import { deepClone, equals } from "../../../base/common/objects.js";
import * as semver from "../../../base/common/semver/semver.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
function merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions, lastSyncBuiltinExtensions) {
  const added = [];
  const removed = [];
  const updated = [];
  if (!remoteExtensions) {
    const remote2 = localExtensions.filter(({ identifier }) => ignoredExtensions.every((id) => id.toLowerCase() !== identifier.id.toLowerCase()));
    return {
      local: {
        added,
        removed,
        updated
      },
      remote: remote2.length > 0 ? {
        added: remote2,
        updated: [],
        removed: [],
        all: remote2
      } : null
    };
  }
  localExtensions = localExtensions.map(massageIncomingExtension);
  remoteExtensions = remoteExtensions.map(massageIncomingExtension);
  lastSyncExtensions = lastSyncExtensions ? lastSyncExtensions.map(massageIncomingExtension) : null;
  const uuids = /* @__PURE__ */ new Map();
  const addUUID = (identifier) => {
    if (identifier.uuid) {
      uuids.set(identifier.id.toLowerCase(), identifier.uuid);
    }
  };
  localExtensions.forEach(({ identifier }) => addUUID(identifier));
  remoteExtensions.forEach(({ identifier }) => addUUID(identifier));
  lastSyncExtensions?.forEach(({ identifier }) => addUUID(identifier));
  skippedExtensions?.forEach(({ identifier }) => addUUID(identifier));
  lastSyncBuiltinExtensions?.forEach((identifier) => addUUID(identifier));
  const getKey = (extension) => {
    const uuid = extension.identifier.uuid || uuids.get(extension.identifier.id.toLowerCase());
    return uuid ? `uuid:${uuid}` : `id:${extension.identifier.id.toLowerCase()}`;
  };
  const addExtensionToMap = (map, extension) => {
    map.set(getKey(extension), extension);
    return map;
  };
  const localExtensionsMap = localExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map());
  const remoteExtensionsMap = remoteExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map());
  const newRemoteExtensionsMap = remoteExtensions.reduce((map, extension) => addExtensionToMap(map, deepClone(extension)), /* @__PURE__ */ new Map());
  const lastSyncExtensionsMap = lastSyncExtensions ? lastSyncExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map()) : null;
  const skippedExtensionsMap = skippedExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map());
  const ignoredExtensionsSet = ignoredExtensions.reduce((set, id) => {
    const uuid = uuids.get(id.toLowerCase());
    return set.add(uuid ? `uuid:${uuid}` : `id:${id.toLowerCase()}`);
  }, /* @__PURE__ */ new Set());
  const lastSyncBuiltinExtensionsSet = lastSyncBuiltinExtensions ? lastSyncBuiltinExtensions.reduce((set, { id, uuid }) => {
    uuid = uuid ?? uuids.get(id.toLowerCase());
    return set.add(uuid ? `uuid:${uuid}` : `id:${id.toLowerCase()}`);
  }, /* @__PURE__ */ new Set()) : null;
  const localToRemote = compare(localExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet, false);
  if (localToRemote.added.size > 0 || localToRemote.removed.size > 0 || localToRemote.updated.size > 0) {
    const baseToLocal = compare(lastSyncExtensionsMap, localExtensionsMap, ignoredExtensionsSet, false);
    const baseToRemote = compare(lastSyncExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet, true);
    const merge2 = (key, localExtension, remoteExtension, preferred) => {
      let pinned, version, preRelease;
      if (localExtension.installed) {
        pinned = preferred.pinned;
        preRelease = preferred.preRelease;
        if (pinned) {
          version = preferred.version;
        }
      } else {
        pinned = remoteExtension.pinned;
        preRelease = remoteExtension.preRelease;
        if (pinned) {
          version = remoteExtension.version;
        }
      }
      if (pinned === void 0) {
        pinned = localExtension.pinned;
        if (pinned) {
          version = localExtension.version;
        }
      }
      if (preRelease === void 0) {
        preRelease = localExtension.preRelease;
      }
      return {
        ...preferred,
        installed: localExtension.installed || remoteExtension.installed,
        pinned,
        preRelease,
        version: version ?? (remoteExtension.version && (!localExtension.installed || semver.gt(remoteExtension.version, localExtension.version)) ? remoteExtension.version : localExtension.version),
        state: mergeExtensionState(localExtension, remoteExtension, lastSyncExtensionsMap?.get(key))
      };
    };
    for (const key of baseToRemote.removed.values()) {
      const localExtension = localExtensionsMap.get(key);
      if (!localExtension) {
        continue;
      }
      const baseExtension = assertReturnsDefined(lastSyncExtensionsMap?.get(key));
      const wasAnInstalledExtensionDuringLastSync = lastSyncBuiltinExtensionsSet && !lastSyncBuiltinExtensionsSet.has(key) && baseExtension.installed;
      if (localExtension.installed && wasAnInstalledExtensionDuringLastSync) {
        removed.push(localExtension.identifier);
      } else {
        newRemoteExtensionsMap.set(key, localExtension);
      }
    }
    for (const key of baseToRemote.added.values()) {
      const remoteExtension = assertReturnsDefined(remoteExtensionsMap.get(key));
      const localExtension = localExtensionsMap.get(key);
      if (localExtension) {
        if (localToRemote.updated.has(key)) {
          const mergedExtension = merge2(key, localExtension, remoteExtension, remoteExtension);
          if (!areSame(localExtension, remoteExtension, false, false)) {
            updated.push(massageOutgoingExtension(mergedExtension, key));
          }
          newRemoteExtensionsMap.set(key, mergedExtension);
        }
      } else {
        if (remoteExtension.installed) {
          added.push(massageOutgoingExtension(remoteExtension, key));
        }
      }
    }
    for (const key of baseToRemote.updated.values()) {
      const remoteExtension = assertReturnsDefined(remoteExtensionsMap.get(key));
      const baseExtension = assertReturnsDefined(lastSyncExtensionsMap?.get(key));
      const localExtension = localExtensionsMap.get(key);
      if (localExtension) {
        const wasAnInstalledExtensionDuringLastSync = lastSyncBuiltinExtensionsSet && !lastSyncBuiltinExtensionsSet.has(key) && baseExtension.installed;
        if (wasAnInstalledExtensionDuringLastSync && localExtension.installed && !remoteExtension.installed) {
          removed.push(localExtension.identifier);
        } else {
          const mergedExtension = merge2(key, localExtension, remoteExtension, remoteExtension);
          updated.push(massageOutgoingExtension(mergedExtension, key));
          newRemoteExtensionsMap.set(key, mergedExtension);
        }
      } else if (remoteExtension.installed) {
        added.push(massageOutgoingExtension(remoteExtension, key));
      }
    }
    for (const key of baseToLocal.added.values()) {
      if (baseToRemote.added.has(key)) {
        continue;
      }
      newRemoteExtensionsMap.set(key, assertReturnsDefined(localExtensionsMap.get(key)));
    }
    for (const key of baseToLocal.updated.values()) {
      if (baseToRemote.removed.has(key)) {
        continue;
      }
      if (baseToRemote.updated.has(key)) {
        continue;
      }
      const localExtension = assertReturnsDefined(localExtensionsMap.get(key));
      const remoteExtension = assertReturnsDefined(remoteExtensionsMap.get(key));
      newRemoteExtensionsMap.set(key, merge2(key, localExtension, remoteExtension, localExtension));
    }
    for (const key of baseToLocal.removed.values()) {
      if (baseToRemote.updated.has(key)) {
        continue;
      }
      if (baseToRemote.removed.has(key)) {
        continue;
      }
      if (skippedExtensionsMap.has(key)) {
        continue;
      }
      if (!assertReturnsDefined(remoteExtensionsMap.get(key)).installed) {
        continue;
      }
      if (!lastSyncBuiltinExtensionsSet) {
        continue;
      }
      if (lastSyncBuiltinExtensionsSet.has(key) || !assertReturnsDefined(lastSyncExtensionsMap?.get(key)).installed) {
        continue;
      }
      newRemoteExtensionsMap.delete(key);
    }
  }
  const remote = [];
  const remoteChanges = compare(remoteExtensionsMap, newRemoteExtensionsMap, /* @__PURE__ */ new Set(), true);
  const hasRemoteChanges = remoteChanges.added.size > 0 || remoteChanges.updated.size > 0 || remoteChanges.removed.size > 0;
  if (hasRemoteChanges) {
    newRemoteExtensionsMap.forEach((value, key) => remote.push(massageOutgoingExtension(value, key)));
  }
  return {
    local: { added, removed, updated },
    remote: hasRemoteChanges ? {
      added: [...remoteChanges.added].map((id) => newRemoteExtensionsMap.get(id)),
      updated: [...remoteChanges.updated].map((id) => newRemoteExtensionsMap.get(id)),
      removed: [...remoteChanges.removed].map((id) => remoteExtensionsMap.get(id)),
      all: remote
    } : null
  };
}
function compare(from, to, ignoredExtensions, checkVersionProperty) {
  const fromKeys = from ? [...from.keys()].filter((key) => !ignoredExtensions.has(key)) : [];
  const toKeys = [...to.keys()].filter((key) => !ignoredExtensions.has(key));
  const added = toKeys.filter((key) => !fromKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const removed = fromKeys.filter((key) => !toKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const updated = /* @__PURE__ */ new Set();
  for (const key of fromKeys) {
    if (removed.has(key)) {
      continue;
    }
    const fromExtension = from.get(key);
    const toExtension = to.get(key);
    if (!toExtension || !areSame(fromExtension, toExtension, checkVersionProperty, true)) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function areSame(fromExtension, toExtension, checkVersionProperty, checkInstalledProperty) {
  if (fromExtension.disabled !== toExtension.disabled) {
    return false;
  }
  if (!!fromExtension.isApplicationScoped !== !!toExtension.isApplicationScoped) {
    return false;
  }
  if (checkInstalledProperty && fromExtension.installed !== toExtension.installed) {
    return false;
  }
  if (fromExtension.installed && toExtension.installed) {
    if (fromExtension.preRelease !== toExtension.preRelease) {
      return false;
    }
    if (fromExtension.pinned !== toExtension.pinned) {
      return false;
    }
    if (toExtension.pinned && fromExtension.version !== toExtension.version) {
      return false;
    }
  }
  if (!isSameExtensionState(fromExtension.state, toExtension.state)) {
    return false;
  }
  if (checkVersionProperty && fromExtension.version !== toExtension.version) {
    return false;
  }
  return true;
}
function mergeExtensionState(localExtension, remoteExtension, lastSyncExtension) {
  const localState = localExtension.state;
  const remoteState = remoteExtension.state;
  const baseState = lastSyncExtension?.state;
  if (!remoteExtension.version) {
    return localState;
  }
  if (localState && semver.gt(localExtension.version, remoteExtension.version)) {
    return localState;
  }
  if (remoteState && semver.gt(remoteExtension.version, localExtension.version)) {
    return remoteState;
  }
  if (!localState) {
    return remoteState;
  }
  if (!remoteState) {
    return localState;
  }
  const mergedState = deepClone(localState);
  const baseToRemote = baseState ? compareExtensionState(baseState, remoteState) : { added: Object.keys(remoteState).reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  const baseToLocal = baseState ? compareExtensionState(baseState, localState) : { added: Object.keys(localState).reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  for (const key of [...baseToRemote.added.values(), ...baseToRemote.updated.values()]) {
    mergedState[key] = remoteState[key];
  }
  for (const key of baseToRemote.removed.values()) {
    if (!baseToLocal.updated.has(key)) {
      delete mergedState[key];
    }
  }
  return mergedState;
}
function compareExtensionState(from, to) {
  const fromKeys = Object.keys(from);
  const toKeys = Object.keys(to);
  const added = toKeys.filter((key) => !fromKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const removed = fromKeys.filter((key) => !toKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const updated = /* @__PURE__ */ new Set();
  for (const key of fromKeys) {
    if (removed.has(key)) {
      continue;
    }
    const value1 = from[key];
    const value2 = to[key];
    if (!equals(value1, value2)) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function isSameExtensionState(a = {}, b = {}) {
  const { added, removed, updated } = compareExtensionState(a, b);
  return added.size === 0 && removed.size === 0 && updated.size === 0;
}
function massageIncomingExtension(extension) {
  return { ...extension, ...{ disabled: !!extension.disabled, installed: !!extension.installed } };
}
function massageOutgoingExtension(extension, key) {
  const massagedExtension = {
    ...extension,
    identifier: {
      id: extension.identifier.id,
      uuid: key.startsWith("uuid:") ? key.substring("uuid:".length) : void 0
    },
    /* set following always so that to differentiate with older clients */
    preRelease: !!extension.preRelease,
    pinned: !!extension.pinned
  };
  if (!extension.disabled) {
    delete massagedExtension.disabled;
  }
  if (!extension.installed) {
    delete massagedExtension.installed;
  }
  if (!extension.state) {
    delete massagedExtension.state;
  }
  if (!extension.isApplicationScoped) {
    delete massagedExtension.isApplicationScoped;
  }
  return massagedExtension;
}
export {
  merge
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXGV4dGVuc2lvbnNNZXJnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lLCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHNlbXZlciBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZW12ZXIvc2VtdmVyLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2NhbFN5bmNFeHRlbnNpb24sIElSZW1vdGVTeW5jRXh0ZW5zaW9uLCBJU3luY0V4dGVuc2lvbiB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTWVyZ2VSZXN1bHQge1xuXHRyZWFkb25seSBsb2NhbDogeyBhZGRlZDogSVN5bmNFeHRlbnNpb25bXTsgcmVtb3ZlZDogSUV4dGVuc2lvbklkZW50aWZpZXJbXTsgdXBkYXRlZDogSVN5bmNFeHRlbnNpb25bXSB9O1xuXHRyZWFkb25seSByZW1vdGU6IHsgYWRkZWQ6IElTeW5jRXh0ZW5zaW9uW107IHJlbW92ZWQ6IElTeW5jRXh0ZW5zaW9uW107IHVwZGF0ZWQ6IElTeW5jRXh0ZW5zaW9uW107IGFsbDogSVN5bmNFeHRlbnNpb25bXSB9IHwgbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlKGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdLCByZW1vdGVFeHRlbnNpb25zOiBJUmVtb3RlU3luY0V4dGVuc2lvbltdIHwgbnVsbCwgbGFzdFN5bmNFeHRlbnNpb25zOiBJUmVtb3RlU3luY0V4dGVuc2lvbltdIHwgbnVsbCwgc2tpcHBlZEV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10sIGlnbm9yZWRFeHRlbnNpb25zOiBzdHJpbmdbXSwgbGFzdFN5bmNCdWlsdGluRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB8IG51bGwpOiBJTWVyZ2VSZXN1bHQge1xuXHRjb25zdCBhZGRlZDogSVN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRjb25zdCByZW1vdmVkOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdGNvbnN0IHVwZGF0ZWQ6IElTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblxuXHRpZiAoIXJlbW90ZUV4dGVuc2lvbnMpIHtcblx0XHRjb25zdCByZW1vdGUgPSBsb2NhbEV4dGVuc2lvbnMuZmlsdGVyKCh7IGlkZW50aWZpZXIgfSkgPT4gaWdub3JlZEV4dGVuc2lvbnMuZXZlcnkoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSAhPT0gaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxvY2FsOiB7XG5cdFx0XHRcdGFkZGVkLFxuXHRcdFx0XHRyZW1vdmVkLFxuXHRcdFx0XHR1cGRhdGVkLFxuXHRcdFx0fSxcblx0XHRcdHJlbW90ZTogcmVtb3RlLmxlbmd0aCA+IDAgPyB7XG5cdFx0XHRcdGFkZGVkOiByZW1vdGUsXG5cdFx0XHRcdHVwZGF0ZWQ6IFtdLFxuXHRcdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdFx0YWxsOiByZW1vdGVcblx0XHRcdH0gOiBudWxsXG5cdFx0fTtcblx0fVxuXG5cdGxvY2FsRXh0ZW5zaW9ucyA9IGxvY2FsRXh0ZW5zaW9ucy5tYXAobWFzc2FnZUluY29taW5nRXh0ZW5zaW9uKSBhcyBJTG9jYWxTeW5jRXh0ZW5zaW9uW107XG5cdHJlbW90ZUV4dGVuc2lvbnMgPSByZW1vdGVFeHRlbnNpb25zLm1hcChtYXNzYWdlSW5jb21pbmdFeHRlbnNpb24pO1xuXHRsYXN0U3luY0V4dGVuc2lvbnMgPSBsYXN0U3luY0V4dGVuc2lvbnMgPyBsYXN0U3luY0V4dGVuc2lvbnMubWFwKG1hc3NhZ2VJbmNvbWluZ0V4dGVuc2lvbikgOiBudWxsO1xuXG5cdGNvbnN0IHV1aWRzOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgYWRkVVVJRCA9IChpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcikgPT4geyBpZiAoaWRlbnRpZmllci51dWlkKSB7IHV1aWRzLnNldChpZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIGlkZW50aWZpZXIudXVpZCk7IH0gfTtcblx0bG9jYWxFeHRlbnNpb25zLmZvckVhY2goKHsgaWRlbnRpZmllciB9KSA9PiBhZGRVVUlEKGlkZW50aWZpZXIpKTtcblx0cmVtb3RlRXh0ZW5zaW9ucy5mb3JFYWNoKCh7IGlkZW50aWZpZXIgfSkgPT4gYWRkVVVJRChpZGVudGlmaWVyKSk7XG5cdGxhc3RTeW5jRXh0ZW5zaW9ucz8uZm9yRWFjaCgoeyBpZGVudGlmaWVyIH0pID0+IGFkZFVVSUQoaWRlbnRpZmllcikpO1xuXHRza2lwcGVkRXh0ZW5zaW9ucz8uZm9yRWFjaCgoeyBpZGVudGlmaWVyIH0pID0+IGFkZFVVSUQoaWRlbnRpZmllcikpO1xuXHRsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zPy5mb3JFYWNoKGlkZW50aWZpZXIgPT4gYWRkVVVJRChpZGVudGlmaWVyKSk7XG5cblx0Y29uc3QgZ2V0S2V5ID0gKGV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24pOiBzdHJpbmcgPT4ge1xuXHRcdGNvbnN0IHV1aWQgPSBleHRlbnNpb24uaWRlbnRpZmllci51dWlkIHx8IHV1aWRzLmdldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRyZXR1cm4gdXVpZCA/IGB1dWlkOiR7dXVpZH1gIDogYGlkOiR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX1gO1xuXHR9O1xuXHRjb25zdCBhZGRFeHRlbnNpb25Ub01hcCA9IChtYXA6IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPiwgZXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbikgPT4ge1xuXHRcdG1hcC5zZXQoZ2V0S2V5KGV4dGVuc2lvbiksIGV4dGVuc2lvbik7XG5cdFx0cmV0dXJuIG1hcDtcblx0fTtcblx0Y29uc3QgbG9jYWxFeHRlbnNpb25zTWFwOiBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4gPSBsb2NhbEV4dGVuc2lvbnMucmVkdWNlKGFkZEV4dGVuc2lvblRvTWFwLCBuZXcgTWFwPHN0cmluZywgSVN5bmNFeHRlbnNpb24+KCkpO1xuXHRjb25zdCByZW1vdGVFeHRlbnNpb25zTWFwID0gcmVtb3RlRXh0ZW5zaW9ucy5yZWR1Y2UoYWRkRXh0ZW5zaW9uVG9NYXAsIG5ldyBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4oKSk7XG5cdGNvbnN0IG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAgPSByZW1vdGVFeHRlbnNpb25zLnJlZHVjZSgobWFwOiBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4sIGV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24pID0+IGFkZEV4dGVuc2lvblRvTWFwKG1hcCwgZGVlcENsb25lKGV4dGVuc2lvbikpLCBuZXcgTWFwPHN0cmluZywgSVN5bmNFeHRlbnNpb24+KCkpO1xuXHRjb25zdCBsYXN0U3luY0V4dGVuc2lvbnNNYXAgPSBsYXN0U3luY0V4dGVuc2lvbnMgPyBsYXN0U3luY0V4dGVuc2lvbnMucmVkdWNlKGFkZEV4dGVuc2lvblRvTWFwLCBuZXcgTWFwPHN0cmluZywgSVN5bmNFeHRlbnNpb24+KCkpIDogbnVsbDtcblx0Y29uc3Qgc2tpcHBlZEV4dGVuc2lvbnNNYXAgPSBza2lwcGVkRXh0ZW5zaW9ucy5yZWR1Y2UoYWRkRXh0ZW5zaW9uVG9NYXAsIG5ldyBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4oKSk7XG5cdGNvbnN0IGlnbm9yZWRFeHRlbnNpb25zU2V0ID0gaWdub3JlZEV4dGVuc2lvbnMucmVkdWNlKChzZXQsIGlkKSA9PiB7XG5cdFx0Y29uc3QgdXVpZCA9IHV1aWRzLmdldChpZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRyZXR1cm4gc2V0LmFkZCh1dWlkID8gYHV1aWQ6JHt1dWlkfWAgOiBgaWQ6JHtpZC50b0xvd2VyQ2FzZSgpfWApO1xuXHR9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IGxhc3RTeW5jQnVpbHRpbkV4dGVuc2lvbnNTZXQgPSBsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zID8gbGFzdFN5bmNCdWlsdGluRXh0ZW5zaW9ucy5yZWR1Y2UoKHNldCwgeyBpZCwgdXVpZCB9KSA9PiB7XG5cdFx0dXVpZCA9IHV1aWQgPz8gdXVpZHMuZ2V0KGlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdHJldHVybiBzZXQuYWRkKHV1aWQgPyBgdXVpZDoke3V1aWR9YCA6IGBpZDoke2lkLnRvTG93ZXJDYXNlKCl9YCk7XG5cdH0sIG5ldyBTZXQ8c3RyaW5nPigpKSA6IG51bGw7XG5cblx0Y29uc3QgbG9jYWxUb1JlbW90ZSA9IGNvbXBhcmUobG9jYWxFeHRlbnNpb25zTWFwLCByZW1vdGVFeHRlbnNpb25zTWFwLCBpZ25vcmVkRXh0ZW5zaW9uc1NldCwgZmFsc2UpO1xuXHRpZiAobG9jYWxUb1JlbW90ZS5hZGRlZC5zaXplID4gMCB8fCBsb2NhbFRvUmVtb3RlLnJlbW92ZWQuc2l6ZSA+IDAgfHwgbG9jYWxUb1JlbW90ZS51cGRhdGVkLnNpemUgPiAwKSB7XG5cblx0XHRjb25zdCBiYXNlVG9Mb2NhbCA9IGNvbXBhcmUobGFzdFN5bmNFeHRlbnNpb25zTWFwLCBsb2NhbEV4dGVuc2lvbnNNYXAsIGlnbm9yZWRFeHRlbnNpb25zU2V0LCBmYWxzZSk7XG5cdFx0Y29uc3QgYmFzZVRvUmVtb3RlID0gY29tcGFyZShsYXN0U3luY0V4dGVuc2lvbnNNYXAsIHJlbW90ZUV4dGVuc2lvbnNNYXAsIGlnbm9yZWRFeHRlbnNpb25zU2V0LCB0cnVlKTtcblxuXHRcdGNvbnN0IG1lcmdlID0gKGtleTogc3RyaW5nLCBsb2NhbEV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24sIHByZWZlcnJlZDogSVN5bmNFeHRlbnNpb24pOiBJU3luY0V4dGVuc2lvbiA9PiB7XG5cdFx0XHRsZXQgcGlubmVkOiBib29sZWFuIHwgdW5kZWZpbmVkLCB2ZXJzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHByZVJlbGVhc2U6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobG9jYWxFeHRlbnNpb24uaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHBpbm5lZCA9IHByZWZlcnJlZC5waW5uZWQ7XG5cdFx0XHRcdHByZVJlbGVhc2UgPSBwcmVmZXJyZWQucHJlUmVsZWFzZTtcblx0XHRcdFx0aWYgKHBpbm5lZCkge1xuXHRcdFx0XHRcdHZlcnNpb24gPSBwcmVmZXJyZWQudmVyc2lvbjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGlubmVkID0gcmVtb3RlRXh0ZW5zaW9uLnBpbm5lZDtcblx0XHRcdFx0cHJlUmVsZWFzZSA9IHJlbW90ZUV4dGVuc2lvbi5wcmVSZWxlYXNlO1xuXHRcdFx0XHRpZiAocGlubmVkKSB7XG5cdFx0XHRcdFx0dmVyc2lvbiA9IHJlbW90ZUV4dGVuc2lvbi52ZXJzaW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocGlubmVkID09PSB1bmRlZmluZWQgLyogZnJvbSBvbGRlciBjbGllbnQqLykge1xuXHRcdFx0XHRwaW5uZWQgPSBsb2NhbEV4dGVuc2lvbi5waW5uZWQ7XG5cdFx0XHRcdGlmIChwaW5uZWQpIHtcblx0XHRcdFx0XHR2ZXJzaW9uID0gbG9jYWxFeHRlbnNpb24udmVyc2lvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHByZVJlbGVhc2UgPT09IHVuZGVmaW5lZCAvKiBmcm9tIG9sZGVyIGNsaWVudCovKSB7XG5cdFx0XHRcdHByZVJlbGVhc2UgPSBsb2NhbEV4dGVuc2lvbi5wcmVSZWxlYXNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ucHJlZmVycmVkLFxuXHRcdFx0XHRpbnN0YWxsZWQ6IGxvY2FsRXh0ZW5zaW9uLmluc3RhbGxlZCB8fCByZW1vdGVFeHRlbnNpb24uaW5zdGFsbGVkLFxuXHRcdFx0XHRwaW5uZWQsXG5cdFx0XHRcdHByZVJlbGVhc2UsXG5cdFx0XHRcdHZlcnNpb246IHZlcnNpb24gPz8gKHJlbW90ZUV4dGVuc2lvbi52ZXJzaW9uICYmICghbG9jYWxFeHRlbnNpb24uaW5zdGFsbGVkIHx8IHNlbXZlci5ndChyZW1vdGVFeHRlbnNpb24udmVyc2lvbiwgbG9jYWxFeHRlbnNpb24udmVyc2lvbikpID8gcmVtb3RlRXh0ZW5zaW9uLnZlcnNpb24gOiBsb2NhbEV4dGVuc2lvbi52ZXJzaW9uKSxcblx0XHRcdFx0c3RhdGU6IG1lcmdlRXh0ZW5zaW9uU3RhdGUobG9jYWxFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbiwgbGFzdFN5bmNFeHRlbnNpb25zTWFwPy5nZXQoa2V5KSksXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHQvLyBSZW1vdGVseSByZW1vdmVkIGV4dGVuc2lvbiA9PiBleGlzdCBpbiBiYXNlIGFuZCBkb2VzIG5vdCBpbiByZW1vdGVcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUucmVtb3ZlZC52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgbG9jYWxFeHRlbnNpb24gPSBsb2NhbEV4dGVuc2lvbnNNYXAuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWxvY2FsRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBiYXNlRXh0ZW5zaW9uID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQobGFzdFN5bmNFeHRlbnNpb25zTWFwPy5nZXQoa2V5KSk7XG5cdFx0XHRjb25zdCB3YXNBbkluc3RhbGxlZEV4dGVuc2lvbkR1cmluZ0xhc3RTeW5jID0gbGFzdFN5bmNCdWlsdGluRXh0ZW5zaW9uc1NldCAmJiAhbGFzdFN5bmNCdWlsdGluRXh0ZW5zaW9uc1NldC5oYXMoa2V5KSAmJiBiYXNlRXh0ZW5zaW9uLmluc3RhbGxlZDtcblx0XHRcdGlmIChsb2NhbEV4dGVuc2lvbi5pbnN0YWxsZWQgJiYgd2FzQW5JbnN0YWxsZWRFeHRlbnNpb25EdXJpbmdMYXN0U3luYyAvKiBJdCBpcyBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIG5vdyBhbmQgZHVyaW5nIGxhc3Qgc3luYyAqLykge1xuXHRcdFx0XHQvLyBJbnN0YWxsZWQgZXh0ZW5zaW9uIGlzIHJlbW92ZWQgZnJvbSByZW1vdGUuIFJlbW92ZSBpdCBmcm9tIGxvY2FsLlxuXHRcdFx0XHRyZW1vdmVkLnB1c2gobG9jYWxFeHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBBZGQgdG8gcmVtb3RlOiBJdCBpcyBhIGJ1aWx0aW4gZXh0ZW5pc2lvbiBvciBnb3QgaW5zdGFsbGVkIGFmdGVyIGxhc3Qgc3luY1xuXHRcdFx0XHRuZXdSZW1vdGVFeHRlbnNpb25zTWFwLnNldChrZXksIGxvY2FsRXh0ZW5zaW9uKTtcblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdC8vIFJlbW90ZWx5IGFkZGVkIGV4dGVuc2lvbiA9PiBkb2VzIG5vdCBleGlzdCBpbiBiYXNlIGFuZCBleGlzdCBpbiByZW1vdGVcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUuYWRkZWQudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IGFzc2VydFJldHVybnNEZWZpbmVkKHJlbW90ZUV4dGVuc2lvbnNNYXAuZ2V0KGtleSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxFeHRlbnNpb24gPSBsb2NhbEV4dGVuc2lvbnNNYXAuZ2V0KGtleSk7XG5cblx0XHRcdC8vIEFsc28gZXhpc3QgaW4gbG9jYWxcblx0XHRcdGlmIChsb2NhbEV4dGVuc2lvbikge1xuXHRcdFx0XHQvLyBJcyBkaWZmZXJlbnQgZnJvbSBsb2NhbCB0byByZW1vdGVcblx0XHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZEV4dGVuc2lvbiA9IG1lcmdlKGtleSwgbG9jYWxFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uKTtcblx0XHRcdFx0XHQvLyBVcGRhdGUgbG9jYWxseSBvbmx5IHdoZW4gdGhlIGV4dGVuc2lvbiBoYXMgY2hhbmdlcyBpbiBwcm9wZXJ0aWVzIG90aGVyIHRoYW4gaW5zdGFsbGVkIHBvcGVydHlcblx0XHRcdFx0XHRpZiAoIWFyZVNhbWUobG9jYWxFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbiwgZmFsc2UsIGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0dXBkYXRlZC5wdXNoKG1hc3NhZ2VPdXRnb2luZ0V4dGVuc2lvbihtZXJnZWRFeHRlbnNpb24sIGtleSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRuZXdSZW1vdGVFeHRlbnNpb25zTWFwLnNldChrZXksIG1lcmdlZEV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEFkZCBvbmx5IGlmIHRoZSBleHRlbnNpb24gaXMgYW4gaW5zdGFsbGVkIGV4dGVuc2lvblxuXHRcdFx0XHRpZiAocmVtb3RlRXh0ZW5zaW9uLmluc3RhbGxlZCkge1xuXHRcdFx0XHRcdGFkZGVkLnB1c2gobWFzc2FnZU91dGdvaW5nRXh0ZW5zaW9uKHJlbW90ZUV4dGVuc2lvbiwga2V5KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1vdGVseSB1cGRhdGVkIGV4dGVuc2lvbiA9PiBleGlzdCBpbiBiYXNlIGFuZCByZW1vdGVcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUudXBkYXRlZC52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQocmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoa2V5KSk7XG5cdFx0XHRjb25zdCBiYXNlRXh0ZW5zaW9uID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQobGFzdFN5bmNFeHRlbnNpb25zTWFwPy5nZXQoa2V5KSk7XG5cdFx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbiA9IGxvY2FsRXh0ZW5zaW9uc01hcC5nZXQoa2V5KTtcblxuXHRcdFx0Ly8gQWxzbyBleGlzdCBpbiBsb2NhbFxuXHRcdFx0aWYgKGxvY2FsRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGNvbnN0IHdhc0FuSW5zdGFsbGVkRXh0ZW5zaW9uRHVyaW5nTGFzdFN5bmMgPSBsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zU2V0ICYmICFsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zU2V0LmhhcyhrZXkpICYmIGJhc2VFeHRlbnNpb24uaW5zdGFsbGVkO1xuXHRcdFx0XHRpZiAod2FzQW5JbnN0YWxsZWRFeHRlbnNpb25EdXJpbmdMYXN0U3luYyAmJiBsb2NhbEV4dGVuc2lvbi5pbnN0YWxsZWQgJiYgIXJlbW90ZUV4dGVuc2lvbi5pbnN0YWxsZWQpIHtcblx0XHRcdFx0XHQvLyBSZW1vdmUgaXQgbG9jYWxseSBpZiBpdCBpcyBpbnN0YWxsZWQgbG9jYWxseSBhbmQgbm90IHJlbW90ZWx5XG5cdFx0XHRcdFx0cmVtb3ZlZC5wdXNoKGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFVwZGF0ZSBpbiBsb2NhbCBhbHdheXNcblx0XHRcdFx0XHRjb25zdCBtZXJnZWRFeHRlbnNpb24gPSBtZXJnZShrZXksIGxvY2FsRXh0ZW5zaW9uLCByZW1vdGVFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbik7XG5cdFx0XHRcdFx0dXBkYXRlZC5wdXNoKG1hc3NhZ2VPdXRnb2luZ0V4dGVuc2lvbihtZXJnZWRFeHRlbnNpb24sIGtleSkpO1xuXHRcdFx0XHRcdG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAuc2V0KGtleSwgbWVyZ2VkRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gQWRkIGl0IGxvY2FsbHkgaWYgZG9lcyBub3QgZXhpc3QgbG9jYWxseSBhbmQgaW5zdGFsbGVkIHJlbW90ZWx5XG5cdFx0XHRlbHNlIGlmIChyZW1vdGVFeHRlbnNpb24uaW5zdGFsbGVkKSB7XG5cdFx0XHRcdGFkZGVkLnB1c2gobWFzc2FnZU91dGdvaW5nRXh0ZW5zaW9uKHJlbW90ZUV4dGVuc2lvbiwga2V5KSk7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHQvLyBMb2NhbGx5IGFkZGVkIGV4dGVuc2lvbiA9PiBkb2VzIG5vdCBleGlzdCBpbiBiYXNlIGFuZCBleGlzdCBpbiBsb2NhbFxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLmFkZGVkLnZhbHVlcygpKSB7XG5cdFx0XHQvLyBJZiBhZGRlZCBpbiByZW1vdGUgKGFscmVhZHkgaGFuZGxlZClcblx0XHRcdGlmIChiYXNlVG9SZW1vdGUuYWRkZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRuZXdSZW1vdGVFeHRlbnNpb25zTWFwLnNldChrZXksIGFzc2VydFJldHVybnNEZWZpbmVkKGxvY2FsRXh0ZW5zaW9uc01hcC5nZXQoa2V5KSkpO1xuXHRcdH1cblxuXHRcdC8vIExvY2FsbHkgdXBkYXRlZCBleHRlbnNpb24gPT4gZXhpc3QgaW4gYmFzZSBhbmQgbG9jYWxcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9Mb2NhbC51cGRhdGVkLnZhbHVlcygpKSB7XG5cdFx0XHQvLyBJZiByZW1vdmVkIGluIHJlbW90ZSAoYWxyZWFkeSBoYW5kbGVkKVxuXHRcdFx0aWYgKGJhc2VUb1JlbW90ZS5yZW1vdmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgdXBkYXRlZCBpbiByZW1vdGUgKGFscmVhZHkgaGFuZGxlZClcblx0XHRcdGlmIChiYXNlVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9uID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQobG9jYWxFeHRlbnNpb25zTWFwLmdldChrZXkpKTtcblx0XHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IGFzc2VydFJldHVybnNEZWZpbmVkKHJlbW90ZUV4dGVuc2lvbnNNYXAuZ2V0KGtleSkpO1xuXHRcdFx0Ly8gVXBkYXRlIHJlbW90ZWx5XG5cdFx0XHRuZXdSZW1vdGVFeHRlbnNpb25zTWFwLnNldChrZXksIG1lcmdlKGtleSwgbG9jYWxFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbiwgbG9jYWxFeHRlbnNpb24pKTtcblx0XHR9XG5cblx0XHQvLyBMb2NhbGx5IHJlbW92ZWQgZXh0ZW5zaW9ucyA9PiBleGlzdCBpbiBiYXNlIGFuZCBkb2VzIG5vdCBleGlzdCBpbiBsb2NhbFxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLnJlbW92ZWQudmFsdWVzKCkpIHtcblx0XHRcdC8vIElmIHVwZGF0ZWQgaW4gcmVtb3RlIChhbHJlYWR5IGhhbmRsZWQpXG5cdFx0XHRpZiAoYmFzZVRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiByZW1vdmVkIGluIHJlbW90ZSAoYWxyZWFkeSBoYW5kbGVkKVxuXHRcdFx0aWYgKGJhc2VUb1JlbW90ZS5yZW1vdmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2tpcHBlZFxuXHRcdFx0aWYgKHNraXBwZWRFeHRlbnNpb25zTWFwLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2tpcCBpZiBpdCBpcyBhIGJ1aWx0aW4gZXh0ZW5zaW9uXG5cdFx0XHRpZiAoIWFzc2VydFJldHVybnNEZWZpbmVkKHJlbW90ZUV4dGVuc2lvbnNNYXAuZ2V0KGtleSkpLmluc3RhbGxlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFNraXAgaWYgbGFzdCBzeW5jIGJ1aWx0aW4gZXh0ZW5zaW9ucyBzZXQgaXMgbm90IGF2YWlsYWJsZVxuXHRcdFx0aWYgKCFsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zU2V0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2tpcCBpZiBpdCB3YXMgYSBidWlsdGluIGV4dGVuc2lvbiBkdXJpbmcgbGFzdCBzeW5jXG5cdFx0XHRpZiAobGFzdFN5bmNCdWlsdGluRXh0ZW5zaW9uc1NldC5oYXMoa2V5KSB8fCAhYXNzZXJ0UmV0dXJuc0RlZmluZWQobGFzdFN5bmNFeHRlbnNpb25zTWFwPy5nZXQoa2V5KSkuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bmV3UmVtb3RlRXh0ZW5zaW9uc01hcC5kZWxldGUoa2V5KTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCByZW1vdGU6IElTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblx0Y29uc3QgcmVtb3RlQ2hhbmdlcyA9IGNvbXBhcmUocmVtb3RlRXh0ZW5zaW9uc01hcCwgbmV3UmVtb3RlRXh0ZW5zaW9uc01hcCwgbmV3IFNldDxzdHJpbmc+KCksIHRydWUpO1xuXHRjb25zdCBoYXNSZW1vdGVDaGFuZ2VzID0gcmVtb3RlQ2hhbmdlcy5hZGRlZC5zaXplID4gMCB8fCByZW1vdGVDaGFuZ2VzLnVwZGF0ZWQuc2l6ZSA+IDAgfHwgcmVtb3RlQ2hhbmdlcy5yZW1vdmVkLnNpemUgPiAwO1xuXHRpZiAoaGFzUmVtb3RlQ2hhbmdlcykge1xuXHRcdG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gcmVtb3RlLnB1c2gobWFzc2FnZU91dGdvaW5nRXh0ZW5zaW9uKHZhbHVlLCBrZXkpKSk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGxvY2FsOiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH0sXG5cdFx0cmVtb3RlOiBoYXNSZW1vdGVDaGFuZ2VzID8ge1xuXHRcdFx0YWRkZWQ6IFsuLi5yZW1vdGVDaGFuZ2VzLmFkZGVkXS5tYXAoaWQgPT4gbmV3UmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoaWQpISksXG5cdFx0XHR1cGRhdGVkOiBbLi4ucmVtb3RlQ2hhbmdlcy51cGRhdGVkXS5tYXAoaWQgPT4gbmV3UmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoaWQpISksXG5cdFx0XHRyZW1vdmVkOiBbLi4ucmVtb3RlQ2hhbmdlcy5yZW1vdmVkXS5tYXAoaWQgPT4gcmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoaWQpISksXG5cdFx0XHRhbGw6IHJlbW90ZVxuXHRcdH0gOiBudWxsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmUoZnJvbTogTWFwPHN0cmluZywgSVN5bmNFeHRlbnNpb24+IHwgbnVsbCwgdG86IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPiwgaWdub3JlZEV4dGVuc2lvbnM6IFNldDxzdHJpbmc+LCBjaGVja1ZlcnNpb25Qcm9wZXJ0eTogYm9vbGVhbik6IHsgYWRkZWQ6IFNldDxzdHJpbmc+OyByZW1vdmVkOiBTZXQ8c3RyaW5nPjsgdXBkYXRlZDogU2V0PHN0cmluZz4gfSB7XG5cdGNvbnN0IGZyb21LZXlzID0gZnJvbSA/IFsuLi5mcm9tLmtleXMoKV0uZmlsdGVyKGtleSA9PiAhaWdub3JlZEV4dGVuc2lvbnMuaGFzKGtleSkpIDogW107XG5cdGNvbnN0IHRvS2V5cyA9IFsuLi50by5rZXlzKCldLmZpbHRlcihrZXkgPT4gIWlnbm9yZWRFeHRlbnNpb25zLmhhcyhrZXkpKTtcblx0Y29uc3QgYWRkZWQgPSB0b0tleXMuZmlsdGVyKGtleSA9PiAhZnJvbUtleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgcmVtb3ZlZCA9IGZyb21LZXlzLmZpbHRlcihrZXkgPT4gIXRvS2V5cy5pbmNsdWRlcyhrZXkpKS5yZWR1Y2UoKHIsIGtleSkgPT4geyByLmFkZChrZXkpOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCB1cGRhdGVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGZvciAoY29uc3Qga2V5IG9mIGZyb21LZXlzKSB7XG5cdFx0aWYgKHJlbW92ZWQuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBmcm9tRXh0ZW5zaW9uID0gZnJvbSEuZ2V0KGtleSkhO1xuXHRcdGNvbnN0IHRvRXh0ZW5zaW9uID0gdG8uZ2V0KGtleSk7XG5cdFx0aWYgKCF0b0V4dGVuc2lvbiB8fCAhYXJlU2FtZShmcm9tRXh0ZW5zaW9uLCB0b0V4dGVuc2lvbiwgY2hlY2tWZXJzaW9uUHJvcGVydHksIHRydWUpKSB7XG5cdFx0XHR1cGRhdGVkLmFkZChrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH07XG59XG5cbmZ1bmN0aW9uIGFyZVNhbWUoZnJvbUV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24sIHRvRXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbiwgY2hlY2tWZXJzaW9uUHJvcGVydHk6IGJvb2xlYW4sIGNoZWNrSW5zdGFsbGVkUHJvcGVydHk6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0aWYgKGZyb21FeHRlbnNpb24uZGlzYWJsZWQgIT09IHRvRXh0ZW5zaW9uLmRpc2FibGVkKSB7XG5cdFx0LyogZXh0ZW5zaW9uIGVuYWJsZW1lbnQgY2hhbmdlZCAqL1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmICghIWZyb21FeHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCAhPT0gISF0b0V4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkKSB7XG5cdFx0LyogZXh0ZW5zaW9uIGFwcGxpY2F0aW9uIHNjb3BlIGhhcyBjaGFuZ2VkICovXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGNoZWNrSW5zdGFsbGVkUHJvcGVydHkgJiYgZnJvbUV4dGVuc2lvbi5pbnN0YWxsZWQgIT09IHRvRXh0ZW5zaW9uLmluc3RhbGxlZCkge1xuXHRcdC8qIGV4dGVuc2lvbiBpbnN0YWxsZWQgcHJvcGVydHkgY2hhbmdlZCAqL1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChmcm9tRXh0ZW5zaW9uLmluc3RhbGxlZCAmJiB0b0V4dGVuc2lvbi5pbnN0YWxsZWQpIHtcblxuXHRcdGlmIChmcm9tRXh0ZW5zaW9uLnByZVJlbGVhc2UgIT09IHRvRXh0ZW5zaW9uLnByZVJlbGVhc2UpIHtcblx0XHRcdC8qIGluc3RhbGxlZCBleHRlbnNpb24ncyBwcmUtcmVsZWFzZSB2ZXJzaW9uIGNoYW5nZWQgKi9cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZnJvbUV4dGVuc2lvbi5waW5uZWQgIT09IHRvRXh0ZW5zaW9uLnBpbm5lZCkge1xuXHRcdFx0LyogaW5zdGFsbGVkIGV4dGVuc2lvbidzIHBpbm5pbmcgY2hhbmdlZCAqL1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0b0V4dGVuc2lvbi5waW5uZWQgJiYgZnJvbUV4dGVuc2lvbi52ZXJzaW9uICE9PSB0b0V4dGVuc2lvbi52ZXJzaW9uKSB7XG5cdFx0XHQvKiBpbnN0YWxsZWQgZXh0ZW5zaW9uJ3MgcGlubmVkIHZlcnNpb24gY2hhbmdlZCAqL1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGlmICghaXNTYW1lRXh0ZW5zaW9uU3RhdGUoZnJvbUV4dGVuc2lvbi5zdGF0ZSwgdG9FeHRlbnNpb24uc3RhdGUpKSB7XG5cdFx0LyogZXh0ZW5zaW9uIHN0YXRlIGNoYW5nZWQgKi9cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoKGNoZWNrVmVyc2lvblByb3BlcnR5ICYmIGZyb21FeHRlbnNpb24udmVyc2lvbiAhPT0gdG9FeHRlbnNpb24udmVyc2lvbikpIHtcblx0XHQvKiBleHRlbnNpb24gdmVyc2lvbiBjaGFuZ2VkICovXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG1lcmdlRXh0ZW5zaW9uU3RhdGUobG9jYWxFeHRlbnNpb246IElTeW5jRXh0ZW5zaW9uLCByZW1vdGVFeHRlbnNpb246IElTeW5jRXh0ZW5zaW9uLCBsYXN0U3luY0V4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24gfCB1bmRlZmluZWQpOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbG9jYWxTdGF0ZSA9IGxvY2FsRXh0ZW5zaW9uLnN0YXRlO1xuXHRjb25zdCByZW1vdGVTdGF0ZSA9IHJlbW90ZUV4dGVuc2lvbi5zdGF0ZTtcblx0Y29uc3QgYmFzZVN0YXRlID0gbGFzdFN5bmNFeHRlbnNpb24/LnN0YXRlO1xuXG5cdC8vIElmIHJlbW90ZSBleHRlbnNpb24gaGFzIG5vIHZlcnNpb24sIHVzZSBsb2NhbCBzdGF0ZVxuXHRpZiAoIXJlbW90ZUV4dGVuc2lvbi52ZXJzaW9uKSB7XG5cdFx0cmV0dXJuIGxvY2FsU3RhdGU7XG5cdH1cblxuXHQvLyBJZiBsb2NhbCBzdGF0ZSBleGlzdHMgYW5kIGxvY2FsIGV4dGVuc2lvbiBpcyBsYXRlc3QgdGhlbiB1c2UgbG9jYWwgc3RhdGVcblx0aWYgKGxvY2FsU3RhdGUgJiYgc2VtdmVyLmd0KGxvY2FsRXh0ZW5zaW9uLnZlcnNpb24sIHJlbW90ZUV4dGVuc2lvbi52ZXJzaW9uKSkge1xuXHRcdHJldHVybiBsb2NhbFN0YXRlO1xuXHR9XG5cdC8vIElmIHJlbW90ZSBzdGF0ZSBleGlzdHMgYW5kIHJlbW90ZSBleHRlbnNpb24gaXMgbGF0ZXN0LCB1c2UgcmVtb3RlIHN0YXRlXG5cdGlmIChyZW1vdGVTdGF0ZSAmJiBzZW12ZXIuZ3QocmVtb3RlRXh0ZW5zaW9uLnZlcnNpb24sIGxvY2FsRXh0ZW5zaW9uLnZlcnNpb24pKSB7XG5cdFx0cmV0dXJuIHJlbW90ZVN0YXRlO1xuXHR9XG5cblxuXHQvKiBSZW1vdGUgYW5kIGxvY2FsIGFyZSBvbiBzYW1lIHZlcnNpb24gKi9cblxuXHQvLyBJZiBsb2NhbCBzdGF0ZSBpcyBub3QgeWV0IHNldCwgdXNlIHJlbW90ZSBzdGF0ZVxuXHRpZiAoIWxvY2FsU3RhdGUpIHtcblx0XHRyZXR1cm4gcmVtb3RlU3RhdGU7XG5cdH1cblx0Ly8gSWYgcmVtb3RlIHN0YXRlIGlzIG5vdCB5ZXQgc2V0LCB1c2UgbG9jYWwgc3RhdGVcblx0aWYgKCFyZW1vdGVTdGF0ZSkge1xuXHRcdHJldHVybiBsb2NhbFN0YXRlO1xuXHR9XG5cblx0Y29uc3QgbWVyZ2VkU3RhdGU6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gPSBkZWVwQ2xvbmUobG9jYWxTdGF0ZSk7XG5cdGNvbnN0IGJhc2VUb1JlbW90ZSA9IGJhc2VTdGF0ZSA/IGNvbXBhcmVFeHRlbnNpb25TdGF0ZShiYXNlU3RhdGUsIHJlbW90ZVN0YXRlKSA6IHsgYWRkZWQ6IE9iamVjdC5rZXlzKHJlbW90ZVN0YXRlKS5yZWR1Y2UoKHIsIGspID0+IHsgci5hZGQoayk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSksIHJlbW92ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpLCB1cGRhdGVkOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuXHRjb25zdCBiYXNlVG9Mb2NhbCA9IGJhc2VTdGF0ZSA/IGNvbXBhcmVFeHRlbnNpb25TdGF0ZShiYXNlU3RhdGUsIGxvY2FsU3RhdGUpIDogeyBhZGRlZDogT2JqZWN0LmtleXMobG9jYWxTdGF0ZSkucmVkdWNlKChyLCBrKSA9PiB7IHIuYWRkKGspOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpLCByZW1vdmVkOiBuZXcgU2V0PHN0cmluZz4oKSwgdXBkYXRlZDogbmV3IFNldDxzdHJpbmc+KCkgfTtcblx0Ly8gQWRkZWQvVXBkYXRlZCBpbiByZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgWy4uLmJhc2VUb1JlbW90ZS5hZGRlZC52YWx1ZXMoKSwgLi4uYmFzZVRvUmVtb3RlLnVwZGF0ZWQudmFsdWVzKCldKSB7XG5cdFx0bWVyZ2VkU3RhdGVba2V5XSA9IHJlbW90ZVN0YXRlW2tleV07XG5cdH1cblx0Ly8gUmVtb3ZlZCBpbiByZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvUmVtb3RlLnJlbW92ZWQudmFsdWVzKCkpIHtcblx0XHQvLyBOb3QgdXBkYXRlZCBpbiBsb2NhbFxuXHRcdGlmICghYmFzZVRvTG9jYWwudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0ZGVsZXRlIG1lcmdlZFN0YXRlW2tleV07XG5cdFx0fVxuXHR9XG5cdHJldHVybiBtZXJnZWRTdGF0ZTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUV4dGVuc2lvblN0YXRlKGZyb206IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4sIHRvOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+KTogeyBhZGRlZDogU2V0PHN0cmluZz47IHJlbW92ZWQ6IFNldDxzdHJpbmc+OyB1cGRhdGVkOiBTZXQ8c3RyaW5nPiB9IHtcblx0Y29uc3QgZnJvbUtleXMgPSBPYmplY3Qua2V5cyhmcm9tKTtcblx0Y29uc3QgdG9LZXlzID0gT2JqZWN0LmtleXModG8pO1xuXHRjb25zdCBhZGRlZCA9IHRvS2V5cy5maWx0ZXIoa2V5ID0+ICFmcm9tS2V5cy5pbmNsdWRlcyhrZXkpKS5yZWR1Y2UoKHIsIGtleSkgPT4geyByLmFkZChrZXkpOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCByZW1vdmVkID0gZnJvbUtleXMuZmlsdGVyKGtleSA9PiAhdG9LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHVwZGF0ZWQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Zm9yIChjb25zdCBrZXkgb2YgZnJvbUtleXMpIHtcblx0XHRpZiAocmVtb3ZlZC5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlMSA9IGZyb21ba2V5XTtcblx0XHRjb25zdCB2YWx1ZTIgPSB0b1trZXldO1xuXHRcdGlmICghZXF1YWxzKHZhbHVlMSwgdmFsdWUyKSkge1xuXHRcdFx0dXBkYXRlZC5hZGQoa2V5KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCB9O1xufVxuXG5mdW5jdGlvbiBpc1NhbWVFeHRlbnNpb25TdGF0ZShhOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+ID0ge30sIGI6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gPSB7fSk6IGJvb2xlYW4ge1xuXHRjb25zdCB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH0gPSBjb21wYXJlRXh0ZW5zaW9uU3RhdGUoYSwgYik7XG5cdHJldHVybiBhZGRlZC5zaXplID09PSAwICYmIHJlbW92ZWQuc2l6ZSA9PT0gMCAmJiB1cGRhdGVkLnNpemUgPT09IDA7XG59XG5cbi8vIG1hc3NhZ2UgaW5jb21pbmcgZXh0ZW5zaW9uIC0gYWRkIG9wdGlvbmFsIHByb3BlcnRpZXNcbmZ1bmN0aW9uIG1hc3NhZ2VJbmNvbWluZ0V4dGVuc2lvbihleHRlbnNpb246IElTeW5jRXh0ZW5zaW9uKTogSVN5bmNFeHRlbnNpb24ge1xuXHRyZXR1cm4geyAuLi5leHRlbnNpb24sIC4uLnsgZGlzYWJsZWQ6ICEhZXh0ZW5zaW9uLmRpc2FibGVkLCBpbnN0YWxsZWQ6ICEhZXh0ZW5zaW9uLmluc3RhbGxlZCB9IH07XG59XG5cbi8vIG1hc3NhZ2Ugb3V0Z29pbmcgZXh0ZW5zaW9uIC0gcmVtb3ZlIG9wdGlvbmFsIHByb3BlcnRpZXNcbmZ1bmN0aW9uIG1hc3NhZ2VPdXRnb2luZ0V4dGVuc2lvbihleHRlbnNpb246IElTeW5jRXh0ZW5zaW9uLCBrZXk6IHN0cmluZyk6IElTeW5jRXh0ZW5zaW9uIHtcblx0Y29uc3QgbWFzc2FnZWRFeHRlbnNpb246IElTeW5jRXh0ZW5zaW9uID0ge1xuXHRcdC4uLmV4dGVuc2lvbixcblx0XHRpZGVudGlmaWVyOiB7XG5cdFx0XHRpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsXG5cdFx0XHR1dWlkOiBrZXkuc3RhcnRzV2l0aCgndXVpZDonKSA/IGtleS5zdWJzdHJpbmcoJ3V1aWQ6Jy5sZW5ndGgpIDogdW5kZWZpbmVkXG5cdFx0fSxcblx0XHQvKiBzZXQgZm9sbG93aW5nIGFsd2F5cyBzbyB0aGF0IHRvIGRpZmZlcmVudGlhdGUgd2l0aCBvbGRlciBjbGllbnRzICovXG5cdFx0cHJlUmVsZWFzZTogISFleHRlbnNpb24ucHJlUmVsZWFzZSxcblx0XHRwaW5uZWQ6ICEhZXh0ZW5zaW9uLnBpbm5lZCxcblx0fTtcblx0aWYgKCFleHRlbnNpb24uZGlzYWJsZWQpIHtcblx0XHRkZWxldGUgbWFzc2FnZWRFeHRlbnNpb24uZGlzYWJsZWQ7XG5cdH1cblx0aWYgKCFleHRlbnNpb24uaW5zdGFsbGVkKSB7XG5cdFx0ZGVsZXRlIG1hc3NhZ2VkRXh0ZW5zaW9uLmluc3RhbGxlZDtcblx0fVxuXHRpZiAoIWV4dGVuc2lvbi5zdGF0ZSkge1xuXHRcdGRlbGV0ZSBtYXNzYWdlZEV4dGVuc2lvbi5zdGF0ZTtcblx0fVxuXHRpZiAoIWV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkKSB7XG5cdFx0ZGVsZXRlIG1hc3NhZ2VkRXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQ7XG5cdH1cblx0cmV0dXJuIG1hc3NhZ2VkRXh0ZW5zaW9uO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxXQUFXLGNBQWM7QUFDbEMsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsNEJBQTRCO0FBUzlCLFNBQVMsTUFBTSxpQkFBd0Msa0JBQWlELG9CQUFtRCxtQkFBcUMsbUJBQTZCLDJCQUF3RTtBQUMzUyxRQUFNLFFBQTBCLENBQUM7QUFDakMsUUFBTSxVQUFrQyxDQUFDO0FBQ3pDLFFBQU0sVUFBNEIsQ0FBQztBQUVuQyxNQUFJLENBQUMsa0JBQWtCO0FBQ3RCLFVBQU1BLFVBQVMsZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLFdBQVcsTUFBTSxrQkFBa0IsTUFBTSxRQUFNLEdBQUcsWUFBWSxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsQ0FBQztBQUN6SSxXQUFPO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsUUFBUUEsUUFBTyxTQUFTLElBQUk7QUFBQSxRQUMzQixPQUFPQTtBQUFBLFFBQ1AsU0FBUyxDQUFDO0FBQUEsUUFDVixTQUFTLENBQUM7QUFBQSxRQUNWLEtBQUtBO0FBQUEsTUFDTixJQUFJO0FBQUEsSUFDTDtBQUFBLEVBQ0Q7QUFFQSxvQkFBa0IsZ0JBQWdCLElBQUksd0JBQXdCO0FB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
