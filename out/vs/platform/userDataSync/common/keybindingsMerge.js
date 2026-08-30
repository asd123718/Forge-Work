import { equals } from "../../../base/common/arrays.js";
import { parse } from "../../../base/common/json.js";
import * as objects from "../../../base/common/objects.js";
import { ContextKeyExpr } from "../../contextkey/common/contextkey.js";
import * as contentUtil from "./content.js";
function parseKeybindings(content) {
  return parse(content) || [];
}
async function merge(localContent, remoteContent, baseContent, formattingOptions, userDataSyncUtilService) {
  const local = parseKeybindings(localContent);
  const remote = parseKeybindings(remoteContent);
  const base = baseContent ? parseKeybindings(baseContent) : null;
  const userbindings = [...local, ...remote, ...base || []].map((keybinding) => keybinding.key);
  const normalizedKeys = await userDataSyncUtilService.resolveUserBindings(userbindings);
  const keybindingsMergeResult = computeMergeResultByKeybinding(local, remote, base, normalizedKeys);
  if (!keybindingsMergeResult.hasLocalForwarded && !keybindingsMergeResult.hasRemoteForwarded) {
    return { mergeContent: localContent, hasChanges: false, hasConflicts: false };
  }
  if (!keybindingsMergeResult.hasLocalForwarded && keybindingsMergeResult.hasRemoteForwarded) {
    return { mergeContent: remoteContent, hasChanges: true, hasConflicts: false };
  }
  if (keybindingsMergeResult.hasLocalForwarded && !keybindingsMergeResult.hasRemoteForwarded) {
    return { mergeContent: localContent, hasChanges: true, hasConflicts: false };
  }
  const localByCommand = byCommand(local);
  const remoteByCommand = byCommand(remote);
  const baseByCommand = base ? byCommand(base) : null;
  const localToRemoteByCommand = compareByCommand(localByCommand, remoteByCommand, normalizedKeys);
  const baseToLocalByCommand = baseByCommand ? compareByCommand(baseByCommand, localByCommand, normalizedKeys) : { added: [...localByCommand.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  const baseToRemoteByCommand = baseByCommand ? compareByCommand(baseByCommand, remoteByCommand, normalizedKeys) : { added: [...remoteByCommand.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  const commandsMergeResult = computeMergeResult(localToRemoteByCommand, baseToLocalByCommand, baseToRemoteByCommand);
  let mergeContent = localContent;
  for (const command of commandsMergeResult.removed.values()) {
    if (commandsMergeResult.conflicts.has(command)) {
      continue;
    }
    mergeContent = removeKeybindings(mergeContent, command, formattingOptions);
  }
  for (const command of commandsMergeResult.added.values()) {
    if (commandsMergeResult.conflicts.has(command)) {
      continue;
    }
    const keybindings = remoteByCommand.get(command);
    if (keybindings.some((keybinding) => keybinding.command !== `-${command}` && keybindingsMergeResult.conflicts.has(normalizedKeys[keybinding.key]))) {
      commandsMergeResult.conflicts.add(command);
      continue;
    }
    mergeContent = addKeybindings(mergeContent, keybindings, formattingOptions);
  }
  for (const command of commandsMergeResult.updated.values()) {
    if (commandsMergeResult.conflicts.has(command)) {
      continue;
    }
    const keybindings = remoteByCommand.get(command);
    if (keybindings.some((keybinding) => keybinding.command !== `-${command}` && keybindingsMergeResult.conflicts.has(normalizedKeys[keybinding.key]))) {
      commandsMergeResult.conflicts.add(command);
      continue;
    }
    mergeContent = updateKeybindings(mergeContent, command, keybindings, formattingOptions);
  }
  return { mergeContent, hasChanges: true, hasConflicts: commandsMergeResult.conflicts.size > 0 };
}
function computeMergeResult(localToRemote, baseToLocal, baseToRemote) {
  const added = /* @__PURE__ */ new Set();
  const removed = /* @__PURE__ */ new Set();
  const updated = /* @__PURE__ */ new Set();
  const conflicts = /* @__PURE__ */ new Set();
  for (const key of baseToLocal.removed.values()) {
    if (baseToRemote.updated.has(key)) {
      conflicts.add(key);
    }
  }
  for (const key of baseToRemote.removed.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      conflicts.add(key);
    } else {
      removed.add(key);
    }
  }
  for (const key of baseToLocal.added.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToRemote.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    }
  }
  for (const key of baseToRemote.added.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToLocal.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    } else {
      added.add(key);
    }
  }
  for (const key of baseToLocal.updated.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToRemote.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    }
  }
  for (const key of baseToRemote.updated.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    } else {
      updated.add(key);
    }
  }
  return { added, removed, updated, conflicts };
}
function computeMergeResultByKeybinding(local, remote, base, normalizedKeys) {
  const empty = /* @__PURE__ */ new Set();
  const localByKeybinding = byKeybinding(local, normalizedKeys);
  const remoteByKeybinding = byKeybinding(remote, normalizedKeys);
  const baseByKeybinding = base ? byKeybinding(base, normalizedKeys) : null;
  const localToRemoteByKeybinding = compareByKeybinding(localByKeybinding, remoteByKeybinding);
  if (localToRemoteByKeybinding.added.size === 0 && localToRemoteByKeybinding.removed.size === 0 && localToRemoteByKeybinding.updated.size === 0) {
    return { hasLocalForwarded: false, hasRemoteForwarded: false, added: empty, removed: empty, updated: empty, conflicts: empty };
  }
  const baseToLocalByKeybinding = baseByKeybinding ? compareByKeybinding(baseByKeybinding, localByKeybinding) : { added: [...localByKeybinding.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  if (baseToLocalByKeybinding.added.size === 0 && baseToLocalByKeybinding.removed.size === 0 && baseToLocalByKeybinding.updated.size === 0) {
    return { hasLocalForwarded: false, hasRemoteForwarded: true, added: empty, removed: empty, updated: empty, conflicts: empty };
  }
  const baseToRemoteByKeybinding = baseByKeybinding ? compareByKeybinding(baseByKeybinding, remoteByKeybinding) : { added: [...remoteByKeybinding.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  if (baseToRemoteByKeybinding.added.size === 0 && baseToRemoteByKeybinding.removed.size === 0 && baseToRemoteByKeybinding.updated.size === 0) {
    return { hasLocalForwarded: true, hasRemoteForwarded: false, added: empty, removed: empty, updated: empty, conflicts: empty };
  }
  const { added, removed, updated, conflicts } = computeMergeResult(localToRemoteByKeybinding, baseToLocalByKeybinding, baseToRemoteByKeybinding);
  return { hasLocalForwarded: true, hasRemoteForwarded: true, added, removed, updated, conflicts };
}
function byKeybinding(keybindings, keys) {
  const map = /* @__PURE__ */ new Map();
  for (const keybinding of keybindings) {
    const key = keys[keybinding.key];
    let value = map.get(key);
    if (!value) {
      value = [];
      map.set(key, value);
    }
    value.push(keybinding);
  }
  return map;
}
function byCommand(keybindings) {
  const map = /* @__PURE__ */ new Map();
  for (const keybinding of keybindings) {
    const command = keybinding.command[0] === "-" ? keybinding.command.substring(1) : keybinding.command;
    let value = map.get(command);
    if (!value) {
      value = [];
      map.set(command, value);
    }
    value.push(keybinding);
  }
  return map;
}
function compareByKeybinding(from, to) {
  const fromKeys = [...from.keys()];
  const toKeys = [...to.keys()];
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
    const value1 = from.get(key).map((keybinding) => ({ ...keybinding, ...{ key } }));
    const value2 = to.get(key).map((keybinding) => ({ ...keybinding, ...{ key } }));
    if (!equals(value1, value2, (a, b) => isSameKeybinding(a, b))) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function compareByCommand(from, to, normalizedKeys) {
  const fromKeys = [...from.keys()];
  const toKeys = [...to.keys()];
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
    const value1 = from.get(key).map((keybinding) => ({ ...keybinding, ...{ key: normalizedKeys[keybinding.key] } }));
    const value2 = to.get(key).map((keybinding) => ({ ...keybinding, ...{ key: normalizedKeys[keybinding.key] } }));
    if (!areSameKeybindingsWithSameCommand(value1, value2)) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function areSameKeybindingsWithSameCommand(value1, value2) {
  if (!equals(value1.filter(({ command }) => command[0] !== "-"), value2.filter(({ command }) => command[0] !== "-"), (a, b) => isSameKeybinding(a, b))) {
    return false;
  }
  if (!equals(value1.filter(({ command }) => command[0] === "-"), value2.filter(({ command }) => command[0] === "-"), (a, b) => isSameKeybinding(a, b))) {
    return false;
  }
  return true;
}
function isSameKeybinding(a, b) {
  if (a.command !== b.command) {
    return false;
  }
  if (a.key !== b.key) {
    return false;
  }
  const whenA = ContextKeyExpr.deserialize(a.when);
  const whenB = ContextKeyExpr.deserialize(b.when);
  if (whenA && !whenB || !whenA && whenB) {
    return false;
  }
  if (whenA && whenB && !whenA.equals(whenB)) {
    return false;
  }
  if (!objects.equals(a.args, b.args)) {
    return false;
  }
  return true;
}
function addKeybindings(content, keybindings, formattingOptions) {
  for (const keybinding of keybindings) {
    content = contentUtil.edit(content, [-1], keybinding, formattingOptions);
  }
  return content;
}
function removeKeybindings(content, command, formattingOptions) {
  const keybindings = parseKeybindings(content);
  for (let index = keybindings.length - 1; index >= 0; index--) {
    if (keybindings[index].command === command || keybindings[index].command === `-${command}`) {
      content = contentUtil.edit(content, [index], void 0, formattingOptions);
    }
  }
  return content;
}
function updateKeybindings(content, command, keybindings, formattingOptions) {
  const allKeybindings = parseKeybindings(content);
  const location = allKeybindings.findIndex((keybinding) => keybinding.command === command || keybinding.command === `-${command}`);
  for (let index = allKeybindings.length - 1; index >= 0; index--) {
    if (allKeybindings[index].command === command || allKeybindings[index].command === `-${command}`) {
      content = contentUtil.edit(content, [index], void 0, formattingOptions);
    }
  }
  for (let index = keybindings.length - 1; index >= 0; index--) {
    content = contentUtil.edit(content, [location], keybindings[index], formattingOptions);
  }
  return content;
}
export {
  merge
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXGtleWJpbmRpbmdzTWVyZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgRm9ybWF0dGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVVzZXJGcmllbmRseUtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCAqIGFzIGNvbnRlbnRVdGlsIGZyb20gJy4vY29udGVudC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UgfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5cbmludGVyZmFjZSBJQ29tcGFyZVJlc3VsdCB7XG5cdGFkZGVkOiBTZXQ8c3RyaW5nPjtcblx0cmVtb3ZlZDogU2V0PHN0cmluZz47XG5cdHVwZGF0ZWQ6IFNldDxzdHJpbmc+O1xufVxuXG5pbnRlcmZhY2UgSU1lcmdlUmVzdWx0IHtcblx0aGFzTG9jYWxGb3J3YXJkZWQ6IGJvb2xlYW47XG5cdGhhc1JlbW90ZUZvcndhcmRlZDogYm9vbGVhbjtcblx0YWRkZWQ6IFNldDxzdHJpbmc+O1xuXHRyZW1vdmVkOiBTZXQ8c3RyaW5nPjtcblx0dXBkYXRlZDogU2V0PHN0cmluZz47XG5cdGNvbmZsaWN0czogU2V0PHN0cmluZz47XG59XG5cbmZ1bmN0aW9uIHBhcnNlS2V5YmluZGluZ3MoY29udGVudDogc3RyaW5nKTogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSB7XG5cdHJldHVybiBwYXJzZShjb250ZW50KSB8fCBbXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1lcmdlKGxvY2FsQ29udGVudDogc3RyaW5nLCByZW1vdGVDb250ZW50OiBzdHJpbmcsIGJhc2VDb250ZW50OiBzdHJpbmcgfCBudWxsLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMsIHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlOiBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UpOiBQcm9taXNlPHsgbWVyZ2VDb250ZW50OiBzdHJpbmc7IGhhc0NoYW5nZXM6IGJvb2xlYW47IGhhc0NvbmZsaWN0czogYm9vbGVhbiB9PiB7XG5cdGNvbnN0IGxvY2FsID0gcGFyc2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQpO1xuXHRjb25zdCByZW1vdGUgPSBwYXJzZUtleWJpbmRpbmdzKHJlbW90ZUNvbnRlbnQpO1xuXHRjb25zdCBiYXNlID0gYmFzZUNvbnRlbnQgPyBwYXJzZUtleWJpbmRpbmdzKGJhc2VDb250ZW50KSA6IG51bGw7XG5cblx0Y29uc3QgdXNlcmJpbmRpbmdzOiBzdHJpbmdbXSA9IFsuLi5sb2NhbCwgLi4ucmVtb3RlLCAuLi4oYmFzZSB8fCBbXSldLm1hcChrZXliaW5kaW5nID0+IGtleWJpbmRpbmcua2V5KTtcblx0Y29uc3Qgbm9ybWFsaXplZEtleXMgPSBhd2FpdCB1c2VyRGF0YVN5bmNVdGlsU2VydmljZS5yZXNvbHZlVXNlckJpbmRpbmdzKHVzZXJiaW5kaW5ncyk7XG5cdGNvbnN0IGtleWJpbmRpbmdzTWVyZ2VSZXN1bHQgPSBjb21wdXRlTWVyZ2VSZXN1bHRCeUtleWJpbmRpbmcobG9jYWwsIHJlbW90ZSwgYmFzZSwgbm9ybWFsaXplZEtleXMpO1xuXG5cdGlmICgha2V5YmluZGluZ3NNZXJnZVJlc3VsdC5oYXNMb2NhbEZvcndhcmRlZCAmJiAha2V5YmluZGluZ3NNZXJnZVJlc3VsdC5oYXNSZW1vdGVGb3J3YXJkZWQpIHtcblx0XHQvLyBObyBjaGFuZ2VzIGZvdW5kIGJldHdlZW4gbG9jYWwgYW5kIHJlbW90ZS5cblx0XHRyZXR1cm4geyBtZXJnZUNvbnRlbnQ6IGxvY2FsQ29udGVudCwgaGFzQ2hhbmdlczogZmFsc2UsIGhhc0NvbmZsaWN0czogZmFsc2UgfTtcblx0fVxuXG5cdGlmICgha2V5YmluZGluZ3NNZXJnZVJlc3VsdC5oYXNMb2NhbEZvcndhcmRlZCAmJiBrZXliaW5kaW5nc01lcmdlUmVzdWx0Lmhhc1JlbW90ZUZvcndhcmRlZCkge1xuXHRcdHJldHVybiB7IG1lcmdlQ29udGVudDogcmVtb3RlQ29udGVudCwgaGFzQ2hhbmdlczogdHJ1ZSwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0aWYgKGtleWJpbmRpbmdzTWVyZ2VSZXN1bHQuaGFzTG9jYWxGb3J3YXJkZWQgJiYgIWtleWJpbmRpbmdzTWVyZ2VSZXN1bHQuaGFzUmVtb3RlRm9yd2FyZGVkKSB7XG5cdFx0Ly8gTG9jYWwgaGFzIG1vdmVkIGZvcndhcmQgYW5kIHJlbW90ZSBoYXMgbm90LiBSZXR1cm4gbG9jYWwuXG5cdFx0cmV0dXJuIHsgbWVyZ2VDb250ZW50OiBsb2NhbENvbnRlbnQsIGhhc0NoYW5nZXM6IHRydWUsIGhhc0NvbmZsaWN0czogZmFsc2UgfTtcblx0fVxuXG5cdC8vIEJvdGggbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZC5cblx0Y29uc3QgbG9jYWxCeUNvbW1hbmQgPSBieUNvbW1hbmQobG9jYWwpO1xuXHRjb25zdCByZW1vdGVCeUNvbW1hbmQgPSBieUNvbW1hbmQocmVtb3RlKTtcblx0Y29uc3QgYmFzZUJ5Q29tbWFuZCA9IGJhc2UgPyBieUNvbW1hbmQoYmFzZSkgOiBudWxsO1xuXHRjb25zdCBsb2NhbFRvUmVtb3RlQnlDb21tYW5kID0gY29tcGFyZUJ5Q29tbWFuZChsb2NhbEJ5Q29tbWFuZCwgcmVtb3RlQnlDb21tYW5kLCBub3JtYWxpemVkS2V5cyk7XG5cdGNvbnN0IGJhc2VUb0xvY2FsQnlDb21tYW5kID0gYmFzZUJ5Q29tbWFuZCA/IGNvbXBhcmVCeUNvbW1hbmQoYmFzZUJ5Q29tbWFuZCwgbG9jYWxCeUNvbW1hbmQsIG5vcm1hbGl6ZWRLZXlzKSA6IHsgYWRkZWQ6IFsuLi5sb2NhbEJ5Q29tbWFuZC5rZXlzKCldLnJlZHVjZSgociwgaykgPT4geyByLmFkZChrKTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKSwgcmVtb3ZlZDogbmV3IFNldDxzdHJpbmc+KCksIHVwZGF0ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpIH07XG5cdGNvbnN0IGJhc2VUb1JlbW90ZUJ5Q29tbWFuZCA9IGJhc2VCeUNvbW1hbmQgPyBjb21wYXJlQnlDb21tYW5kKGJhc2VCeUNvbW1hbmQsIHJlbW90ZUJ5Q29tbWFuZCwgbm9ybWFsaXplZEtleXMpIDogeyBhZGRlZDogWy4uLnJlbW90ZUJ5Q29tbWFuZC5rZXlzKCldLnJlZHVjZSgociwgaykgPT4geyByLmFkZChrKTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKSwgcmVtb3ZlZDogbmV3IFNldDxzdHJpbmc+KCksIHVwZGF0ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpIH07XG5cblx0Y29uc3QgY29tbWFuZHNNZXJnZVJlc3VsdCA9IGNvbXB1dGVNZXJnZVJlc3VsdChsb2NhbFRvUmVtb3RlQnlDb21tYW5kLCBiYXNlVG9Mb2NhbEJ5Q29tbWFuZCwgYmFzZVRvUmVtb3RlQnlDb21tYW5kKTtcblx0bGV0IG1lcmdlQ29udGVudCA9IGxvY2FsQ29udGVudDtcblxuXHQvLyBSZW1vdmVkIGNvbW1hbmRzIGluIFJlbW90ZVxuXHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHNNZXJnZVJlc3VsdC5yZW1vdmVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGNvbW1hbmRzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmhhcyhjb21tYW5kKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG1lcmdlQ29udGVudCA9IHJlbW92ZUtleWJpbmRpbmdzKG1lcmdlQ29udGVudCwgY29tbWFuZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHR9XG5cblx0Ly8gQWRkZWQgY29tbWFuZHMgaW4gcmVtb3RlXG5cdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kc01lcmdlUmVzdWx0LmFkZGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGNvbW1hbmRzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmhhcyhjb21tYW5kKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGtleWJpbmRpbmdzID0gcmVtb3RlQnlDb21tYW5kLmdldChjb21tYW5kKSE7XG5cdFx0Ly8gSWdub3JlIG5lZ2F0ZWQgY29tbWFuZHNcblx0XHRpZiAoa2V5YmluZGluZ3Muc29tZShrZXliaW5kaW5nID0+IGtleWJpbmRpbmcuY29tbWFuZCAhPT0gYC0ke2NvbW1hbmR9YCAmJiBrZXliaW5kaW5nc01lcmdlUmVzdWx0LmNvbmZsaWN0cy5oYXMobm9ybWFsaXplZEtleXNba2V5YmluZGluZy5rZXldKSkpIHtcblx0XHRcdGNvbW1hbmRzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmFkZChjb21tYW5kKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRtZXJnZUNvbnRlbnQgPSBhZGRLZXliaW5kaW5ncyhtZXJnZUNvbnRlbnQsIGtleWJpbmRpbmdzLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdH1cblxuXHQvLyBVcGRhdGVkIGNvbW1hbmRzIGluIFJlbW90ZVxuXHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHNNZXJnZVJlc3VsdC51cGRhdGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGNvbW1hbmRzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmhhcyhjb21tYW5kKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGtleWJpbmRpbmdzID0gcmVtb3RlQnlDb21tYW5kLmdldChjb21tYW5kKSE7XG5cdFx0Ly8gSWdub3JlIG5lZ2F0ZWQgY29tbWFuZHNcblx0XHRpZiAoa2V5YmluZGluZ3Muc29tZShrZXliaW5kaW5nID0+IGtleWJpbmRpbmcuY29tbWFuZCAhPT0gYC0ke2NvbW1hbmR9YCAmJiBrZXliaW5kaW5nc01lcmdlUmVzdWx0LmNvbmZsaWN0cy5oYXMobm9ybWFsaXplZEtleXNba2V5YmluZGluZy5rZXldKSkpIHtcblx0XHRcdGNvbW1hbmRzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmFkZChjb21tYW5kKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRtZXJnZUNvbnRlbnQgPSB1cGRhdGVLZXliaW5kaW5ncyhtZXJnZUNvbnRlbnQsIGNvbW1hbmQsIGtleWJpbmRpbmdzLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdH1cblxuXHRyZXR1cm4geyBtZXJnZUNvbnRlbnQsIGhhc0NoYW5nZXM6IHRydWUsIGhhc0NvbmZsaWN0czogY29tbWFuZHNNZXJnZVJlc3VsdC5jb25mbGljdHMuc2l6ZSA+IDAgfTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1lcmdlUmVzdWx0KGxvY2FsVG9SZW1vdGU6IElDb21wYXJlUmVzdWx0LCBiYXNlVG9Mb2NhbDogSUNvbXBhcmVSZXN1bHQsIGJhc2VUb1JlbW90ZTogSUNvbXBhcmVSZXN1bHQpOiB7IGFkZGVkOiBTZXQ8c3RyaW5nPjsgcmVtb3ZlZDogU2V0PHN0cmluZz47IHVwZGF0ZWQ6IFNldDxzdHJpbmc+OyBjb25mbGljdHM6IFNldDxzdHJpbmc+IH0ge1xuXHRjb25zdCBhZGRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgcmVtb3ZlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgdXBkYXRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgY29uZmxpY3RzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8vIFJlbW92ZWQga2V5cyBpbiBMb2NhbFxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9Mb2NhbC5yZW1vdmVkLnZhbHVlcygpKSB7XG5cdFx0Ly8gR290IHVwZGF0ZWQgaW4gcmVtb3RlXG5cdFx0aWYgKGJhc2VUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRjb25mbGljdHMuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gUmVtb3ZlZCBrZXlzIGluIFJlbW90ZVxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUucmVtb3ZlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChjb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgdXBkYXRlZCBpbiBsb2NhbFxuXHRcdGlmIChiYXNlVG9Mb2NhbC51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRjb25mbGljdHMuYWRkKGtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHJlbW92ZSB0aGUga2V5XG5cdFx0XHRyZW1vdmVkLmFkZChrZXkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEFkZGVkIGtleXMgaW4gTG9jYWxcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvTG9jYWwuYWRkZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoY29uZmxpY3RzLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gR290IGFkZGVkIGluIHJlbW90ZVxuXHRcdGlmIChiYXNlVG9SZW1vdGUuYWRkZWQuaGFzKGtleSkpIHtcblx0XHRcdC8vIEhhcyBkaWZmZXJlbnQgdmFsdWVcblx0XHRcdGlmIChsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29uZmxpY3RzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEFkZGVkIGtleXMgaW4gcmVtb3RlXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS5hZGRlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChjb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgYWRkZWQgaW4gbG9jYWxcblx0XHRpZiAoYmFzZVRvTG9jYWwuYWRkZWQuaGFzKGtleSkpIHtcblx0XHRcdC8vIEhhcyBkaWZmZXJlbnQgdmFsdWVcblx0XHRcdGlmIChsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29uZmxpY3RzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhZGRlZC5hZGQoa2V5KTtcblx0XHR9XG5cdH1cblxuXHQvLyBVcGRhdGVkIGtleXMgaW4gTG9jYWxcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvTG9jYWwudXBkYXRlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChjb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgdXBkYXRlZCBpbiByZW1vdGVcblx0XHRpZiAoYmFzZVRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdC8vIEhhcyBkaWZmZXJlbnQgdmFsdWVcblx0XHRcdGlmIChsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29uZmxpY3RzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFVwZGF0ZWQga2V5cyBpbiBSZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvUmVtb3RlLnVwZGF0ZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoY29uZmxpY3RzLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gR290IHVwZGF0ZWQgaW4gbG9jYWxcblx0XHRpZiAoYmFzZVRvTG9jYWwudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25mbGljdHMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHVwZGF0ZWQga2V5XG5cdFx0XHR1cGRhdGVkLmFkZChrZXkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4geyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCwgY29uZmxpY3RzIH07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVNZXJnZVJlc3VsdEJ5S2V5YmluZGluZyhsb2NhbDogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSwgcmVtb3RlOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdLCBiYXNlOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdIHwgbnVsbCwgbm9ybWFsaXplZEtleXM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4pOiBJTWVyZ2VSZXN1bHQge1xuXHRjb25zdCBlbXB0eSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBsb2NhbEJ5S2V5YmluZGluZyA9IGJ5S2V5YmluZGluZyhsb2NhbCwgbm9ybWFsaXplZEtleXMpO1xuXHRjb25zdCByZW1vdGVCeUtleWJpbmRpbmcgPSBieUtleWJpbmRpbmcocmVtb3RlLCBub3JtYWxpemVkS2V5cyk7XG5cdGNvbnN0IGJhc2VCeUtleWJpbmRpbmcgPSBiYXNlID8gYnlLZXliaW5kaW5nKGJhc2UsIG5vcm1hbGl6ZWRLZXlzKSA6IG51bGw7XG5cblx0Y29uc3QgbG9jYWxUb1JlbW90ZUJ5S2V5YmluZGluZyA9IGNvbXBhcmVCeUtleWJpbmRpbmcobG9jYWxCeUtleWJpbmRpbmcsIHJlbW90ZUJ5S2V5YmluZGluZyk7XG5cdGlmIChsb2NhbFRvUmVtb3RlQnlLZXliaW5kaW5nLmFkZGVkLnNpemUgPT09IDAgJiYgbG9jYWxUb1JlbW90ZUJ5S2V5YmluZGluZy5yZW1vdmVkLnNpemUgPT09IDAgJiYgbG9jYWxUb1JlbW90ZUJ5S2V5YmluZGluZy51cGRhdGVkLnNpemUgPT09IDApIHtcblx0XHRyZXR1cm4geyBoYXNMb2NhbEZvcndhcmRlZDogZmFsc2UsIGhhc1JlbW90ZUZvcndhcmRlZDogZmFsc2UsIGFkZGVkOiBlbXB0eSwgcmVtb3ZlZDogZW1wdHksIHVwZGF0ZWQ6IGVtcHR5LCBjb25mbGljdHM6IGVtcHR5IH07XG5cdH1cblxuXHRjb25zdCBiYXNlVG9Mb2NhbEJ5S2V5YmluZGluZyA9IGJhc2VCeUtleWJpbmRpbmcgPyBjb21wYXJlQnlLZXliaW5kaW5nKGJhc2VCeUtleWJpbmRpbmcsIGxvY2FsQnlLZXliaW5kaW5nKSA6IHsgYWRkZWQ6IFsuLi5sb2NhbEJ5S2V5YmluZGluZy5rZXlzKCldLnJlZHVjZSgociwgaykgPT4geyByLmFkZChrKTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKSwgcmVtb3ZlZDogbmV3IFNldDxzdHJpbmc+KCksIHVwZGF0ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpIH07XG5cdGlmIChiYXNlVG9Mb2NhbEJ5S2V5YmluZGluZy5hZGRlZC5zaXplID09PSAwICYmIGJhc2VUb0xvY2FsQnlLZXliaW5kaW5nLnJlbW92ZWQuc2l6ZSA9PT0gMCAmJiBiYXNlVG9Mb2NhbEJ5S2V5YmluZGluZy51cGRhdGVkLnNpemUgPT09IDApIHtcblx0XHQvLyBSZW1vdGUgaGFzIG1vdmVkIGZvcndhcmQgYW5kIGxvY2FsIGhhcyBub3QuXG5cdFx0cmV0dXJuIHsgaGFzTG9jYWxGb3J3YXJkZWQ6IGZhbHNlLCBoYXNSZW1vdGVGb3J3YXJkZWQ6IHRydWUsIGFkZGVkOiBlbXB0eSwgcmVtb3ZlZDogZW1wdHksIHVwZGF0ZWQ6IGVtcHR5LCBjb25mbGljdHM6IGVtcHR5IH07XG5cdH1cblxuXHRjb25zdCBiYXNlVG9SZW1vdGVCeUtleWJpbmRpbmcgPSBiYXNlQnlLZXliaW5kaW5nID8gY29tcGFyZUJ5S2V5YmluZGluZyhiYXNlQnlLZXliaW5kaW5nLCByZW1vdGVCeUtleWJpbmRpbmcpIDogeyBhZGRlZDogWy4uLnJlbW90ZUJ5S2V5YmluZGluZy5rZXlzKCldLnJlZHVjZSgociwgaykgPT4geyByLmFkZChrKTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKSwgcmVtb3ZlZDogbmV3IFNldDxzdHJpbmc+KCksIHVwZGF0ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpIH07XG5cdGlmIChiYXNlVG9SZW1vdGVCeUtleWJpbmRpbmcuYWRkZWQuc2l6ZSA9PT0gMCAmJiBiYXNlVG9SZW1vdGVCeUtleWJpbmRpbmcucmVtb3ZlZC5zaXplID09PSAwICYmIGJhc2VUb1JlbW90ZUJ5S2V5YmluZGluZy51cGRhdGVkLnNpemUgPT09IDApIHtcblx0XHRyZXR1cm4geyBoYXNMb2NhbEZvcndhcmRlZDogdHJ1ZSwgaGFzUmVtb3RlRm9yd2FyZGVkOiBmYWxzZSwgYWRkZWQ6IGVtcHR5LCByZW1vdmVkOiBlbXB0eSwgdXBkYXRlZDogZW1wdHksIGNvbmZsaWN0czogZW1wdHkgfTtcblx0fVxuXG5cdGNvbnN0IHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQsIGNvbmZsaWN0cyB9ID0gY29tcHV0ZU1lcmdlUmVzdWx0KGxvY2FsVG9SZW1vdGVCeUtleWJpbmRpbmcsIGJhc2VUb0xvY2FsQnlLZXliaW5kaW5nLCBiYXNlVG9SZW1vdGVCeUtleWJpbmRpbmcpO1xuXHRyZXR1cm4geyBoYXNMb2NhbEZvcndhcmRlZDogdHJ1ZSwgaGFzUmVtb3RlRm9yd2FyZGVkOiB0cnVlLCBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCwgY29uZmxpY3RzIH07XG59XG5cbmZ1bmN0aW9uIGJ5S2V5YmluZGluZyhrZXliaW5kaW5nczogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSwga2V5czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPikge1xuXHRjb25zdCBtYXA6IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+ID0gbmV3IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+KCk7XG5cdGZvciAoY29uc3Qga2V5YmluZGluZyBvZiBrZXliaW5kaW5ncykge1xuXHRcdGNvbnN0IGtleSA9IGtleXNba2V5YmluZGluZy5rZXldO1xuXHRcdGxldCB2YWx1ZSA9IG1hcC5nZXQoa2V5KTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IFtdO1xuXHRcdFx0bWFwLnNldChrZXksIHZhbHVlKTtcblx0XHR9XG5cdFx0dmFsdWUucHVzaChrZXliaW5kaW5nKTtcblxuXHR9XG5cdHJldHVybiBtYXA7XG59XG5cbmZ1bmN0aW9uIGJ5Q29tbWFuZChrZXliaW5kaW5nczogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSk6IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+IHtcblx0Y29uc3QgbWFwOiBNYXA8c3RyaW5nLCBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdPiA9IG5ldyBNYXA8c3RyaW5nLCBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdPigpO1xuXHRmb3IgKGNvbnN0IGtleWJpbmRpbmcgb2Yga2V5YmluZGluZ3MpIHtcblx0XHRjb25zdCBjb21tYW5kID0ga2V5YmluZGluZy5jb21tYW5kWzBdID09PSAnLScgPyBrZXliaW5kaW5nLmNvbW1hbmQuc3Vic3RyaW5nKDEpIDoga2V5YmluZGluZy5jb21tYW5kO1xuXHRcdGxldCB2YWx1ZSA9IG1hcC5nZXQoY29tbWFuZCk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSBbXTtcblx0XHRcdG1hcC5zZXQoY29tbWFuZCwgdmFsdWUpO1xuXHRcdH1cblx0XHR2YWx1ZS5wdXNoKGtleWJpbmRpbmcpO1xuXHR9XG5cdHJldHVybiBtYXA7XG59XG5cblxuZnVuY3Rpb24gY29tcGFyZUJ5S2V5YmluZGluZyhmcm9tOiBNYXA8c3RyaW5nLCBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdPiwgdG86IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+KTogSUNvbXBhcmVSZXN1bHQge1xuXHRjb25zdCBmcm9tS2V5cyA9IFsuLi5mcm9tLmtleXMoKV07XG5cdGNvbnN0IHRvS2V5cyA9IFsuLi50by5rZXlzKCldO1xuXHRjb25zdCBhZGRlZCA9IHRvS2V5cy5maWx0ZXIoa2V5ID0+ICFmcm9tS2V5cy5pbmNsdWRlcyhrZXkpKS5yZWR1Y2UoKHIsIGtleSkgPT4geyByLmFkZChrZXkpOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCByZW1vdmVkID0gZnJvbUtleXMuZmlsdGVyKGtleSA9PiAhdG9LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHVwZGF0ZWQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Zm9yIChjb25zdCBrZXkgb2YgZnJvbUtleXMpIHtcblx0XHRpZiAocmVtb3ZlZC5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlMTogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSA9IGZyb20uZ2V0KGtleSkhLm1hcChrZXliaW5kaW5nID0+ICh7IC4uLmtleWJpbmRpbmcsIC4uLnsga2V5IH0gfSkpO1xuXHRcdGNvbnN0IHZhbHVlMjogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSA9IHRvLmdldChrZXkpIS5tYXAoa2V5YmluZGluZyA9PiAoeyAuLi5rZXliaW5kaW5nLCAuLi57IGtleSB9IH0pKTtcblx0XHRpZiAoIWVxdWFscyh2YWx1ZTEsIHZhbHVlMiwgKGEsIGIpID0+IGlzU2FtZUtleWJpbmRpbmcoYSwgYikpKSB7XG5cdFx0XHR1cGRhdGVkLmFkZChrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH07XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVCeUNvbW1hbmQoZnJvbTogTWFwPHN0cmluZywgSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXT4sIHRvOiBNYXA8c3RyaW5nLCBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdPiwgbm9ybWFsaXplZEtleXM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4pOiBJQ29tcGFyZVJlc3VsdCB7XG5cdGNvbnN0IGZyb21LZXlzID0gWy4uLmZyb20ua2V5cygpXTtcblx0Y29uc3QgdG9LZXlzID0gWy4uLnRvLmtleXMoKV07XG5cdGNvbnN0IGFkZGVkID0gdG9LZXlzLmZpbHRlcihrZXkgPT4gIWZyb21LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHJlbW92ZWQgPSBmcm9tS2V5cy5maWx0ZXIoa2V5ID0+ICF0b0tleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgdXBkYXRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRmb3IgKGNvbnN0IGtleSBvZiBmcm9tS2V5cykge1xuXHRcdGlmIChyZW1vdmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUxOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdID0gZnJvbS5nZXQoa2V5KSEubWFwKGtleWJpbmRpbmcgPT4gKHsgLi4ua2V5YmluZGluZywgLi4ueyBrZXk6IG5vcm1hbGl6ZWRLZXlzW2tleWJpbmRpbmcua2V5XSB9IH0pKTtcblx0XHRjb25zdCB2YWx1ZTI6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10gPSB0by5nZXQoa2V5KSEubWFwKGtleWJpbmRpbmcgPT4gKHsgLi4ua2V5YmluZGluZywgLi4ueyBrZXk6IG5vcm1hbGl6ZWRLZXlzW2tleWJpbmRpbmcua2V5XSB9IH0pKTtcblx0XHRpZiAoIWFyZVNhbWVLZXliaW5kaW5nc1dpdGhTYW1lQ29tbWFuZCh2YWx1ZTEsIHZhbHVlMikpIHtcblx0XHRcdHVwZGF0ZWQuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfTtcbn1cblxuZnVuY3Rpb24gYXJlU2FtZUtleWJpbmRpbmdzV2l0aFNhbWVDb21tYW5kKHZhbHVlMTogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSwgdmFsdWUyOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdKTogYm9vbGVhbiB7XG5cdC8vIENvbXBhcmUgZW50cmllcyBhZGRpbmcga2V5YmluZGluZ3Ncblx0aWYgKCFlcXVhbHModmFsdWUxLmZpbHRlcigoeyBjb21tYW5kIH0pID0+IGNvbW1hbmRbMF0gIT09ICctJyksIHZhbHVlMi5maWx0ZXIoKHsgY29tbWFuZCB9KSA9PiBjb21tYW5kWzBdICE9PSAnLScpLCAoYSwgYikgPT4gaXNTYW1lS2V5YmluZGluZyhhLCBiKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gQ29tcGFyZSBlbnRyaWVzIHJlbW92aW5nIGtleWJpbmRpbmdzXG5cdGlmICghZXF1YWxzKHZhbHVlMS5maWx0ZXIoKHsgY29tbWFuZCB9KSA9PiBjb21tYW5kWzBdID09PSAnLScpLCB2YWx1ZTIuZmlsdGVyKCh7IGNvbW1hbmQgfSkgPT4gY29tbWFuZFswXSA9PT0gJy0nKSwgKGEsIGIpID0+IGlzU2FtZUtleWJpbmRpbmcoYSwgYikpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc1NhbWVLZXliaW5kaW5nKGE6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nLCBiOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZyk6IGJvb2xlYW4ge1xuXHRpZiAoYS5jb21tYW5kICE9PSBiLmNvbW1hbmQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGEua2V5ICE9PSBiLmtleSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCB3aGVuQSA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGEud2hlbik7XG5cdGNvbnN0IHdoZW5CID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoYi53aGVuKTtcblx0aWYgKCh3aGVuQSAmJiAhd2hlbkIpIHx8ICghd2hlbkEgJiYgd2hlbkIpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh3aGVuQSAmJiB3aGVuQiAmJiAhd2hlbkEuZXF1YWxzKHdoZW5CKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIW9iamVjdHMuZXF1YWxzKGEuYXJncywgYi5hcmdzKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gYWRkS2V5YmluZGluZ3MoY29udGVudDogc3RyaW5nLCBrZXliaW5kaW5nczogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogc3RyaW5nIHtcblx0Zm9yIChjb25zdCBrZXliaW5kaW5nIG9mIGtleWJpbmRpbmdzKSB7XG5cdFx0Y29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQoY29udGVudCwgWy0xXSwga2V5YmluZGluZywgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG5mdW5jdGlvbiByZW1vdmVLZXliaW5kaW5ncyhjb250ZW50OiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZywgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogc3RyaW5nIHtcblx0Y29uc3Qga2V5YmluZGluZ3MgPSBwYXJzZUtleWJpbmRpbmdzKGNvbnRlbnQpO1xuXHRmb3IgKGxldCBpbmRleCA9IGtleWJpbmRpbmdzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRpZiAoa2V5YmluZGluZ3NbaW5kZXhdLmNvbW1hbmQgPT09IGNvbW1hbmQgfHwga2V5YmluZGluZ3NbaW5kZXhdLmNvbW1hbmQgPT09IGAtJHtjb21tYW5kfWApIHtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KGNvbnRlbnQsIFtpbmRleF0sIHVuZGVmaW5lZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY29udGVudDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlS2V5YmluZGluZ3MoY29udGVudDogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcsIGtleWJpbmRpbmdzOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBzdHJpbmcge1xuXHRjb25zdCBhbGxLZXliaW5kaW5ncyA9IHBhcnNlS2V5YmluZGluZ3MoY29udGVudCk7XG5cdGNvbnN0IGxvY2F0aW9uID0gYWxsS2V5YmluZGluZ3MuZmluZEluZGV4KGtleWJpbmRpbmcgPT4ga2V5YmluZGluZy5jb21tYW5kID09PSBjb21tYW5kIHx8IGtleWJpbmRpbmcuY29tbWFuZCA9PT0gYC0ke2NvbW1hbmR9YCk7XG5cdC8vIFJlbW92ZSBhbGwgZW50cmllcyB3aXRoIHRoaXMgY29tbWFuZFxuXHRmb3IgKGxldCBpbmRleCA9IGFsbEtleWJpbmRpbmdzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRpZiAoYWxsS2V5YmluZGluZ3NbaW5kZXhdLmNvbW1hbmQgPT09IGNvbW1hbmQgfHwgYWxsS2V5YmluZGluZ3NbaW5kZXhdLmNvbW1hbmQgPT09IGAtJHtjb21tYW5kfWApIHtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KGNvbnRlbnQsIFtpbmRleF0sIHVuZGVmaW5lZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXHQvLyBhZGQgYWxsIGVudHJpZXMgYXQgdGhlIHNhbWUgbG9jYXRpb24gd2hlcmUgdGhlIGVudHJ5IHdpdGggdGhpcyBjb21tYW5kIHdhcyBsb2NhdGVkLlxuXHRmb3IgKGxldCBpbmRleCA9IGtleWJpbmRpbmdzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRjb250ZW50ID0gY29udGVudFV0aWwuZWRpdChjb250ZW50LCBbbG9jYXRpb25dLCBrZXliaW5kaW5nc1tpbmRleF0sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0fVxuXHRyZXR1cm4gY29udGVudDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsY0FBYztBQUV2QixTQUFTLGFBQWE7QUFFdEIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRS9CLFlBQVksaUJBQWlCO0FBa0I3QixTQUFTLGlCQUFpQixTQUE0QztBQUNyRSxTQUFPLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFDM0I7QUFFQSxlQUFzQixNQUFNLGNBQXNCLGVBQXVCLGFBQTRCLG1CQUFzQyx5QkFBa0k7QUFDNVEsUUFBTSxRQUFRLGlCQUFpQixZ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
