import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { isUndefinedOrNull } from "../../../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import * as Adapt from "../../../common/model/objectMutationLog.js";
const enablePerf = process.env.VSCODE_PERF_CHAT_OBJECT_MUTATION_LOG === "true";
function perfSuite(name, callback) {
  if (enablePerf) {
    suite(name, callback);
  }
}
var EntryKind = /* @__PURE__ */ ((EntryKind2) => {
  EntryKind2[EntryKind2["Initial"] = 0] = "Initial";
  EntryKind2[EntryKind2["Set"] = 1] = "Set";
  EntryKind2[EntryKind2["Push"] = 2] = "Push";
  EntryKind2[EntryKind2["Delete"] = 3] = "Delete";
  return EntryKind2;
})(EntryKind || {});
function isTransformValue(transform) {
  return "equals" in transform;
}
function isTransformArray(transform) {
  return "itemSchema" in transform;
}
function isTransformObject(transform) {
  return "children" in transform;
}
function isKeyTransform(transform) {
  return isTransformValue(transform) && transform.kind === 0;
}
function isVoidFunction(value) {
  return typeof value === "function";
}
const benchmarkConfig = {
  iterations: 120,
  sealedItems: 1500,
  activeItems: 4,
  payloadSize: 128,
  rounds: 5
};
class ReferenceReusingObjectMutationLog {
  constructor(_transform, _compactAfterEntries = 512) {
    this._transform = _transform;
    this._compactAfterEntries = _compactAfterEntries;
    this._entryCount = 0;
    this.reusedReferences = 0;
  }
  createInitial(current) {
    const value = this._transform.extract(current);
    this._previous = value;
    this._entryCount = 1;
    const entry = { kind: 0 /* Initial */, v: value };
    return VSBuffer.fromString(JSON.stringify(entry) + "\n");
  }
  write(current) {
    const currentValue = this._transform.extract(current);
    if (!this._previous || this._entryCount > this._compactAfterEntries) {
      this._previous = currentValue;
      this._entryCount = 1;
      const entry = { kind: 0 /* Initial */, v: currentValue };
      return { op: "replace", data: VSBuffer.fromString(JSON.stringify(entry) + "\n") };
    }
    const entries = [];
    this._diff(this._transform, [], this._previous, currentValue, entries);
    if (entries.length === 0) {
      return { op: "append", data: VSBuffer.fromString("") };
    }
    this._entryCount += entries.length;
    this._previous = currentValue;
    let data = "";
    for (const entry of entries) {
      data += JSON.stringify(entry) + "\n";
    }
    return { op: "append", data: VSBuffer.fromString(data) };
  }
  confirmWrite() {
  }
  _diff(transform, path, prev, curr, entries) {
    if (isTransformValue(transform)) {
      if (!transform.equals(prev, curr)) {
        entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
      }
    } else if (isUndefinedOrNull(prev) || isUndefinedOrNull(curr)) {
      if (prev !== curr) {
        if (curr === void 0) {
          entries.push({ kind: 3 /* Delete */, k: path.slice() });
        } else if (curr === null) {
          entries.push({ kind: 1 /* Set */, k: path.slice(), v: null });
        } else {
          entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
        }
      }
    } else if (isTransformArray(transform)) {
      this._diffArray(transform, path, prev, curr, entries);
    } else if (isTransformObject(transform)) {
      this._diffObject(transform.children, path, prev, curr, entries, transform.sealed);
    } else {
      throw new Error(`Unknown transform kind ${JSON.stringify(transform)}`);
    }
  }
  _diffObject(children, path, prev, curr, entries, sealed) {
    const prevObj = prev;
    const currObj = curr;
    let i = 0;
    for (; i < children.length; i++) {
      const [key, transform] = children[i];
      if (!isKeyTransform(transform)) {
        break;
      }
      if (!transform.equals(prevObj?.[key], currObj[key])) {
        entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
        return false;
      }
    }
    if (sealed && sealed(prev, true) && sealed(curr, false)) {
      return true;
    }
    for (; i < children.length; i++) {
      const [key, transform] = children[i];
      path.push(key);
      this._diff(transform, path, prevObj?.[key], currObj[key], entries);
      path.pop();
    }
    return false;
  }
  _diffArray(transform, path, prev, curr, entries) {
    const prevArr = prev || [];
    const currArr = curr || [];
    const itemSchema = transform.itemSchema;
    const minLen = Math.min(prevArr.length, currArr.length);
    if (isTransformObject(itemSchema)) {
      const childEntries = itemSchema.children;
      for (let i = 0; i < minLen; i++) {
        const prevItem = prevArr[i];
        const currItem = currArr[i];
        if (this._hasKeyMismatch(childEntries, prevItem, currItem)) {
          const newItems = currArr.slice(i);
          entries.push({ kind: 2 /* Push */, k: path.slice(), v: newItems.length > 0 ? newItems : void 0, i });
          return;
        }
        path.push(i);
        const wasSealed = this._diffObject(childEntries, path, prevItem, currItem, entries, itemSchema.sealed);
        path.pop();
        if (wasSealed) {
          currArr[i] = prevItem;
          this.reusedReferences++;
        }
      }
      if (currArr.length > prevArr.length) {
        entries.push({ kind: 2 /* Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
      } else if (currArr.length < prevArr.length) {
        entries.push({ kind: 2 /* Push */, k: path.slice(), i: currArr.length });
      }
    } else {
      let firstMismatch = -1;
      for (let i = 0; i < minLen; i++) {
        if (!itemSchema.equals(prevArr[i], currArr[i])) {
          firstMismatch = i;
          break;
        }
      }
      if (firstMismatch === -1) {
        if (currArr.length > prevArr.length) {
          entries.push({ kind: 2 /* Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
        } else if (currArr.length < prevArr.length) {
          entries.push({ kind: 2 /* Push */, k: path.slice(), i: currArr.length });
        }
      } else {
        const newItems = currArr.slice(firstMismatch);
        entries.push({ kind: 2 /* Push */, k: path.slice(), v: newItems.length > 0 ? newItems : void 0, i: firstMismatch });
      }
    }
  }
  _hasKeyMismatch(children, prev, curr) {
    const prevObj = prev;
    const currObj = curr;
    for (const [key, transform] of children) {
      if (!isKeyTransform(transform)) {
        break;
      }
      if (!transform.equals(prevObj?.[key], currObj[key])) {
        return true;
      }
    }
    return false;
  }
}
function createBenchmarkSchema() {
  const itemSchema = Adapt.object({
    id: Adapt.t((item) => item.id, Adapt.key()),
    content: Adapt.t((item) => item.content, Adapt.value()),
    references: Adapt.t((item) => item.references, Adapt.array(Adapt.value())),
    isSealed: Adapt.t((item) => item.isSealed, Adapt.value())
  }, {
    sealed: (item) => item.isSealed
  });
  return Adapt.object({
    items: Adapt.t((state) => state.items, Adapt.array(itemSchema))
  });
}
function createPayload(label, size) {
  return `${label}:${"x".repeat(size)}`;
}
function createBenchmarkState(iteration) {
  const items = [];
  for (let i = 0; i < benchmarkConfig.sealedItems; i++) {
    items.push({
      id: `sealed-${i}`,
      content: createPayload(`sealed-${i}`, benchmarkConfig.payloadSize),
      references: [
        createPayload(`ref-${i}-a`, benchmarkConfig.payloadSize / 2),
        createPayload(`ref-${i}-b`, benchmarkConfig.payloadSize / 2)
      ],
      isSealed: true
    });
  }
  for (let i = 0; i < benchmarkConfig.activeItems; i++) {
    const revision = i === benchmarkConfig.activeItems - 1 ? iteration : 0;
    items.push({
      id: `active-${i}`,
      content: createPayload(`active-${i}-${revision}`, benchmarkConfig.payloadSize),
      references: [
        createPayload(`active-ref-${i}-${revision}`, benchmarkConfig.payloadSize / 2),
        createPayload(`active-ref-${i}-stable`, benchmarkConfig.payloadSize / 2)
      ],
      isSealed: false
    });
  }
  return { items };
}
function createBenchmarkStates() {
  const states = [];
  for (let i = 0; i < benchmarkConfig.iterations; i++) {
    states.push(createBenchmarkState(i));
  }
  return states;
}
function appendToLog(current, result) {
  if (result.op === "replace") {
    return result.data;
  }
  return VSBuffer.concat([current, result.data]);
}
function collectGarbage() {
  const gc = Reflect.get(globalThis, "gc");
  if (isVoidFunction(gc)) {
    gc();
  }
}
function runBenchmarkRound(writer, states, schema) {
  collectGarbage();
  const initialHeap = process.memoryUsage().heapUsed;
  let serialized = writer.createInitial(states[0]);
  const sw = StopWatch.create();
  for (let i = 1; i < states.length; i++) {
    serialized = appendToLog(serialized, writer.write(states[i]));
    writer.confirmWrite();
  }
  const elapsedMs = sw.elapsed();
  collectGarbage();
  const finalHeap = process.memoryUsage().heapUsed;
  const reader = new Adapt.ObjectMutationLog(schema);
  assert.deepStrictEqual(reader.read(serialized), states[states.length - 1]);
  return {
    elapsedMs,
    heapDeltaBytes: finalHeap - initialHeap,
    serialized,
    reusedReferences: writer.reusedReferences ?? 0
  };
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}
function formatBytes(bytes) {
  const sign = bytes < 0 ? "-" : "";
  const absolute = Math.abs(bytes);
  if (absolute < 1024) {
    return `${bytes} B`;
  }
  if (absolute < 1024 * 1024) {
    return `${sign}${(absolute / 1024).toFixed(1)} KB`;
  }
  return `${sign}${(absolute / (1024 * 1024)).toFixed(2)} MB`;
}
perfSuite("Chat ObjectMutationLog - perf", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  const schema = createBenchmarkSchema();
  const states = createBenchmarkStates();
  test("compares baseline writes against sealed-reference reuse", function() {
    this.timeout(12e4);
    runBenchmarkRound(new Adapt.ObjectMutationLog(schema), states, schema);
    runBenchmarkRound(new ReferenceReusingObjectMutationLog(schema), states, schema);
    const baselineResults = [];
    const optimizedResults = [];
    for (let i = 0; i < benchmarkConfig.rounds; i++) {
      baselineResults.push(runBenchmarkRound(new Adapt.ObjectMutationLog(schema), states, schema));
      optimizedResults.push(runBenchmarkRound(new ReferenceReusingObjectMutationLog(schema), states, schema));
    }
    assert.strictEqual(baselineResults[0].serialized.toString(), optimizedResults[0].serialized.toString());
    const baselineElapsed = median(baselineResults.map((result) => result.elapsedMs));
    const optimizedElapsed = median(optimizedResults.map((result) => result.elapsedMs));
    const baselineHeap = median(baselineResults.map((result) => result.heapDeltaBytes));
    const optimizedHeap = median(optimizedResults.map((result) => result.heapDeltaBytes));
    const optimizedReusedReferences = median(optimizedResults.map((result) => result.reusedReferences));
    console.log("[chat objectMutationLog perf] config", benchmarkConfig);
    console.log("[chat objectMutationLog perf] baseline", {
      medianElapsedMs: baselineElapsed,
      medianHeapDelta: formatBytes(baselineHeap),
      serializedBytes: baselineResults[0].serialized.byteLength
    });
    console.log("[chat objectMutationLog perf] optimized", {
      medianElapsedMs: optimizedElapsed,
      medianHeapDelta: formatBytes(optimizedHeap),
      serializedBytes: optimizedResults[0].serialized.byteLength,
      reusedReferences: optimizedReusedReferences
    });
    console.log("[chat objectMutationLog perf] delta", {
      elapsedMs: optimizedElapsed - baselineElapsed,
      heapDelta: formatBytes(optimizedHeap - baselineHeap),
      elapsedRatio: Number((optimizedElapsed / baselineElapsed).toFixed(3))
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxcXG9iamVjdE11dGF0aW9uTG9nLnBlcmYudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0ICogYXMgQWRhcHQgZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL29iamVjdE11dGF0aW9uTG9nLmpzJztcblxuY29uc3QgZW5hYmxlUGVyZiA9IHByb2Nlc3MuZW52LlZTQ09ERV9QRVJGX0NIQVRfT0JKRUNUX01VVEFUSU9OX0xPRyA9PT0gJ3RydWUnO1xuXG5mdW5jdGlvbiBwZXJmU3VpdGUobmFtZTogc3RyaW5nLCBjYWxsYmFjazogKHRoaXM6IE1vY2hhLlN1aXRlKSA9PiB2b2lkKTogdm9pZCB7XG5cdGlmIChlbmFibGVQZXJmKSB7XG5cdFx0c3VpdGUobmFtZSwgY2FsbGJhY2spO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gRW50cnlLaW5kIHtcblx0SW5pdGlhbCA9IDAsXG5cdFNldCA9IDEsXG5cdFB1c2ggPSAyLFxuXHREZWxldGUgPSAzLFxufVxuXG50eXBlIE9iamVjdFBhdGggPSAoc3RyaW5nIHwgbnVtYmVyKVtdO1xuXG50eXBlIEVudHJ5ID1cblx0fCB7IGtpbmQ6IEVudHJ5S2luZC5Jbml0aWFsOyB2OiB1bmtub3duIH1cblx0fCB7IGtpbmQ6IEVudHJ5S2luZC5TZXQ7IGs6IE9iamVjdFBhdGg7IHY6IHVua25vd24gfVxuXHR8IHsga2luZDogRW50cnlLaW5kLkRlbGV0ZTsgazogT2JqZWN0UGF0aCB9XG5cdHwgeyBraW5kOiBFbnRyeUtpbmQuUHVzaDsgazogT2JqZWN0UGF0aDsgdj86IHVua25vd25bXTsgaT86IG51bWJlciB9O1xuXG5pbnRlcmZhY2UgQmVuY2htYXJrSXRlbSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVmZXJlbmNlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGlzU2VhbGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgQmVuY2htYXJrU3RhdGUge1xuXHRyZWFkb25seSBpdGVtczogcmVhZG9ubHkgQmVuY2htYXJrSXRlbVtdO1xufVxuXG5pbnRlcmZhY2UgQmVuY2htYXJrUmVzdWx0IHtcblx0cmVhZG9ubHkgZWxhcHNlZE1zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhlYXBEZWx0YUJ5dGVzOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNlcmlhbGl6ZWQ6IFZTQnVmZmVyO1xuXHRyZWFkb25seSByZXVzZWRSZWZlcmVuY2VzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBCZW5jaG1hcmtXcml0ZXI8VD4ge1xuXHRjcmVhdGVJbml0aWFsKGN1cnJlbnQ6IFQpOiBWU0J1ZmZlcjtcblx0d3JpdGUoY3VycmVudDogVCk6IHsgb3A6ICdhcHBlbmQnIHwgJ3JlcGxhY2UnOyBkYXRhOiBWU0J1ZmZlciB9O1xuXHRjb25maXJtV3JpdGUoKTogdm9pZDtcblx0cmVhZG9ubHkgcmV1c2VkUmVmZXJlbmNlcz86IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gaXNUcmFuc2Zvcm1WYWx1ZTxURnJvbSwgVFRvPih0cmFuc2Zvcm06IEFkYXB0LlRyYW5zZm9ybTxURnJvbSwgVFRvPik6IHRyYW5zZm9ybSBpcyBBZGFwdC5UcmFuc2Zvcm1WYWx1ZTxURnJvbSwgVFRvPiB7XG5cdHJldHVybiAnZXF1YWxzJyBpbiB0cmFuc2Zvcm07XG59XG5cbmZ1bmN0aW9uIGlzVHJhbnNmb3JtQXJyYXk8VEZyb20sIFRUbz4odHJhbnNmb3JtOiBBZGFwdC5UcmFuc2Zvcm08VEZyb20sIFRUbz4pOiB0cmFuc2Zvcm0gaXMgQWRhcHQuVHJhbnNmb3JtQXJyYXk8VEZyb20sIFRUbz4ge1xuXHRyZXR1cm4gJ2l0ZW1TY2hlbWEnIGluIHRyYW5zZm9ybTtcbn1cblxuZnVuY3Rpb24gaXNUcmFuc2Zvcm1PYmplY3Q8VEZyb20sIFRUbz4odHJhbnNmb3JtOiBBZGFwdC5UcmFuc2Zvcm08VEZyb20sIFRUbz4pOiB0cmFuc2Zvcm0gaXMgQWRhcHQuVHJhbnNmb3JtT2JqZWN0PFRGcm9tLCBUVG8+IHtcblx0cmV0dXJuICdjaGlsZHJlbicgaW4gdHJhbnNmb3JtO1xufVxuXG5mdW5jdGlvbiBpc0tleVRyYW5zZm9ybSh0cmFuc2Zvcm06IEFkYXB0LlRyYW5zZm9ybTx1bmtub3duLCB1bmtub3duPik6IHRyYW5zZm9ybSBpcyBBZGFwdC5UcmFuc2Zvcm1WYWx1ZTx1bmtub3duLCB1bmtub3duPiB7XG5cdHJldHVybiBpc1RyYW5zZm9ybVZhbHVlKHRyYW5zZm9ybSkgJiYgdHJhbnNmb3JtLmtpbmQgPT09IDA7XG59XG5cbmZ1bmN0aW9uIGlzVm9pZEZ1bmN0aW9uKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgKCkgPT4gdm9pZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbic7XG59XG5cbmNvbnN0IGJlbmNobWFya0NvbmZpZyA9IHtcblx0aXRlcmF0aW9uczogMTIwLFxuXHRzZWFsZWRJdGVtczogMTUwMCxcblx0YWN0aXZlSXRlbXM6IDQsXG5cdHBheWxvYWRTaXplOiAxMjgsXG5cdHJvdW5kczogNSxcbn0gYXMgY29uc3Q7XG5cbmNsYXNzIFJlZmVyZW5jZVJldXNpbmdPYmplY3RNdXRhdGlvbkxvZzxURnJvbSwgVFRvPiBpbXBsZW1lbnRzIEJlbmNobWFya1dyaXRlcjxURnJvbT4ge1xuXHRwcml2YXRlIF9wcmV2aW91czogVFRvIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lbnRyeUNvdW50ID0gMDtcblx0cHVibGljIHJldXNlZFJlZmVyZW5jZXMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zZm9ybTogQWRhcHQuVHJhbnNmb3JtPFRGcm9tLCBUVG8+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBhY3RBZnRlckVudHJpZXMgPSA1MTIsXG5cdCkgeyB9XG5cblx0Y3JlYXRlSW5pdGlhbChjdXJyZW50OiBURnJvbSk6IFZTQnVmZmVyIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3RyYW5zZm9ybS5leHRyYWN0KGN1cnJlbnQpO1xuXHRcdHRoaXMuX3ByZXZpb3VzID0gdmFsdWU7XG5cdFx0dGhpcy5fZW50cnlDb3VudCA9IDE7XG5cdFx0Y29uc3QgZW50cnk6IEVudHJ5ID0geyBraW5kOiBFbnRyeUtpbmQuSW5pdGlhbCwgdjogdmFsdWUgfTtcblx0XHRyZXR1cm4gVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShlbnRyeSkgKyAnXFxuJyk7XG5cdH1cblxuXHR3cml0ZShjdXJyZW50OiBURnJvbSk6IHsgb3A6ICdhcHBlbmQnIHwgJ3JlcGxhY2UnOyBkYXRhOiBWU0J1ZmZlciB9IHtcblx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSB0aGlzLl90cmFuc2Zvcm0uZXh0cmFjdChjdXJyZW50KTtcblxuXHRcdGlmICghdGhpcy5fcHJldmlvdXMgfHwgdGhpcy5fZW50cnlDb3VudCA+IHRoaXMuX2NvbXBhY3RBZnRlckVudHJpZXMpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzID0gY3VycmVudFZhbHVlO1xuXHRcdFx0dGhpcy5fZW50cnlDb3VudCA9IDE7XG5cdFx0XHRjb25zdCBlbnRyeTogRW50cnkgPSB7IGtpbmQ6IEVudHJ5S2luZC5Jbml0aWFsLCB2OiBjdXJyZW50VmFsdWUgfTtcblx0XHRcdHJldHVybiB7IG9wOiAncmVwbGFjZScsIGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoZW50cnkpICsgJ1xcbicpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllczogRW50cnlbXSA9IFtdO1xuXHRcdHRoaXMuX2RpZmYodGhpcy5fdHJhbnNmb3JtLCBbXSwgdGhpcy5fcHJldmlvdXMsIGN1cnJlbnRWYWx1ZSwgZW50cmllcyk7XG5cblx0XHRpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IG9wOiAnYXBwZW5kJywgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZygnJykgfTtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnRyeUNvdW50ICs9IGVudHJpZXMubGVuZ3RoO1xuXHRcdHRoaXMuX3ByZXZpb3VzID0gY3VycmVudFZhbHVlO1xuXG5cdFx0bGV0IGRhdGEgPSAnJztcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGRhdGEgKz0gSlNPTi5zdHJpbmdpZnkoZW50cnkpICsgJ1xcbic7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgb3A6ICdhcHBlbmQnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGRhdGEpIH07XG5cdH1cblxuXHRjb25maXJtV3JpdGUoKTogdm9pZCB7XG5cdFx0Ly8gUGVyZiBiZW5jaG1hcmsgYWx3YXlzIHN1Y2NlZWRzLCBzdGF0ZSBpcyBlYWdlcmx5IHVwZGF0ZWQgaW4gd3JpdGUoKVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlmZjxULCBSPihcblx0XHR0cmFuc2Zvcm06IEFkYXB0LlRyYW5zZm9ybTxULCBSPixcblx0XHRwYXRoOiBPYmplY3RQYXRoLFxuXHRcdHByZXY6IFIsXG5cdFx0Y3VycjogUixcblx0XHRlbnRyaWVzOiBFbnRyeVtdXG5cdCk6IHZvaWQge1xuXHRcdGlmIChpc1RyYW5zZm9ybVZhbHVlKHRyYW5zZm9ybSkpIHtcblx0XHRcdGlmICghdHJhbnNmb3JtLmVxdWFscyhwcmV2LCBjdXJyKSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuU2V0LCBrOiBwYXRoLnNsaWNlKCksIHY6IGN1cnIgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1VuZGVmaW5lZE9yTnVsbChwcmV2KSB8fCBpc1VuZGVmaW5lZE9yTnVsbChjdXJyKSkge1xuXHRcdFx0aWYgKHByZXYgIT09IGN1cnIpIHtcblx0XHRcdFx0aWYgKGN1cnIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5EZWxldGUsIGs6IHBhdGguc2xpY2UoKSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjdXJyID09PSBudWxsKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlNldCwgazogcGF0aC5zbGljZSgpLCB2OiBudWxsIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5TZXQsIGs6IHBhdGguc2xpY2UoKSwgdjogY3VyciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNUcmFuc2Zvcm1BcnJheSh0cmFuc2Zvcm0pKSB7XG5cdFx0XHR0aGlzLl9kaWZmQXJyYXkodHJhbnNmb3JtLCBwYXRoLCBwcmV2IGFzIHVua25vd25bXSwgY3VyciBhcyB1bmtub3duW10sIGVudHJpZXMpO1xuXHRcdH0gZWxzZSBpZiAoaXNUcmFuc2Zvcm1PYmplY3QodHJhbnNmb3JtKSkge1xuXHRcdFx0dGhpcy5fZGlmZk9iamVjdCh0cmFuc2Zvcm0uY2hpbGRyZW4sIHBhdGgsIHByZXYsIGN1cnIsIGVudHJpZXMsIHRyYW5zZm9ybS5zZWFsZWQgYXMgKChvYmo6IHVua25vd24sIHdhc1NlcmlhbGl6ZWQ6IGJvb2xlYW4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRyYW5zZm9ybSBraW5kICR7SlNPTi5zdHJpbmdpZnkodHJhbnNmb3JtKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWZmT2JqZWN0KFxuXHRcdGNoaWxkcmVuOiBBZGFwdC5TY2hlbWFFbnRyaWVzLFxuXHRcdHBhdGg6IE9iamVjdFBhdGgsXG5cdFx0cHJldjogdW5rbm93bixcblx0XHRjdXJyOiB1bmtub3duLFxuXHRcdGVudHJpZXM6IEVudHJ5W10sXG5cdFx0c2VhbGVkPzogKG9iajogdW5rbm93biwgd2FzU2VyaWFsaXplZDogYm9vbGVhbikgPT4gYm9vbGVhbixcblx0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJldk9iaiA9IHByZXYgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3Vyck9iaiA9IGN1cnIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cblx0XHRsZXQgaSA9IDA7XG5cdFx0Zm9yICg7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgW2tleSwgdHJhbnNmb3JtXSA9IGNoaWxkcmVuW2ldO1xuXHRcdFx0aWYgKCFpc0tleVRyYW5zZm9ybSh0cmFuc2Zvcm0pKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRyYW5zZm9ybS5lcXVhbHMocHJldk9iaj8uW2tleV0sIGN1cnJPYmpba2V5XSkpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlNldCwgazogcGF0aC5zbGljZSgpLCB2OiBjdXJyIH0pO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlYWxlZCAmJiBzZWFsZWQocHJldiwgdHJ1ZSkgJiYgc2VhbGVkKGN1cnIsIGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yICg7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgW2tleSwgdHJhbnNmb3JtXSA9IGNoaWxkcmVuW2ldO1xuXHRcdFx0cGF0aC5wdXNoKGtleSk7XG5cdFx0XHR0aGlzLl9kaWZmKHRyYW5zZm9ybSwgcGF0aCwgcHJldk9iaj8uW2tleV0sIGN1cnJPYmpba2V5XSwgZW50cmllcyk7XG5cdFx0XHRwYXRoLnBvcCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2RpZmZBcnJheTxULCBSPihcblx0XHR0cmFuc2Zvcm06IEFkYXB0LlRyYW5zZm9ybUFycmF5PFQsIFI+LFxuXHRcdHBhdGg6IE9iamVjdFBhdGgsXG5cdFx0cHJldjogdW5rbm93bltdIHwgdW5kZWZpbmVkLFxuXHRcdGN1cnI6IHVua25vd25bXSB8IHVuZGVmaW5lZCxcblx0XHRlbnRyaWVzOiBFbnRyeVtdXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZBcnIgPSBwcmV2IHx8IFtdO1xuXHRcdGNvbnN0IGN1cnJBcnIgPSBjdXJyIHx8IFtdO1xuXHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSB0cmFuc2Zvcm0uaXRlbVNjaGVtYTtcblx0XHRjb25zdCBtaW5MZW4gPSBNYXRoLm1pbihwcmV2QXJyLmxlbmd0aCwgY3VyckFyci5sZW5ndGgpO1xuXG5cdFx0aWYgKGlzVHJhbnNmb3JtT2JqZWN0KGl0ZW1TY2hlbWEpKSB7XG5cdFx0XHRjb25zdCBjaGlsZEVudHJpZXMgPSBpdGVtU2NoZW1hLmNoaWxkcmVuO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1pbkxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZJdGVtID0gcHJldkFycltpXTtcblx0XHRcdFx0Y29uc3QgY3Vyckl0ZW0gPSBjdXJyQXJyW2ldO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9oYXNLZXlNaXNtYXRjaChjaGlsZEVudHJpZXMsIHByZXZJdGVtLCBjdXJySXRlbSkpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdJdGVtcyA9IGN1cnJBcnIuc2xpY2UoaSk7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgdjogbmV3SXRlbXMubGVuZ3RoID4gMCA/IG5ld0l0ZW1zIDogdW5kZWZpbmVkLCBpIH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBhdGgucHVzaChpKTtcblx0XHRcdFx0Y29uc3Qgd2FzU2VhbGVkID0gdGhpcy5fZGlmZk9iamVjdChjaGlsZEVudHJpZXMsIHBhdGgsIHByZXZJdGVtLCBjdXJySXRlbSwgZW50cmllcywgaXRlbVNjaGVtYS5zZWFsZWQpO1xuXHRcdFx0XHRwYXRoLnBvcCgpO1xuXG5cdFx0XHRcdGlmICh3YXNTZWFsZWQpIHtcblx0XHRcdFx0XHRjdXJyQXJyW2ldID0gcHJldkl0ZW07XG5cdFx0XHRcdFx0dGhpcy5yZXVzZWRSZWZlcmVuY2VzKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJBcnIubGVuZ3RoID4gcHJldkFyci5sZW5ndGgpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgdjogY3VyckFyci5zbGljZShwcmV2QXJyLmxlbmd0aCkgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJBcnIubGVuZ3RoIDwgcHJldkFyci5sZW5ndGgpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgaTogY3VyckFyci5sZW5ndGggfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBmaXJzdE1pc21hdGNoID0gLTE7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWluTGVuOyBpKyspIHtcblx0XHRcdFx0aWYgKCFpdGVtU2NoZW1hLmVxdWFscyhwcmV2QXJyW2ldLCBjdXJyQXJyW2ldKSkge1xuXHRcdFx0XHRcdGZpcnN0TWlzbWF0Y2ggPSBpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaXJzdE1pc21hdGNoID09PSAtMSkge1xuXHRcdFx0XHRpZiAoY3VyckFyci5sZW5ndGggPiBwcmV2QXJyLmxlbmd0aCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5QdXNoLCBrOiBwYXRoLnNsaWNlKCksIHY6IGN1cnJBcnIuc2xpY2UocHJldkFyci5sZW5ndGgpIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN1cnJBcnIubGVuZ3RoIDwgcHJldkFyci5sZW5ndGgpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuUHVzaCwgazogcGF0aC5zbGljZSgpLCBpOiBjdXJyQXJyLmxlbmd0aCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV3SXRlbXMgPSBjdXJyQXJyLnNsaWNlKGZpcnN0TWlzbWF0Y2gpO1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuUHVzaCwgazogcGF0aC5zbGljZSgpLCB2OiBuZXdJdGVtcy5sZW5ndGggPiAwID8gbmV3SXRlbXMgOiB1bmRlZmluZWQsIGk6IGZpcnN0TWlzbWF0Y2ggfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzS2V5TWlzbWF0Y2goY2hpbGRyZW46IEFkYXB0LlNjaGVtYUVudHJpZXMsIHByZXY6IHVua25vd24sIGN1cnI6IHVua25vd24pOiBib29sZWFuIHtcblx0XHRjb25zdCBwcmV2T2JqID0gcHJldiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjdXJyT2JqID0gY3VyciBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuXHRcdGZvciAoY29uc3QgW2tleSwgdHJhbnNmb3JtXSBvZiBjaGlsZHJlbikge1xuXHRcdFx0aWYgKCFpc0tleVRyYW5zZm9ybSh0cmFuc2Zvcm0pKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRyYW5zZm9ybS5lcXVhbHMocHJldk9iaj8uW2tleV0sIGN1cnJPYmpba2V5XSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlbmNobWFya1NjaGVtYSgpOiBBZGFwdC5UcmFuc2Zvcm1PYmplY3Q8QmVuY2htYXJrU3RhdGUsIEJlbmNobWFya1N0YXRlPiB7XG5cdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8QmVuY2htYXJrSXRlbSwgQmVuY2htYXJrSXRlbT4oe1xuXHRcdGlkOiBBZGFwdC50KGl0ZW0gPT4gaXRlbS5pZCwgQWRhcHQua2V5KCkpLFxuXHRcdGNvbnRlbnQ6IEFkYXB0LnQoaXRlbSA9PiBpdGVtLmNvbnRlbnQsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdHJlZmVyZW5jZXM6IEFkYXB0LnQoaXRlbSA9PiBpdGVtLnJlZmVyZW5jZXMsIEFkYXB0LmFycmF5KEFkYXB0LnZhbHVlKCkpKSxcblx0XHRpc1NlYWxlZDogQWRhcHQudChpdGVtID0+IGl0ZW0uaXNTZWFsZWQsIEFkYXB0LnZhbHVlKCkpLFxuXHR9LCB7XG5cdFx0c2VhbGVkOiBpdGVtID0+IGl0ZW0uaXNTZWFsZWQsXG5cdH0pO1xuXG5cdHJldHVybiBBZGFwdC5vYmplY3Q8QmVuY2htYXJrU3RhdGUsIEJlbmNobWFya1N0YXRlPih7XG5cdFx0aXRlbXM6IEFkYXB0LnQoc3RhdGUgPT4gc3RhdGUuaXRlbXMsIEFkYXB0LmFycmF5KGl0ZW1TY2hlbWEpKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBheWxvYWQobGFiZWw6IHN0cmluZywgc2l6ZTogbnVtYmVyKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke2xhYmVsfTokeyd4Jy5yZXBlYXQoc2l6ZSl9YDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVuY2htYXJrU3RhdGUoaXRlcmF0aW9uOiBudW1iZXIpOiBCZW5jaG1hcmtTdGF0ZSB7XG5cdGNvbnN0IGl0ZW1zOiBCZW5jaG1hcmtJdGVtW10gPSBbXTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGJlbmNobWFya0NvbmZpZy5zZWFsZWRJdGVtczsgaSsrKSB7XG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRpZDogYHNlYWxlZC0ke2l9YCxcblx0XHRcdGNvbnRlbnQ6IGNyZWF0ZVBheWxvYWQoYHNlYWxlZC0ke2l9YCwgYmVuY2htYXJrQ29uZmlnLnBheWxvYWRTaXplKSxcblx0XHRcdHJlZmVyZW5jZXM6IFtcblx0XHRcdFx0Y3JlYXRlUGF5bG9hZChgcmVmLSR7aX0tYWAsIGJlbmNobWFya0NvbmZpZy5wYXlsb2FkU2l6ZSAvIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXlsb2FkKGByZWYtJHtpfS1iYCwgYmVuY2htYXJrQ29uZmlnLnBheWxvYWRTaXplIC8gMiksXG5cdFx0XHRdLFxuXHRcdFx0aXNTZWFsZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGJlbmNobWFya0NvbmZpZy5hY3RpdmVJdGVtczsgaSsrKSB7XG5cdFx0Y29uc3QgcmV2aXNpb24gPSBpID09PSBiZW5jaG1hcmtDb25maWcuYWN0aXZlSXRlbXMgLSAxID8gaXRlcmF0aW9uIDogMDtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGlkOiBgYWN0aXZlLSR7aX1gLFxuXHRcdFx0Y29udGVudDogY3JlYXRlUGF5bG9hZChgYWN0aXZlLSR7aX0tJHtyZXZpc2lvbn1gLCBiZW5jaG1hcmtDb25maWcucGF5bG9hZFNpemUpLFxuXHRcdFx0cmVmZXJlbmNlczogW1xuXHRcdFx0XHRjcmVhdGVQYXlsb2FkKGBhY3RpdmUtcmVmLSR7aX0tJHtyZXZpc2lvbn1gLCBiZW5jaG1hcmtDb25maWcucGF5bG9hZFNpemUgLyAyKSxcblx0XHRcdFx0Y3JlYXRlUGF5bG9hZChgYWN0aXZlLXJlZi0ke2l9LXN0YWJsZWAsIGJlbmNobWFya0NvbmZpZy5wYXlsb2FkU2l6ZSAvIDIpLFxuXHRcdFx0XSxcblx0XHRcdGlzU2VhbGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiB7IGl0ZW1zIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlbmNobWFya1N0YXRlcygpOiBCZW5jaG1hcmtTdGF0ZVtdIHtcblx0Y29uc3Qgc3RhdGVzOiBCZW5jaG1hcmtTdGF0ZVtdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYmVuY2htYXJrQ29uZmlnLml0ZXJhdGlvbnM7IGkrKykge1xuXHRcdHN0YXRlcy5wdXNoKGNyZWF0ZUJlbmNobWFya1N0YXRlKGkpKTtcblx0fVxuXHRyZXR1cm4gc3RhdGVzO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRUb0xvZyhjdXJyZW50OiBWU0J1ZmZlciwgcmVzdWx0OiB7IG9wOiAnYXBwZW5kJyB8ICdyZXBsYWNlJzsgZGF0YTogVlNCdWZmZXIgfSk6IFZTQnVmZmVyIHtcblx0aWYgKHJlc3VsdC5vcCA9PT0gJ3JlcGxhY2UnKSB7XG5cdFx0cmV0dXJuIHJlc3VsdC5kYXRhO1xuXHR9XG5cblx0cmV0dXJuIFZTQnVmZmVyLmNvbmNhdChbY3VycmVudCwgcmVzdWx0LmRhdGFdKTtcbn1cblxuZnVuY3Rpb24gY29sbGVjdEdhcmJhZ2UoKTogdm9pZCB7XG5cdGNvbnN0IGdjID0gUmVmbGVjdC5nZXQoZ2xvYmFsVGhpcywgJ2djJyk7XG5cdGlmIChpc1ZvaWRGdW5jdGlvbihnYykpIHtcblx0XHRnYygpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJ1bkJlbmNobWFya1JvdW5kKHdyaXRlcjogQmVuY2htYXJrV3JpdGVyPEJlbmNobWFya1N0YXRlPiwgc3RhdGVzOiByZWFkb25seSBCZW5jaG1hcmtTdGF0ZVtdLCBzY2hlbWE6IEFkYXB0LlRyYW5zZm9ybU9iamVjdDxCZW5jaG1hcmtTdGF0ZSwgQmVuY2htYXJrU3RhdGU+KTogQmVuY2htYXJrUmVzdWx0IHtcblx0Y29sbGVjdEdhcmJhZ2UoKTtcblx0Y29uc3QgaW5pdGlhbEhlYXAgPSBwcm9jZXNzLm1lbW9yeVVzYWdlKCkuaGVhcFVzZWQ7XG5cblx0bGV0IHNlcmlhbGl6ZWQgPSB3cml0ZXIuY3JlYXRlSW5pdGlhbChzdGF0ZXNbMF0pO1xuXHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBzdGF0ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRzZXJpYWxpemVkID0gYXBwZW5kVG9Mb2coc2VyaWFsaXplZCwgd3JpdGVyLndyaXRlKHN0YXRlc1tpXSkpO1xuXHRcdHdyaXRlci5jb25maXJtV3JpdGUoKTtcblx0fVxuXHRjb25zdCBlbGFwc2VkTXMgPSBzdy5lbGFwc2VkKCk7XG5cblx0Y29sbGVjdEdhcmJhZ2UoKTtcblx0Y29uc3QgZmluYWxIZWFwID0gcHJvY2Vzcy5tZW1vcnlVc2FnZSgpLmhlYXBVc2VkO1xuXG5cdGNvbnN0IHJlYWRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRlci5yZWFkKHNlcmlhbGl6ZWQpLCBzdGF0ZXNbc3RhdGVzLmxlbmd0aCAtIDFdKTtcblxuXHRyZXR1cm4ge1xuXHRcdGVsYXBzZWRNcyxcblx0XHRoZWFwRGVsdGFCeXRlczogZmluYWxIZWFwIC0gaW5pdGlhbEhlYXAsXG5cdFx0c2VyaWFsaXplZCxcblx0XHRyZXVzZWRSZWZlcmVuY2VzOiB3cml0ZXIucmV1c2VkUmVmZXJlbmNlcyA/PyAwLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtZWRpYW4odmFsdWVzOiByZWFkb25seSBudW1iZXJbXSk6IG51bWJlciB7XG5cdGNvbnN0IHNvcnRlZCA9IFsuLi52YWx1ZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblx0Y29uc3QgbWlkZGxlID0gTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMik7XG5cdGlmIChzb3J0ZWQubGVuZ3RoICUgMiA9PT0gMCkge1xuXHRcdHJldHVybiAoc29ydGVkW21pZGRsZSAtIDFdICsgc29ydGVkW21pZGRsZV0pIC8gMjtcblx0fVxuXG5cdHJldHVybiBzb3J0ZWRbbWlkZGxlXTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0Qnl0ZXMoYnl0ZXM6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHNpZ24gPSBieXRlcyA8IDAgPyAnLScgOiAnJztcblx0Y29uc3QgYWJzb2x1dGUgPSBNYXRoLmFicyhieXRlcyk7XG5cdGlmIChhYnNvbHV0ZSA8IDEwMjQpIHtcblx0XHRyZXR1cm4gYCR7Ynl0ZXN9IEJgO1xuXHR9XG5cdGlmIChhYnNvbHV0ZSA8IDEwMjQgKiAxMDI0KSB7XG5cdFx0cmV0dXJuIGAke3NpZ259JHsoYWJzb2x1dGUgLyAxMDI0KS50b0ZpeGVkKDEpfSBLQmA7XG5cdH1cblxuXHRyZXR1cm4gYCR7c2lnbn0keyhhYnNvbHV0ZSAvICgxMDI0ICogMTAyNCkpLnRvRml4ZWQoMil9IE1CYDtcbn1cblxucGVyZlN1aXRlKCdDaGF0IE9iamVjdE11dGF0aW9uTG9nIC0gcGVyZicsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlQmVuY2htYXJrU2NoZW1hKCk7XG5cdGNvbnN0IHN0YXRlcyA9IGNyZWF0ZUJlbmNobWFya1N0YXRlcygpO1xuXG5cdHRlc3QoJ2NvbXBhcmVzIGJhc2VsaW5lIHdyaXRlcyBhZ2FpbnN0IHNlYWxlZC1yZWZlcmVuY2UgcmV1c2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEyMF8wMDApO1xuXG5cdFx0Ly8gV2FybSB1cCBib3RoIHZhcmlhbnRzIG9uY2Ugc28gdGhlIG1lYXN1cmVkIHJvdW5kcyBhcmUgbGVzcyBub2lzeS5cblx0XHRydW5CZW5jaG1hcmtSb3VuZChuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKSwgc3RhdGVzLCBzY2hlbWEpO1xuXHRcdHJ1bkJlbmNobWFya1JvdW5kKG5ldyBSZWZlcmVuY2VSZXVzaW5nT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKSwgc3RhdGVzLCBzY2hlbWEpO1xuXG5cdFx0Y29uc3QgYmFzZWxpbmVSZXN1bHRzOiBCZW5jaG1hcmtSZXN1bHRbXSA9IFtdO1xuXHRcdGNvbnN0IG9wdGltaXplZFJlc3VsdHM6IEJlbmNobWFya1Jlc3VsdFtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGJlbmNobWFya0NvbmZpZy5yb3VuZHM7IGkrKykge1xuXHRcdFx0YmFzZWxpbmVSZXN1bHRzLnB1c2gocnVuQmVuY2htYXJrUm91bmQobmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSksIHN0YXRlcywgc2NoZW1hKSk7XG5cdFx0XHRvcHRpbWl6ZWRSZXN1bHRzLnB1c2gocnVuQmVuY2htYXJrUm91bmQobmV3IFJlZmVyZW5jZVJldXNpbmdPYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpLCBzdGF0ZXMsIHNjaGVtYSkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbGluZVJlc3VsdHNbMF0uc2VyaWFsaXplZC50b1N0cmluZygpLCBvcHRpbWl6ZWRSZXN1bHRzWzBdLnNlcmlhbGl6ZWQudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBiYXNlbGluZUVsYXBzZWQgPSBtZWRpYW4oYmFzZWxpbmVSZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmVsYXBzZWRNcykpO1xuXHRcdGNvbnN0IG9wdGltaXplZEVsYXBzZWQgPSBtZWRpYW4ob3B0aW1pemVkUmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5lbGFwc2VkTXMpKTtcblx0XHRjb25zdCBiYXNlbGluZUhlYXAgPSBtZWRpYW4oYmFzZWxpbmVSZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmhlYXBEZWx0YUJ5dGVzKSk7XG5cdFx0Y29uc3Qgb3B0aW1pemVkSGVhcCA9IG1lZGlhbihvcHRpbWl6ZWRSZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmhlYXBEZWx0YUJ5dGVzKSk7XG5cdFx0Y29uc3Qgb3B0aW1pemVkUmV1c2VkUmVmZXJlbmNlcyA9IG1lZGlhbihvcHRpbWl6ZWRSZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJldXNlZFJlZmVyZW5jZXMpKTtcblxuXHRcdGNvbnNvbGUubG9nKCdbY2hhdCBvYmplY3RNdXRhdGlvbkxvZyBwZXJmXSBjb25maWcnLCBiZW5jaG1hcmtDb25maWcpO1xuXHRcdGNvbnNvbGUubG9nKCdbY2hhdCBvYmplY3RNdXRhdGlvbkxvZyBwZXJmXSBiYXNlbGluZScsIHtcblx0XHRcdG1lZGlhbkVsYXBzZWRNczogYmFzZWxpbmVFbGFwc2VkLFxuXHRcdFx0bWVkaWFuSGVhcERlbHRhOiBmb3JtYXRCeXRlcyhiYXNlbGluZUhlYXApLFxuXHRcdFx0c2VyaWFsaXplZEJ5dGVzOiBiYXNlbGluZVJlc3VsdHNbMF0uc2VyaWFsaXplZC5ieXRlTGVuZ3RoLFxuXHRcdH0pO1xuXHRcdGNvbnNvbGUubG9nKCdbY2hhdCBvYmplY3RNdXRhdGlvbkxvZyBwZXJmXSBvcHRpbWl6ZWQnLCB7XG5cdFx0XHRtZWRpYW5FbGFwc2VkTXM6IG9wdGltaXplZEVsYXBzZWQsXG5cdFx0XHRtZWRpYW5IZWFwRGVsdGE6IGZvcm1hdEJ5dGVzKG9wdGltaXplZEhlYXApLFxuXHRcdFx0c2VyaWFsaXplZEJ5dGVzOiBvcHRpbWl6ZWRSZXN1bHRzWzBdLnNlcmlhbGl6ZWQuYnl0ZUxlbmd0aCxcblx0XHRcdHJldXNlZFJlZmVyZW5jZXM6IG9wdGltaXplZFJldXNlZFJlZmVyZW5jZXMsXG5cdFx0fSk7XG5cdFx0Y29uc29sZS5sb2coJ1tjaGF0IG9iamVjdE11dGF0aW9uTG9nIHBlcmZdIGRlbHRhJywge1xuXHRcdFx0ZWxhcHNlZE1zOiBvcHRpbWl6ZWRFbGFwc2VkIC0gYmFzZWxpbmVFbGFwc2VkLFxuXHRcdFx0aGVhcERlbHRhOiBmb3JtYXRCeXRlcyhvcHRpbWl6ZWRIZWFwIC0gYmFzZWxpbmVIZWFwKSxcblx0XHRcdGVsYXBzZWRSYXRpbzogTnVtYmVyKChvcHRpbWl6ZWRFbGFwc2VkIC8gYmFzZWxpbmVFbGFwc2VkKS50b0ZpeGVkKDMpKSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtDQUErQztBQUN4RCxZQUFZLFdBQVc7QUFFdkIsTUFBTSxhQUFhLFFBQVEsSUFBSSx5Q0FBeUM7QUFFeEUsU0FBUyxVQUFVLE1BQWMsVUFBNkM7QUFDN0UsTUFBSSxZQUFZO0FBQ2YsVUFBTSxNQUFNLFFBQVE7QUFBQSxFQUNyQjtBQUNEO0FBRUEsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBQ0MsRUFBQUEsc0JBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsc0JBQUEsU0FBTSxLQUFOO0FBQ0Es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
