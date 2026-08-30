import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { deepClone } from "../../../../base/common/objects.js";
import { observableSignal } from "../../../../base/common/observable.js";
import { WellDefinedPrefixTree } from "../../../../base/common/prefixTree.js";
import { URI } from "../../../../base/common/uri.js";
import { DetailType, ICoverageCount } from "./testTypes.js";
let incId = 0;
class TestCoverage {
  constructor(result, fromTaskId, uriIdentityService, accessor) {
    this.result = result;
    this.fromTaskId = fromTaskId;
    this.uriIdentityService = uriIdentityService;
    this.accessor = accessor;
    this.fileCoverage = new ResourceMap();
    this.didAddCoverage = observableSignal(this);
    this.tree = new WellDefinedPrefixTree();
    this.associatedData = /* @__PURE__ */ new Map();
  }
  /** Gets all test IDs that were included in this test run. */
  *allPerTestIDs() {
    const seen = /* @__PURE__ */ new Set();
    for (const root of this.tree.nodes) {
      if (root.value && root.value.perTestData) {
        for (const id of root.value.perTestData) {
          if (!seen.has(id)) {
            seen.add(id);
            yield id;
          }
        }
      }
    }
  }
  append(coverage, tx) {
    const previous = this.getComputedForUri(coverage.uri);
    const result = this.result;
    const applyDelta = (kind, node) => {
      if (!node[kind]) {
        if (coverage[kind]) {
          node[kind] = { ...coverage[kind] };
        }
      } else {
        node[kind].covered += (coverage[kind]?.covered || 0) - (previous?.[kind]?.covered || 0);
        node[kind].total += (coverage[kind]?.total || 0) - (previous?.[kind]?.total || 0);
      }
    };
    const canonical = [...this.treePathForUri(
      coverage.uri,
      /* canonical = */
      true
    )];
    const chain = [];
    this.tree.mutatePath(this.treePathForUri(
      coverage.uri,
      /* canonical = */
      false
    ), (node) => {
      chain.push(node);
      if (chain.length === canonical.length) {
        if (node.value) {
          const v = node.value;
          v.id = coverage.id;
          v.statement = coverage.statement;
          v.branch = coverage.branch;
          v.declaration = coverage.declaration;
        } else {
          const v = node.value = new FileCoverage(coverage, result, this.accessor);
          this.fileCoverage.set(coverage.uri, v);
        }
      } else {
        if (!node.value) {
          const intermediate = deepClone(coverage);
          intermediate.id = String(incId++);
          intermediate.uri = this.treePathToUri(canonical.slice(0, chain.length));
          node.value = new ComputedFileCoverage(intermediate, result);
        } else {
          applyDelta("statement", node.value);
          applyDelta("branch", node.value);
          applyDelta("declaration", node.value);
          node.value.didChange.trigger(tx);
        }
      }
      if (coverage.testIds) {
        node.value.perTestData ??= /* @__PURE__ */ new Set();
        for (const id of coverage.testIds) {
          node.value.perTestData.add(id);
        }
      }
    });
    if (chain) {
      this.didAddCoverage.trigger(tx, chain);
    }
  }
  /**
   * Builds a new tree filtered to per-test coverage data for the given ID.
   */
  filterTreeForTest(testId) {
    const tree = new WellDefinedPrefixTree();
    for (const node of this.tree.values()) {
      if (node instanceof FileCoverage) {
        if (!node.perTestData?.has(testId.toString())) {
          continue;
        }
        const canonical = [...this.treePathForUri(
          node.uri,
          /* canonical = */
          true
        )];
        const chain = [];
        tree.mutatePath(this.treePathForUri(
          node.uri,
          /* canonical = */
          false
        ), (n) => {
          chain.push(n);
          n.value ??= new BypassedFileCoverage(this.treePathToUri(canonical.slice(0, chain.length)), node.fromResult);
        });
      }
    }
    return tree;
  }
  /**
   * Gets coverage information for all files.
   */
  getAllFiles() {
    return this.fileCoverage;
  }
  /**
   * Gets coverage information for a specific file.
   */
  getUri(uri) {
    return this.fileCoverage.get(uri);
  }
  /**
   * Gets computed information for a file, including DFS-computed information
   * from child tests.
   */
  getComputedForUri(uri) {
    return this.tree.find(this.treePathForUri(
      uri,
      /* canonical = */
      false
    ));
  }
  *treePathForUri(uri, canconicalPath) {
    yield uri.scheme;
    yield uri.authority;
    const path = !canconicalPath && this.uriIdentityService.extUri.ignorePathCasing(uri) ? uri.path.toLowerCase() : uri.path;
    yield* path.split("/");
  }
  treePathToUri(path) {
    return URI.from({ scheme: path[0], authority: path[1], path: path.slice(2).join("/") });
  }
}
const getTotalCoveragePercent = (statement, branch, function_) => {
  let numerator = statement.covered;
  let denominator = statement.total;
  if (branch) {
    numerator += branch.covered;
    denominator += branch.total;
  }
  if (function_) {
    numerator += function_.covered;
    denominator += function_.total;
  }
  return denominator === 0 ? 1 : numerator / denominator;
};
class AbstractFileCoverage {
  constructor(coverage, fromResult) {
    this.fromResult = fromResult;
    this.didChange = observableSignal(this);
    this.id = coverage.id;
    this.uri = coverage.uri;
    this.statement = coverage.statement;
    this.branch = coverage.branch;
    this.declaration = coverage.declaration;
  }
  /**
   * Gets the total coverage percent based on information provided.
   * This is based on the Clover total coverage formula
   */
  get tpc() {
    return getTotalCoveragePercent(this.statement, this.branch, this.declaration);
  }
}
class ComputedFileCoverage extends AbstractFileCoverage {
}
class BypassedFileCoverage extends ComputedFileCoverage {
  constructor(uri, result) {
    super({ id: String(incId++), uri, statement: { covered: 0, total: 0 } }, result);
  }
}
class FileCoverage extends AbstractFileCoverage {
  constructor(coverage, fromResult, accessor) {
    super(coverage, fromResult);
    this.accessor = accessor;
  }
  /** Gets whether details are synchronously available */
  get hasSynchronousDetails() {
    return this._details instanceof Array || this.resolved;
  }
  /**
   * Gets per-line coverage details.
   */
  async detailsForTest(_testId, token = CancellationToken.None) {
    this._detailsForTest ??= /* @__PURE__ */ new Map();
    const testId = _testId.toString();
    const prev = this._detailsForTest.get(testId);
    if (prev) {
      return prev;
    }
    const promise = (async () => {
      try {
        return await this.accessor.getCoverageDetails(this.id, testId, token);
      } catch (e) {
        this._detailsForTest?.delete(testId);
        throw e;
      }
    })();
    this._detailsForTest.set(testId, promise);
    return promise;
  }
  /**
   * Gets per-line coverage details.
   */
  async details(token = CancellationToken.None) {
    this._details ??= this.accessor.getCoverageDetails(this.id, void 0, token);
    try {
      const d = await this._details;
      this.resolved = true;
      return d;
    } catch (e) {
      this._details = void 0;
      throw e;
    }
  }
}
const totalFromCoverageDetails = (uri, details) => {
  const fc = {
    id: "",
    uri,
    statement: ICoverageCount.empty()
  };
  for (const detail of details) {
    if (detail.type === DetailType.Statement) {
      fc.statement.total++;
      fc.statement.total += detail.count ? 1 : 0;
      for (const branch of detail.branches || []) {
        fc.branch ??= ICoverageCount.empty();
        fc.branch.total++;
        fc.branch.covered += branch.count ? 1 : 0;
      }
    } else {
      fc.declaration ??= ICoverageCount.empty();
      fc.declaration.total++;
      fc.declaration.covered += detail.count ? 1 : 0;
    }
  }
  return fc;
};
export {
  AbstractFileCoverage,
  BypassedFileCoverage,
  ComputedFileCoverage,
  FileCoverage,
  TestCoverage,
  getTotalCoveragePercent,
  totalFromCoverageDetails
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdENvdmVyYWdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVTaWduYWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElQcmVmaXhUcmVlTm9kZSwgV2VsbERlZmluZWRQcmVmaXhUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJlZml4VHJlZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBMaXZlVGVzdFJlc3VsdCB9IGZyb20gJy4vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBDb3ZlcmFnZURldGFpbHMsIERldGFpbFR5cGUsIElDb3ZlcmFnZUNvdW50LCBJRmlsZUNvdmVyYWdlIH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb3ZlcmFnZUFjY2Vzc29yIHtcblx0Z2V0Q292ZXJhZ2VEZXRhaWxzOiAoaWQ6IHN0cmluZywgdGVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxDb3ZlcmFnZURldGFpbHNbXT47XG59XG5cbmxldCBpbmNJZCA9IDA7XG5cbi8qKlxuICogQ2xhc3MgdGhhdCBleHBvc2VzZSBjb3ZlcmFnZSBpbmZvcm1hdGlvbiBmb3IgYSBydW4uXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0Q292ZXJhZ2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVDb3ZlcmFnZSA9IG5ldyBSZXNvdXJjZU1hcDxGaWxlQ292ZXJhZ2U+KCk7XG5cdHB1YmxpYyByZWFkb25seSBkaWRBZGRDb3ZlcmFnZSA9IG9ic2VydmFibGVTaWduYWw8SVByZWZpeFRyZWVOb2RlPEFic3RyYWN0RmlsZUNvdmVyYWdlPltdPih0aGlzKTtcblx0cHVibGljIHJlYWRvbmx5IHRyZWUgPSBuZXcgV2VsbERlZmluZWRQcmVmaXhUcmVlPEFic3RyYWN0RmlsZUNvdmVyYWdlPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgYXNzb2NpYXRlZERhdGEgPSBuZXcgTWFwPHVua25vd24sIHVua25vd24+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3VsdDogTGl2ZVRlc3RSZXN1bHQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGZyb21UYXNrSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc29yOiBJQ292ZXJhZ2VBY2Nlc3Nvcixcblx0KSB7IH1cblxuXHQvKiogR2V0cyBhbGwgdGVzdCBJRHMgdGhhdCB3ZXJlIGluY2x1ZGVkIGluIHRoaXMgdGVzdCBydW4uICovXG5cdHB1YmxpYyAqYWxsUGVyVGVzdElEcygpIHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCByb290IG9mIHRoaXMudHJlZS5ub2Rlcykge1xuXHRcdFx0aWYgKHJvb3QudmFsdWUgJiYgcm9vdC52YWx1ZS5wZXJUZXN0RGF0YSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHJvb3QudmFsdWUucGVyVGVzdERhdGEpIHtcblx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKGlkKSkge1xuXHRcdFx0XHRcdFx0c2Vlbi5hZGQoaWQpO1xuXHRcdFx0XHRcdFx0eWllbGQgaWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFwcGVuZChjb3ZlcmFnZTogSUZpbGVDb3ZlcmFnZSwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5nZXRDb21wdXRlZEZvclVyaShjb3ZlcmFnZS51cmkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMucmVzdWx0O1xuXHRcdGNvbnN0IGFwcGx5RGVsdGEgPSAoa2luZDogJ3N0YXRlbWVudCcgfCAnYnJhbmNoJyB8ICdkZWNsYXJhdGlvbicsIG5vZGU6IENvbXB1dGVkRmlsZUNvdmVyYWdlKSA9PiB7XG5cdFx0XHRpZiAoIW5vZGVba2luZF0pIHtcblx0XHRcdFx0aWYgKGNvdmVyYWdlW2tpbmRdKSB7XG5cdFx0XHRcdFx0bm9kZVtraW5kXSA9IHsgLi4uY292ZXJhZ2Vba2luZF0hIH07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5vZGVba2luZF0hLmNvdmVyZWQgKz0gKGNvdmVyYWdlW2tpbmRdPy5jb3ZlcmVkIHx8IDApIC0gKHByZXZpb3VzPy5ba2luZF0/LmNvdmVyZWQgfHwgMCk7XG5cdFx0XHRcdG5vZGVba2luZF0hLnRvdGFsICs9IChjb3ZlcmFnZVtraW5kXT8udG90YWwgfHwgMCkgLSAocHJldmlvdXM/LltraW5kXT8udG90YWwgfHwgMCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFdlIGluc2VydCB1c2luZyB0aGUgbm9uLWNhbm9uaWNhbCBwYXRoIHRvIG5vcm1hbGl6ZSBmb3IgY2FzaW5nIGRpZmZlcmVuY2VzXG5cdFx0Ly8gYmV0d2VlbiBVUklzLCBidXQgd2hlbiBpbnNlcnRpbmcgYW4gaW50ZXJtZWRpYXRlIG5vZGUgYWx3YXlzIHVzZSAnYScgY2Fub25pY2FsXG5cdFx0Ly8gdmVyc2lvbi5cblx0XHRjb25zdCBjYW5vbmljYWwgPSBbLi4udGhpcy50cmVlUGF0aEZvclVyaShjb3ZlcmFnZS51cmksIC8qIGNhbm9uaWNhbCA9ICovIHRydWUpXTtcblx0XHRjb25zdCBjaGFpbjogSVByZWZpeFRyZWVOb2RlPEFic3RyYWN0RmlsZUNvdmVyYWdlPltdID0gW107XG5cblx0XHR0aGlzLnRyZWUubXV0YXRlUGF0aCh0aGlzLnRyZWVQYXRoRm9yVXJpKGNvdmVyYWdlLnVyaSwgLyogY2Fub25pY2FsID0gKi8gZmFsc2UpLCBub2RlID0+IHtcblx0XHRcdGNoYWluLnB1c2gobm9kZSk7XG5cblx0XHRcdGlmIChjaGFpbi5sZW5ndGggPT09IGNhbm9uaWNhbC5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gd2UgcmVhY2hlZCBvdXIgZGVzdGluYXRpb24gbm9kZSwgYXBwbHkgdGhlIGNvdmVyYWdlIGFzIG5lY2Vzc2FyeTpcblx0XHRcdFx0aWYgKG5vZGUudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCB2ID0gbm9kZS52YWx1ZTtcblx0XHRcdFx0XHQvLyBpZiBJRCB3YXMgZ2VuZXJhdGVkIGZyb20gYSB0ZXN0LXNwZWNpZmljIGNvdmVyYWdlLCByZWFzc2lnbiBpdCB0byBnZXQgaXRzIHJlYWwgSUQgaW4gdGhlIGV4dGVuc2lvbiBob3N0LlxuXHRcdFx0XHRcdHYuaWQgPSBjb3ZlcmFnZS5pZDtcblx0XHRcdFx0XHR2LnN0YXRlbWVudCA9IGNvdmVyYWdlLnN0YXRlbWVudDtcblx0XHRcdFx0XHR2LmJyYW5jaCA9IGNvdmVyYWdlLmJyYW5jaDtcblx0XHRcdFx0XHR2LmRlY2xhcmF0aW9uID0gY292ZXJhZ2UuZGVjbGFyYXRpb247XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgdiA9IG5vZGUudmFsdWUgPSBuZXcgRmlsZUNvdmVyYWdlKGNvdmVyYWdlLCByZXN1bHQsIHRoaXMuYWNjZXNzb3IpO1xuXHRcdFx0XHRcdHRoaXMuZmlsZUNvdmVyYWdlLnNldChjb3ZlcmFnZS51cmksIHYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBPdGhlcndpc2UsIGlmIHRoaXMgaXMgbm90IGEgcGFydGlhbCBwZXItdGVzdCBjb3ZlcmFnZSwgbWVyZ2UgdGhlXG5cdFx0XHRcdC8vIGNvdmVyYWdlIGNoYW5nZXMgaW50byB0aGUgY2hhaW4uIFBlci10ZXN0IGNvdmVyYWdlcyBhcmUgbm90IGNvbXBsZXRlXG5cdFx0XHRcdC8vIGFuZCB3ZSBkb24ndCB3YW50IHRvIGNvbnNpZGVyIHRoZW0gZm9yIGNvbXB1dGF0aW9uLlxuXHRcdFx0XHRpZiAoIW5vZGUudmFsdWUpIHtcblx0XHRcdFx0XHQvLyBjbG9uZSBiZWNhdXNlIGxhdGVyIGludGVyc2VydGlvbnMgY2FuIG1vZGlmeSB0aGUgY291bnRzOlxuXHRcdFx0XHRcdGNvbnN0IGludGVybWVkaWF0ZSA9IGRlZXBDbG9uZShjb3ZlcmFnZSk7XG5cdFx0XHRcdFx0aW50ZXJtZWRpYXRlLmlkID0gU3RyaW5nKGluY0lkKyspO1xuXHRcdFx0XHRcdGludGVybWVkaWF0ZS51cmkgPSB0aGlzLnRyZWVQYXRoVG9VcmkoY2Fub25pY2FsLnNsaWNlKDAsIGNoYWluLmxlbmd0aCkpO1xuXHRcdFx0XHRcdG5vZGUudmFsdWUgPSBuZXcgQ29tcHV0ZWRGaWxlQ292ZXJhZ2UoaW50ZXJtZWRpYXRlLCByZXN1bHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFwcGx5RGVsdGEoJ3N0YXRlbWVudCcsIG5vZGUudmFsdWUpO1xuXHRcdFx0XHRcdGFwcGx5RGVsdGEoJ2JyYW5jaCcsIG5vZGUudmFsdWUpO1xuXHRcdFx0XHRcdGFwcGx5RGVsdGEoJ2RlY2xhcmF0aW9uJywgbm9kZS52YWx1ZSk7XG5cdFx0XHRcdFx0bm9kZS52YWx1ZS5kaWRDaGFuZ2UudHJpZ2dlcih0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvdmVyYWdlLnRlc3RJZHMpIHtcblx0XHRcdFx0bm9kZS52YWx1ZSEucGVyVGVzdERhdGEgPz89IG5ldyBTZXQoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBjb3ZlcmFnZS50ZXN0SWRzKSB7XG5cdFx0XHRcdFx0bm9kZS52YWx1ZSEucGVyVGVzdERhdGEuYWRkKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGNoYWluKSB7XG5cdFx0XHR0aGlzLmRpZEFkZENvdmVyYWdlLnRyaWdnZXIodHgsIGNoYWluKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIGEgbmV3IHRyZWUgZmlsdGVyZWQgdG8gcGVyLXRlc3QgY292ZXJhZ2UgZGF0YSBmb3IgdGhlIGdpdmVuIElELlxuXHQgKi9cblx0cHVibGljIGZpbHRlclRyZWVGb3JUZXN0KHRlc3RJZDogVGVzdElkKSB7XG5cdFx0Y29uc3QgdHJlZSA9IG5ldyBXZWxsRGVmaW5lZFByZWZpeFRyZWU8QWJzdHJhY3RGaWxlQ292ZXJhZ2U+KCk7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMudHJlZS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKG5vZGUgaW5zdGFuY2VvZiBGaWxlQ292ZXJhZ2UpIHtcblx0XHRcdFx0aWYgKCFub2RlLnBlclRlc3REYXRhPy5oYXModGVzdElkLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjYW5vbmljYWwgPSBbLi4udGhpcy50cmVlUGF0aEZvclVyaShub2RlLnVyaSwgLyogY2Fub25pY2FsID0gKi8gdHJ1ZSldO1xuXHRcdFx0XHRjb25zdCBjaGFpbjogSVByZWZpeFRyZWVOb2RlPEFic3RyYWN0RmlsZUNvdmVyYWdlPltdID0gW107XG5cdFx0XHRcdHRyZWUubXV0YXRlUGF0aCh0aGlzLnRyZWVQYXRoRm9yVXJpKG5vZGUudXJpLCAvKiBjYW5vbmljYWwgPSAqLyBmYWxzZSksIG4gPT4ge1xuXHRcdFx0XHRcdGNoYWluLnB1c2gobik7XG5cdFx0XHRcdFx0bi52YWx1ZSA/Pz0gbmV3IEJ5cGFzc2VkRmlsZUNvdmVyYWdlKHRoaXMudHJlZVBhdGhUb1VyaShjYW5vbmljYWwuc2xpY2UoMCwgY2hhaW4ubGVuZ3RoKSksIG5vZGUuZnJvbVJlc3VsdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cmVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgY292ZXJhZ2UgaW5mb3JtYXRpb24gZm9yIGFsbCBmaWxlcy5cblx0ICovXG5cdHB1YmxpYyBnZXRBbGxGaWxlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlQ292ZXJhZ2U7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBjb3ZlcmFnZSBpbmZvcm1hdGlvbiBmb3IgYSBzcGVjaWZpYyBmaWxlLlxuXHQgKi9cblx0cHVibGljIGdldFVyaSh1cmk6IFVSSSkge1xuXHRcdHJldHVybiB0aGlzLmZpbGVDb3ZlcmFnZS5nZXQodXJpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGNvbXB1dGVkIGluZm9ybWF0aW9uIGZvciBhIGZpbGUsIGluY2x1ZGluZyBERlMtY29tcHV0ZWQgaW5mb3JtYXRpb25cblx0ICogZnJvbSBjaGlsZCB0ZXN0cy5cblx0ICovXG5cdHB1YmxpYyBnZXRDb21wdXRlZEZvclVyaSh1cmk6IFVSSSkge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZmluZCh0aGlzLnRyZWVQYXRoRm9yVXJpKHVyaSwgLyogY2Fub25pY2FsID0gKi8gZmFsc2UpKTtcblx0fVxuXG5cdHByaXZhdGUgKnRyZWVQYXRoRm9yVXJpKHVyaTogVVJJLCBjYW5jb25pY2FsUGF0aDogYm9vbGVhbikge1xuXHRcdHlpZWxkIHVyaS5zY2hlbWU7XG5cdFx0eWllbGQgdXJpLmF1dGhvcml0eTtcblxuXHRcdGNvbnN0IHBhdGggPSAhY2FuY29uaWNhbFBhdGggJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcodXJpKSA/IHVyaS5wYXRoLnRvTG93ZXJDYXNlKCkgOiB1cmkucGF0aDtcblx0XHR5aWVsZCogcGF0aC5zcGxpdCgnLycpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmVlUGF0aFRvVXJpKHBhdGg6IHN0cmluZ1tdKSB7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBwYXRoWzBdLCBhdXRob3JpdHk6IHBhdGhbMV0sIHBhdGg6IHBhdGguc2xpY2UoMikuam9pbignLycpIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBnZXRUb3RhbENvdmVyYWdlUGVyY2VudCA9IChzdGF0ZW1lbnQ6IElDb3ZlcmFnZUNvdW50LCBicmFuY2g6IElDb3ZlcmFnZUNvdW50IHwgdW5kZWZpbmVkLCBmdW5jdGlvbl86IElDb3ZlcmFnZUNvdW50IHwgdW5kZWZpbmVkKSA9PiB7XG5cdGxldCBudW1lcmF0b3IgPSBzdGF0ZW1lbnQuY292ZXJlZDtcblx0bGV0IGRlbm9taW5hdG9yID0gc3RhdGVtZW50LnRvdGFsO1xuXG5cdGlmIChicmFuY2gpIHtcblx0XHRudW1lcmF0b3IgKz0gYnJhbmNoLmNvdmVyZWQ7XG5cdFx0ZGVub21pbmF0b3IgKz0gYnJhbmNoLnRvdGFsO1xuXHR9XG5cblx0aWYgKGZ1bmN0aW9uXykge1xuXHRcdG51bWVyYXRvciArPSBmdW5jdGlvbl8uY292ZXJlZDtcblx0XHRkZW5vbWluYXRvciArPSBmdW5jdGlvbl8udG90YWw7XG5cdH1cblxuXHRyZXR1cm4gZGVub21pbmF0b3IgPT09IDAgPyAxIDogbnVtZXJhdG9yIC8gZGVub21pbmF0b3I7XG59O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RGaWxlQ292ZXJhZ2Uge1xuXHRwdWJsaWMgaWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHVyaTogVVJJO1xuXHRwdWJsaWMgc3RhdGVtZW50OiBJQ292ZXJhZ2VDb3VudDtcblx0cHVibGljIGJyYW5jaD86IElDb3ZlcmFnZUNvdW50O1xuXHRwdWJsaWMgZGVjbGFyYXRpb24/OiBJQ292ZXJhZ2VDb3VudDtcblx0cHVibGljIHJlYWRvbmx5IGRpZENoYW5nZSA9IG9ic2VydmFibGVTaWduYWwodGhpcyk7XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHRvdGFsIGNvdmVyYWdlIHBlcmNlbnQgYmFzZWQgb24gaW5mb3JtYXRpb24gcHJvdmlkZWQuXG5cdCAqIFRoaXMgaXMgYmFzZWQgb24gdGhlIENsb3ZlciB0b3RhbCBjb3ZlcmFnZSBmb3JtdWxhXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHRwYygpIHtcblx0XHRyZXR1cm4gZ2V0VG90YWxDb3ZlcmFnZVBlcmNlbnQodGhpcy5zdGF0ZW1lbnQsIHRoaXMuYnJhbmNoLCB0aGlzLmRlY2xhcmF0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXItdGVzdCBjb3ZlcmFnZSBkYXRhIGZvciB0aGlzIGZpbGUsIGlmIGF2YWlsYWJsZS5cblx0ICovXG5cdHB1YmxpYyBwZXJUZXN0RGF0YT86IFNldDxzdHJpbmc+O1xuXG5cdGNvbnN0cnVjdG9yKGNvdmVyYWdlOiBJRmlsZUNvdmVyYWdlLCBwdWJsaWMgcmVhZG9ubHkgZnJvbVJlc3VsdDogTGl2ZVRlc3RSZXN1bHQpIHtcblx0XHR0aGlzLmlkID0gY292ZXJhZ2UuaWQ7XG5cdFx0dGhpcy51cmkgPSBjb3ZlcmFnZS51cmk7XG5cdFx0dGhpcy5zdGF0ZW1lbnQgPSBjb3ZlcmFnZS5zdGF0ZW1lbnQ7XG5cdFx0dGhpcy5icmFuY2ggPSBjb3ZlcmFnZS5icmFuY2g7XG5cdFx0dGhpcy5kZWNsYXJhdGlvbiA9IGNvdmVyYWdlLmRlY2xhcmF0aW9uO1xuXHR9XG59XG5cbi8qKlxuICogRmlsZSBjb3ZlcmFnZSBpbmZvIGNvbXB1dGVkIGZyb20gY2hpbGRyZW4gaW4gdGhlIHRyZWUsIG5vdCBwcm92aWRlZCBieSB0aGVcbiAqIGV4dGVuc2lvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbXB1dGVkRmlsZUNvdmVyYWdlIGV4dGVuZHMgQWJzdHJhY3RGaWxlQ292ZXJhZ2UgeyB9XG5cbi8qKlxuICogQSB2aXJ0dWFsIG5vZGUgdGhhdCBkb2Vzbid0IGhhdmUgYW55IGFkZGVkIGNvdmVyYWdlIGluZm8uXG4gKi9cbmV4cG9ydCBjbGFzcyBCeXBhc3NlZEZpbGVDb3ZlcmFnZSBleHRlbmRzIENvbXB1dGVkRmlsZUNvdmVyYWdlIHtcblx0Y29uc3RydWN0b3IodXJpOiBVUkksIHJlc3VsdDogTGl2ZVRlc3RSZXN1bHQpIHtcblx0XHRzdXBlcih7IGlkOiBTdHJpbmcoaW5jSWQrKyksIHVyaSwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDAsIHRvdGFsOiAwIH0gfSwgcmVzdWx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmlsZUNvdmVyYWdlIGV4dGVuZHMgQWJzdHJhY3RGaWxlQ292ZXJhZ2Uge1xuXHRwcml2YXRlIF9kZXRhaWxzPzogUHJvbWlzZTxDb3ZlcmFnZURldGFpbHNbXT47XG5cdHByaXZhdGUgcmVzb2x2ZWQ/OiBib29sZWFuO1xuXHRwcml2YXRlIF9kZXRhaWxzRm9yVGVzdD86IE1hcDxzdHJpbmcsIFByb21pc2U8Q292ZXJhZ2VEZXRhaWxzW10+PjtcblxuXHQvKiogR2V0cyB3aGV0aGVyIGRldGFpbHMgYXJlIHN5bmNocm9ub3VzbHkgYXZhaWxhYmxlICovXG5cdHB1YmxpYyBnZXQgaGFzU3luY2hyb25vdXNEZXRhaWxzKCkge1xuXHRcdHJldHVybiB0aGlzLl9kZXRhaWxzIGluc3RhbmNlb2YgQXJyYXkgfHwgdGhpcy5yZXNvbHZlZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKGNvdmVyYWdlOiBJRmlsZUNvdmVyYWdlLCBmcm9tUmVzdWx0OiBMaXZlVGVzdFJlc3VsdCwgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NvcjogSUNvdmVyYWdlQWNjZXNzb3IpIHtcblx0XHRzdXBlcihjb3ZlcmFnZSwgZnJvbVJlc3VsdCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBwZXItbGluZSBjb3ZlcmFnZSBkZXRhaWxzLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGRldGFpbHNGb3JUZXN0KF90ZXN0SWQ6IFRlc3RJZCwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSB7XG5cdFx0dGhpcy5fZGV0YWlsc0ZvclRlc3QgPz89IG5ldyBNYXAoKTtcblx0XHRjb25zdCB0ZXN0SWQgPSBfdGVzdElkLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuX2RldGFpbHNGb3JUZXN0LmdldCh0ZXN0SWQpO1xuXHRcdGlmIChwcmV2KSB7XG5cdFx0XHRyZXR1cm4gcHJldjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmFjY2Vzc29yLmdldENvdmVyYWdlRGV0YWlscyh0aGlzLmlkLCB0ZXN0SWQsIHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlsc0ZvclRlc3Q/LmRlbGV0ZSh0ZXN0SWQpO1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHR0aGlzLl9kZXRhaWxzRm9yVGVzdC5zZXQodGVzdElkLCBwcm9taXNlKTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHBlci1saW5lIGNvdmVyYWdlIGRldGFpbHMuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZGV0YWlscyh0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpIHtcblx0XHR0aGlzLl9kZXRhaWxzID8/PSB0aGlzLmFjY2Vzc29yLmdldENvdmVyYWdlRGV0YWlscyh0aGlzLmlkLCB1bmRlZmluZWQsIHRva2VuKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkID0gYXdhaXQgdGhpcy5fZGV0YWlscztcblx0XHRcdHRoaXMucmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIGQ7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fZGV0YWlscyA9IHVuZGVmaW5lZDtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjb25zdCB0b3RhbEZyb21Db3ZlcmFnZURldGFpbHMgPSAodXJpOiBVUkksIGRldGFpbHM6IENvdmVyYWdlRGV0YWlsc1tdKTogSUZpbGVDb3ZlcmFnZSA9PiB7XG5cdGNvbnN0IGZjOiBJRmlsZUNvdmVyYWdlID0ge1xuXHRcdGlkOiAnJyxcblx0XHR1cmksXG5cdFx0c3RhdGVtZW50OiBJQ292ZXJhZ2VDb3VudC5lbXB0eSgpLFxuXHR9O1xuXG5cdGZvciAoY29uc3QgZGV0YWlsIG9mIGRldGFpbHMpIHtcblx0XHRpZiAoZGV0YWlsLnR5cGUgPT09IERldGFpbFR5cGUuU3RhdGVtZW50KSB7XG5cdFx0XHRmYy5zdGF0ZW1lbnQudG90YWwrKztcblx0XHRcdGZjLnN0YXRlbWVudC50b3RhbCArPSBkZXRhaWwuY291bnQgPyAxIDogMDtcblxuXHRcdFx0Zm9yIChjb25zdCBicmFuY2ggb2YgZGV0YWlsLmJyYW5jaGVzIHx8IFtdKSB7XG5cdFx0XHRcdGZjLmJyYW5jaCA/Pz0gSUNvdmVyYWdlQ291bnQuZW1wdHkoKTtcblx0XHRcdFx0ZmMuYnJhbmNoLnRvdGFsKys7XG5cdFx0XHRcdGZjLmJyYW5jaC5jb3ZlcmVkICs9IGJyYW5jaC5jb3VudCA/IDEgOiAwO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmYy5kZWNsYXJhdGlvbiA/Pz0gSUNvdmVyYWdlQ291bnQuZW1wdHkoKTtcblx0XHRcdGZjLmRlY2xhcmF0aW9uLnRvdGFsKys7XG5cdFx0XHRmYy5kZWNsYXJhdGlvbi5jb3ZlcmVkICs9IGRldGFpbC5jb3VudCA/IDEgOiAwO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYztcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQjtBQUMxQixTQUF1Qix3QkFBd0I7QUFDL0MsU0FBMEIsNkJBQTZCO0FBQ3ZELFNBQVMsV0FBVztBQUlwQixTQUEwQixZQUFZLHNCQUFxQztBQU0zRSxJQUFJLFFBQVE7QUFLTCxNQUFNLGFBQWE7QUFBQSxFQU16QixZQUNpQixRQUNBLFlBQ0Msb0JBQ0EsVUFDaEI7QUFKZTtBQUNBO0FBQ0M7QUFDQTtBQVRsQixTQUFpQixlQUFlLElBQUksWUFBMEI7QUFDOUQsU0FBZ0IsaUJBQWlCLGlCQUEwRCxJQUFJO0FBQy9GLFNBQWdCLE9BQU8sSUFBSSxzQkFBNEM7QUFDdkUsU0FBZ0IsaUJBQWlCLG9CQUFJLElBQXNCO0FBQUEsRUFPdkQ7QUFBQTtBQUFBLEVBR0osQ0FBUSxnQkFBZ0I7QUFDdkIsVUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsZUFBVyxRQUFRLEtBQUssS0FBSyxPQUFPO0FBQ25DLFVBQUksS0FBSyxTQUFTLEtBQUssTUFBTSxhQUFhO0FBQ3pDLG1CQUFXLE1BQU0sS0FBSyxNQUFNLGFBQWE7QUFD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QUFrQixNQUFNO0FBQzVFLFNBQUssb0JBQW9CLG9CQUFJLElBQUk7QUFDakMsVUFBTSxTQUFTLFFBQVEsU0FBUztBQUNoQyxVQUFNLE9BQU8sS0FBSyxnQkFBZ0IsSUFBSSxNQUFNO0FBQzVDLFFBQUksTUFBTTtBQUNULGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxXQUFXLFlBQVk7QUFDNUIsVUFBSTtBQUNILGVBQU8sTUFBTSxLQUFLLFNBQVMsbUJBQW1CLEtBQUssSUFBSSxRQUFRLEtBQUs7QUFBQSxNQUNyRSxTQUFTLEdBQUc7QUFDWCxhQUFLLGlCQUFpQixPQUFPLE1BQU07QUFDbkMsY0FBTTtBQUFBLE1BQ1A7QUFBQSxJQUNELEdBQUc7QUFFSCxTQUFLLGdCQUFnQixJQUFJLFFBQVEsT0FBTztBQUN4QyxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSxRQUFRLFFBQVEsa0JBQWtCLE1BQU07QUFDcEQsU0FBSyxhQUFhLEtBQUssU0FBUyxtQkFBbUIsS0FBSyxJQUFJLFFBQVcsS0FBSztBQUU1RSxRQUFJO0FBQ0gsWUFBTSxJQUFJLE1BQU0sS0FBSztBQUNyQixXQUFLLFdBQVc7QUFDaEIsYUFBTztBQUFBLElBQ1IsU0FBUyxHQUFHO0FBQ1gsV0FBSyxXQUFXO0FBQ2hCLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSwyQkFBMkIsQ0FBQyxLQUFVLFlBQThDO0FBQ2hHLFFBQU0sS0FBb0I7QUFBQSxJQUN6QixJQUFJO0FBQUEsSUFDSjtBQUFBLElBQ0EsV0FBVyxlQUFlLE1BQU07QUFBQSxFQUNqQztBQUVBLGFBQVcsVUFBVSxTQUFTO0FBQzdCLFFBQUksT0FBTyxTQUFTLFdBQVcsV0FBVztBQUN6QyxTQUFHLFVBQVU7QUFDYixTQUFHLFVBQVUsU0FBUyxPQUFPLFFBQVEsSUFBSTtBQUV6QyxpQkFBVyxVQUFVLE9BQU8sWUFBWSxDQUFDLEdBQUc7QUFDM0MsV0FBRyxXQUFXLGVBQWUsTUFBTTtBQUNuQyxXQUFHLE9BQU87QUFDVixXQUFHLE9BQU8sV0FBVyxPQUFPLFFBQVEsSUFBSTtBQUFBLE1BQ3pDO0FBQUEsSUFDRCxPQUFPO0FBQ04sU0FBRyxnQkFBZ0IsZUFBZSxNQUFNO0FBQ3hDLFNBQUcsWUFBWTtBQUNmLFNBQUcsWUFBWSxXQUFXLE9BQU8sUUFBUSxJQUFJO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogW10KfQo=
