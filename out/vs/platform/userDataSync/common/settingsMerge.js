import { distinct } from "../../../base/common/arrays.js";
import { parse, visit } from "../../../base/common/json.js";
import { applyEdits, setProperty, withFormatting } from "../../../base/common/jsonEdit.js";
import { getEOL } from "../../../base/common/jsonFormatter.js";
import * as objects from "../../../base/common/objects.js";
import * as contentUtil from "./content.js";
import { getDisallowedIgnoredSettings } from "./userDataSync.js";
function getIgnoredSettings(defaultIgnoredSettings, configurationService, settingsContent) {
  let value = [];
  if (settingsContent) {
    value = getIgnoredSettingsFromContent(settingsContent);
  } else {
    value = getIgnoredSettingsFromConfig(configurationService);
  }
  const added = [], removed = [...getDisallowedIgnoredSettings()];
  if (Array.isArray(value)) {
    for (const key of value) {
      if (key.startsWith("-")) {
        removed.push(key.substring(1));
      } else {
        added.push(key);
      }
    }
  }
  return distinct([...defaultIgnoredSettings, ...added].filter((setting) => !removed.includes(setting)));
}
function getIgnoredSettingsFromConfig(configurationService) {
  let userValue = configurationService.inspect("settingsSync.ignoredSettings").userValue;
  if (userValue !== void 0) {
    return userValue;
  }
  userValue = configurationService.inspect("sync.ignoredSettings").userValue;
  if (userValue !== void 0) {
    return userValue;
  }
  return configurationService.getValue("settingsSync.ignoredSettings") || [];
}
function getIgnoredSettingsFromContent(settingsContent) {
  const parsed = parse(settingsContent);
  return parsed ? parsed["settingsSync.ignoredSettings"] || parsed["sync.ignoredSettings"] || [] : [];
}
function removeComments(content, formattingOptions) {
  const source = parse(content) || {};
  let result = "{}";
  for (const key of Object.keys(source)) {
    const edits = setProperty(result, [key], source[key], formattingOptions);
    result = applyEdits(result, edits);
  }
  return result;
}
function updateIgnoredSettings(targetContent, sourceContent, ignoredSettings, formattingOptions) {
  if (ignoredSettings.length) {
    const sourceTree = parseSettings(sourceContent);
    const source = parse(sourceContent) || {};
    const target = parse(targetContent);
    if (!target) {
      return targetContent;
    }
    const settingsToAdd = [];
    for (const key of ignoredSettings) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (sourceValue === void 0) {
        targetContent = contentUtil.edit(targetContent, [key], void 0, formattingOptions);
      } else if (targetValue !== void 0) {
        targetContent = contentUtil.edit(targetContent, [key], sourceValue, formattingOptions);
      } else {
        settingsToAdd.push(findSettingNode(key, sourceTree));
      }
    }
    settingsToAdd.sort((a, b) => a.startOffset - b.startOffset);
    settingsToAdd.forEach((s) => targetContent = addSetting(s.setting.key, sourceContent, targetContent, formattingOptions));
  }
  return targetContent;
}
function merge(originalLocalContent, originalRemoteContent, baseContent, ignoredSettings, resolvedConflicts, formattingOptions) {
  const localContentWithoutIgnoredSettings = updateIgnoredSettings(originalLocalContent, originalRemoteContent, ignoredSettings, formattingOptions);
  const localForwarded = baseContent !== localContentWithoutIgnoredSettings;
  const remoteForwarded = baseContent !== originalRemoteContent;
  if (!localForwarded && !remoteForwarded) {
    return { conflictsSettings: [], localContent: null, remoteContent: null, hasConflicts: false };
  }
  if (localForwarded && !remoteForwarded) {
    return { conflictsSettings: [], localContent: null, remoteContent: localContentWithoutIgnoredSettings, hasConflicts: false };
  }
  if (remoteForwarded && !localForwarded) {
    return { conflictsSettings: [], localContent: updateIgnoredSettings(originalRemoteContent, originalLocalContent, ignoredSettings, formattingOptions), remoteContent: null, hasConflicts: false };
  }
  if (baseContent === null && isEmpty(originalLocalContent)) {
    const localContent2 = areSame(originalLocalContent, originalRemoteContent, ignoredSettings) ? null : updateIgnoredSettings(originalRemoteContent, originalLocalContent, ignoredSettings, formattingOptions);
    return { conflictsSettings: [], localContent: localContent2, remoteContent: null, hasConflicts: false };
  }
  let localContent = originalLocalContent;
  let remoteContent = originalRemoteContent;
  const local = parse(originalLocalContent);
  const remote = parse(originalRemoteContent);
  const base = baseContent ? parse(baseContent) : null;
  const ignored = ignoredSettings.reduce((set, key) => {
    set.add(key);
    return set;
  }, /* @__PURE__ */ new Set());
  const localToRemote = compare(local, remote, ignored);
  const baseToLocal = compare(base, local, ignored);
  const baseToRemote = compare(base, remote, ignored);
  const conflicts = /* @__PURE__ */ new Map();
  const handledConflicts = /* @__PURE__ */ new Set();
  const handleConflict = (conflictKey) => {
    handledConflicts.add(conflictKey);
    const resolvedConflict = resolvedConflicts.filter(({ key }) => key === conflictKey)[0];
    if (resolvedConflict) {
      localContent = contentUtil.edit(localContent, [conflictKey], resolvedConflict.value, formattingOptions);
      remoteContent = contentUtil.edit(remoteContent, [conflictKey], resolvedConflict.value, formattingOptions);
    } else {
      conflicts.set(conflictKey, { key: conflictKey, localValue: local[conflictKey], remoteValue: remote[conflictKey] });
    }
  };
  for (const key of baseToLocal.removed.values()) {
    if (baseToRemote.updated.has(key)) {
      handleConflict(key);
    } else {
      remoteContent = contentUtil.edit(remoteContent, [key], void 0, formattingOptions);
    }
  }
  for (const key of baseToRemote.removed.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      handleConflict(key);
    } else {
      localContent = contentUtil.edit(localContent, [key], void 0, formattingOptions);
    }
  }
  for (const key of baseToLocal.updated.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToRemote.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      remoteContent = contentUtil.edit(remoteContent, [key], local[key], formattingOptions);
    }
  }
  for (const key of baseToRemote.updated.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      localContent = contentUtil.edit(localContent, [key], remote[key], formattingOptions);
    }
  }
  for (const key of baseToLocal.added.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToRemote.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      remoteContent = addSetting(key, localContent, remoteContent, formattingOptions);
    }
  }
  for (const key of baseToRemote.added.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToLocal.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      localContent = addSetting(key, remoteContent, localContent, formattingOptions);
    }
  }
  const hasConflicts = conflicts.size > 0 || !areSame(localContent, remoteContent, ignoredSettings);
  const hasLocalChanged = hasConflicts || !areSame(localContent, originalLocalContent, []);
  const hasRemoteChanged = hasConflicts || !areSame(remoteContent, originalRemoteContent, []);
  return { localContent: hasLocalChanged ? localContent : null, remoteContent: hasRemoteChanged ? remoteContent : null, conflictsSettings: [...conflicts.values()], hasConflicts };
}
function areSame(localContent, remoteContent, ignoredSettings) {
  if (localContent === remoteContent) {
    return true;
  }
  const local = parse(localContent);
  const remote = parse(remoteContent);
  const ignored = ignoredSettings.reduce((set, key) => {
    set.add(key);
    return set;
  }, /* @__PURE__ */ new Set());
  const localTree = parseSettings(localContent).filter((node) => !(node.setting && ignored.has(node.setting.key)));
  const remoteTree = parseSettings(remoteContent).filter((node) => !(node.setting && ignored.has(node.setting.key)));
  if (localTree.length !== remoteTree.length) {
    return false;
  }
  for (let index = 0; index < localTree.length; index++) {
    const localNode = localTree[index];
    const remoteNode = remoteTree[index];
    if (localNode.setting && remoteNode.setting) {
      if (localNode.setting.key !== remoteNode.setting.key) {
        return false;
      }
      if (!objects.equals(local[localNode.setting.key], remote[localNode.setting.key])) {
        return false;
      }
    } else if (!localNode.setting && !remoteNode.setting) {
      if (localNode.value !== remoteNode.value) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}
function isEmpty(content) {
  if (content) {
    const nodes = parseSettings(content);
    return nodes.length === 0;
  }
  return true;
}
function compare(from, to, ignored) {
  const fromKeys = from ? Object.keys(from).filter((key) => !ignored.has(key)) : [];
  const toKeys = Object.keys(to).filter((key) => !ignored.has(key));
  const added = toKeys.filter((key) => !fromKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const removed = fromKeys.filter((key) => !toKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const updated = /* @__PURE__ */ new Set();
  if (from) {
    for (const key of fromKeys) {
      if (removed.has(key)) {
        continue;
      }
      const value1 = from[key];
      const value2 = to[key];
      if (!objects.equals(value1, value2)) {
        updated.add(key);
      }
    }
  }
  return { added, removed, updated };
}
function addSetting(key, sourceContent, targetContent, formattingOptions) {
  const source = parse(sourceContent);
  const sourceTree = parseSettings(sourceContent);
  const targetTree = parseSettings(targetContent);
  const insertLocation = getInsertLocation(key, sourceTree, targetTree);
  return insertAtLocation(targetContent, key, source[key], insertLocation, targetTree, formattingOptions);
}
function getInsertLocation(key, sourceTree, targetTree) {
  const sourceNodeIndex = sourceTree.findIndex((node) => node.setting?.key === key);
  const sourcePreviousNode = sourceTree[sourceNodeIndex - 1];
  if (sourcePreviousNode) {
    if (sourcePreviousNode.setting) {
      const targetPreviousSetting = findSettingNode(sourcePreviousNode.setting.key, targetTree);
      if (targetPreviousSetting) {
        return { index: targetTree.indexOf(targetPreviousSetting), insertAfter: true };
      }
    } else {
      const sourcePreviousSettingNode = findPreviousSettingNode(sourceNodeIndex, sourceTree);
      if (sourcePreviousSettingNode) {
        const targetPreviousSetting = findSettingNode(sourcePreviousSettingNode.setting.key, targetTree);
        if (targetPreviousSetting) {
          const targetNextSetting = findNextSettingNode(targetTree.indexOf(targetPreviousSetting), targetTree);
          const sourceCommentNodes = findNodesBetween(sourceTree, sourcePreviousSettingNode, sourceTree[sourceNodeIndex]);
          if (targetNextSetting) {
            const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetNextSetting);
            const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes, targetCommentNodes);
            if (targetCommentNode) {
              return { index: targetTree.indexOf(targetCommentNode), insertAfter: true };
            } else {
              return { index: targetTree.indexOf(targetNextSetting), insertAfter: false };
            }
          } else {
            const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetTree[targetTree.length - 1]);
            const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes, targetCommentNodes);
            if (targetCommentNode) {
              return { index: targetTree.indexOf(targetCommentNode), insertAfter: true };
            } else {
              return { index: targetTree.length - 1, insertAfter: true };
            }
          }
        }
      }
    }
    const sourceNextNode = sourceTree[sourceNodeIndex + 1];
    if (sourceNextNode) {
      if (sourceNextNode.setting) {
        const targetNextSetting = findSettingNode(sourceNextNode.setting.key, targetTree);
        if (targetNextSetting) {
          return { index: targetTree.indexOf(targetNextSetting), insertAfter: false };
        }
      } else {
        const sourceNextSettingNode = findNextSettingNode(sourceNodeIndex, sourceTree);
        if (sourceNextSettingNode) {
          const targetNextSetting = findSettingNode(sourceNextSettingNode.setting.key, targetTree);
          if (targetNextSetting) {
            const targetPreviousSetting = findPreviousSettingNode(targetTree.indexOf(targetNextSetting), targetTree);
            const sourceCommentNodes = findNodesBetween(sourceTree, sourceTree[sourceNodeIndex], sourceNextSettingNode);
            if (targetPreviousSetting) {
              const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetNextSetting);
              const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes.reverse(), targetCommentNodes.reverse());
              if (targetCommentNode) {
                return { index: targetTree.indexOf(targetCommentNode), insertAfter: false };
              } else {
                return { index: targetTree.indexOf(targetPreviousSetting), insertAfter: true };
              }
            } else {
              const targetCommentNodes = findNodesBetween(targetTree, targetTree[0], targetNextSetting);
              const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes.reverse(), targetCommentNodes.reverse());
              if (targetCommentNode) {
                return { index: targetTree.indexOf(targetCommentNode), insertAfter: false };
              } else {
                return { index: 0, insertAfter: false };
              }
            }
          }
        }
      }
    }
  }
  return { index: targetTree.length - 1, insertAfter: true };
}
function insertAtLocation(content, key, value, location, tree, formattingOptions) {
  let edits;
  if (location.index === -1) {
    edits = setProperty(content, [key], value, formattingOptions);
  } else {
    edits = getEditToInsertAtLocation(content, key, value, location, tree, formattingOptions).map((edit) => withFormatting(content, edit, formattingOptions)[0]);
  }
  return applyEdits(content, edits);
}
function getEditToInsertAtLocation(content, key, value, location, tree, formattingOptions) {
  const newProperty = `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  const eol = getEOL(formattingOptions, content);
  const node = tree[location.index];
  if (location.insertAfter) {
    const edits = [];
    if (node.setting) {
      edits.push({ offset: node.endOffset, length: 0, content: "," + newProperty });
    } else {
      const nextSettingNode = findNextSettingNode(location.index, tree);
      const previousSettingNode = findPreviousSettingNode(location.index, tree);
      const previousSettingCommaOffset = previousSettingNode?.setting?.commaOffset;
      if (previousSettingNode && previousSettingCommaOffset === void 0) {
        edits.push({ offset: previousSettingNode.endOffset, length: 0, content: "," });
      }
      const isPreviouisSettingIncludesComment = previousSettingCommaOffset !== void 0 && previousSettingCommaOffset > node.endOffset;
      edits.push({
        offset: isPreviouisSettingIncludesComment ? previousSettingCommaOffset + 1 : node.endOffset,
        length: 0,
        content: nextSettingNode ? eol + newProperty + "," : eol + newProperty
      });
    }
    return edits;
  } else {
    if (node.setting) {
      return [{ offset: node.startOffset, length: 0, content: newProperty + "," }];
    }
    const content2 = (tree[location.index - 1] && !tree[location.index - 1].setting ? eol : "") + newProperty + (findNextSettingNode(location.index, tree) ? "," : "") + eol;
    return [{ offset: node.startOffset, length: 0, content: content2 }];
  }
}
function findSettingNode(key, tree) {
  return tree.filter((node) => node.setting?.key === key)[0];
}
function findPreviousSettingNode(index, tree) {
  for (let i = index - 1; i >= 0; i--) {
    if (tree[i].setting) {
      return tree[i];
    }
  }
  return void 0;
}
function findNextSettingNode(index, tree) {
  for (let i = index + 1; i < tree.length; i++) {
    if (tree[i].setting) {
      return tree[i];
    }
  }
  return void 0;
}
function findNodesBetween(nodes, from, till) {
  const fromIndex = nodes.indexOf(from);
  const tillIndex = nodes.indexOf(till);
  return nodes.filter((node, index) => fromIndex < index && index < tillIndex);
}
function findLastMatchingTargetCommentNode(sourceComments, targetComments) {
  if (sourceComments.length && targetComments.length) {
    let index = 0;
    for (; index < targetComments.length && index < sourceComments.length; index++) {
      if (sourceComments[index].value !== targetComments[index].value) {
        return targetComments[index - 1];
      }
    }
    return targetComments[index - 1];
  }
  return void 0;
}
function parseSettings(content) {
  const nodes = [];
  let hierarchyLevel = -1;
  let startOffset;
  let key;
  const visitor = {
    onObjectBegin: (offset) => {
      hierarchyLevel++;
    },
    onObjectProperty: (name, offset, length) => {
      if (hierarchyLevel === 0) {
        startOffset = offset;
        key = name;
      }
    },
    onObjectEnd: (offset, length) => {
      hierarchyLevel--;
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset,
          endOffset: offset + length,
          value: content.substring(startOffset, offset + length),
          setting: {
            key,
            commaOffset: void 0
          }
        });
      }
    },
    onArrayBegin: (offset, length) => {
      hierarchyLevel++;
    },
    onArrayEnd: (offset, length) => {
      hierarchyLevel--;
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset,
          endOffset: offset + length,
          value: content.substring(startOffset, offset + length),
          setting: {
            key,
            commaOffset: void 0
          }
        });
      }
    },
    onLiteralValue: (value, offset, length) => {
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset,
          endOffset: offset + length,
          value: content.substring(startOffset, offset + length),
          setting: {
            key,
            commaOffset: void 0
          }
        });
      }
    },
    onSeparator: (sep, offset, length) => {
      if (hierarchyLevel === 0) {
        if (sep === ",") {
          let index = nodes.length - 1;
          for (; index >= 0; index--) {
            if (nodes[index].setting) {
              break;
            }
          }
          const node = nodes[index];
          if (node) {
            nodes.splice(index, 1, {
              startOffset: node.startOffset,
              endOffset: node.endOffset,
              value: node.value,
              setting: {
                key: node.setting.key,
                commaOffset: offset
              }
            });
          }
        }
      }
    },
    onComment: (offset, length) => {
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset: offset,
          endOffset: offset + length,
          value: content.substring(offset, offset + length)
        });
      }
    }
  };
  visit(content, visitor);
  return nodes;
}
export {
  addSetting,
  getIgnoredSettings,
  isEmpty,
  merge,
  removeComments,
  updateIgnoredSettings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHNldHRpbmdzTWVyZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEpTT05WaXNpdG9yLCBwYXJzZSwgdmlzaXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IGFwcGx5RWRpdHMsIHNldFByb3BlcnR5LCB3aXRoRm9ybWF0dGluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FZGl0LmpzJztcbmltcG9ydCB7IEVkaXQsIEZvcm1hdHRpbmdPcHRpb25zLCBnZXRFT0wgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCAqIGFzIGNvbnRlbnRVdGlsIGZyb20gJy4vY29udGVudC5qcyc7XG5pbXBvcnQgeyBnZXREaXNhbGxvd2VkSWdub3JlZFNldHRpbmdzLCBJQ29uZmxpY3RTZXR0aW5nIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNZXJnZVJlc3VsdCB7XG5cdGxvY2FsQ29udGVudDogc3RyaW5nIHwgbnVsbDtcblx0cmVtb3RlQ29udGVudDogc3RyaW5nIHwgbnVsbDtcblx0aGFzQ29uZmxpY3RzOiBib29sZWFuO1xuXHRjb25mbGljdHNTZXR0aW5nczogSUNvbmZsaWN0U2V0dGluZ1tdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SWdub3JlZFNldHRpbmdzKGRlZmF1bHRJZ25vcmVkU2V0dGluZ3M6IHN0cmluZ1tdLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzZXR0aW5nc0NvbnRlbnQ/OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGxldCB2YWx1ZTogUmVhZG9ubHlBcnJheTxzdHJpbmc+ID0gW107XG5cdGlmIChzZXR0aW5nc0NvbnRlbnQpIHtcblx0XHR2YWx1ZSA9IGdldElnbm9yZWRTZXR0aW5nc0Zyb21Db250ZW50KHNldHRpbmdzQ29udGVudCk7XG5cdH0gZWxzZSB7XG5cdFx0dmFsdWUgPSBnZXRJZ25vcmVkU2V0dGluZ3NGcm9tQ29uZmlnKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxuXHRjb25zdCBhZGRlZDogc3RyaW5nW10gPSBbXSwgcmVtb3ZlZDogc3RyaW5nW10gPSBbLi4uZ2V0RGlzYWxsb3dlZElnbm9yZWRTZXR0aW5ncygpXTtcblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdmFsdWUpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRcdHJlbW92ZWQucHVzaChrZXkuc3Vic3RyaW5nKDEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFkZGVkLnB1c2goa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGRpc3RpbmN0KFsuLi5kZWZhdWx0SWdub3JlZFNldHRpbmdzLCAuLi5hZGRlZCxdLmZpbHRlcihzZXR0aW5nID0+ICFyZW1vdmVkLmluY2x1ZGVzKHNldHRpbmcpKSk7XG59XG5cbmZ1bmN0aW9uIGdldElnbm9yZWRTZXR0aW5nc0Zyb21Db25maWcoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB7XG5cdGxldCB1c2VyVmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZ1tdPignc2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5ncycpLnVzZXJWYWx1ZTtcblx0aWYgKHVzZXJWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVzZXJWYWx1ZTtcblx0fVxuXHR1c2VyVmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZ1tdPignc3luYy5pZ25vcmVkU2V0dGluZ3MnKS51c2VyVmFsdWU7XG5cdGlmICh1c2VyVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1c2VyVmFsdWU7XG5cdH1cblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZ1tdPignc2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5ncycpIHx8IFtdO1xufVxuXG5mdW5jdGlvbiBnZXRJZ25vcmVkU2V0dGluZ3NGcm9tQ29udGVudChzZXR0aW5nc0NvbnRlbnQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcGFyc2VkID0gcGFyc2Uoc2V0dGluZ3NDb250ZW50KTtcblx0cmV0dXJuIHBhcnNlZCA/IHBhcnNlZFsnc2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5ncyddIHx8IHBhcnNlZFsnc3luYy5pZ25vcmVkU2V0dGluZ3MnXSB8fCBbXSA6IFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQ29tbWVudHMoY29udGVudDogc3RyaW5nLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBzdHJpbmcge1xuXHRjb25zdCBzb3VyY2UgPSBwYXJzZShjb250ZW50KSB8fCB7fTtcblx0bGV0IHJlc3VsdCA9ICd7fSc7XG5cdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNvdXJjZSkpIHtcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KHJlc3VsdCwgW2tleV0sIHNvdXJjZVtrZXldLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0cmVzdWx0ID0gYXBwbHlFZGl0cyhyZXN1bHQsIGVkaXRzKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlSWdub3JlZFNldHRpbmdzKHRhcmdldENvbnRlbnQ6IHN0cmluZywgc291cmNlQ29udGVudDogc3RyaW5nLCBpZ25vcmVkU2V0dGluZ3M6IHN0cmluZ1tdLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBzdHJpbmcge1xuXHRpZiAoaWdub3JlZFNldHRpbmdzLmxlbmd0aCkge1xuXHRcdGNvbnN0IHNvdXJjZVRyZWUgPSBwYXJzZVNldHRpbmdzKHNvdXJjZUNvbnRlbnQpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHBhcnNlKHNvdXJjZUNvbnRlbnQpIHx8IHt9O1xuXHRcdGNvbnN0IHRhcmdldCA9IHBhcnNlKHRhcmdldENvbnRlbnQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0Q29udGVudDtcblx0XHR9XG5cdFx0Y29uc3Qgc2V0dGluZ3NUb0FkZDogSU5vZGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGlnbm9yZWRTZXR0aW5ncykge1xuXHRcdFx0Y29uc3Qgc291cmNlVmFsdWUgPSBzb3VyY2Vba2V5XTtcblx0XHRcdGNvbnN0IHRhcmdldFZhbHVlID0gdGFyZ2V0W2tleV07XG5cblx0XHRcdC8vIFJlbW92ZSBpbiB0YXJnZXRcblx0XHRcdGlmIChzb3VyY2VWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRhcmdldENvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KHRhcmdldENvbnRlbnQsIFtrZXldLCB1bmRlZmluZWQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIGluIHRhcmdldFxuXHRcdFx0ZWxzZSBpZiAodGFyZ2V0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0YXJnZXRDb250ZW50ID0gY29udGVudFV0aWwuZWRpdCh0YXJnZXRDb250ZW50LCBba2V5XSwgc291cmNlVmFsdWUsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHNldHRpbmdzVG9BZGQucHVzaChmaW5kU2V0dGluZ05vZGUoa2V5LCBzb3VyY2VUcmVlKSEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNldHRpbmdzVG9BZGQuc29ydCgoYSwgYikgPT4gYS5zdGFydE9mZnNldCAtIGIuc3RhcnRPZmZzZXQpO1xuXHRcdHNldHRpbmdzVG9BZGQuZm9yRWFjaChzID0+IHRhcmdldENvbnRlbnQgPSBhZGRTZXR0aW5nKHMuc2V0dGluZyEua2V5LCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucykpO1xuXHR9XG5cdHJldHVybiB0YXJnZXRDb250ZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2Uob3JpZ2luYWxMb2NhbENvbnRlbnQ6IHN0cmluZywgb3JpZ2luYWxSZW1vdGVDb250ZW50OiBzdHJpbmcsIGJhc2VDb250ZW50OiBzdHJpbmcgfCBudWxsLCBpZ25vcmVkU2V0dGluZ3M6IHN0cmluZ1tdLCByZXNvbHZlZENvbmZsaWN0czogeyBrZXk6IHN0cmluZzsgdmFsdWU6IGFueSB8IHVuZGVmaW5lZCB9W10sIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IElNZXJnZVJlc3VsdCB7XG5cblx0Y29uc3QgbG9jYWxDb250ZW50V2l0aG91dElnbm9yZWRTZXR0aW5ncyA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhvcmlnaW5hbExvY2FsQ29udGVudCwgb3JpZ2luYWxSZW1vdGVDb250ZW50LCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0Y29uc3QgbG9jYWxGb3J3YXJkZWQgPSBiYXNlQ29udGVudCAhPT0gbG9jYWxDb250ZW50V2l0aG91dElnbm9yZWRTZXR0aW5ncztcblx0Y29uc3QgcmVtb3RlRm9yd2FyZGVkID0gYmFzZUNvbnRlbnQgIT09IG9yaWdpbmFsUmVtb3RlQ29udGVudDtcblxuXHQvKiBubyBjaGFuZ2VzICovXG5cdGlmICghbG9jYWxGb3J3YXJkZWQgJiYgIXJlbW90ZUZvcndhcmRlZCkge1xuXHRcdHJldHVybiB7IGNvbmZsaWN0c1NldHRpbmdzOiBbXSwgbG9jYWxDb250ZW50OiBudWxsLCByZW1vdGVDb250ZW50OiBudWxsLCBoYXNDb25mbGljdHM6IGZhbHNlIH07XG5cdH1cblxuXHQvKiBsb2NhbCBoYXMgY2hhbmdlZCBhbmQgcmVtb3RlIGhhcyBub3QgKi9cblx0aWYgKGxvY2FsRm9yd2FyZGVkICYmICFyZW1vdGVGb3J3YXJkZWQpIHtcblx0XHRyZXR1cm4geyBjb25mbGljdHNTZXR0aW5nczogW10sIGxvY2FsQ29udGVudDogbnVsbCwgcmVtb3RlQ29udGVudDogbG9jYWxDb250ZW50V2l0aG91dElnbm9yZWRTZXR0aW5ncywgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0LyogcmVtb3RlIGhhcyBjaGFuZ2VkIGFuZCBsb2NhbCBoYXMgbm90ICovXG5cdGlmIChyZW1vdGVGb3J3YXJkZWQgJiYgIWxvY2FsRm9yd2FyZGVkKSB7XG5cdFx0cmV0dXJuIHsgY29uZmxpY3RzU2V0dGluZ3M6IFtdLCBsb2NhbENvbnRlbnQ6IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhvcmlnaW5hbFJlbW90ZUNvbnRlbnQsIG9yaWdpbmFsTG9jYWxDb250ZW50LCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKSwgcmVtb3RlQ29udGVudDogbnVsbCwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0LyogbG9jYWwgaXMgZW1wdHkgYW5kIG5vdCBzeW5jZWQgYmVmb3JlICovXG5cdGlmIChiYXNlQ29udGVudCA9PT0gbnVsbCAmJiBpc0VtcHR5KG9yaWdpbmFsTG9jYWxDb250ZW50KSkge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGFyZVNhbWUob3JpZ2luYWxMb2NhbENvbnRlbnQsIG9yaWdpbmFsUmVtb3RlQ29udGVudCwgaWdub3JlZFNldHRpbmdzKSA/IG51bGwgOiB1cGRhdGVJZ25vcmVkU2V0dGluZ3Mob3JpZ2luYWxSZW1vdGVDb250ZW50LCBvcmlnaW5hbExvY2FsQ29udGVudCwgaWdub3JlZFNldHRpbmdzLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0cmV0dXJuIHsgY29uZmxpY3RzU2V0dGluZ3M6IFtdLCBsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQ6IG51bGwsIGhhc0NvbmZsaWN0czogZmFsc2UgfTtcblx0fVxuXG5cdC8qIHJlbW90ZSBhbmQgbG9jYWwgaGFzIGNoYW5nZWQgKi9cblx0bGV0IGxvY2FsQ29udGVudCA9IG9yaWdpbmFsTG9jYWxDb250ZW50O1xuXHRsZXQgcmVtb3RlQ29udGVudCA9IG9yaWdpbmFsUmVtb3RlQ29udGVudDtcblx0Y29uc3QgbG9jYWwgPSBwYXJzZShvcmlnaW5hbExvY2FsQ29udGVudCk7XG5cdGNvbnN0IHJlbW90ZSA9IHBhcnNlKG9yaWdpbmFsUmVtb3RlQ29udGVudCk7XG5cdGNvbnN0IGJhc2UgPSBiYXNlQ29udGVudCA/IHBhcnNlKGJhc2VDb250ZW50KSA6IG51bGw7XG5cblx0Y29uc3QgaWdub3JlZCA9IGlnbm9yZWRTZXR0aW5ncy5yZWR1Y2UoKHNldCwga2V5KSA9PiB7IHNldC5hZGQoa2V5KTsgcmV0dXJuIHNldDsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCBsb2NhbFRvUmVtb3RlID0gY29tcGFyZShsb2NhbCwgcmVtb3RlLCBpZ25vcmVkKTtcblx0Y29uc3QgYmFzZVRvTG9jYWwgPSBjb21wYXJlKGJhc2UsIGxvY2FsLCBpZ25vcmVkKTtcblx0Y29uc3QgYmFzZVRvUmVtb3RlID0gY29tcGFyZShiYXNlLCByZW1vdGUsIGlnbm9yZWQpO1xuXG5cdGNvbnN0IGNvbmZsaWN0czogTWFwPHN0cmluZywgSUNvbmZsaWN0U2V0dGluZz4gPSBuZXcgTWFwPHN0cmluZywgSUNvbmZsaWN0U2V0dGluZz4oKTtcblx0Y29uc3QgaGFuZGxlZENvbmZsaWN0czogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgaGFuZGxlQ29uZmxpY3QgPSAoY29uZmxpY3RLZXk6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdGhhbmRsZWRDb25mbGljdHMuYWRkKGNvbmZsaWN0S2V5KTtcblx0XHRjb25zdCByZXNvbHZlZENvbmZsaWN0ID0gcmVzb2x2ZWRDb25mbGljdHMuZmlsdGVyKCh7IGtleSB9KSA9PiBrZXkgPT09IGNvbmZsaWN0S2V5KVswXTtcblx0XHRpZiAocmVzb2x2ZWRDb25mbGljdCkge1xuXHRcdFx0bG9jYWxDb250ZW50ID0gY29udGVudFV0aWwuZWRpdChsb2NhbENvbnRlbnQsIFtjb25mbGljdEtleV0sIHJlc29sdmVkQ29uZmxpY3QudmFsdWUsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRcdHJlbW90ZUNvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KHJlbW90ZUNvbnRlbnQsIFtjb25mbGljdEtleV0sIHJlc29sdmVkQ29uZmxpY3QudmFsdWUsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uZmxpY3RzLnNldChjb25mbGljdEtleSwgeyBrZXk6IGNvbmZsaWN0S2V5LCBsb2NhbFZhbHVlOiBsb2NhbFtjb25mbGljdEtleV0sIHJlbW90ZVZhbHVlOiByZW1vdGVbY29uZmxpY3RLZXldIH0pO1xuXHRcdH1cblx0fTtcblxuXHQvLyBSZW1vdmVkIHNldHRpbmdzIGluIExvY2FsXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLnJlbW92ZWQudmFsdWVzKCkpIHtcblx0XHQvLyBDb25mbGljdCAtIEdvdCB1cGRhdGVkIGluIHJlbW90ZS5cblx0XHRpZiAoYmFzZVRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdGhhbmRsZUNvbmZsaWN0KGtleSk7XG5cdFx0fVxuXHRcdC8vIEFsc28gcmVtb3ZlIGluIHJlbW90ZVxuXHRcdGVsc2Uge1xuXHRcdFx0cmVtb3RlQ29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQocmVtb3RlQ29udGVudCwgW2tleV0sIHVuZGVmaW5lZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFJlbW92ZWQgc2V0dGluZ3MgaW4gUmVtb3RlXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS5yZW1vdmVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGhhbmRsZWRDb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBDb25mbGljdCAtIEdvdCB1cGRhdGVkIGluIGxvY2FsXG5cdFx0aWYgKGJhc2VUb0xvY2FsLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdGhhbmRsZUNvbmZsaWN0KGtleSk7XG5cdFx0fVxuXHRcdC8vIEFsc28gcmVtb3ZlIGluIGxvY2Fsc1xuXHRcdGVsc2Uge1xuXHRcdFx0bG9jYWxDb250ZW50ID0gY29udGVudFV0aWwuZWRpdChsb2NhbENvbnRlbnQsIFtrZXldLCB1bmRlZmluZWQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyBVcGRhdGVkIHNldHRpbmdzIGluIExvY2FsXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLnVwZGF0ZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoaGFuZGxlZENvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIEdvdCB1cGRhdGVkIGluIHJlbW90ZVxuXHRcdGlmIChiYXNlVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRoYW5kbGVDb25mbGljdChrZXkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZW1vdGVDb250ZW50ID0gY29udGVudFV0aWwuZWRpdChyZW1vdGVDb250ZW50LCBba2V5XSwgbG9jYWxba2V5XSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFVwZGF0ZWQgc2V0dGluZ3MgaW4gUmVtb3RlXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS51cGRhdGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGhhbmRsZWRDb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgdXBkYXRlZCBpbiBsb2NhbFxuXHRcdGlmIChiYXNlVG9Mb2NhbC51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHQvLyBIYXMgZGlmZmVyZW50IHZhbHVlXG5cdFx0XHRpZiAobG9jYWxUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGhhbmRsZUNvbmZsaWN0KGtleSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvY2FsQ29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQobG9jYWxDb250ZW50LCBba2V5XSwgcmVtb3RlW2tleV0sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBZGRlZCBzZXR0aW5ncyBpbiBMb2NhbFxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9Mb2NhbC5hZGRlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChoYW5kbGVkQ29uZmxpY3RzLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gR290IGFkZGVkIGluIHJlbW90ZVxuXHRcdGlmIChiYXNlVG9SZW1vdGUuYWRkZWQuaGFzKGtleSkpIHtcblx0XHRcdC8vIEhhcyBkaWZmZXJlbnQgdmFsdWVcblx0XHRcdGlmIChsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0aGFuZGxlQ29uZmxpY3Qoa2V5KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVtb3RlQ29udGVudCA9IGFkZFNldHRpbmcoa2V5LCBsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBZGRlZCBzZXR0aW5ncyBpbiByZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvUmVtb3RlLmFkZGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGhhbmRsZWRDb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgYWRkZWQgaW4gbG9jYWxcblx0XHRpZiAoYmFzZVRvTG9jYWwuYWRkZWQuaGFzKGtleSkpIHtcblx0XHRcdC8vIEhhcyBkaWZmZXJlbnQgdmFsdWVcblx0XHRcdGlmIChsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0aGFuZGxlQ29uZmxpY3Qoa2V5KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9jYWxDb250ZW50ID0gYWRkU2V0dGluZyhrZXksIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGhhc0NvbmZsaWN0cyA9IGNvbmZsaWN0cy5zaXplID4gMCB8fCAhYXJlU2FtZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGlnbm9yZWRTZXR0aW5ncyk7XG5cdGNvbnN0IGhhc0xvY2FsQ2hhbmdlZCA9IGhhc0NvbmZsaWN0cyB8fCAhYXJlU2FtZShsb2NhbENvbnRlbnQsIG9yaWdpbmFsTG9jYWxDb250ZW50LCBbXSk7XG5cdGNvbnN0IGhhc1JlbW90ZUNoYW5nZWQgPSBoYXNDb25mbGljdHMgfHwgIWFyZVNhbWUocmVtb3RlQ29udGVudCwgb3JpZ2luYWxSZW1vdGVDb250ZW50LCBbXSk7XG5cdHJldHVybiB7IGxvY2FsQ29udGVudDogaGFzTG9jYWxDaGFuZ2VkID8gbG9jYWxDb250ZW50IDogbnVsbCwgcmVtb3RlQ29udGVudDogaGFzUmVtb3RlQ2hhbmdlZCA/IHJlbW90ZUNvbnRlbnQgOiBudWxsLCBjb25mbGljdHNTZXR0aW5nczogWy4uLmNvbmZsaWN0cy52YWx1ZXMoKV0sIGhhc0NvbmZsaWN0cyB9O1xufVxuXG5mdW5jdGlvbiBhcmVTYW1lKGxvY2FsQ29udGVudDogc3RyaW5nLCByZW1vdGVDb250ZW50OiBzdHJpbmcsIGlnbm9yZWRTZXR0aW5nczogc3RyaW5nW10pOiBib29sZWFuIHtcblx0aWYgKGxvY2FsQ29udGVudCA9PT0gcmVtb3RlQ29udGVudCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3QgbG9jYWwgPSBwYXJzZShsb2NhbENvbnRlbnQpO1xuXHRjb25zdCByZW1vdGUgPSBwYXJzZShyZW1vdGVDb250ZW50KTtcblx0Y29uc3QgaWdub3JlZCA9IGlnbm9yZWRTZXR0aW5ncy5yZWR1Y2UoKHNldCwga2V5KSA9PiB7IHNldC5hZGQoa2V5KTsgcmV0dXJuIHNldDsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCBsb2NhbFRyZWUgPSBwYXJzZVNldHRpbmdzKGxvY2FsQ29udGVudCkuZmlsdGVyKG5vZGUgPT4gIShub2RlLnNldHRpbmcgJiYgaWdub3JlZC5oYXMobm9kZS5zZXR0aW5nLmtleSkpKTtcblx0Y29uc3QgcmVtb3RlVHJlZSA9IHBhcnNlU2V0dGluZ3MocmVtb3RlQ29udGVudCkuZmlsdGVyKG5vZGUgPT4gIShub2RlLnNldHRpbmcgJiYgaWdub3JlZC5oYXMobm9kZS5zZXR0aW5nLmtleSkpKTtcblxuXHRpZiAobG9jYWxUcmVlLmxlbmd0aCAhPT0gcmVtb3RlVHJlZS5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbG9jYWxUcmVlLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IGxvY2FsTm9kZSA9IGxvY2FsVHJlZVtpbmRleF07XG5cdFx0Y29uc3QgcmVtb3RlTm9kZSA9IHJlbW90ZVRyZWVbaW5kZXhdO1xuXHRcdGlmIChsb2NhbE5vZGUuc2V0dGluZyAmJiByZW1vdGVOb2RlLnNldHRpbmcpIHtcblx0XHRcdGlmIChsb2NhbE5vZGUuc2V0dGluZy5rZXkgIT09IHJlbW90ZU5vZGUuc2V0dGluZy5rZXkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFvYmplY3RzLmVxdWFscyhsb2NhbFtsb2NhbE5vZGUuc2V0dGluZy5rZXldLCByZW1vdGVbbG9jYWxOb2RlLnNldHRpbmcua2V5XSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIWxvY2FsTm9kZS5zZXR0aW5nICYmICFyZW1vdGVOb2RlLnNldHRpbmcpIHtcblx0XHRcdGlmIChsb2NhbE5vZGUudmFsdWUgIT09IHJlbW90ZU5vZGUudmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5KGNvbnRlbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoY29udGVudCkge1xuXHRcdGNvbnN0IG5vZGVzID0gcGFyc2VTZXR0aW5ncyhjb250ZW50KTtcblx0XHRyZXR1cm4gbm9kZXMubGVuZ3RoID09PSAwO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlKGZyb206IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gfCBudWxsLCB0bzogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiwgaWdub3JlZDogU2V0PHN0cmluZz4pOiB7IGFkZGVkOiBTZXQ8c3RyaW5nPjsgcmVtb3ZlZDogU2V0PHN0cmluZz47IHVwZGF0ZWQ6IFNldDxzdHJpbmc+IH0ge1xuXHRjb25zdCBmcm9tS2V5cyA9IGZyb20gPyBPYmplY3Qua2V5cyhmcm9tKS5maWx0ZXIoa2V5ID0+ICFpZ25vcmVkLmhhcyhrZXkpKSA6IFtdO1xuXHRjb25zdCB0b0tleXMgPSBPYmplY3Qua2V5cyh0bykuZmlsdGVyKGtleSA9PiAhaWdub3JlZC5oYXMoa2V5KSk7XG5cdGNvbnN0IGFkZGVkID0gdG9LZXlzLmZpbHRlcihrZXkgPT4gIWZyb21LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHJlbW92ZWQgPSBmcm9tS2V5cy5maWx0ZXIoa2V5ID0+ICF0b0tleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgdXBkYXRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRpZiAoZnJvbSkge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGZyb21LZXlzKSB7XG5cdFx0XHRpZiAocmVtb3ZlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbHVlMSA9IGZyb21ba2V5XTtcblx0XHRcdGNvbnN0IHZhbHVlMiA9IHRvW2tleV07XG5cdFx0XHRpZiAoIW9iamVjdHMuZXF1YWxzKHZhbHVlMSwgdmFsdWUyKSkge1xuXHRcdFx0XHR1cGRhdGVkLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRTZXR0aW5nKGtleTogc3RyaW5nLCBzb3VyY2VDb250ZW50OiBzdHJpbmcsIHRhcmdldENvbnRlbnQ6IHN0cmluZywgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogc3RyaW5nIHtcblx0Y29uc3Qgc291cmNlID0gcGFyc2Uoc291cmNlQ29udGVudCk7XG5cdGNvbnN0IHNvdXJjZVRyZWUgPSBwYXJzZVNldHRpbmdzKHNvdXJjZUNvbnRlbnQpO1xuXHRjb25zdCB0YXJnZXRUcmVlID0gcGFyc2VTZXR0aW5ncyh0YXJnZXRDb250ZW50KTtcblx0Y29uc3QgaW5zZXJ0TG9jYXRpb24gPSBnZXRJbnNlcnRMb2NhdGlvbihrZXksIHNvdXJjZVRyZWUsIHRhcmdldFRyZWUpO1xuXHRyZXR1cm4gaW5zZXJ0QXRMb2NhdGlvbih0YXJnZXRDb250ZW50LCBrZXksIHNvdXJjZVtrZXldLCBpbnNlcnRMb2NhdGlvbiwgdGFyZ2V0VHJlZSwgZm9ybWF0dGluZ09wdGlvbnMpO1xufVxuXG5pbnRlcmZhY2UgSW5zZXJ0TG9jYXRpb24ge1xuXHRpbmRleDogbnVtYmVyO1xuXHRpbnNlcnRBZnRlcjogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZ2V0SW5zZXJ0TG9jYXRpb24oa2V5OiBzdHJpbmcsIHNvdXJjZVRyZWU6IElOb2RlW10sIHRhcmdldFRyZWU6IElOb2RlW10pOiBJbnNlcnRMb2NhdGlvbiB7XG5cblx0Y29uc3Qgc291cmNlTm9kZUluZGV4ID0gc291cmNlVHJlZS5maW5kSW5kZXgobm9kZSA9PiBub2RlLnNldHRpbmc/LmtleSA9PT0ga2V5KTtcblxuXHRjb25zdCBzb3VyY2VQcmV2aW91c05vZGU6IElOb2RlID0gc291cmNlVHJlZVtzb3VyY2VOb2RlSW5kZXggLSAxXTtcblx0aWYgKHNvdXJjZVByZXZpb3VzTm9kZSkge1xuXHRcdC8qXG5cdFx0XHRQcmV2aW91cyBub2RlIGluIHNvdXJjZSBpcyBhIHNldHRpbmcuXG5cdFx0XHRGaW5kIHRoZSBzYW1lIHNldHRpbmcgaW4gdGhlIHRhcmdldC5cblx0XHRcdEluc2VydCBpdCBhZnRlciB0aGF0IHNldHRpbmdcblx0XHQqL1xuXHRcdGlmIChzb3VyY2VQcmV2aW91c05vZGUuc2V0dGluZykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UHJldmlvdXNTZXR0aW5nID0gZmluZFNldHRpbmdOb2RlKHNvdXJjZVByZXZpb3VzTm9kZS5zZXR0aW5nLmtleSwgdGFyZ2V0VHJlZSk7XG5cdFx0XHRpZiAodGFyZ2V0UHJldmlvdXNTZXR0aW5nKSB7XG5cdFx0XHRcdC8qIEluc2VydCBhZnRlciB0YXJnZXQncyBwcmV2aW91cyBzZXR0aW5nICovXG5cdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0UHJldmlvdXNTZXR0aW5nKSwgaW5zZXJ0QWZ0ZXI6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0LyogUHJldmlvdXMgbm9kZSBpbiBzb3VyY2UgaXMgYSBjb21tZW50ICovXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBzb3VyY2VQcmV2aW91c1NldHRpbmdOb2RlID0gZmluZFByZXZpb3VzU2V0dGluZ05vZGUoc291cmNlTm9kZUluZGV4LCBzb3VyY2VUcmVlKTtcblx0XHRcdC8qXG5cdFx0XHRcdFNvdXJjZSBoYXMgYSBzZXR0aW5nIGRlZmluZWQgYmVmb3JlIHRoZSBzZXR0aW5nIHRvIGJlIGFkZGVkLlxuXHRcdFx0XHRGaW5kIHRoZSBzYW1lIHByZXZpb3VzIHNldHRpbmcgaW4gdGhlIHRhcmdldC5cblx0XHRcdFx0SWYgZm91bmQsIGluc2VydCBiZWZvcmUgaXRzIG5leHQgc2V0dGluZyBzbyB0aGF0IGNvbW1lbnRzIGFyZSByZXRyaWV2ZWQuXG5cdFx0XHRcdE90aGVyd2lzZSwgaW5zZXJ0IGF0IHRoZSBlbmQuXG5cdFx0XHQqL1xuXHRcdFx0aWYgKHNvdXJjZVByZXZpb3VzU2V0dGluZ05vZGUpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0UHJldmlvdXNTZXR0aW5nID0gZmluZFNldHRpbmdOb2RlKHNvdXJjZVByZXZpb3VzU2V0dGluZ05vZGUuc2V0dGluZyEua2V5LCB0YXJnZXRUcmVlKTtcblx0XHRcdFx0aWYgKHRhcmdldFByZXZpb3VzU2V0dGluZykge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldE5leHRTZXR0aW5nID0gZmluZE5leHRTZXR0aW5nTm9kZSh0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0UHJldmlvdXNTZXR0aW5nKSwgdGFyZ2V0VHJlZSk7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlQ29tbWVudE5vZGVzID0gZmluZE5vZGVzQmV0d2Vlbihzb3VyY2VUcmVlLCBzb3VyY2VQcmV2aW91c1NldHRpbmdOb2RlLCBzb3VyY2VUcmVlW3NvdXJjZU5vZGVJbmRleF0pO1xuXHRcdFx0XHRcdGlmICh0YXJnZXROZXh0U2V0dGluZykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGVzID0gZmluZE5vZGVzQmV0d2Vlbih0YXJnZXRUcmVlLCB0YXJnZXRQcmV2aW91c1NldHRpbmcsIHRhcmdldE5leHRTZXR0aW5nKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldENvbW1lbnROb2RlID0gZmluZExhc3RNYXRjaGluZ1RhcmdldENvbW1lbnROb2RlKHNvdXJjZUNvbW1lbnROb2RlcywgdGFyZ2V0Q29tbWVudE5vZGVzKTtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXRDb21tZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRleDogdGFyZ2V0VHJlZS5pbmRleE9mKHRhcmdldENvbW1lbnROb2RlKSwgaW5zZXJ0QWZ0ZXI6IHRydWUgfTsgLyogSW5zZXJ0IGFmdGVyIGNvbW1lbnQgKi9cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0TmV4dFNldHRpbmcpLCBpbnNlcnRBZnRlcjogZmFsc2UgfTsgLyogSW5zZXJ0IGJlZm9yZSB0YXJnZXQgbmV4dCBzZXR0aW5nICovXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldENvbW1lbnROb2RlcyA9IGZpbmROb2Rlc0JldHdlZW4odGFyZ2V0VHJlZSwgdGFyZ2V0UHJldmlvdXNTZXR0aW5nLCB0YXJnZXRUcmVlW3RhcmdldFRyZWUubGVuZ3RoIC0gMV0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGUgPSBmaW5kTGFzdE1hdGNoaW5nVGFyZ2V0Q29tbWVudE5vZGUoc291cmNlQ29tbWVudE5vZGVzLCB0YXJnZXRDb21tZW50Tm9kZXMpO1xuXHRcdFx0XHRcdFx0aWYgKHRhcmdldENvbW1lbnROb2RlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0Q29tbWVudE5vZGUpLCBpbnNlcnRBZnRlcjogdHJ1ZSB9OyAvKiBJbnNlcnQgYWZ0ZXIgY29tbWVudCAqL1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUubGVuZ3RoIC0gMSwgaW5zZXJ0QWZ0ZXI6IHRydWUgfTsgLyogSW5zZXJ0IGF0IHRoZSBlbmQgKi9cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VOZXh0Tm9kZSA9IHNvdXJjZVRyZWVbc291cmNlTm9kZUluZGV4ICsgMV07XG5cdFx0aWYgKHNvdXJjZU5leHROb2RlKSB7XG5cdFx0XHQvKlxuXHRcdFx0XHROZXh0IG5vZGUgaW4gc291cmNlIGlzIGEgc2V0dGluZy5cblx0XHRcdFx0RmluZCB0aGUgc2FtZSBzZXR0aW5nIGluIHRoZSB0YXJnZXQuXG5cdFx0XHRcdEluc2VydCBpdCBiZWZvcmUgdGhhdCBzZXR0aW5nXG5cdFx0XHQqL1xuXHRcdFx0aWYgKHNvdXJjZU5leHROb2RlLnNldHRpbmcpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0TmV4dFNldHRpbmcgPSBmaW5kU2V0dGluZ05vZGUoc291cmNlTmV4dE5vZGUuc2V0dGluZy5rZXksIHRhcmdldFRyZWUpO1xuXHRcdFx0XHRpZiAodGFyZ2V0TmV4dFNldHRpbmcpIHtcblx0XHRcdFx0XHQvKiBJbnNlcnQgYmVmb3JlIHRhcmdldCdzIG5leHQgc2V0dGluZyAqL1xuXHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0TmV4dFNldHRpbmcpLCBpbnNlcnRBZnRlcjogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0LyogTmV4dCBub2RlIGluIHNvdXJjZSBpcyBhIGNvbW1lbnQgKi9cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VOZXh0U2V0dGluZ05vZGUgPSBmaW5kTmV4dFNldHRpbmdOb2RlKHNvdXJjZU5vZGVJbmRleCwgc291cmNlVHJlZSk7XG5cdFx0XHRcdC8qXG5cdFx0XHRcdFx0U291cmNlIGhhcyBhIHNldHRpbmcgZGVmaW5lZCBhZnRlciB0aGUgc2V0dGluZyB0byBiZSBhZGRlZC5cblx0XHRcdFx0XHRGaW5kIHRoZSBzYW1lIG5leHQgc2V0dGluZyBpbiB0aGUgdGFyZ2V0LlxuXHRcdFx0XHRcdElmIGZvdW5kLCBpbnNlcnQgYWZ0ZXIgaXRzIHByZXZpb3VzIHNldHRpbmcgc28gdGhhdCBjb21tZW50cyBhcmUgcmV0cmlldmVkLlxuXHRcdFx0XHRcdE90aGVyd2lzZSwgaW5zZXJ0IGF0IHRoZSBiZWdpbm5pbmcuXG5cdFx0XHRcdCovXG5cdFx0XHRcdGlmIChzb3VyY2VOZXh0U2V0dGluZ05vZGUpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXROZXh0U2V0dGluZyA9IGZpbmRTZXR0aW5nTm9kZShzb3VyY2VOZXh0U2V0dGluZ05vZGUuc2V0dGluZyEua2V5LCB0YXJnZXRUcmVlKTtcblx0XHRcdFx0XHRpZiAodGFyZ2V0TmV4dFNldHRpbmcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldFByZXZpb3VzU2V0dGluZyA9IGZpbmRQcmV2aW91c1NldHRpbmdOb2RlKHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXROZXh0U2V0dGluZyksIHRhcmdldFRyZWUpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc291cmNlQ29tbWVudE5vZGVzID0gZmluZE5vZGVzQmV0d2Vlbihzb3VyY2VUcmVlLCBzb3VyY2VUcmVlW3NvdXJjZU5vZGVJbmRleF0sIHNvdXJjZU5leHRTZXR0aW5nTm9kZSk7XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0UHJldmlvdXNTZXR0aW5nKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldENvbW1lbnROb2RlcyA9IGZpbmROb2Rlc0JldHdlZW4odGFyZ2V0VHJlZSwgdGFyZ2V0UHJldmlvdXNTZXR0aW5nLCB0YXJnZXROZXh0U2V0dGluZyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldENvbW1lbnROb2RlID0gZmluZExhc3RNYXRjaGluZ1RhcmdldENvbW1lbnROb2RlKHNvdXJjZUNvbW1lbnROb2Rlcy5yZXZlcnNlKCksIHRhcmdldENvbW1lbnROb2Rlcy5yZXZlcnNlKCkpO1xuXHRcdFx0XHRcdFx0XHRpZiAodGFyZ2V0Q29tbWVudE5vZGUpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRleDogdGFyZ2V0VHJlZS5pbmRleE9mKHRhcmdldENvbW1lbnROb2RlKSwgaW5zZXJ0QWZ0ZXI6IGZhbHNlIH07IC8qIEluc2VydCBiZWZvcmUgY29tbWVudCAqL1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0UHJldmlvdXNTZXR0aW5nKSwgaW5zZXJ0QWZ0ZXI6IHRydWUgfTsgLyogSW5zZXJ0IGFmdGVyIHRhcmdldCBwcmV2aW91cyBzZXR0aW5nICovXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldENvbW1lbnROb2RlcyA9IGZpbmROb2Rlc0JldHdlZW4odGFyZ2V0VHJlZSwgdGFyZ2V0VHJlZVswXSwgdGFyZ2V0TmV4dFNldHRpbmcpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRDb21tZW50Tm9kZSA9IGZpbmRMYXN0TWF0Y2hpbmdUYXJnZXRDb21tZW50Tm9kZShzb3VyY2VDb21tZW50Tm9kZXMucmV2ZXJzZSgpLCB0YXJnZXRDb21tZW50Tm9kZXMucmV2ZXJzZSgpKTtcblx0XHRcdFx0XHRcdFx0aWYgKHRhcmdldENvbW1lbnROb2RlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXRDb21tZW50Tm9kZSksIGluc2VydEFmdGVyOiBmYWxzZSB9OyAvKiBJbnNlcnQgYmVmb3JlIGNvbW1lbnQgKi9cblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRleDogMCwgaW5zZXJ0QWZ0ZXI6IGZhbHNlIH07IC8qIEluc2VydCBhdCB0aGUgYmVnaW5uaW5nICovXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0LyogSW5zZXJ0IGF0IHRoZSBlbmQgKi9cblx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUubGVuZ3RoIC0gMSwgaW5zZXJ0QWZ0ZXI6IHRydWUgfTtcbn1cblxuZnVuY3Rpb24gaW5zZXJ0QXRMb2NhdGlvbihjb250ZW50OiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBsb2NhdGlvbjogSW5zZXJ0TG9jYXRpb24sIHRyZWU6IElOb2RlW10sIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IHN0cmluZyB7XG5cdGxldCBlZGl0czogRWRpdFtdO1xuXHQvKiBJbnNlcnQgYXQgdGhlIGVuZCAqL1xuXHRpZiAobG9jYXRpb24uaW5kZXggPT09IC0xKSB7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBba2V5XSwgdmFsdWUsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0fSBlbHNlIHtcblx0XHRlZGl0cyA9IGdldEVkaXRUb0luc2VydEF0TG9jYXRpb24oY29udGVudCwga2V5LCB2YWx1ZSwgbG9jYXRpb24sIHRyZWUsIGZvcm1hdHRpbmdPcHRpb25zKS5tYXAoZWRpdCA9PiB3aXRoRm9ybWF0dGluZyhjb250ZW50LCBlZGl0LCBmb3JtYXR0aW5nT3B0aW9ucylbMF0pO1xuXHR9XG5cdHJldHVybiBhcHBseUVkaXRzKGNvbnRlbnQsIGVkaXRzKTtcbn1cblxuZnVuY3Rpb24gZ2V0RWRpdFRvSW5zZXJ0QXRMb2NhdGlvbihjb250ZW50OiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBsb2NhdGlvbjogSW5zZXJ0TG9jYXRpb24sIHRyZWU6IElOb2RlW10sIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IEVkaXRbXSB7XG5cdGNvbnN0IG5ld1Byb3BlcnR5ID0gYCR7SlNPTi5zdHJpbmdpZnkoa2V5KX06ICR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfWA7XG5cdGNvbnN0IGVvbCA9IGdldEVPTChmb3JtYXR0aW5nT3B0aW9ucywgY29udGVudCk7XG5cdGNvbnN0IG5vZGUgPSB0cmVlW2xvY2F0aW9uLmluZGV4XTtcblxuXHRpZiAobG9jYXRpb24uaW5zZXJ0QWZ0ZXIpIHtcblxuXHRcdGNvbnN0IGVkaXRzOiBFZGl0W10gPSBbXTtcblxuXHRcdC8qIEluc2VydCBhZnRlciBhIHNldHRpbmcgKi9cblx0XHRpZiAobm9kZS5zZXR0aW5nKSB7XG5cdFx0XHRlZGl0cy5wdXNoKHsgb2Zmc2V0OiBub2RlLmVuZE9mZnNldCwgbGVuZ3RoOiAwLCBjb250ZW50OiAnLCcgKyBuZXdQcm9wZXJ0eSB9KTtcblx0XHR9XG5cblx0XHQvKiBJbnNlcnQgYWZ0ZXIgYSBjb21tZW50ICovXG5cdFx0ZWxzZSB7XG5cblx0XHRcdGNvbnN0IG5leHRTZXR0aW5nTm9kZSA9IGZpbmROZXh0U2V0dGluZ05vZGUobG9jYXRpb24uaW5kZXgsIHRyZWUpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNTZXR0aW5nTm9kZSA9IGZpbmRQcmV2aW91c1NldHRpbmdOb2RlKGxvY2F0aW9uLmluZGV4LCB0cmVlKTtcblx0XHRcdGNvbnN0IHByZXZpb3VzU2V0dGluZ0NvbW1hT2Zmc2V0ID0gcHJldmlvdXNTZXR0aW5nTm9kZT8uc2V0dGluZz8uY29tbWFPZmZzZXQ7XG5cblx0XHRcdC8qIElmIHRoZXJlIGlzIGEgcHJldmlvdXMgc2V0dGluZyBhbmQgaXQgZG9lcyBub3QgaGFzIGNvbW1hIHRoZW4gYWRkIGl0ICovXG5cdFx0XHRpZiAocHJldmlvdXNTZXR0aW5nTm9kZSAmJiBwcmV2aW91c1NldHRpbmdDb21tYU9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGVkaXRzLnB1c2goeyBvZmZzZXQ6IHByZXZpb3VzU2V0dGluZ05vZGUuZW5kT2Zmc2V0LCBsZW5ndGg6IDAsIGNvbnRlbnQ6ICcsJyB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNQcmV2aW91aXNTZXR0aW5nSW5jbHVkZXNDb21tZW50ID0gcHJldmlvdXNTZXR0aW5nQ29tbWFPZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBwcmV2aW91c1NldHRpbmdDb21tYU9mZnNldCA+IG5vZGUuZW5kT2Zmc2V0O1xuXHRcdFx0ZWRpdHMucHVzaCh7XG5cdFx0XHRcdG9mZnNldDogaXNQcmV2aW91aXNTZXR0aW5nSW5jbHVkZXNDb21tZW50ID8gcHJldmlvdXNTZXR0aW5nQ29tbWFPZmZzZXQgKyAxIDogbm9kZS5lbmRPZmZzZXQsXG5cdFx0XHRcdGxlbmd0aDogMCxcblx0XHRcdFx0Y29udGVudDogbmV4dFNldHRpbmdOb2RlID8gZW9sICsgbmV3UHJvcGVydHkgKyAnLCcgOiBlb2wgKyBuZXdQcm9wZXJ0eVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cblx0XHRyZXR1cm4gZWRpdHM7XG5cdH1cblxuXHRlbHNlIHtcblxuXHRcdC8qIEluc2VydCBiZWZvcmUgYSBzZXR0aW5nICovXG5cdFx0aWYgKG5vZGUuc2V0dGluZykge1xuXHRcdFx0cmV0dXJuIFt7IG9mZnNldDogbm9kZS5zdGFydE9mZnNldCwgbGVuZ3RoOiAwLCBjb250ZW50OiBuZXdQcm9wZXJ0eSArICcsJyB9XTtcblx0XHR9XG5cblx0XHQvKiBJbnNlcnQgYmVmb3JlIGEgY29tbWVudCAqL1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAodHJlZVtsb2NhdGlvbi5pbmRleCAtIDFdICYmICF0cmVlW2xvY2F0aW9uLmluZGV4IC0gMV0uc2V0dGluZyAvKiBwcmV2aW91cyBub2RlIGlzIGNvbW1lbnQgKi8gPyBlb2wgOiAnJylcblx0XHRcdCsgbmV3UHJvcGVydHlcblx0XHRcdCsgKGZpbmROZXh0U2V0dGluZ05vZGUobG9jYXRpb24uaW5kZXgsIHRyZWUpID8gJywnIDogJycpXG5cdFx0XHQrIGVvbDtcblx0XHRyZXR1cm4gW3sgb2Zmc2V0OiBub2RlLnN0YXJ0T2Zmc2V0LCBsZW5ndGg6IDAsIGNvbnRlbnQgfV07XG5cdH1cblxufVxuXG5mdW5jdGlvbiBmaW5kU2V0dGluZ05vZGUoa2V5OiBzdHJpbmcsIHRyZWU6IElOb2RlW10pOiBJTm9kZSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0cmVlLmZpbHRlcihub2RlID0+IG5vZGUuc2V0dGluZz8ua2V5ID09PSBrZXkpWzBdO1xufVxuXG5mdW5jdGlvbiBmaW5kUHJldmlvdXNTZXR0aW5nTm9kZShpbmRleDogbnVtYmVyLCB0cmVlOiBJTm9kZVtdKTogSU5vZGUgfCB1bmRlZmluZWQge1xuXHRmb3IgKGxldCBpID0gaW5kZXggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGlmICh0cmVlW2ldLnNldHRpbmcpIHtcblx0XHRcdHJldHVybiB0cmVlW2ldO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmaW5kTmV4dFNldHRpbmdOb2RlKGluZGV4OiBudW1iZXIsIHRyZWU6IElOb2RlW10pOiBJTm9kZSB8IHVuZGVmaW5lZCB7XG5cdGZvciAobGV0IGkgPSBpbmRleCArIDE7IGkgPCB0cmVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKHRyZWVbaV0uc2V0dGluZykge1xuXHRcdFx0cmV0dXJuIHRyZWVbaV07XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGZpbmROb2Rlc0JldHdlZW4obm9kZXM6IElOb2RlW10sIGZyb206IElOb2RlLCB0aWxsOiBJTm9kZSk6IElOb2RlW10ge1xuXHRjb25zdCBmcm9tSW5kZXggPSBub2Rlcy5pbmRleE9mKGZyb20pO1xuXHRjb25zdCB0aWxsSW5kZXggPSBub2Rlcy5pbmRleE9mKHRpbGwpO1xuXHRyZXR1cm4gbm9kZXMuZmlsdGVyKChub2RlLCBpbmRleCkgPT4gZnJvbUluZGV4IDwgaW5kZXggJiYgaW5kZXggPCB0aWxsSW5kZXgpO1xufVxuXG5mdW5jdGlvbiBmaW5kTGFzdE1hdGNoaW5nVGFyZ2V0Q29tbWVudE5vZGUoc291cmNlQ29tbWVudHM6IElOb2RlW10sIHRhcmdldENvbW1lbnRzOiBJTm9kZVtdKTogSU5vZGUgfCB1bmRlZmluZWQge1xuXHRpZiAoc291cmNlQ29tbWVudHMubGVuZ3RoICYmIHRhcmdldENvbW1lbnRzLmxlbmd0aCkge1xuXHRcdGxldCBpbmRleCA9IDA7XG5cdFx0Zm9yICg7IGluZGV4IDwgdGFyZ2V0Q29tbWVudHMubGVuZ3RoICYmIGluZGV4IDwgc291cmNlQ29tbWVudHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRpZiAoc291cmNlQ29tbWVudHNbaW5kZXhdLnZhbHVlICE9PSB0YXJnZXRDb21tZW50c1tpbmRleF0udmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHRhcmdldENvbW1lbnRzW2luZGV4IC0gMV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0YXJnZXRDb21tZW50c1tpbmRleCAtIDFdO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJTm9kZSB7XG5cdHJlYWRvbmx5IHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZE9mZnNldDogbnVtYmVyO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBzZXR0aW5nPzoge1xuXHRcdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNvbW1hT2Zmc2V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdH07XG5cdHJlYWRvbmx5IGNvbW1lbnQ/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHBhcnNlU2V0dGluZ3MoY29udGVudDogc3RyaW5nKTogSU5vZGVbXSB7XG5cdGNvbnN0IG5vZGVzOiBJTm9kZVtdID0gW107XG5cdGxldCBoaWVyYXJjaHlMZXZlbCA9IC0xO1xuXHRsZXQgc3RhcnRPZmZzZXQ6IG51bWJlcjtcblx0bGV0IGtleTogc3RyaW5nO1xuXG5cdGNvbnN0IHZpc2l0b3I6IEpTT05WaXNpdG9yID0ge1xuXHRcdG9uT2JqZWN0QmVnaW46IChvZmZzZXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0aGllcmFyY2h5TGV2ZWwrKztcblx0XHR9LFxuXHRcdG9uT2JqZWN0UHJvcGVydHk6IChuYW1lOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKGhpZXJhcmNoeUxldmVsID09PSAwKSB7XG5cdFx0XHRcdC8vIHRoaXMgaXMgc2V0dGluZyBrZXlcblx0XHRcdFx0c3RhcnRPZmZzZXQgPSBvZmZzZXQ7XG5cdFx0XHRcdGtleSA9IG5hbWU7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvbk9iamVjdEVuZDogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0aGllcmFyY2h5TGV2ZWwtLTtcblx0XHRcdGlmIChoaWVyYXJjaHlMZXZlbCA9PT0gMCkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKHtcblx0XHRcdFx0XHRzdGFydE9mZnNldCxcblx0XHRcdFx0XHRlbmRPZmZzZXQ6IG9mZnNldCArIGxlbmd0aCxcblx0XHRcdFx0XHR2YWx1ZTogY29udGVudC5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIG9mZnNldCArIGxlbmd0aCksXG5cdFx0XHRcdFx0c2V0dGluZzoge1xuXHRcdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdFx0Y29tbWFPZmZzZXQ6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvbkFycmF5QmVnaW46IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGhpZXJhcmNoeUxldmVsKys7XG5cdFx0fSxcblx0XHRvbkFycmF5RW5kOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRoaWVyYXJjaHlMZXZlbC0tO1xuXHRcdFx0aWYgKGhpZXJhcmNoeUxldmVsID09PSAwKSB7XG5cdFx0XHRcdG5vZGVzLnB1c2goe1xuXHRcdFx0XHRcdHN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRcdGVuZE9mZnNldDogb2Zmc2V0ICsgbGVuZ3RoLFxuXHRcdFx0XHRcdHZhbHVlOiBjb250ZW50LnN1YnN0cmluZyhzdGFydE9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoKSxcblx0XHRcdFx0XHRzZXR0aW5nOiB7XG5cdFx0XHRcdFx0XHRrZXksXG5cdFx0XHRcdFx0XHRjb21tYU9mZnNldDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uTGl0ZXJhbFZhbHVlOiAodmFsdWU6IGFueSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoaGllcmFyY2h5TGV2ZWwgPT09IDApIHtcblx0XHRcdFx0bm9kZXMucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0ZW5kT2Zmc2V0OiBvZmZzZXQgKyBsZW5ndGgsXG5cdFx0XHRcdFx0dmFsdWU6IGNvbnRlbnQuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBvZmZzZXQgKyBsZW5ndGgpLFxuXHRcdFx0XHRcdHNldHRpbmc6IHtcblx0XHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRcdGNvbW1hT2Zmc2V0OiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25TZXBhcmF0b3I6IChzZXA6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoaGllcmFyY2h5TGV2ZWwgPT09IDApIHtcblx0XHRcdFx0aWYgKHNlcCA9PT0gJywnKSB7XG5cdFx0XHRcdFx0bGV0IGluZGV4ID0gbm9kZXMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRmb3IgKDsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdFx0XHRcdFx0aWYgKG5vZGVzW2luZGV4XS5zZXR0aW5nKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBub2RlID0gbm9kZXNbaW5kZXhdO1xuXHRcdFx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdFx0XHRub2Rlcy5zcGxpY2UoaW5kZXgsIDEsIHtcblx0XHRcdFx0XHRcdFx0c3RhcnRPZmZzZXQ6IG5vZGUuc3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0XHRcdGVuZE9mZnNldDogbm9kZS5lbmRPZmZzZXQsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBub2RlLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRzZXR0aW5nOiB7XG5cdFx0XHRcdFx0XHRcdFx0a2V5OiBub2RlLnNldHRpbmchLmtleSxcblx0XHRcdFx0XHRcdFx0XHRjb21tYU9mZnNldDogb2Zmc2V0XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25Db21tZW50OiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoaGllcmFyY2h5TGV2ZWwgPT09IDApIHtcblx0XHRcdFx0bm9kZXMucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnRPZmZzZXQ6IG9mZnNldCxcblx0XHRcdFx0XHRlbmRPZmZzZXQ6IG9mZnNldCArIGxlbmd0aCxcblx0XHRcdFx0XHR2YWx1ZTogY29udGVudC5zdWJzdHJpbmcob2Zmc2V0LCBvZmZzZXQgKyBsZW5ndGgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cdHZpc2l0KGNvbnRlbnQsIHZpc2l0b3IpO1xuXHRyZXR1cm4gbm9kZXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFzQixPQUFPLGFBQWE7QUFDMUMsU0FBUyxZQUFZLGFBQWEsc0JBQXNCO0FBQ3hELFNBQWtDLGNBQWM7QUFDaEQsWUFBWSxhQUFhO0FBRXpCLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsb0NBQXNEO0FBU3hELFNBQVMsbUJBQW1CLHdCQUFrQyxzQkFBNkMsaUJBQW9DO0FBQ3JKLE1BQUksUUFBK0IsQ0FBQztBQUNwQyxNQUFJLGlCQUFpQjtBQUNwQixZQUFRLDhCQUE4QixlQUFlO0FBQUEsRUFDdEQsT0FBTztBQUNOLFlBQVEsNkJBQTZC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QSxJQUNEO0FBQUEsSUFDQSxjQUFjLENBQUMsUUFBZ0IsV0FBbUI7QUFDakQ7QUFBQSxJQUNEO0FBQUEsSUFDQSxZQUFZLENBQUMsUUFBZ0IsV0FBbUI7QUFDL0M7QUFDQSxVQUFJLG1CQUFtQixHQUFHO0FBQ3pCLGNBQU0sS0FBSztBQUFBLFVBQ1Y7QUFBQSxVQUNBLFdBQVcsU0FBUztBQUFBLFVBQ3BCLE9BQU8sUUFBUSxVQUFVLGFBQWEsU0FBUyxNQUFNO0FBQUEsVUFDckQsU0FBUztBQUFBLFlBQ1I7QUFBQSxZQUNBLGFBQWE7QUFBQSxVQUNkO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGdCQUFnQixDQUFDLE9BQVksUUFBZ0IsV0FBbUI7QUFDL0QsVUFBSSxtQkFBbUIsR0FBRztBQUN6QixjQUFNLEtBQUs7QUFBQSxVQUNWO0FBQUEsVUFDQSxXQUFXLFNBQVM7QUFBQSxVQUNwQixPQUFPLFFBQVEsVUFBVSxhQUFhLFNBQVMsTUFBTTtBQUFBLFVBQ3JELFNBQVM7QUFBQSxZQUNSO0FBQUEsWUFDQSxhQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsSUFDQSxhQUFhLENBQUMsS0FBYSxRQUFnQixXQUFtQjtBQUM3RCxVQUFJLG1CQUFtQixHQUFHO0FBQ3pCLFlBQUksUUFBUSxLQUFLO0FBQ2hCLGNBQUksUUFBUSxNQUFNLFNBQVM7QUFDM0IsaUJBQU8sU0FBUyxHQUFHLFNBQVM7QUFDM0IsZ0JBQUksTUFBTSxLQUFLLEVBQUUsU0FBUztBQUN6QjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQ0EsZ0JBQU0sT0FBTyxNQUFNLEtBQUs7QUFDeEIsY0FBSSxNQUFNO0FBQ1Qsa0JBQU0sT0FBTyxPQUFPLEdBQUc7QUFBQSxjQUN0QixhQUFhLEtBQUs7QUFBQSxjQUNsQixXQUFXLEtBQUs7QUFBQSxjQUNoQixPQUFPLEtBQUs7QUFBQSxjQUNaLFNBQVM7QUFBQSxnQkFDUixLQUFLLEtBQUssUUFBUztBQUFBLGdCQUNuQixhQUFhO0FBQUEsY0FDZDtBQUFBLFlBQ0QsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFdBQVcsQ0FBQyxRQUFnQixXQUFtQjtBQUM5QyxVQUFJLG1CQUFtQixHQUFHO0FBQ3pCLGNBQU0sS0FBSztBQUFBLFVBQ1YsYUFBYTtBQUFBLFVBQ2IsV0FBVyxTQUFTO0FBQUEsVUFDcEIsT0FBTyxRQUFRLFVBQVUsUUFBUSxTQUFTLE1BQU07QUFBQSxRQUNqRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsUUFBTSxTQUFTLE9BQU87QUFDdEIsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJsb2NhbENvbnRlbnQiLCAiY29udGVudCJdCn0K
