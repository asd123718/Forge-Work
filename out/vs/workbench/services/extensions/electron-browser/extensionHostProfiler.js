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
import { TernarySearchTree } from "../../../../base/common/ternarySearchTree.js";
import { IExtensionService } from "../common/extensions.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { IV8InspectProfilingService } from "../../../../platform/profiling/common/profiling.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
let ExtensionHostProfiler = class {
  constructor(_host, _port, _extensionService, _profilingService) {
    this._host = _host;
    this._port = _port;
    this._extensionService = _extensionService;
    this._profilingService = _profilingService;
  }
  async start() {
    const id = await this._profilingService.startProfiling({ host: this._host, port: this._port });
    return {
      stop: createSingleCallFunction(async () => {
        const profile = await this._profilingService.stopProfiling(id);
        await this._extensionService.whenInstalledExtensionsRegistered();
        const extensions = this._extensionService.extensions;
        return this._distill(profile, extensions);
      })
    };
  }
  _distill(profile, extensions) {
    const searchTree = TernarySearchTree.forUris();
    for (const extension of extensions) {
      if (extension.extensionLocation.scheme === Schemas.file) {
        searchTree.set(URI.file(extension.extensionLocation.fsPath), extension);
      }
    }
    const nodes = profile.nodes;
    const idsToNodes = /* @__PURE__ */ new Map();
    const idsToSegmentId = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      idsToNodes.set(node.id, node);
    }
    function visit(node, segmentId) {
      if (!segmentId) {
        switch (node.callFrame.functionName) {
          case "(root)":
            break;
          case "(program)":
            segmentId = "program";
            break;
          case "(garbage collector)":
            segmentId = "gc";
            break;
          default:
            segmentId = "self";
            break;
        }
      } else if (segmentId === "self" && node.callFrame.url) {
        let extension;
        try {
          extension = searchTree.findSubstr(URI.parse(node.callFrame.url));
        } catch {
        }
        if (extension) {
          segmentId = extension.identifier.value;
        }
      }
      idsToSegmentId.set(node.id, segmentId);
      if (node.children) {
        for (const child of node.children) {
          const childNode = idsToNodes.get(child);
          if (childNode) {
            visit(childNode, segmentId);
          }
        }
      }
    }
    visit(nodes[0], null);
    const samples = profile.samples || [];
    const timeDeltas = profile.timeDeltas || [];
    const distilledDeltas = [];
    const distilledIds = [];
    let currSegmentTime = 0;
    let currSegmentId;
    for (let i = 0; i < samples.length; i++) {
      const id = samples[i];
      const segmentId = idsToSegmentId.get(id);
      if (segmentId !== currSegmentId) {
        if (currSegmentId) {
          distilledIds.push(currSegmentId);
          distilledDeltas.push(currSegmentTime);
        }
        currSegmentId = segmentId ?? void 0;
        currSegmentTime = 0;
      }
      currSegmentTime += timeDeltas[i];
    }
    if (currSegmentId) {
      distilledIds.push(currSegmentId);
      distilledDeltas.push(currSegmentTime);
    }
    return {
      startTime: profile.startTime,
      endTime: profile.endTime,
      deltas: distilledDeltas,
      ids: distilledIds,
      data: profile,
      getAggregatedTimes: () => {
        const segmentsToTime = /* @__PURE__ */ new Map();
        for (let i = 0; i < distilledIds.length; i++) {
          const id = distilledIds[i];
          segmentsToTime.set(id, (segmentsToTime.get(id) || 0) + distilledDeltas[i]);
        }
        return segmentsToTime;
      }
    };
  }
};
ExtensionHostProfiler = __decorateClass([
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IV8InspectProfilingService)
], ExtensionHostProfiler);
export {
  ExtensionHostProfiler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxlbGVjdHJvbi1icm93c2VyXFxleHRlbnNpb25Ib3N0UHJvZmlsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0UHJvZmlsZSwgSUV4dGVuc2lvblNlcnZpY2UsIFByb2ZpbGVTZWdtZW50SWQsIFByb2ZpbGVTZXNzaW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVY4SW5zcGVjdFByb2ZpbGluZ1NlcnZpY2UsIElWOFByb2ZpbGUsIElWOFByb2ZpbGVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZmlsaW5nL2NvbW1vbi9wcm9maWxpbmcuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnVuY3Rpb25hbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Ib3N0UHJvZmlsZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvc3Q6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wb3J0OiBudW1iZXIsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJVjhJbnNwZWN0UHJvZmlsaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9maWxpbmdTZXJ2aWNlOiBJVjhJbnNwZWN0UHJvZmlsaW5nU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTxQcm9maWxlU2Vzc2lvbj4ge1xuXG5cdFx0Y29uc3QgaWQgPSBhd2FpdCB0aGlzLl9wcm9maWxpbmdTZXJ2aWNlLnN0YXJ0UHJvZmlsaW5nKHsgaG9zdDogdGhpcy5faG9zdCwgcG9ydDogdGhpcy5fcG9ydCB9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdG9wOiBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5fcHJvZmlsaW5nU2VydmljZS5zdG9wUHJvZmlsaW5nKGlkKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucztcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2Rpc3RpbGwocHJvZmlsZSwgZXh0ZW5zaW9ucyk7XG5cdFx0XHR9KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9kaXN0aWxsKHByb2ZpbGU6IElWOFByb2ZpbGUsIGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKTogSUV4dGVuc2lvbkhvc3RQcm9maWxlIHtcblx0XHRjb25zdCBzZWFyY2hUcmVlID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRzZWFyY2hUcmVlLnNldChVUkkuZmlsZShleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRoKSwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBub2RlcyA9IHByb2ZpbGUubm9kZXM7XG5cdFx0Y29uc3QgaWRzVG9Ob2RlcyA9IG5ldyBNYXA8bnVtYmVyLCBJVjhQcm9maWxlTm9kZT4oKTtcblx0XHRjb25zdCBpZHNUb1NlZ21lbnRJZCA9IG5ldyBNYXA8bnVtYmVyLCBQcm9maWxlU2VnbWVudElkIHwgbnVsbD4oKTtcblx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRcdGlkc1RvTm9kZXMuc2V0KG5vZGUuaWQsIG5vZGUpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHZpc2l0KG5vZGU6IElWOFByb2ZpbGVOb2RlLCBzZWdtZW50SWQ6IFByb2ZpbGVTZWdtZW50SWQgfCBudWxsKSB7XG5cdFx0XHRpZiAoIXNlZ21lbnRJZCkge1xuXHRcdFx0XHRzd2l0Y2ggKG5vZGUuY2FsbEZyYW1lLmZ1bmN0aW9uTmFtZSkge1xuXHRcdFx0XHRcdGNhc2UgJyhyb290KSc6XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICcocHJvZ3JhbSknOlxuXHRcdFx0XHRcdFx0c2VnbWVudElkID0gJ3Byb2dyYW0nO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnKGdhcmJhZ2UgY29sbGVjdG9yKSc6XG5cdFx0XHRcdFx0XHRzZWdtZW50SWQgPSAnZ2MnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHNlZ21lbnRJZCA9ICdzZWxmJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHNlZ21lbnRJZCA9PT0gJ3NlbGYnICYmIG5vZGUuY2FsbEZyYW1lLnVybCkge1xuXHRcdFx0XHRsZXQgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uID0gc2VhcmNoVHJlZS5maW5kU3Vic3RyKFVSSS5wYXJzZShub2RlLmNhbGxGcmFtZS51cmwpKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHNlZ21lbnRJZCA9IGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZHNUb1NlZ21lbnRJZC5zZXQobm9kZS5pZCwgc2VnbWVudElkKTtcblxuXHRcdFx0aWYgKG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGROb2RlID0gaWRzVG9Ob2Rlcy5nZXQoY2hpbGQpO1xuXHRcdFx0XHRcdGlmIChjaGlsZE5vZGUpIHtcblx0XHRcdFx0XHRcdHZpc2l0KGNoaWxkTm9kZSwgc2VnbWVudElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dmlzaXQobm9kZXNbMF0sIG51bGwpO1xuXG5cdFx0Y29uc3Qgc2FtcGxlcyA9IHByb2ZpbGUuc2FtcGxlcyB8fCBbXTtcblx0XHRjb25zdCB0aW1lRGVsdGFzID0gcHJvZmlsZS50aW1lRGVsdGFzIHx8IFtdO1xuXHRcdGNvbnN0IGRpc3RpbGxlZERlbHRhczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBkaXN0aWxsZWRJZHM6IFByb2ZpbGVTZWdtZW50SWRbXSA9IFtdO1xuXG5cdFx0bGV0IGN1cnJTZWdtZW50VGltZSA9IDA7XG5cdFx0bGV0IGN1cnJTZWdtZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNhbXBsZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGlkID0gc2FtcGxlc1tpXTtcblx0XHRcdGNvbnN0IHNlZ21lbnRJZCA9IGlkc1RvU2VnbWVudElkLmdldChpZCk7XG5cdFx0XHRpZiAoc2VnbWVudElkICE9PSBjdXJyU2VnbWVudElkKSB7XG5cdFx0XHRcdGlmIChjdXJyU2VnbWVudElkKSB7XG5cdFx0XHRcdFx0ZGlzdGlsbGVkSWRzLnB1c2goY3VyclNlZ21lbnRJZCk7XG5cdFx0XHRcdFx0ZGlzdGlsbGVkRGVsdGFzLnB1c2goY3VyclNlZ21lbnRUaW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyU2VnbWVudElkID0gc2VnbWVudElkID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0Y3VyclNlZ21lbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHRcdGN1cnJTZWdtZW50VGltZSArPSB0aW1lRGVsdGFzW2ldO1xuXHRcdH1cblx0XHRpZiAoY3VyclNlZ21lbnRJZCkge1xuXHRcdFx0ZGlzdGlsbGVkSWRzLnB1c2goY3VyclNlZ21lbnRJZCk7XG5cdFx0XHRkaXN0aWxsZWREZWx0YXMucHVzaChjdXJyU2VnbWVudFRpbWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydFRpbWU6IHByb2ZpbGUuc3RhcnRUaW1lLFxuXHRcdFx0ZW5kVGltZTogcHJvZmlsZS5lbmRUaW1lLFxuXHRcdFx0ZGVsdGFzOiBkaXN0aWxsZWREZWx0YXMsXG5cdFx0XHRpZHM6IGRpc3RpbGxlZElkcyxcblx0XHRcdGRhdGE6IHByb2ZpbGUsXG5cdFx0XHRnZXRBZ2dyZWdhdGVkVGltZXM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VnbWVudHNUb1RpbWUgPSBuZXcgTWFwPFByb2ZpbGVTZWdtZW50SWQsIG51bWJlcj4oKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkaXN0aWxsZWRJZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGRpc3RpbGxlZElkc1tpXTtcblx0XHRcdFx0XHRzZWdtZW50c1RvVGltZS5zZXQoaWQsIChzZWdtZW50c1RvVGltZS5nZXQoaWQpIHx8IDApICsgZGlzdGlsbGVkRGVsdGFzW2ldKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc2VnbWVudHNUb1RpbWU7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFnQyx5QkFBMkQ7QUFFM0YsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGtDQUE4RDtBQUN2RSxTQUFTLGdDQUFnQztBQUVsQyxJQUFNLHdCQUFOLE1BQTRCO0FBQUEsRUFFbEMsWUFDa0IsT0FDQSxPQUNtQixtQkFDUyxtQkFDNUM7QUFKZ0I7QUFDQTtBQUNtQjtBQUNTO0FBQUEsRUFFOUM7QUFBQSxFQUVBLE1BQWEsUUFBaUM7QUFFN0MsVUFBTSxLQUFLLE1BQU0sS0FBSyxrQkFB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
