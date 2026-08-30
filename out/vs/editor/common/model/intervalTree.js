import { TrackedRangeStickiness } from "../model.js";
var ClassName = /* @__PURE__ */ ((ClassName2) => {
  ClassName2["EditorHintDecoration"] = "squiggly-hint";
  ClassName2["EditorInfoDecoration"] = "squiggly-info";
  ClassName2["EditorWarningDecoration"] = "squiggly-warning";
  ClassName2["EditorErrorDecoration"] = "squiggly-error";
  ClassName2["EditorUnnecessaryDecoration"] = "squiggly-unnecessary";
  ClassName2["EditorUnnecessaryInlineDecoration"] = "squiggly-inline-unnecessary";
  ClassName2["EditorDeprecatedInlineDecoration"] = "squiggly-inline-deprecated";
  return ClassName2;
})(ClassName || {});
var NodeColor = /* @__PURE__ */ ((NodeColor2) => {
  NodeColor2[NodeColor2["Black"] = 0] = "Black";
  NodeColor2[NodeColor2["Red"] = 1] = "Red";
  return NodeColor2;
})(NodeColor || {});
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["ColorMask"] = 1] = "ColorMask";
  Constants2[Constants2["ColorMaskInverse"] = 254] = "ColorMaskInverse";
  Constants2[Constants2["ColorOffset"] = 0] = "ColorOffset";
  Constants2[Constants2["IsVisitedMask"] = 2] = "IsVisitedMask";
  Constants2[Constants2["IsVisitedMaskInverse"] = 253] = "IsVisitedMaskInverse";
  Constants2[Constants2["IsVisitedOffset"] = 1] = "IsVisitedOffset";
  Constants2[Constants2["IsForValidationMask"] = 4] = "IsForValidationMask";
  Constants2[Constants2["IsForValidationMaskInverse"] = 251] = "IsForValidationMaskInverse";
  Constants2[Constants2["IsForValidationOffset"] = 2] = "IsForValidationOffset";
  Constants2[Constants2["StickinessMask"] = 24] = "StickinessMask";
  Constants2[Constants2["StickinessMaskInverse"] = 231] = "StickinessMaskInverse";
  Constants2[Constants2["StickinessOffset"] = 3] = "StickinessOffset";
  Constants2[Constants2["CollapseOnReplaceEditMask"] = 32] = "CollapseOnReplaceEditMask";
  Constants2[Constants2["CollapseOnReplaceEditMaskInverse"] = 223] = "CollapseOnReplaceEditMaskInverse";
  Constants2[Constants2["CollapseOnReplaceEditOffset"] = 5] = "CollapseOnReplaceEditOffset";
  Constants2[Constants2["IsMarginMask"] = 64] = "IsMarginMask";
  Constants2[Constants2["IsMarginMaskInverse"] = 191] = "IsMarginMaskInverse";
  Constants2[Constants2["IsMarginOffset"] = 6] = "IsMarginOffset";
  Constants2[Constants2["AffectsFontMask"] = 128] = "AffectsFontMask";
  Constants2[Constants2["AffectsFontMaskInverse"] = 127] = "AffectsFontMaskInverse";
  Constants2[Constants2["AffectsFontOffset"] = 7] = "AffectsFontOffset";
  Constants2[Constants2["MIN_SAFE_DELTA"] = -1073741824] = "MIN_SAFE_DELTA";
  Constants2[Constants2["MAX_SAFE_DELTA"] = 1073741824] = "MAX_SAFE_DELTA";
  return Constants2;
})(Constants || {});
function getNodeColor(node) {
  return (node.metadata & 1 /* ColorMask */) >>> 0 /* ColorOffset */;
}
function setNodeColor(node, color) {
  node.metadata = node.metadata & 254 /* ColorMaskInverse */ | color << 0 /* ColorOffset */;
}
function getNodeIsVisited(node) {
  return (node.metadata & 2 /* IsVisitedMask */) >>> 1 /* IsVisitedOffset */ === 1;
}
function setNodeIsVisited(node, value) {
  node.metadata = node.metadata & 253 /* IsVisitedMaskInverse */ | (value ? 1 : 0) << 1 /* IsVisitedOffset */;
}
function getNodeIsForValidation(node) {
  return (node.metadata & 4 /* IsForValidationMask */) >>> 2 /* IsForValidationOffset */ === 1;
}
function setNodeIsForValidation(node, value) {
  node.metadata = node.metadata & 251 /* IsForValidationMaskInverse */ | (value ? 1 : 0) << 2 /* IsForValidationOffset */;
}
function getNodeIsInGlyphMargin(node) {
  return (node.metadata & 64 /* IsMarginMask */) >>> 6 /* IsMarginOffset */ === 1;
}
function setNodeIsInGlyphMargin(node, value) {
  node.metadata = node.metadata & 191 /* IsMarginMaskInverse */ | (value ? 1 : 0) << 6 /* IsMarginOffset */;
}
function getNodeAffectsFont(node) {
  return (node.metadata & 128 /* AffectsFontMask */) >>> 7 /* AffectsFontOffset */ === 1;
}
function setNodeAffectsFont(node, value) {
  node.metadata = node.metadata & 127 /* AffectsFontMaskInverse */ | (value ? 1 : 0) << 7 /* AffectsFontOffset */;
}
function getNodeStickiness(node) {
  return (node.metadata & 24 /* StickinessMask */) >>> 3 /* StickinessOffset */;
}
function _setNodeStickiness(node, stickiness) {
  node.metadata = node.metadata & 231 /* StickinessMaskInverse */ | stickiness << 3 /* StickinessOffset */;
}
function getCollapseOnReplaceEdit(node) {
  return (node.metadata & 32 /* CollapseOnReplaceEditMask */) >>> 5 /* CollapseOnReplaceEditOffset */ === 1;
}
function setCollapseOnReplaceEdit(node, value) {
  node.metadata = node.metadata & 223 /* CollapseOnReplaceEditMaskInverse */ | (value ? 1 : 0) << 5 /* CollapseOnReplaceEditOffset */;
}
function setNodeStickiness(node, stickiness) {
  _setNodeStickiness(node, stickiness);
}
class IntervalNode {
  constructor(id, start, end) {
    this.metadata = 0;
    this.parent = this;
    this.left = this;
    this.right = this;
    setNodeColor(this, 1 /* Red */);
    this.start = start;
    this.end = end;
    this.delta = 0;
    this.maxEnd = end;
    this.id = id;
    this.ownerId = 0;
    this.options = null;
    setNodeIsForValidation(this, false);
    setNodeIsInGlyphMargin(this, false);
    _setNodeStickiness(this, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
    setCollapseOnReplaceEdit(this, false);
    setNodeAffectsFont(this, false);
    this.cachedVersionId = 0;
    this.cachedAbsoluteStart = start;
    this.cachedAbsoluteEnd = end;
    this.range = null;
    setNodeIsVisited(this, false);
  }
  reset(versionId, start, end, range) {
    this.start = start;
    this.end = end;
    this.maxEnd = end;
    this.cachedVersionId = versionId;
    this.cachedAbsoluteStart = start;
    this.cachedAbsoluteEnd = end;
    this.range = range;
  }
  setOptions(options) {
    this.options = options;
    const className = this.options.className;
    setNodeIsForValidation(this, className === "squiggly-error" /* EditorErrorDecoration */ || className === "squiggly-warning" /* EditorWarningDecoration */ || className === "squiggly-info" /* EditorInfoDecoration */);
    setNodeIsInGlyphMargin(this, this.options.glyphMarginClassName !== null);
    _setNodeStickiness(this, this.options.stickiness);
    setCollapseOnReplaceEdit(this, this.options.collapseOnReplaceEdit);
    setNodeAffectsFont(this, this.options.affectsFont ?? false);
  }
  setCachedOffsets(absoluteStart, absoluteEnd, cachedVersionId) {
    if (this.cachedVersionId !== cachedVersionId) {
      this.range = null;
    }
    this.cachedVersionId = cachedVersionId;
    this.cachedAbsoluteStart = absoluteStart;
    this.cachedAbsoluteEnd = absoluteEnd;
  }
  detach() {
    this.parent = null;
    this.left = null;
    this.right = null;
  }
}
const SENTINEL = new IntervalNode(null, 0, 0);
SENTINEL.parent = SENTINEL;
SENTINEL.left = SENTINEL;
SENTINEL.right = SENTINEL;
setNodeColor(SENTINEL, 0 /* Black */);
class IntervalTree {
  constructor() {
    this.root = SENTINEL;
    this.requestNormalizeDelta = false;
  }
  intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    if (this.root === SENTINEL) {
      return [];
    }
    return intervalSearch(this, start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
  }
  search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    if (this.root === SENTINEL) {
      return [];
    }
    return search(this, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
  }
  /**
   * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
   */
  collectNodesFromOwner(ownerId) {
    return collectNodesFromOwner(this, ownerId);
  }
  /**
   * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
   */
  collectNodesPostOrder() {
    return collectNodesPostOrder(this);
  }
  insert(node) {
    rbTreeInsert(this, node);
    this._normalizeDeltaIfNecessary();
  }
  delete(node) {
    rbTreeDelete(this, node);
    this._normalizeDeltaIfNecessary();
  }
  resolveNode(node, cachedVersionId) {
    const initialNode = node;
    let delta = 0;
    while (node !== this.root) {
      if (node === node.parent.right) {
        delta += node.parent.delta;
      }
      node = node.parent;
    }
    const nodeStart = initialNode.start + delta;
    const nodeEnd = initialNode.end + delta;
    initialNode.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
  }
  acceptReplace(offset, length, textLength, forceMoveMarkers) {
    const nodesOfInterest = searchForEditing(this, offset, offset + length);
    for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
      const node = nodesOfInterest[i];
      rbTreeDelete(this, node);
    }
    this._normalizeDeltaIfNecessary();
    noOverlapReplace(this, offset, offset + length, textLength);
    this._normalizeDeltaIfNecessary();
    for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
      const node = nodesOfInterest[i];
      node.start = node.cachedAbsoluteStart;
      node.end = node.cachedAbsoluteEnd;
      nodeAcceptEdit(node, offset, offset + length, textLength, forceMoveMarkers);
      node.maxEnd = node.end;
      rbTreeInsert(this, node);
    }
    this._normalizeDeltaIfNecessary();
  }
  getAllInOrder() {
    return search(this, 0, false, false, 0, false);
  }
  _normalizeDeltaIfNecessary() {
    if (!this.requestNormalizeDelta) {
      return;
    }
    this.requestNormalizeDelta = false;
    normalizeDelta(this);
  }
}
function normalizeDelta(T) {
  let node = T.root;
  let delta = 0;
  while (node !== SENTINEL) {
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
    node.start = delta + node.start;
    node.end = delta + node.end;
    node.delta = 0;
    recomputeMaxEnd(node);
    setNodeIsVisited(node, true);
    setNodeIsVisited(node.left, false);
    setNodeIsVisited(node.right, false);
    if (node === node.parent.right) {
      delta -= node.parent.delta;
    }
    node = node.parent;
  }
  setNodeIsVisited(T.root, false);
}
var MarkerMoveSemantics = /* @__PURE__ */ ((MarkerMoveSemantics2) => {
  MarkerMoveSemantics2[MarkerMoveSemantics2["MarkerDefined"] = 0] = "MarkerDefined";
  MarkerMoveSemantics2[MarkerMoveSemantics2["ForceMove"] = 1] = "ForceMove";
  MarkerMoveSemantics2[MarkerMoveSemantics2["ForceStay"] = 2] = "ForceStay";
  return MarkerMoveSemantics2;
})(MarkerMoveSemantics || {});
function adjustMarkerBeforeColumn(markerOffset, markerStickToPreviousCharacter, checkOffset, moveSemantics) {
  if (markerOffset < checkOffset) {
    return true;
  }
  if (markerOffset > checkOffset) {
    return false;
  }
  if (moveSemantics === 1 /* ForceMove */) {
    return false;
  }
  if (moveSemantics === 2 /* ForceStay */) {
    return true;
  }
  return markerStickToPreviousCharacter;
}
function nodeAcceptEdit(node, start, end, textLength, forceMoveMarkers) {
  const nodeStickiness = getNodeStickiness(node);
  const startStickToPreviousCharacter = nodeStickiness === TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges || nodeStickiness === TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
  const endStickToPreviousCharacter = nodeStickiness === TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges || nodeStickiness === TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
  const deletingCnt = end - start;
  const insertingCnt = textLength;
  const commonLength = Math.min(deletingCnt, insertingCnt);
  const nodeStart = node.start;
  let startDone = false;
  const nodeEnd = node.end;
  let endDone = false;
  if (start <= nodeStart && nodeEnd <= end && getCollapseOnReplaceEdit(node)) {
    node.start = start;
    startDone = true;
    node.end = start;
    endDone = true;
  }
  {
    const moveSemantics = forceMoveMarkers ? 1 /* ForceMove */ : deletingCnt > 0 ? 2 /* ForceStay */ : 0 /* MarkerDefined */;
    if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start, moveSemantics)) {
      startDone = true;
    }
    if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start, moveSemantics)) {
      endDone = true;
    }
  }
  if (commonLength > 0 && !forceMoveMarkers) {
    const moveSemantics = deletingCnt > insertingCnt ? 2 /* ForceStay */ : 0 /* MarkerDefined */;
    if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start + commonLength, moveSemantics)) {
      startDone = true;
    }
    if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start + commonLength, moveSemantics)) {
      endDone = true;
    }
  }
  {
    const moveSemantics = forceMoveMarkers ? 1 /* ForceMove */ : 0 /* MarkerDefined */;
    if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, end, moveSemantics)) {
      node.start = start + insertingCnt;
      startDone = true;
    }
    if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, end, moveSemantics)) {
      node.end = start + insertingCnt;
      endDone = true;
    }
  }
  const deltaColumn = insertingCnt - deletingCnt;
  if (!startDone) {
    node.start = Math.max(0, nodeStart + deltaColumn);
  }
  if (!endDone) {
    node.end = Math.max(0, nodeEnd + deltaColumn);
  }
  if (node.start > node.end) {
    node.end = node.start;
  }
}
function searchForEditing(T, start, end) {
  let node = T.root;
  let delta = 0;
  let nodeMaxEnd = 0;
  let nodeStart = 0;
  let nodeEnd = 0;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      node = node.parent;
      continue;
    }
    if (!getNodeIsVisited(node.left)) {
      nodeMaxEnd = delta + node.maxEnd;
      if (nodeMaxEnd < start) {
        setNodeIsVisited(node, true);
        continue;
      }
      if (node.left !== SENTINEL) {
        node = node.left;
        continue;
      }
    }
    nodeStart = delta + node.start;
    if (nodeStart > end) {
      setNodeIsVisited(node, true);
      continue;
    }
    nodeEnd = delta + node.end;
    if (nodeEnd >= start) {
      node.setCachedOffsets(nodeStart, nodeEnd, 0);
      result[resultLen++] = node;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function noOverlapReplace(T, start, end, textLength) {
  let node = T.root;
  let delta = 0;
  let nodeMaxEnd = 0;
  let nodeStart = 0;
  const editDelta = textLength - (end - start);
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      recomputeMaxEnd(node);
      node = node.parent;
      continue;
    }
    if (!getNodeIsVisited(node.left)) {
      nodeMaxEnd = delta + node.maxEnd;
      if (nodeMaxEnd < start) {
        setNodeIsVisited(node, true);
        continue;
      }
      if (node.left !== SENTINEL) {
        node = node.left;
        continue;
      }
    }
    nodeStart = delta + node.start;
    if (nodeStart > end) {
      node.start += editDelta;
      node.end += editDelta;
      node.delta += editDelta;
      if (node.delta < -1073741824 /* MIN_SAFE_DELTA */ || node.delta > 1073741824 /* MAX_SAFE_DELTA */) {
        T.requestNormalizeDelta = true;
      }
      setNodeIsVisited(node, true);
      continue;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
}
function collectNodesFromOwner(T, ownerId) {
  let node = T.root;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      node = node.parent;
      continue;
    }
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    if (node.ownerId === ownerId) {
      result[resultLen++] = node;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function collectNodesPostOrder(T) {
  let node = T.root;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      node = node.parent;
      continue;
    }
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      node = node.right;
      continue;
    }
    result[resultLen++] = node;
    setNodeIsVisited(node, true);
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function search(T, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
  let node = T.root;
  let delta = 0;
  let nodeStart = 0;
  let nodeEnd = 0;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      node = node.parent;
      continue;
    }
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    nodeStart = delta + node.start;
    nodeEnd = delta + node.end;
    node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
    let include = true;
    if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
      include = false;
    }
    if (filterOutValidation && getNodeIsForValidation(node)) {
      include = false;
    }
    if (filterFontDecorations && getNodeAffectsFont(node)) {
      include = false;
    }
    if (onlyMarginDecorations && !getNodeIsInGlyphMargin(node)) {
      include = false;
    }
    if (include) {
      result[resultLen++] = node;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function intervalSearch(T, intervalStart, intervalEnd, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
  let node = T.root;
  let delta = 0;
  let nodeMaxEnd = 0;
  let nodeStart = 0;
  let nodeEnd = 0;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      node = node.parent;
      continue;
    }
    if (!getNodeIsVisited(node.left)) {
      nodeMaxEnd = delta + node.maxEnd;
      if (nodeMaxEnd < intervalStart) {
        setNodeIsVisited(node, true);
        continue;
      }
      if (node.left !== SENTINEL) {
        node = node.left;
        continue;
      }
    }
    nodeStart = delta + node.start;
    if (nodeStart > intervalEnd) {
      setNodeIsVisited(node, true);
      continue;
    }
    nodeEnd = delta + node.end;
    if (nodeEnd >= intervalStart) {
      node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
      let include = true;
      if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
        include = false;
      }
      if (filterOutValidation && getNodeIsForValidation(node)) {
        include = false;
      }
      if (filterFontDecorations && getNodeAffectsFont(node)) {
        include = false;
      }
      if (onlyMarginDecorations && !getNodeIsInGlyphMargin(node)) {
        include = false;
      }
      if (include) {
        result[resultLen++] = node;
      }
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function rbTreeInsert(T, newNode) {
  if (T.root === SENTINEL) {
    newNode.parent = SENTINEL;
    newNode.left = SENTINEL;
    newNode.right = SENTINEL;
    setNodeColor(newNode, 0 /* Black */);
    T.root = newNode;
    return T.root;
  }
  treeInsert(T, newNode);
  recomputeMaxEndWalkToRoot(newNode.parent);
  let x = newNode;
  while (x !== T.root && getNodeColor(x.parent) === 1 /* Red */) {
    if (x.parent === x.parent.parent.left) {
      const y = x.parent.parent.right;
      if (getNodeColor(y) === 1 /* Red */) {
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(y, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        x = x.parent.parent;
      } else {
        if (x === x.parent.right) {
          x = x.parent;
          leftRotate(T, x);
        }
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        rightRotate(T, x.parent.parent);
      }
    } else {
      const y = x.parent.parent.left;
      if (getNodeColor(y) === 1 /* Red */) {
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(y, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        x = x.parent.parent;
      } else {
        if (x === x.parent.left) {
          x = x.parent;
          rightRotate(T, x);
        }
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        leftRotate(T, x.parent.parent);
      }
    }
  }
  setNodeColor(T.root, 0 /* Black */);
  return newNode;
}
function treeInsert(T, z) {
  let delta = 0;
  let x = T.root;
  const zAbsoluteStart = z.start;
  const zAbsoluteEnd = z.end;
  while (true) {
    const cmp = intervalCompare(zAbsoluteStart, zAbsoluteEnd, x.start + delta, x.end + delta);
    if (cmp < 0) {
      if (x.left === SENTINEL) {
        z.start -= delta;
        z.end -= delta;
        z.maxEnd -= delta;
        x.left = z;
        break;
      } else {
        x = x.left;
      }
    } else {
      if (x.right === SENTINEL) {
        z.start -= delta + x.delta;
        z.end -= delta + x.delta;
        z.maxEnd -= delta + x.delta;
        x.right = z;
        break;
      } else {
        delta += x.delta;
        x = x.right;
      }
    }
  }
  z.parent = x;
  z.left = SENTINEL;
  z.right = SENTINEL;
  setNodeColor(z, 1 /* Red */);
}
function rbTreeDelete(T, z) {
  let x;
  let y;
  if (z.left === SENTINEL) {
    x = z.right;
    y = z;
    x.delta += z.delta;
    if (x.delta < -1073741824 /* MIN_SAFE_DELTA */ || x.delta > 1073741824 /* MAX_SAFE_DELTA */) {
      T.requestNormalizeDelta = true;
    }
    x.start += z.delta;
    x.end += z.delta;
  } else if (z.right === SENTINEL) {
    x = z.left;
    y = z;
  } else {
    y = leftest(z.right);
    x = y.right;
    x.start += y.delta;
    x.end += y.delta;
    x.delta += y.delta;
    if (x.delta < -1073741824 /* MIN_SAFE_DELTA */ || x.delta > 1073741824 /* MAX_SAFE_DELTA */) {
      T.requestNormalizeDelta = true;
    }
    y.start += z.delta;
    y.end += z.delta;
    y.delta = z.delta;
    if (y.delta < -1073741824 /* MIN_SAFE_DELTA */ || y.delta > 1073741824 /* MAX_SAFE_DELTA */) {
      T.requestNormalizeDelta = true;
    }
  }
  if (y === T.root) {
    T.root = x;
    setNodeColor(x, 0 /* Black */);
    z.detach();
    resetSentinel();
    recomputeMaxEnd(x);
    T.root.parent = SENTINEL;
    return;
  }
  const yWasRed = getNodeColor(y) === 1 /* Red */;
  if (y === y.parent.left) {
    y.parent.left = x;
  } else {
    y.parent.right = x;
  }
  if (y === z) {
    x.parent = y.parent;
  } else {
    if (y.parent === z) {
      x.parent = y;
    } else {
      x.parent = y.parent;
    }
    y.left = z.left;
    y.right = z.right;
    y.parent = z.parent;
    setNodeColor(y, getNodeColor(z));
    if (z === T.root) {
      T.root = y;
    } else {
      if (z === z.parent.left) {
        z.parent.left = y;
      } else {
        z.parent.right = y;
      }
    }
    if (y.left !== SENTINEL) {
      y.left.parent = y;
    }
    if (y.right !== SENTINEL) {
      y.right.parent = y;
    }
  }
  z.detach();
  if (yWasRed) {
    recomputeMaxEndWalkToRoot(x.parent);
    if (y !== z) {
      recomputeMaxEndWalkToRoot(y);
      recomputeMaxEndWalkToRoot(y.parent);
    }
    resetSentinel();
    return;
  }
  recomputeMaxEndWalkToRoot(x);
  recomputeMaxEndWalkToRoot(x.parent);
  if (y !== z) {
    recomputeMaxEndWalkToRoot(y);
    recomputeMaxEndWalkToRoot(y.parent);
  }
  let w;
  while (x !== T.root && getNodeColor(x) === 0 /* Black */) {
    if (x === x.parent.left) {
      w = x.parent.right;
      if (getNodeColor(w) === 1 /* Red */) {
        setNodeColor(w, 0 /* Black */);
        setNodeColor(x.parent, 1 /* Red */);
        leftRotate(T, x.parent);
        w = x.parent.right;
      }
      if (getNodeColor(w.left) === 0 /* Black */ && getNodeColor(w.right) === 0 /* Black */) {
        setNodeColor(w, 1 /* Red */);
        x = x.parent;
      } else {
        if (getNodeColor(w.right) === 0 /* Black */) {
          setNodeColor(w.left, 0 /* Black */);
          setNodeColor(w, 1 /* Red */);
          rightRotate(T, w);
          w = x.parent.right;
        }
        setNodeColor(w, getNodeColor(x.parent));
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(w.right, 0 /* Black */);
        leftRotate(T, x.parent);
        x = T.root;
      }
    } else {
      w = x.parent.left;
      if (getNodeColor(w) === 1 /* Red */) {
        setNodeColor(w, 0 /* Black */);
        setNodeColor(x.parent, 1 /* Red */);
        rightRotate(T, x.parent);
        w = x.parent.left;
      }
      if (getNodeColor(w.left) === 0 /* Black */ && getNodeColor(w.right) === 0 /* Black */) {
        setNodeColor(w, 1 /* Red */);
        x = x.parent;
      } else {
        if (getNodeColor(w.left) === 0 /* Black */) {
          setNodeColor(w.right, 0 /* Black */);
          setNodeColor(w, 1 /* Red */);
          leftRotate(T, w);
          w = x.parent.left;
        }
        setNodeColor(w, getNodeColor(x.parent));
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(w.left, 0 /* Black */);
        rightRotate(T, x.parent);
        x = T.root;
      }
    }
  }
  setNodeColor(x, 0 /* Black */);
  resetSentinel();
}
function leftest(node) {
  while (node.left !== SENTINEL) {
    node = node.left;
  }
  return node;
}
function resetSentinel() {
  SENTINEL.parent = SENTINEL;
  SENTINEL.delta = 0;
  SENTINEL.start = 0;
  SENTINEL.end = 0;
}
function leftRotate(T, x) {
  const y = x.right;
  y.delta += x.delta;
  if (y.delta < -1073741824 /* MIN_SAFE_DELTA */ || y.delta > 1073741824 /* MAX_SAFE_DELTA */) {
    T.requestNormalizeDelta = true;
  }
  y.start += x.delta;
  y.end += x.delta;
  x.right = y.left;
  if (y.left !== SENTINEL) {
    y.left.parent = x;
  }
  y.parent = x.parent;
  if (x.parent === SENTINEL) {
    T.root = y;
  } else if (x === x.parent.left) {
    x.parent.left = y;
  } else {
    x.parent.right = y;
  }
  y.left = x;
  x.parent = y;
  recomputeMaxEnd(x);
  recomputeMaxEnd(y);
}
function rightRotate(T, y) {
  const x = y.left;
  y.delta -= x.delta;
  if (y.delta < -1073741824 /* MIN_SAFE_DELTA */ || y.delta > 1073741824 /* MAX_SAFE_DELTA */) {
    T.requestNormalizeDelta = true;
  }
  y.start -= x.delta;
  y.end -= x.delta;
  y.left = x.right;
  if (x.right !== SENTINEL) {
    x.right.parent = y;
  }
  x.parent = y.parent;
  if (y.parent === SENTINEL) {
    T.root = x;
  } else if (y === y.parent.right) {
    y.parent.right = x;
  } else {
    y.parent.left = x;
  }
  x.right = y;
  y.parent = x;
  recomputeMaxEnd(y);
  recomputeMaxEnd(x);
}
function computeMaxEnd(node) {
  let maxEnd = node.end;
  if (node.left !== SENTINEL) {
    const leftMaxEnd = node.left.maxEnd;
    if (leftMaxEnd > maxEnd) {
      maxEnd = leftMaxEnd;
    }
  }
  if (node.right !== SENTINEL) {
    const rightMaxEnd = node.right.maxEnd + node.delta;
    if (rightMaxEnd > maxEnd) {
      maxEnd = rightMaxEnd;
    }
  }
  return maxEnd;
}
function recomputeMaxEnd(node) {
  node.maxEnd = computeMaxEnd(node);
}
function recomputeMaxEndWalkToRoot(node) {
  while (node !== SENTINEL) {
    const maxEnd = computeMaxEnd(node);
    if (node.maxEnd === maxEnd) {
      return;
    }
    node.maxEnd = maxEnd;
    node = node.parent;
  }
}
function intervalCompare(aStart, aEnd, bStart, bEnd) {
  if (aStart === bStart) {
    return aEnd - bEnd;
  }
  return aStart - bStart;
}
export {
  ClassName,
  IntervalNode,
  IntervalTree,
  NodeColor,
  SENTINEL,
  getNodeColor,
  intervalCompare,
  nodeAcceptEdit,
  recomputeMaxEnd,
  setNodeStickiness
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGludGVydmFsVHJlZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUcmFja2VkUmFuZ2VTdGlja2luZXNzLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIGFzIEFjdHVhbFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi90ZXh0TW9kZWwuanMnO1xuXG4vL1xuLy8gVGhlIHJlZC1ibGFjayB0cmVlIGlzIGJhc2VkIG9uIHRoZSBcIkludHJvZHVjdGlvbiB0byBBbGdvcml0aG1zXCIgYnkgQ29ybWVuLCBMZWlzZXJzb24gYW5kIFJpdmVzdC5cbi8vXG5cbmV4cG9ydCBjb25zdCBlbnVtIENsYXNzTmFtZSB7XG5cdEVkaXRvckhpbnREZWNvcmF0aW9uID0gJ3NxdWlnZ2x5LWhpbnQnLFxuXHRFZGl0b3JJbmZvRGVjb3JhdGlvbiA9ICdzcXVpZ2dseS1pbmZvJyxcblx0RWRpdG9yV2FybmluZ0RlY29yYXRpb24gPSAnc3F1aWdnbHktd2FybmluZycsXG5cdEVkaXRvckVycm9yRGVjb3JhdGlvbiA9ICdzcXVpZ2dseS1lcnJvcicsXG5cdEVkaXRvclVubmVjZXNzYXJ5RGVjb3JhdGlvbiA9ICdzcXVpZ2dseS11bm5lY2Vzc2FyeScsXG5cdEVkaXRvclVubmVjZXNzYXJ5SW5saW5lRGVjb3JhdGlvbiA9ICdzcXVpZ2dseS1pbmxpbmUtdW5uZWNlc3NhcnknLFxuXHRFZGl0b3JEZXByZWNhdGVkSW5saW5lRGVjb3JhdGlvbiA9ICdzcXVpZ2dseS1pbmxpbmUtZGVwcmVjYXRlZCdcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gTm9kZUNvbG9yIHtcblx0QmxhY2sgPSAwLFxuXHRSZWQgPSAxLFxufVxuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdENvbG9yTWFzayA9IDBiMDAwMDAwMDEsXG5cdENvbG9yTWFza0ludmVyc2UgPSAwYjExMTExMTEwLFxuXHRDb2xvck9mZnNldCA9IDAsXG5cblx0SXNWaXNpdGVkTWFzayA9IDBiMDAwMDAwMTAsXG5cdElzVmlzaXRlZE1hc2tJbnZlcnNlID0gMGIxMTExMTEwMSxcblx0SXNWaXNpdGVkT2Zmc2V0ID0gMSxcblxuXHRJc0ZvclZhbGlkYXRpb25NYXNrID0gMGIwMDAwMDEwMCxcblx0SXNGb3JWYWxpZGF0aW9uTWFza0ludmVyc2UgPSAwYjExMTExMDExLFxuXHRJc0ZvclZhbGlkYXRpb25PZmZzZXQgPSAyLFxuXG5cdFN0aWNraW5lc3NNYXNrID0gMGIwMDAxMTAwMCxcblx0U3RpY2tpbmVzc01hc2tJbnZlcnNlID0gMGIxMTEwMDExMSxcblx0U3RpY2tpbmVzc09mZnNldCA9IDMsXG5cblx0Q29sbGFwc2VPblJlcGxhY2VFZGl0TWFzayA9IDBiMDAxMDAwMDAsXG5cdENvbGxhcHNlT25SZXBsYWNlRWRpdE1hc2tJbnZlcnNlID0gMGIxMTAxMTExMSxcblx0Q29sbGFwc2VPblJlcGxhY2VFZGl0T2Zmc2V0ID0gNSxcblxuXHRJc01hcmdpbk1hc2sgPSAwYjAxMDAwMDAwLFxuXHRJc01hcmdpbk1hc2tJbnZlcnNlID0gMGIxMDExMTExMSxcblx0SXNNYXJnaW5PZmZzZXQgPSA2LFxuXG5cdEFmZmVjdHNGb250TWFzayA9IDBiMTAwMDAwMDAsXG5cdEFmZmVjdHNGb250TWFza0ludmVyc2UgPSAwYjAxMTExMTExLFxuXHRBZmZlY3RzRm9udE9mZnNldCA9IDcsXG5cblx0LyoqXG5cdCAqIER1ZSB0byBob3cgZGVsZXRpb24gd29ya3MgKGluIG9yZGVyIHRvIGF2b2lkIGFsd2F5cyB3YWxraW5nIHRoZSByaWdodCBzdWJ0cmVlIG9mIHRoZSBkZWxldGVkIG5vZGUpLFxuXHQgKiB0aGUgZGVsdGFzIGZvciBub2RlcyBjYW4gZ3JvdyBhbmQgc2hyaW5rIGRyYW1hdGljYWxseS4gSXQgaGFzIGJlZW4gb2JzZXJ2ZWQsIGluIHByYWN0aWNlLCB0aGF0IHVubGVzc1xuXHQgKiB0aGUgZGVsdGFzIGFyZSBjb3JyZWN0ZWQsIGludGVnZXIgb3ZlcmZsb3cgd2lsbCBvY2N1ci5cblx0ICpcblx0ICogVGhlIGludGVnZXIgb3ZlcmZsb3cgb2NjdXJzIHdoZW4gNTMgYml0cyBhcmUgdXNlZCBpbiB0aGUgbnVtYmVycywgYnV0IHdlIHdpbGwgdHJ5IHRvIGF2b2lkIGl0IGFzXG5cdCAqIGEgbm9kZSdzIGRlbHRhIGdldHMgYmVsb3cgYSBuZWdhdGl2ZSAzMCBiaXRzIG51bWJlci5cblx0ICpcblx0ICogTUlOIFNNSSAoU01hbGwgSW50ZWdlcikgYXMgZGVmaW5lZCBpbiB2OC5cblx0ICogb25lIGJpdCBpcyBsb3N0IGZvciBib3hpbmcvdW5ib3hpbmcgZmxhZy5cblx0ICogb25lIGJpdCBpcyBsb3N0IGZvciBzaWduIGZsYWcuXG5cdCAqIFNlZSBodHRwczovL3RoaWJhdWx0bGF1cmVucy5naXRodWIuaW8vamF2YXNjcmlwdC8yMDEzLzA0LzI5L2hvdy10aGUtdjgtZW5naW5lLXdvcmtzLyN0YWdnZWQtdmFsdWVzXG5cdCAqL1xuXHRNSU5fU0FGRV9ERUxUQSA9IC0oMSA8PCAzMCksXG5cdC8qKlxuXHQgKiBNQVggU01JIChTTWFsbCBJbnRlZ2VyKSBhcyBkZWZpbmVkIGluIHY4LlxuXHQgKiBvbmUgYml0IGlzIGxvc3QgZm9yIGJveGluZy91bmJveGluZyBmbGFnLlxuXHQgKiBvbmUgYml0IGlzIGxvc3QgZm9yIHNpZ24gZmxhZy5cblx0ICogU2VlIGh0dHBzOi8vdGhpYmF1bHRsYXVyZW5zLmdpdGh1Yi5pby9qYXZhc2NyaXB0LzIwMTMvMDQvMjkvaG93LXRoZS12OC1lbmdpbmUtd29ya3MvI3RhZ2dlZC12YWx1ZXNcblx0ICovXG5cdE1BWF9TQUZFX0RFTFRBID0gMSA8PCAzMCxcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5vZGVDb2xvcihub2RlOiBJbnRlcnZhbE5vZGUpOiBOb2RlQ29sb3Ige1xuXHRyZXR1cm4gKChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLkNvbG9yTWFzaykgPj4+IENvbnN0YW50cy5Db2xvck9mZnNldCk7XG59XG5mdW5jdGlvbiBzZXROb2RlQ29sb3Iobm9kZTogSW50ZXJ2YWxOb2RlLCBjb2xvcjogTm9kZUNvbG9yKTogdm9pZCB7XG5cdG5vZGUubWV0YWRhdGEgPSAoXG5cdFx0KG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuQ29sb3JNYXNrSW52ZXJzZSkgfCAoY29sb3IgPDwgQ29uc3RhbnRzLkNvbG9yT2Zmc2V0KVxuXHQpO1xufVxuZnVuY3Rpb24gZ2V0Tm9kZUlzVmlzaXRlZChub2RlOiBJbnRlcnZhbE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuICgobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5Jc1Zpc2l0ZWRNYXNrKSA+Pj4gQ29uc3RhbnRzLklzVmlzaXRlZE9mZnNldCkgPT09IDE7XG59XG5mdW5jdGlvbiBzZXROb2RlSXNWaXNpdGVkKG5vZGU6IEludGVydmFsTm9kZSwgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0bm9kZS5tZXRhZGF0YSA9IChcblx0XHQobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5Jc1Zpc2l0ZWRNYXNrSW52ZXJzZSkgfCAoKHZhbHVlID8gMSA6IDApIDw8IENvbnN0YW50cy5Jc1Zpc2l0ZWRPZmZzZXQpXG5cdCk7XG59XG5mdW5jdGlvbiBnZXROb2RlSXNGb3JWYWxpZGF0aW9uKG5vZGU6IEludGVydmFsTm9kZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLklzRm9yVmFsaWRhdGlvbk1hc2spID4+PiBDb25zdGFudHMuSXNGb3JWYWxpZGF0aW9uT2Zmc2V0KSA9PT0gMTtcbn1cbmZ1bmN0aW9uIHNldE5vZGVJc0ZvclZhbGlkYXRpb24obm9kZTogSW50ZXJ2YWxOb2RlLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRub2RlLm1ldGFkYXRhID0gKFxuXHRcdChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLklzRm9yVmFsaWRhdGlvbk1hc2tJbnZlcnNlKSB8ICgodmFsdWUgPyAxIDogMCkgPDwgQ29uc3RhbnRzLklzRm9yVmFsaWRhdGlvbk9mZnNldClcblx0KTtcbn1cbmZ1bmN0aW9uIGdldE5vZGVJc0luR2x5cGhNYXJnaW4obm9kZTogSW50ZXJ2YWxOb2RlKTogYm9vbGVhbiB7XG5cdHJldHVybiAoKG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuSXNNYXJnaW5NYXNrKSA+Pj4gQ29uc3RhbnRzLklzTWFyZ2luT2Zmc2V0KSA9PT0gMTtcbn1cbmZ1bmN0aW9uIHNldE5vZGVJc0luR2x5cGhNYXJnaW4obm9kZTogSW50ZXJ2YWxOb2RlLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRub2RlLm1ldGFkYXRhID0gKFxuXHRcdChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLklzTWFyZ2luTWFza0ludmVyc2UpIHwgKCh2YWx1ZSA/IDEgOiAwKSA8PCBDb25zdGFudHMuSXNNYXJnaW5PZmZzZXQpXG5cdCk7XG59XG5mdW5jdGlvbiBnZXROb2RlQWZmZWN0c0ZvbnQobm9kZTogSW50ZXJ2YWxOb2RlKTogYm9vbGVhbiB7XG5cdHJldHVybiAoKG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuQWZmZWN0c0ZvbnRNYXNrKSA+Pj4gQ29uc3RhbnRzLkFmZmVjdHNGb250T2Zmc2V0KSA9PT0gMTtcbn1cbmZ1bmN0aW9uIHNldE5vZGVBZmZlY3RzRm9udChub2RlOiBJbnRlcnZhbE5vZGUsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdG5vZGUubWV0YWRhdGEgPSAoXG5cdFx0KG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuQWZmZWN0c0ZvbnRNYXNrSW52ZXJzZSkgfCAoKHZhbHVlID8gMSA6IDApIDw8IENvbnN0YW50cy5BZmZlY3RzRm9udE9mZnNldClcblx0KTtcbn1cbmZ1bmN0aW9uIGdldE5vZGVTdGlja2luZXNzKG5vZGU6IEludGVydmFsTm9kZSk6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3Mge1xuXHRyZXR1cm4gKChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLlN0aWNraW5lc3NNYXNrKSA+Pj4gQ29uc3RhbnRzLlN0aWNraW5lc3NPZmZzZXQpO1xufVxuZnVuY3Rpb24gX3NldE5vZGVTdGlja2luZXNzKG5vZGU6IEludGVydmFsTm9kZSwgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyk6IHZvaWQge1xuXHRub2RlLm1ldGFkYXRhID0gKFxuXHRcdChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLlN0aWNraW5lc3NNYXNrSW52ZXJzZSkgfCAoc3RpY2tpbmVzcyA8PCBDb25zdGFudHMuU3RpY2tpbmVzc09mZnNldClcblx0KTtcbn1cbmZ1bmN0aW9uIGdldENvbGxhcHNlT25SZXBsYWNlRWRpdChub2RlOiBJbnRlcnZhbE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuICgobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5Db2xsYXBzZU9uUmVwbGFjZUVkaXRNYXNrKSA+Pj4gQ29uc3RhbnRzLkNvbGxhcHNlT25SZXBsYWNlRWRpdE9mZnNldCkgPT09IDE7XG59XG5mdW5jdGlvbiBzZXRDb2xsYXBzZU9uUmVwbGFjZUVkaXQobm9kZTogSW50ZXJ2YWxOb2RlLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRub2RlLm1ldGFkYXRhID0gKFxuXHRcdChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLkNvbGxhcHNlT25SZXBsYWNlRWRpdE1hc2tJbnZlcnNlKSB8ICgodmFsdWUgPyAxIDogMCkgPDwgQ29uc3RhbnRzLkNvbGxhcHNlT25SZXBsYWNlRWRpdE9mZnNldClcblx0KTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzZXROb2RlU3RpY2tpbmVzcyhub2RlOiBJbnRlcnZhbE5vZGUsIHN0aWNraW5lc3M6IEFjdHVhbFRyYWNrZWRSYW5nZVN0aWNraW5lc3MpOiB2b2lkIHtcblx0X3NldE5vZGVTdGlja2luZXNzKG5vZGUsIDxudW1iZXI+c3RpY2tpbmVzcyk7XG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcnZhbE5vZGUge1xuXG5cdC8qKlxuXHQgKiBjb250YWlucyBiaW5hcnkgZW5jb2RlZCBpbmZvcm1hdGlvbiBmb3IgY29sb3IsIHZpc2l0ZWQsIGlzRm9yVmFsaWRhdGlvbiBhbmQgc3RpY2tpbmVzcy5cblx0ICovXG5cdHB1YmxpYyBtZXRhZGF0YTogbnVtYmVyO1xuXG5cdHB1YmxpYyBwYXJlbnQ6IEludGVydmFsTm9kZTtcblx0cHVibGljIGxlZnQ6IEludGVydmFsTm9kZTtcblx0cHVibGljIHJpZ2h0OiBJbnRlcnZhbE5vZGU7XG5cblx0cHVibGljIHN0YXJ0OiBudW1iZXI7XG5cdHB1YmxpYyBlbmQ6IG51bWJlcjtcblx0cHVibGljIGRlbHRhOiBudW1iZXI7XG5cdHB1YmxpYyBtYXhFbmQ6IG51bWJlcjtcblxuXHRwdWJsaWMgaWQ6IHN0cmluZztcblx0cHVibGljIG93bmVySWQ6IG51bWJlcjtcblx0cHVibGljIG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cblx0cHVibGljIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyO1xuXHRwdWJsaWMgY2FjaGVkQWJzb2x1dGVTdGFydDogbnVtYmVyO1xuXHRwdWJsaWMgY2FjaGVkQWJzb2x1dGVFbmQ6IG51bWJlcjtcblx0cHVibGljIHJhbmdlOiBSYW5nZSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpIHtcblx0XHR0aGlzLm1ldGFkYXRhID0gMDtcblxuXHRcdHRoaXMucGFyZW50ID0gdGhpcztcblx0XHR0aGlzLmxlZnQgPSB0aGlzO1xuXHRcdHRoaXMucmlnaHQgPSB0aGlzO1xuXHRcdHNldE5vZGVDb2xvcih0aGlzLCBOb2RlQ29sb3IuUmVkKTtcblxuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLmVuZCA9IGVuZDtcblx0XHQvLyBGT1JDRV9PVkVSRkxPV0lOR19URVNUOiB0aGlzLmRlbHRhID0gc3RhcnQ7XG5cdFx0dGhpcy5kZWx0YSA9IDA7XG5cdFx0dGhpcy5tYXhFbmQgPSBlbmQ7XG5cblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5vd25lcklkID0gMDtcblx0XHR0aGlzLm9wdGlvbnMgPSBudWxsITtcblx0XHRzZXROb2RlSXNGb3JWYWxpZGF0aW9uKHRoaXMsIGZhbHNlKTtcblx0XHRzZXROb2RlSXNJbkdseXBoTWFyZ2luKHRoaXMsIGZhbHNlKTtcblx0XHRfc2V0Tm9kZVN0aWNraW5lc3ModGhpcywgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMpO1xuXHRcdHNldENvbGxhcHNlT25SZXBsYWNlRWRpdCh0aGlzLCBmYWxzZSk7XG5cdFx0c2V0Tm9kZUFmZmVjdHNGb250KHRoaXMsIGZhbHNlKTtcblxuXHRcdHRoaXMuY2FjaGVkVmVyc2lvbklkID0gMDtcblx0XHR0aGlzLmNhY2hlZEFic29sdXRlU3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLmNhY2hlZEFic29sdXRlRW5kID0gZW5kO1xuXHRcdHRoaXMucmFuZ2UgPSBudWxsO1xuXG5cdFx0c2V0Tm9kZUlzVmlzaXRlZCh0aGlzLCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXQodmVyc2lvbklkOiBudW1iZXIsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCByYW5nZTogUmFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5lbmQgPSBlbmQ7XG5cdFx0dGhpcy5tYXhFbmQgPSBlbmQ7XG5cdFx0dGhpcy5jYWNoZWRWZXJzaW9uSWQgPSB2ZXJzaW9uSWQ7XG5cdFx0dGhpcy5jYWNoZWRBYnNvbHV0ZVN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5jYWNoZWRBYnNvbHV0ZUVuZCA9IGVuZDtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdH1cblxuXHRwdWJsaWMgc2V0T3B0aW9ucyhvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zKSB7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHRjb25zdCBjbGFzc05hbWUgPSB0aGlzLm9wdGlvbnMuY2xhc3NOYW1lO1xuXHRcdHNldE5vZGVJc0ZvclZhbGlkYXRpb24odGhpcywgKFxuXHRcdFx0Y2xhc3NOYW1lID09PSBDbGFzc05hbWUuRWRpdG9yRXJyb3JEZWNvcmF0aW9uXG5cdFx0XHR8fCBjbGFzc05hbWUgPT09IENsYXNzTmFtZS5FZGl0b3JXYXJuaW5nRGVjb3JhdGlvblxuXHRcdFx0fHwgY2xhc3NOYW1lID09PSBDbGFzc05hbWUuRWRpdG9ySW5mb0RlY29yYXRpb25cblx0XHQpKTtcblx0XHRzZXROb2RlSXNJbkdseXBoTWFyZ2luKHRoaXMsIHRoaXMub3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZSAhPT0gbnVsbCk7XG5cdFx0X3NldE5vZGVTdGlja2luZXNzKHRoaXMsIDxudW1iZXI+dGhpcy5vcHRpb25zLnN0aWNraW5lc3MpO1xuXHRcdHNldENvbGxhcHNlT25SZXBsYWNlRWRpdCh0aGlzLCB0aGlzLm9wdGlvbnMuY29sbGFwc2VPblJlcGxhY2VFZGl0KTtcblx0XHRzZXROb2RlQWZmZWN0c0ZvbnQodGhpcywgdGhpcy5vcHRpb25zLmFmZmVjdHNGb250ID8/IGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDYWNoZWRPZmZzZXRzKGFic29sdXRlU3RhcnQ6IG51bWJlciwgYWJzb2x1dGVFbmQ6IG51bWJlciwgY2FjaGVkVmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYWNoZWRWZXJzaW9uSWQgIT09IGNhY2hlZFZlcnNpb25JZCkge1xuXHRcdFx0dGhpcy5yYW5nZSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuY2FjaGVkVmVyc2lvbklkID0gY2FjaGVkVmVyc2lvbklkO1xuXHRcdHRoaXMuY2FjaGVkQWJzb2x1dGVTdGFydCA9IGFic29sdXRlU3RhcnQ7XG5cdFx0dGhpcy5jYWNoZWRBYnNvbHV0ZUVuZCA9IGFic29sdXRlRW5kO1xuXHR9XG5cblx0cHVibGljIGRldGFjaCgpOiB2b2lkIHtcblx0XHR0aGlzLnBhcmVudCA9IG51bGwhO1xuXHRcdHRoaXMubGVmdCA9IG51bGwhO1xuXHRcdHRoaXMucmlnaHQgPSBudWxsITtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgU0VOVElORUw6IEludGVydmFsTm9kZSA9IG5ldyBJbnRlcnZhbE5vZGUobnVsbCEsIDAsIDApO1xuU0VOVElORUwucGFyZW50ID0gU0VOVElORUw7XG5TRU5USU5FTC5sZWZ0ID0gU0VOVElORUw7XG5TRU5USU5FTC5yaWdodCA9IFNFTlRJTkVMO1xuc2V0Tm9kZUNvbG9yKFNFTlRJTkVMLCBOb2RlQ29sb3IuQmxhY2spO1xuXG5leHBvcnQgY2xhc3MgSW50ZXJ2YWxUcmVlIHtcblxuXHRwdWJsaWMgcm9vdDogSW50ZXJ2YWxOb2RlO1xuXHRwdWJsaWMgcmVxdWVzdE5vcm1hbGl6ZURlbHRhOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMucm9vdCA9IFNFTlRJTkVMO1xuXHRcdHRoaXMucmVxdWVzdE5vcm1hbGl6ZURlbHRhID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgaW50ZXJ2YWxTZWFyY2goc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGZpbHRlck93bmVySWQ6IG51bWJlciwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlciwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdGlmICh0aGlzLnJvb3QgPT09IFNFTlRJTkVMKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBpbnRlcnZhbFNlYXJjaCh0aGlzLCBzdGFydCwgZW5kLCBmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBzZWFyY2goZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0aWYgKHRoaXMucm9vdCA9PT0gU0VOVElORUwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlYXJjaCh0aGlzLCBmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaWxsIG5vdCBzZXQgYGNhY2hlZEFic29sdXRlU3RhcnRgIG5vciBgY2FjaGVkQWJzb2x1dGVFbmRgIG9uIHRoZSByZXR1cm5lZCBub2RlcyFcblx0ICovXG5cdHB1YmxpYyBjb2xsZWN0Tm9kZXNGcm9tT3duZXIob3duZXJJZDogbnVtYmVyKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdHJldHVybiBjb2xsZWN0Tm9kZXNGcm9tT3duZXIodGhpcywgb3duZXJJZCk7XG5cdH1cblxuXHQvKipcblx0ICogV2lsbCBub3Qgc2V0IGBjYWNoZWRBYnNvbHV0ZVN0YXJ0YCBub3IgYGNhY2hlZEFic29sdXRlRW5kYCBvbiB0aGUgcmV0dXJuZWQgbm9kZXMhXG5cdCAqL1xuXHRwdWJsaWMgY29sbGVjdE5vZGVzUG9zdE9yZGVyKCk6IEludGVydmFsTm9kZVtdIHtcblx0XHRyZXR1cm4gY29sbGVjdE5vZGVzUG9zdE9yZGVyKHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGluc2VydChub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0XHRyYlRyZWVJbnNlcnQodGhpcywgbm9kZSk7XG5cdFx0dGhpcy5fbm9ybWFsaXplRGVsdGFJZk5lY2Vzc2FyeSgpO1xuXHR9XG5cblx0cHVibGljIGRlbGV0ZShub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0XHRyYlRyZWVEZWxldGUodGhpcywgbm9kZSk7XG5cdFx0dGhpcy5fbm9ybWFsaXplRGVsdGFJZk5lY2Vzc2FyeSgpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVOb2RlKG5vZGU6IEludGVydmFsTm9kZSwgY2FjaGVkVmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbml0aWFsTm9kZSA9IG5vZGU7XG5cdFx0bGV0IGRlbHRhID0gMDtcblx0XHR3aGlsZSAobm9kZSAhPT0gdGhpcy5yb290KSB7XG5cdFx0XHRpZiAobm9kZSA9PT0gbm9kZS5wYXJlbnQucmlnaHQpIHtcblx0XHRcdFx0ZGVsdGEgKz0gbm9kZS5wYXJlbnQuZGVsdGE7XG5cdFx0XHR9XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZVN0YXJ0ID0gaW5pdGlhbE5vZGUuc3RhcnQgKyBkZWx0YTtcblx0XHRjb25zdCBub2RlRW5kID0gaW5pdGlhbE5vZGUuZW5kICsgZGVsdGE7XG5cdFx0aW5pdGlhbE5vZGUuc2V0Q2FjaGVkT2Zmc2V0cyhub2RlU3RhcnQsIG5vZGVFbmQsIGNhY2hlZFZlcnNpb25JZCk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0UmVwbGFjZShvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIHRleHRMZW5ndGg6IG51bWJlciwgZm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIE91ciBzdHJhdGVneSBpcyB0byByZW1vdmUgYWxsIGRpcmVjdGx5IGltcGFjdGVkIG5vZGVzLCBhbmQgdGhlbiBhZGQgdGhlbSBiYWNrIHRvIHRoZSB0cmVlLlxuXG5cdFx0Ly8gKDEpIGNvbGxlY3QgYWxsIG5vZGVzIHRoYXQgYXJlIGludGVyc2VjdGluZyB0aGlzIGVkaXQgYXMgbm9kZXMgb2YgaW50ZXJlc3Rcblx0XHRjb25zdCBub2Rlc09mSW50ZXJlc3QgPSBzZWFyY2hGb3JFZGl0aW5nKHRoaXMsIG9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoKTtcblxuXHRcdC8vICgyKSByZW1vdmUgYWxsIG5vZGVzIHRoYXQgYXJlIGludGVyc2VjdGluZyB0aGlzIGVkaXRcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbm9kZXNPZkludGVyZXN0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBub2RlID0gbm9kZXNPZkludGVyZXN0W2ldO1xuXHRcdFx0cmJUcmVlRGVsZXRlKHRoaXMsIG5vZGUpO1xuXHRcdH1cblx0XHR0aGlzLl9ub3JtYWxpemVEZWx0YUlmTmVjZXNzYXJ5KCk7XG5cblx0XHQvLyAoMykgZWRpdCBhbGwgdHJlZSBub2RlcyBleGNlcHQgdGhlIG5vZGVzIG9mIGludGVyZXN0XG5cdFx0bm9PdmVybGFwUmVwbGFjZSh0aGlzLCBvZmZzZXQsIG9mZnNldCArIGxlbmd0aCwgdGV4dExlbmd0aCk7XG5cdFx0dGhpcy5fbm9ybWFsaXplRGVsdGFJZk5lY2Vzc2FyeSgpO1xuXG5cdFx0Ly8gKDQpIGVkaXQgdGhlIG5vZGVzIG9mIGludGVyZXN0IGFuZCBpbnNlcnQgdGhlbSBiYWNrIGluIHRoZSB0cmVlXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG5vZGVzT2ZJbnRlcmVzdC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IG5vZGVzT2ZJbnRlcmVzdFtpXTtcblx0XHRcdG5vZGUuc3RhcnQgPSBub2RlLmNhY2hlZEFic29sdXRlU3RhcnQ7XG5cdFx0XHRub2RlLmVuZCA9IG5vZGUuY2FjaGVkQWJzb2x1dGVFbmQ7XG5cdFx0XHRub2RlQWNjZXB0RWRpdChub2RlLCBvZmZzZXQsIChvZmZzZXQgKyBsZW5ndGgpLCB0ZXh0TGVuZ3RoLCBmb3JjZU1vdmVNYXJrZXJzKTtcblx0XHRcdG5vZGUubWF4RW5kID0gbm9kZS5lbmQ7XG5cdFx0XHRyYlRyZWVJbnNlcnQodGhpcywgbm9kZSk7XG5cdFx0fVxuXHRcdHRoaXMuX25vcm1hbGl6ZURlbHRhSWZOZWNlc3NhcnkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbGxJbk9yZGVyKCk6IEludGVydmFsTm9kZVtdIHtcblx0XHRyZXR1cm4gc2VhcmNoKHRoaXMsIDAsIGZhbHNlLCBmYWxzZSwgMCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplRGVsdGFJZk5lY2Vzc2FyeSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucmVxdWVzdE5vcm1hbGl6ZURlbHRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucmVxdWVzdE5vcm1hbGl6ZURlbHRhID0gZmFsc2U7XG5cdFx0bm9ybWFsaXplRGVsdGEodGhpcyk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIERlbHRhIE5vcm1hbGl6YXRpb25cbmZ1bmN0aW9uIG5vcm1hbGl6ZURlbHRhKFQ6IEludGVydmFsVHJlZSk6IHZvaWQge1xuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0bGV0IGRlbHRhID0gMDtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cblx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQpKSB7XG5cdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRub2RlID0gbm9kZS5sZWZ0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUucmlnaHQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQpKSB7XG5cdFx0XHQvLyBnbyByaWdodFxuXHRcdFx0ZGVsdGEgKz0gbm9kZS5kZWx0YTtcblx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIGN1cnJlbnQgbm9kZVxuXHRcdG5vZGUuc3RhcnQgPSBkZWx0YSArIG5vZGUuc3RhcnQ7XG5cdFx0bm9kZS5lbmQgPSBkZWx0YSArIG5vZGUuZW5kO1xuXHRcdG5vZGUuZGVsdGEgPSAwO1xuXHRcdHJlY29tcHV0ZU1heEVuZChub2RlKTtcblxuXHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cblx0XHQvLyBnb2luZyB1cCBmcm9tIHRoaXMgbm9kZVxuXHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0LCBmYWxzZSk7XG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0LCBmYWxzZSk7XG5cdFx0aWYgKG5vZGUgPT09IG5vZGUucGFyZW50LnJpZ2h0KSB7XG5cdFx0XHRkZWx0YSAtPSBub2RlLnBhcmVudC5kZWx0YTtcblx0XHR9XG5cdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHR9XG5cblx0c2V0Tm9kZUlzVmlzaXRlZChULnJvb3QsIGZhbHNlKTtcbn1cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRWRpdGluZ1xuXG5jb25zdCBlbnVtIE1hcmtlck1vdmVTZW1hbnRpY3Mge1xuXHRNYXJrZXJEZWZpbmVkID0gMCxcblx0Rm9yY2VNb3ZlID0gMSxcblx0Rm9yY2VTdGF5ID0gMlxufVxuXG5mdW5jdGlvbiBhZGp1c3RNYXJrZXJCZWZvcmVDb2x1bW4obWFya2VyT2Zmc2V0OiBudW1iZXIsIG1hcmtlclN0aWNrVG9QcmV2aW91c0NoYXJhY3RlcjogYm9vbGVhbiwgY2hlY2tPZmZzZXQ6IG51bWJlciwgbW92ZVNlbWFudGljczogTWFya2VyTW92ZVNlbWFudGljcyk6IGJvb2xlYW4ge1xuXHRpZiAobWFya2VyT2Zmc2V0IDwgY2hlY2tPZmZzZXQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAobWFya2VyT2Zmc2V0ID4gY2hlY2tPZmZzZXQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKG1vdmVTZW1hbnRpY3MgPT09IE1hcmtlck1vdmVTZW1hbnRpY3MuRm9yY2VNb3ZlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChtb3ZlU2VtYW50aWNzID09PSBNYXJrZXJNb3ZlU2VtYW50aWNzLkZvcmNlU3RheSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBtYXJrZXJTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXI7XG59XG5cbi8qKlxuICogVGhpcyBpcyBhIGxvdCBtb3JlIGNvbXBsaWNhdGVkIHRoYW4gc3RyaWN0bHkgbmVjZXNzYXJ5IHRvIG1haW50YWluIHRoZSBzYW1lIGJlaGF2aW91clxuICogYXMgd2hlbiBkZWNvcmF0aW9ucyB3ZXJlIGltcGxlbWVudGVkIHVzaW5nIHR3byBtYXJrZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbm9kZUFjY2VwdEVkaXQobm9kZTogSW50ZXJ2YWxOb2RlLCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgdGV4dExlbmd0aDogbnVtYmVyLCBmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IG5vZGVTdGlja2luZXNzID0gZ2V0Tm9kZVN0aWNraW5lc3Mobm9kZSk7XG5cdGNvbnN0IHN0YXJ0U3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyID0gKFxuXHRcdG5vZGVTdGlja2luZXNzID09PSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0XHR8fCBub2RlU3RpY2tpbmVzcyA9PT0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlXG5cdCk7XG5cdGNvbnN0IGVuZFN0aWNrVG9QcmV2aW91c0NoYXJhY3RlciA9IChcblx0XHRub2RlU3RpY2tpbmVzcyA9PT0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0XHR8fCBub2RlU3RpY2tpbmVzcyA9PT0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlXG5cdCk7XG5cblx0Y29uc3QgZGVsZXRpbmdDbnQgPSAoZW5kIC0gc3RhcnQpO1xuXHRjb25zdCBpbnNlcnRpbmdDbnQgPSB0ZXh0TGVuZ3RoO1xuXHRjb25zdCBjb21tb25MZW5ndGggPSBNYXRoLm1pbihkZWxldGluZ0NudCwgaW5zZXJ0aW5nQ250KTtcblxuXHRjb25zdCBub2RlU3RhcnQgPSBub2RlLnN0YXJ0O1xuXHRsZXQgc3RhcnREb25lID0gZmFsc2U7XG5cblx0Y29uc3Qgbm9kZUVuZCA9IG5vZGUuZW5kO1xuXHRsZXQgZW5kRG9uZSA9IGZhbHNlO1xuXG5cdGlmIChzdGFydCA8PSBub2RlU3RhcnQgJiYgbm9kZUVuZCA8PSBlbmQgJiYgZ2V0Q29sbGFwc2VPblJlcGxhY2VFZGl0KG5vZGUpKSB7XG5cdFx0Ly8gVGhpcyBlZGl0IGVuY29tcGFzc2VzIHRoZSBlbnRpcmUgZGVjb3JhdGlvbiByYW5nZVxuXHRcdC8vIGFuZCB0aGUgZGVjb3JhdGlvbiBoYXMgYXNrZWQgdG8gYmVjb21lIGNvbGxhcHNlZFxuXHRcdG5vZGUuc3RhcnQgPSBzdGFydDtcblx0XHRzdGFydERvbmUgPSB0cnVlO1xuXHRcdG5vZGUuZW5kID0gc3RhcnQ7XG5cdFx0ZW5kRG9uZSA9IHRydWU7XG5cdH1cblxuXHR7XG5cdFx0Y29uc3QgbW92ZVNlbWFudGljcyA9IGZvcmNlTW92ZU1hcmtlcnMgPyBNYXJrZXJNb3ZlU2VtYW50aWNzLkZvcmNlTW92ZSA6IChkZWxldGluZ0NudCA+IDAgPyBNYXJrZXJNb3ZlU2VtYW50aWNzLkZvcmNlU3RheSA6IE1hcmtlck1vdmVTZW1hbnRpY3MuTWFya2VyRGVmaW5lZCk7XG5cdFx0aWYgKCFzdGFydERvbmUgJiYgYWRqdXN0TWFya2VyQmVmb3JlQ29sdW1uKG5vZGVTdGFydCwgc3RhcnRTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXIsIHN0YXJ0LCBtb3ZlU2VtYW50aWNzKSkge1xuXHRcdFx0c3RhcnREb25lID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFlbmREb25lICYmIGFkanVzdE1hcmtlckJlZm9yZUNvbHVtbihub2RlRW5kLCBlbmRTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXIsIHN0YXJ0LCBtb3ZlU2VtYW50aWNzKSkge1xuXHRcdFx0ZW5kRG9uZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGNvbW1vbkxlbmd0aCA+IDAgJiYgIWZvcmNlTW92ZU1hcmtlcnMpIHtcblx0XHRjb25zdCBtb3ZlU2VtYW50aWNzID0gKGRlbGV0aW5nQ250ID4gaW5zZXJ0aW5nQ250ID8gTWFya2VyTW92ZVNlbWFudGljcy5Gb3JjZVN0YXkgOiBNYXJrZXJNb3ZlU2VtYW50aWNzLk1hcmtlckRlZmluZWQpO1xuXHRcdGlmICghc3RhcnREb25lICYmIGFkanVzdE1hcmtlckJlZm9yZUNvbHVtbihub2RlU3RhcnQsIHN0YXJ0U3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyLCBzdGFydCArIGNvbW1vbkxlbmd0aCwgbW92ZVNlbWFudGljcykpIHtcblx0XHRcdHN0YXJ0RG9uZSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmICghZW5kRG9uZSAmJiBhZGp1c3RNYXJrZXJCZWZvcmVDb2x1bW4obm9kZUVuZCwgZW5kU3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyLCBzdGFydCArIGNvbW1vbkxlbmd0aCwgbW92ZVNlbWFudGljcykpIHtcblx0XHRcdGVuZERvbmUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHtcblx0XHRjb25zdCBtb3ZlU2VtYW50aWNzID0gZm9yY2VNb3ZlTWFya2VycyA/IE1hcmtlck1vdmVTZW1hbnRpY3MuRm9yY2VNb3ZlIDogTWFya2VyTW92ZVNlbWFudGljcy5NYXJrZXJEZWZpbmVkO1xuXHRcdGlmICghc3RhcnREb25lICYmIGFkanVzdE1hcmtlckJlZm9yZUNvbHVtbihub2RlU3RhcnQsIHN0YXJ0U3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyLCBlbmQsIG1vdmVTZW1hbnRpY3MpKSB7XG5cdFx0XHRub2RlLnN0YXJ0ID0gc3RhcnQgKyBpbnNlcnRpbmdDbnQ7XG5cdFx0XHRzdGFydERvbmUgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWVuZERvbmUgJiYgYWRqdXN0TWFya2VyQmVmb3JlQ29sdW1uKG5vZGVFbmQsIGVuZFN0aWNrVG9QcmV2aW91c0NoYXJhY3RlciwgZW5kLCBtb3ZlU2VtYW50aWNzKSkge1xuXHRcdFx0bm9kZS5lbmQgPSBzdGFydCArIGluc2VydGluZ0NudDtcblx0XHRcdGVuZERvbmUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdC8vIEZpbmlzaFxuXHRjb25zdCBkZWx0YUNvbHVtbiA9IChpbnNlcnRpbmdDbnQgLSBkZWxldGluZ0NudCk7XG5cdGlmICghc3RhcnREb25lKSB7XG5cdFx0bm9kZS5zdGFydCA9IE1hdGgubWF4KDAsIG5vZGVTdGFydCArIGRlbHRhQ29sdW1uKTtcblx0fVxuXHRpZiAoIWVuZERvbmUpIHtcblx0XHRub2RlLmVuZCA9IE1hdGgubWF4KDAsIG5vZGVFbmQgKyBkZWx0YUNvbHVtbik7XG5cdH1cblxuXHRpZiAobm9kZS5zdGFydCA+IG5vZGUuZW5kKSB7XG5cdFx0bm9kZS5lbmQgPSBub2RlLnN0YXJ0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNlYXJjaEZvckVkaXRpbmcoVDogSW50ZXJ2YWxUcmVlLCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcik6IEludGVydmFsTm9kZVtdIHtcblx0Ly8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSW50ZXJ2YWxfdHJlZSNBdWdtZW50ZWRfdHJlZVxuXHQvLyBOb3csIGl0IGlzIGtub3duIHRoYXQgdHdvIGludGVydmFscyBBIGFuZCBCIG92ZXJsYXAgb25seSB3aGVuIGJvdGhcblx0Ly8gQS5sb3cgPD0gQi5oaWdoIGFuZCBBLmhpZ2ggPj0gQi5sb3cuIFdoZW4gc2VhcmNoaW5nIHRoZSB0cmVlcyBmb3Jcblx0Ly8gbm9kZXMgb3ZlcmxhcHBpbmcgd2l0aCBhIGdpdmVuIGludGVydmFsLCB5b3UgY2FuIGltbWVkaWF0ZWx5IHNraXA6XG5cdC8vICBhKSBhbGwgbm9kZXMgdG8gdGhlIHJpZ2h0IG9mIG5vZGVzIHdob3NlIGxvdyB2YWx1ZSBpcyBwYXN0IHRoZSBlbmQgb2YgdGhlIGdpdmVuIGludGVydmFsLlxuXHQvLyAgYikgYWxsIG5vZGVzIHRoYXQgaGF2ZSB0aGVpciBtYXhpbXVtICdoaWdoJyB2YWx1ZSBiZWxvdyB0aGUgc3RhcnQgb2YgdGhlIGdpdmVuIGludGVydmFsLlxuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0bGV0IGRlbHRhID0gMDtcblx0bGV0IG5vZGVNYXhFbmQgPSAwO1xuXHRsZXQgbm9kZVN0YXJ0ID0gMDtcblx0bGV0IG5vZGVFbmQgPSAwO1xuXHRjb25zdCByZXN1bHQ6IEludGVydmFsTm9kZVtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXHR3aGlsZSAobm9kZSAhPT0gU0VOVElORUwpIHtcblx0XHRpZiAoZ2V0Tm9kZUlzVmlzaXRlZChub2RlKSkge1xuXHRcdFx0Ly8gZ29pbmcgdXAgZnJvbSB0aGlzIG5vZGVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0LCBmYWxzZSk7XG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQsIGZhbHNlKTtcblx0XHRcdGlmIChub2RlID09PSBub2RlLnBhcmVudC5yaWdodCkge1xuXHRcdFx0XHRkZWx0YSAtPSBub2RlLnBhcmVudC5kZWx0YTtcblx0XHRcdH1cblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmICghZ2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQpKSB7XG5cdFx0XHQvLyBmaXJzdCB0aW1lIHNlZWluZyB0aGlzIG5vZGVcblx0XHRcdG5vZGVNYXhFbmQgPSBkZWx0YSArIG5vZGUubWF4RW5kO1xuXHRcdFx0aWYgKG5vZGVNYXhFbmQgPCBzdGFydCkge1xuXHRcdFx0XHQvLyBjb3ZlciBjYXNlIGIpIGZyb20gYWJvdmVcblx0XHRcdFx0Ly8gdGhlcmUgaXMgbm8gbmVlZCB0byBzZWFyY2ggdGhpcyBub2RlIG9yIGl0cyBjaGlsZHJlblxuXHRcdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUsIHRydWUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5vZGUubGVmdCAhPT0gU0VOVElORUwpIHtcblx0XHRcdFx0Ly8gZ28gbGVmdFxuXHRcdFx0XHRub2RlID0gbm9kZS5sZWZ0O1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgY3VycmVudCBub2RlXG5cdFx0bm9kZVN0YXJ0ID0gZGVsdGEgKyBub2RlLnN0YXJ0O1xuXHRcdGlmIChub2RlU3RhcnQgPiBlbmQpIHtcblx0XHRcdC8vIGNvdmVyIGNhc2UgYSkgZnJvbSBhYm92ZVxuXHRcdFx0Ly8gdGhlcmUgaXMgbm8gbmVlZCB0byBzZWFyY2ggdGhpcyBub2RlIG9yIGl0cyByaWdodCBzdWJ0cmVlXG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUsIHRydWUpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0bm9kZUVuZCA9IGRlbHRhICsgbm9kZS5lbmQ7XG5cdFx0aWYgKG5vZGVFbmQgPj0gc3RhcnQpIHtcblx0XHRcdG5vZGUuc2V0Q2FjaGVkT2Zmc2V0cyhub2RlU3RhcnQsIG5vZGVFbmQsIDApO1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5vZGU7XG5cdFx0fVxuXHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cblx0XHRpZiAobm9kZS5yaWdodCAhPT0gU0VOVElORUwgJiYgIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCkpIHtcblx0XHRcdC8vIGdvIHJpZ2h0XG5cdFx0XHRkZWx0YSArPSBub2RlLmRlbHRhO1xuXHRcdFx0bm9kZSA9IG5vZGUucmlnaHQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdH1cblxuXHRzZXROb2RlSXNWaXNpdGVkKFQucm9vdCwgZmFsc2UpO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIG5vT3ZlcmxhcFJlcGxhY2UoVDogSW50ZXJ2YWxUcmVlLCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgdGV4dExlbmd0aDogbnVtYmVyKTogdm9pZCB7XG5cdC8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0ludGVydmFsX3RyZWUjQXVnbWVudGVkX3RyZWVcblx0Ly8gTm93LCBpdCBpcyBrbm93biB0aGF0IHR3byBpbnRlcnZhbHMgQSBhbmQgQiBvdmVybGFwIG9ubHkgd2hlbiBib3RoXG5cdC8vIEEubG93IDw9IEIuaGlnaCBhbmQgQS5oaWdoID49IEIubG93LiBXaGVuIHNlYXJjaGluZyB0aGUgdHJlZXMgZm9yXG5cdC8vIG5vZGVzIG92ZXJsYXBwaW5nIHdpdGggYSBnaXZlbiBpbnRlcnZhbCwgeW91IGNhbiBpbW1lZGlhdGVseSBza2lwOlxuXHQvLyAgYSkgYWxsIG5vZGVzIHRvIHRoZSByaWdodCBvZiBub2RlcyB3aG9zZSBsb3cgdmFsdWUgaXMgcGFzdCB0aGUgZW5kIG9mIHRoZSBnaXZlbiBpbnRlcnZhbC5cblx0Ly8gIGIpIGFsbCBub2RlcyB0aGF0IGhhdmUgdGhlaXIgbWF4aW11bSAnaGlnaCcgdmFsdWUgYmVsb3cgdGhlIHN0YXJ0IG9mIHRoZSBnaXZlbiBpbnRlcnZhbC5cblx0bGV0IG5vZGUgPSBULnJvb3Q7XG5cdGxldCBkZWx0YSA9IDA7XG5cdGxldCBub2RlTWF4RW5kID0gMDtcblx0bGV0IG5vZGVTdGFydCA9IDA7XG5cdGNvbnN0IGVkaXREZWx0YSA9ICh0ZXh0TGVuZ3RoIC0gKGVuZCAtIHN0YXJ0KSk7XG5cdHdoaWxlIChub2RlICE9PSBTRU5USU5FTCkge1xuXHRcdGlmIChnZXROb2RlSXNWaXNpdGVkKG5vZGUpKSB7XG5cdFx0XHQvLyBnb2luZyB1cCBmcm9tIHRoaXMgbm9kZVxuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQsIGZhbHNlKTtcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCwgZmFsc2UpO1xuXHRcdFx0aWYgKG5vZGUgPT09IG5vZGUucGFyZW50LnJpZ2h0KSB7XG5cdFx0XHRcdGRlbHRhIC09IG5vZGUucGFyZW50LmRlbHRhO1xuXHRcdFx0fVxuXHRcdFx0cmVjb21wdXRlTWF4RW5kKG5vZGUpO1xuXHRcdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFnZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCkpIHtcblx0XHRcdC8vIGZpcnN0IHRpbWUgc2VlaW5nIHRoaXMgbm9kZVxuXHRcdFx0bm9kZU1heEVuZCA9IGRlbHRhICsgbm9kZS5tYXhFbmQ7XG5cdFx0XHRpZiAobm9kZU1heEVuZCA8IHN0YXJ0KSB7XG5cdFx0XHRcdC8vIGNvdmVyIGNhc2UgYikgZnJvbSBhYm92ZVxuXHRcdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIHNlYXJjaCB0aGlzIG5vZGUgb3IgaXRzIGNoaWxkcmVuXG5cdFx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGhhbmRsZSBjdXJyZW50IG5vZGVcblx0XHRub2RlU3RhcnQgPSBkZWx0YSArIG5vZGUuc3RhcnQ7XG5cdFx0aWYgKG5vZGVTdGFydCA+IGVuZCkge1xuXHRcdFx0bm9kZS5zdGFydCArPSBlZGl0RGVsdGE7XG5cdFx0XHRub2RlLmVuZCArPSBlZGl0RGVsdGE7XG5cdFx0XHRub2RlLmRlbHRhICs9IGVkaXREZWx0YTtcblx0XHRcdGlmIChub2RlLmRlbHRhIDwgQ29uc3RhbnRzLk1JTl9TQUZFX0RFTFRBIHx8IG5vZGUuZGVsdGEgPiBDb25zdGFudHMuTUFYX1NBRkVfREVMVEEpIHtcblx0XHRcdFx0VC5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gY292ZXIgY2FzZSBhKSBmcm9tIGFib3ZlXG5cdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIHNlYXJjaCB0aGlzIG5vZGUgb3IgaXRzIHJpZ2h0IHN1YnRyZWVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUsIHRydWUpO1xuXG5cdFx0aWYgKG5vZGUucmlnaHQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQpKSB7XG5cdFx0XHQvLyBnbyByaWdodFxuXHRcdFx0ZGVsdGEgKz0gbm9kZS5kZWx0YTtcblx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHR9XG5cblx0c2V0Tm9kZUlzVmlzaXRlZChULnJvb3QsIGZhbHNlKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTZWFyY2hpbmdcblxuZnVuY3Rpb24gY29sbGVjdE5vZGVzRnJvbU93bmVyKFQ6IEludGVydmFsVHJlZSwgb3duZXJJZDogbnVtYmVyKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0Y29uc3QgcmVzdWx0OiBJbnRlcnZhbE5vZGVbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cdFx0aWYgKGdldE5vZGVJc1Zpc2l0ZWQobm9kZSkpIHtcblx0XHRcdC8vIGdvaW5nIHVwIGZyb20gdGhpcyBub2RlXG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCwgZmFsc2UpO1xuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0LCBmYWxzZSk7XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQpKSB7XG5cdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRub2RlID0gbm9kZS5sZWZ0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIGN1cnJlbnQgbm9kZVxuXHRcdGlmIChub2RlLm93bmVySWQgPT09IG93bmVySWQpIHtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBub2RlO1xuXHRcdH1cblxuXHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cblx0XHRpZiAobm9kZS5yaWdodCAhPT0gU0VOVElORUwgJiYgIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCkpIHtcblx0XHRcdC8vIGdvIHJpZ2h0XG5cdFx0XHRub2RlID0gbm9kZS5yaWdodDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0fVxuXG5cdHNldE5vZGVJc1Zpc2l0ZWQoVC5yb290LCBmYWxzZSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY29sbGVjdE5vZGVzUG9zdE9yZGVyKFQ6IEludGVydmFsVHJlZSk6IEludGVydmFsTm9kZVtdIHtcblx0bGV0IG5vZGUgPSBULnJvb3Q7XG5cdGNvbnN0IHJlc3VsdDogSW50ZXJ2YWxOb2RlW10gPSBbXTtcblx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdHdoaWxlIChub2RlICE9PSBTRU5USU5FTCkge1xuXHRcdGlmIChnZXROb2RlSXNWaXNpdGVkKG5vZGUpKSB7XG5cdFx0XHQvLyBnb2luZyB1cCBmcm9tIHRoaXMgbm9kZVxuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQsIGZhbHNlKTtcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCwgZmFsc2UpO1xuXHRcdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUubGVmdCAhPT0gU0VOVElORUwgJiYgIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0KSkge1xuXHRcdFx0Ly8gZ28gbGVmdFxuXHRcdFx0bm9kZSA9IG5vZGUubGVmdDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLnJpZ2h0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0KSkge1xuXHRcdFx0Ly8gZ28gcmlnaHRcblx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIGN1cnJlbnQgbm9kZVxuXHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBub2RlO1xuXHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdH1cblxuXHRzZXROb2RlSXNWaXNpdGVkKFQucm9vdCwgZmFsc2UpO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHNlYXJjaChUOiBJbnRlcnZhbFRyZWUsIGZpbHRlck93bmVySWQ6IG51bWJlciwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlciwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0bGV0IGRlbHRhID0gMDtcblx0bGV0IG5vZGVTdGFydCA9IDA7XG5cdGxldCBub2RlRW5kID0gMDtcblx0Y29uc3QgcmVzdWx0OiBJbnRlcnZhbE5vZGVbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cdFx0aWYgKGdldE5vZGVJc1Zpc2l0ZWQobm9kZSkpIHtcblx0XHRcdC8vIGdvaW5nIHVwIGZyb20gdGhpcyBub2RlXG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCwgZmFsc2UpO1xuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0LCBmYWxzZSk7XG5cdFx0XHRpZiAobm9kZSA9PT0gbm9kZS5wYXJlbnQucmlnaHQpIHtcblx0XHRcdFx0ZGVsdGEgLT0gbm9kZS5wYXJlbnQuZGVsdGE7XG5cdFx0XHR9XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQpKSB7XG5cdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRub2RlID0gbm9kZS5sZWZ0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIGN1cnJlbnQgbm9kZVxuXHRcdG5vZGVTdGFydCA9IGRlbHRhICsgbm9kZS5zdGFydDtcblx0XHRub2RlRW5kID0gZGVsdGEgKyBub2RlLmVuZDtcblxuXHRcdG5vZGUuc2V0Q2FjaGVkT2Zmc2V0cyhub2RlU3RhcnQsIG5vZGVFbmQsIGNhY2hlZFZlcnNpb25JZCk7XG5cblx0XHRsZXQgaW5jbHVkZSA9IHRydWU7XG5cdFx0aWYgKGZpbHRlck93bmVySWQgJiYgbm9kZS5vd25lcklkICYmIG5vZGUub3duZXJJZCAhPT0gZmlsdGVyT3duZXJJZCkge1xuXHRcdFx0aW5jbHVkZSA9IGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoZmlsdGVyT3V0VmFsaWRhdGlvbiAmJiBnZXROb2RlSXNGb3JWYWxpZGF0aW9uKG5vZGUpKSB7XG5cdFx0XHRpbmNsdWRlID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChmaWx0ZXJGb250RGVjb3JhdGlvbnMgJiYgZ2V0Tm9kZUFmZmVjdHNGb250KG5vZGUpKSB7XG5cdFx0XHRpbmNsdWRlID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvbmx5TWFyZ2luRGVjb3JhdGlvbnMgJiYgIWdldE5vZGVJc0luR2x5cGhNYXJnaW4obm9kZSkpIHtcblx0XHRcdGluY2x1ZGUgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaW5jbHVkZSkge1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5vZGU7XG5cdFx0fVxuXG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblxuXHRcdGlmIChub2RlLnJpZ2h0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0KSkge1xuXHRcdFx0Ly8gZ28gcmlnaHRcblx0XHRcdGRlbHRhICs9IG5vZGUuZGVsdGE7XG5cdFx0XHRub2RlID0gbm9kZS5yaWdodDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0fVxuXG5cdHNldE5vZGVJc1Zpc2l0ZWQoVC5yb290LCBmYWxzZSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaW50ZXJ2YWxTZWFyY2goVDogSW50ZXJ2YWxUcmVlLCBpbnRlcnZhbFN0YXJ0OiBudW1iZXIsIGludGVydmFsRW5kOiBudW1iZXIsIGZpbHRlck93bmVySWQ6IG51bWJlciwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlciwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSW50ZXJ2YWxOb2RlW10ge1xuXHQvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9JbnRlcnZhbF90cmVlI0F1Z21lbnRlZF90cmVlXG5cdC8vIE5vdywgaXQgaXMga25vd24gdGhhdCB0d28gaW50ZXJ2YWxzIEEgYW5kIEIgb3ZlcmxhcCBvbmx5IHdoZW4gYm90aFxuXHQvLyBBLmxvdyA8PSBCLmhpZ2ggYW5kIEEuaGlnaCA+PSBCLmxvdy4gV2hlbiBzZWFyY2hpbmcgdGhlIHRyZWVzIGZvclxuXHQvLyBub2RlcyBvdmVybGFwcGluZyB3aXRoIGEgZ2l2ZW4gaW50ZXJ2YWwsIHlvdSBjYW4gaW1tZWRpYXRlbHkgc2tpcDpcblx0Ly8gIGEpIGFsbCBub2RlcyB0byB0aGUgcmlnaHQgb2Ygbm9kZXMgd2hvc2UgbG93IHZhbHVlIGlzIHBhc3QgdGhlIGVuZCBvZiB0aGUgZ2l2ZW4gaW50ZXJ2YWwuXG5cdC8vICBiKSBhbGwgbm9kZXMgdGhhdCBoYXZlIHRoZWlyIG1heGltdW0gJ2hpZ2gnIHZhbHVlIGJlbG93IHRoZSBzdGFydCBvZiB0aGUgZ2l2ZW4gaW50ZXJ2YWwuXG5cblx0bGV0IG5vZGUgPSBULnJvb3Q7XG5cdGxldCBkZWx0YSA9IDA7XG5cdGxldCBub2RlTWF4RW5kID0gMDtcblx0bGV0IG5vZGVTdGFydCA9IDA7XG5cdGxldCBub2RlRW5kID0gMDtcblx0Y29uc3QgcmVzdWx0OiBJbnRlcnZhbE5vZGVbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cdFx0aWYgKGdldE5vZGVJc1Zpc2l0ZWQobm9kZSkpIHtcblx0XHRcdC8vIGdvaW5nIHVwIGZyb20gdGhpcyBub2RlXG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCwgZmFsc2UpO1xuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0LCBmYWxzZSk7XG5cdFx0XHRpZiAobm9kZSA9PT0gbm9kZS5wYXJlbnQucmlnaHQpIHtcblx0XHRcdFx0ZGVsdGEgLT0gbm9kZS5wYXJlbnQuZGVsdGE7XG5cdFx0XHR9XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0KSkge1xuXHRcdFx0Ly8gZmlyc3QgdGltZSBzZWVpbmcgdGhpcyBub2RlXG5cdFx0XHRub2RlTWF4RW5kID0gZGVsdGEgKyBub2RlLm1heEVuZDtcblx0XHRcdGlmIChub2RlTWF4RW5kIDwgaW50ZXJ2YWxTdGFydCkge1xuXHRcdFx0XHQvLyBjb3ZlciBjYXNlIGIpIGZyb20gYWJvdmVcblx0XHRcdFx0Ly8gdGhlcmUgaXMgbm8gbmVlZCB0byBzZWFyY2ggdGhpcyBub2RlIG9yIGl0cyBjaGlsZHJlblxuXHRcdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUsIHRydWUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5vZGUubGVmdCAhPT0gU0VOVElORUwpIHtcblx0XHRcdFx0Ly8gZ28gbGVmdFxuXHRcdFx0XHRub2RlID0gbm9kZS5sZWZ0O1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgY3VycmVudCBub2RlXG5cdFx0bm9kZVN0YXJ0ID0gZGVsdGEgKyBub2RlLnN0YXJ0O1xuXHRcdGlmIChub2RlU3RhcnQgPiBpbnRlcnZhbEVuZCkge1xuXHRcdFx0Ly8gY292ZXIgY2FzZSBhKSBmcm9tIGFib3ZlXG5cdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIHNlYXJjaCB0aGlzIG5vZGUgb3IgaXRzIHJpZ2h0IHN1YnRyZWVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRub2RlRW5kID0gZGVsdGEgKyBub2RlLmVuZDtcblxuXHRcdGlmIChub2RlRW5kID49IGludGVydmFsU3RhcnQpIHtcblx0XHRcdC8vIFRoZXJlIGlzIG92ZXJsYXBcblx0XHRcdG5vZGUuc2V0Q2FjaGVkT2Zmc2V0cyhub2RlU3RhcnQsIG5vZGVFbmQsIGNhY2hlZFZlcnNpb25JZCk7XG5cblx0XHRcdGxldCBpbmNsdWRlID0gdHJ1ZTtcblx0XHRcdGlmIChmaWx0ZXJPd25lcklkICYmIG5vZGUub3duZXJJZCAmJiBub2RlLm93bmVySWQgIT09IGZpbHRlck93bmVySWQpIHtcblx0XHRcdFx0aW5jbHVkZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpbHRlck91dFZhbGlkYXRpb24gJiYgZ2V0Tm9kZUlzRm9yVmFsaWRhdGlvbihub2RlKSkge1xuXHRcdFx0XHRpbmNsdWRlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlsdGVyRm9udERlY29yYXRpb25zICYmIGdldE5vZGVBZmZlY3RzRm9udChub2RlKSkge1xuXHRcdFx0XHRpbmNsdWRlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAob25seU1hcmdpbkRlY29yYXRpb25zICYmICFnZXROb2RlSXNJbkdseXBoTWFyZ2luKG5vZGUpKSB7XG5cdFx0XHRcdGluY2x1ZGUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGluY2x1ZGUpIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5vZGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblxuXHRcdGlmIChub2RlLnJpZ2h0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0KSkge1xuXHRcdFx0Ly8gZ28gcmlnaHRcblx0XHRcdGRlbHRhICs9IG5vZGUuZGVsdGE7XG5cdFx0XHRub2RlID0gbm9kZS5yaWdodDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0fVxuXG5cdHNldE5vZGVJc1Zpc2l0ZWQoVC5yb290LCBmYWxzZSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBJbnNlcnRpb25cbmZ1bmN0aW9uIHJiVHJlZUluc2VydChUOiBJbnRlcnZhbFRyZWUsIG5ld05vZGU6IEludGVydmFsTm9kZSk6IEludGVydmFsTm9kZSB7XG5cdGlmIChULnJvb3QgPT09IFNFTlRJTkVMKSB7XG5cdFx0bmV3Tm9kZS5wYXJlbnQgPSBTRU5USU5FTDtcblx0XHRuZXdOb2RlLmxlZnQgPSBTRU5USU5FTDtcblx0XHRuZXdOb2RlLnJpZ2h0ID0gU0VOVElORUw7XG5cdFx0c2V0Tm9kZUNvbG9yKG5ld05vZGUsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0VC5yb290ID0gbmV3Tm9kZTtcblx0XHRyZXR1cm4gVC5yb290O1xuXHR9XG5cblx0dHJlZUluc2VydChULCBuZXdOb2RlKTtcblxuXHRyZWNvbXB1dGVNYXhFbmRXYWxrVG9Sb290KG5ld05vZGUucGFyZW50KTtcblxuXHQvLyByZXBhaXIgdHJlZVxuXHRsZXQgeCA9IG5ld05vZGU7XG5cdHdoaWxlICh4ICE9PSBULnJvb3QgJiYgZ2V0Tm9kZUNvbG9yKHgucGFyZW50KSA9PT0gTm9kZUNvbG9yLlJlZCkge1xuXHRcdGlmICh4LnBhcmVudCA9PT0geC5wYXJlbnQucGFyZW50LmxlZnQpIHtcblx0XHRcdGNvbnN0IHkgPSB4LnBhcmVudC5wYXJlbnQucmlnaHQ7XG5cblx0XHRcdGlmIChnZXROb2RlQ29sb3IoeSkgPT09IE5vZGVDb2xvci5SZWQpIHtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeSwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LnBhcmVudCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdHggPSB4LnBhcmVudC5wYXJlbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoeCA9PT0geC5wYXJlbnQucmlnaHQpIHtcblx0XHRcdFx0XHR4ID0geC5wYXJlbnQ7XG5cdFx0XHRcdFx0bGVmdFJvdGF0ZShULCB4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih4LnBhcmVudC5wYXJlbnQsIE5vZGVDb2xvci5SZWQpO1xuXHRcdFx0XHRyaWdodFJvdGF0ZShULCB4LnBhcmVudC5wYXJlbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB5ID0geC5wYXJlbnQucGFyZW50LmxlZnQ7XG5cblx0XHRcdGlmIChnZXROb2RlQ29sb3IoeSkgPT09IE5vZGVDb2xvci5SZWQpIHtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeSwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LnBhcmVudCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdHggPSB4LnBhcmVudC5wYXJlbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoeCA9PT0geC5wYXJlbnQubGVmdCkge1xuXHRcdFx0XHRcdHggPSB4LnBhcmVudDtcblx0XHRcdFx0XHRyaWdodFJvdGF0ZShULCB4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih4LnBhcmVudC5wYXJlbnQsIE5vZGVDb2xvci5SZWQpO1xuXHRcdFx0XHRsZWZ0Um90YXRlKFQsIHgucGFyZW50LnBhcmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0Tm9kZUNvbG9yKFQucm9vdCwgTm9kZUNvbG9yLkJsYWNrKTtcblxuXHRyZXR1cm4gbmV3Tm9kZTtcbn1cblxuZnVuY3Rpb24gdHJlZUluc2VydChUOiBJbnRlcnZhbFRyZWUsIHo6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHRsZXQgZGVsdGE6IG51bWJlciA9IDA7XG5cdGxldCB4ID0gVC5yb290O1xuXHRjb25zdCB6QWJzb2x1dGVTdGFydCA9IHouc3RhcnQ7XG5cdGNvbnN0IHpBYnNvbHV0ZUVuZCA9IHouZW5kO1xuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdGNvbnN0IGNtcCA9IGludGVydmFsQ29tcGFyZSh6QWJzb2x1dGVTdGFydCwgekFic29sdXRlRW5kLCB4LnN0YXJ0ICsgZGVsdGEsIHguZW5kICsgZGVsdGEpO1xuXHRcdGlmIChjbXAgPCAwKSB7XG5cdFx0XHQvLyB0aGlzIG5vZGUgc2hvdWxkIGJlIGluc2VydGVkIHRvIHRoZSBsZWZ0XG5cdFx0XHQvLyA9PiBpdCBpcyBub3QgYWZmZWN0ZWQgYnkgdGhlIG5vZGUncyBkZWx0YVxuXHRcdFx0aWYgKHgubGVmdCA9PT0gU0VOVElORUwpIHtcblx0XHRcdFx0ei5zdGFydCAtPSBkZWx0YTtcblx0XHRcdFx0ei5lbmQgLT0gZGVsdGE7XG5cdFx0XHRcdHoubWF4RW5kIC09IGRlbHRhO1xuXHRcdFx0XHR4LmxlZnQgPSB6O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHggPSB4LmxlZnQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHRoaXMgbm9kZSBzaG91bGQgYmUgaW5zZXJ0ZWQgdG8gdGhlIHJpZ2h0XG5cdFx0XHQvLyA9PiBpdCBpcyBub3QgYWZmZWN0ZWQgYnkgdGhlIG5vZGUncyBkZWx0YVxuXHRcdFx0aWYgKHgucmlnaHQgPT09IFNFTlRJTkVMKSB7XG5cdFx0XHRcdHouc3RhcnQgLT0gKGRlbHRhICsgeC5kZWx0YSk7XG5cdFx0XHRcdHouZW5kIC09IChkZWx0YSArIHguZGVsdGEpO1xuXHRcdFx0XHR6Lm1heEVuZCAtPSAoZGVsdGEgKyB4LmRlbHRhKTtcblx0XHRcdFx0eC5yaWdodCA9IHo7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVsdGEgKz0geC5kZWx0YTtcblx0XHRcdFx0eCA9IHgucmlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ei5wYXJlbnQgPSB4O1xuXHR6LmxlZnQgPSBTRU5USU5FTDtcblx0ei5yaWdodCA9IFNFTlRJTkVMO1xuXHRzZXROb2RlQ29sb3IoeiwgTm9kZUNvbG9yLlJlZCk7XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIERlbGV0aW9uXG5mdW5jdGlvbiByYlRyZWVEZWxldGUoVDogSW50ZXJ2YWxUcmVlLCB6OiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblxuXHRsZXQgeDogSW50ZXJ2YWxOb2RlO1xuXHRsZXQgeTogSW50ZXJ2YWxOb2RlO1xuXG5cdC8vIFJCLURFTEVURSBleGNlcHQgd2UgZG9uJ3Qgc3dhcCB6IGFuZCB5IGluIGNhc2UgYylcblx0Ly8gaS5lLiB3ZSBhbHdheXMgZGVsZXRlIHdoYXQncyBwb2ludGVkIGF0IGJ5IHouXG5cblx0aWYgKHoubGVmdCA9PT0gU0VOVElORUwpIHtcblx0XHR4ID0gei5yaWdodDtcblx0XHR5ID0gejtcblxuXHRcdC8vIHgncyBkZWx0YSBpcyBubyBsb25nZXIgaW5mbHVlbmNlZCBieSB6J3MgZGVsdGFcblx0XHR4LmRlbHRhICs9IHouZGVsdGE7XG5cdFx0aWYgKHguZGVsdGEgPCBDb25zdGFudHMuTUlOX1NBRkVfREVMVEEgfHwgeC5kZWx0YSA+IENvbnN0YW50cy5NQVhfU0FGRV9ERUxUQSkge1xuXHRcdFx0VC5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEgPSB0cnVlO1xuXHRcdH1cblx0XHR4LnN0YXJ0ICs9IHouZGVsdGE7XG5cdFx0eC5lbmQgKz0gei5kZWx0YTtcblxuXHR9IGVsc2UgaWYgKHoucmlnaHQgPT09IFNFTlRJTkVMKSB7XG5cdFx0eCA9IHoubGVmdDtcblx0XHR5ID0gejtcblxuXHR9IGVsc2Uge1xuXHRcdHkgPSBsZWZ0ZXN0KHoucmlnaHQpO1xuXHRcdHggPSB5LnJpZ2h0O1xuXG5cdFx0Ly8geSdzIGRlbHRhIGlzIG5vIGxvbmdlciBpbmZsdWVuY2VkIGJ5IHoncyBkZWx0YSxcblx0XHQvLyBidXQgd2UgZG9uJ3Qgd2FudCB0byB3YWxrIHRoZSBlbnRpcmUgcmlnaHQtaGFuZC1zaWRlIHN1YnRyZWUgb2YgeC5cblx0XHQvLyB3ZSB0aGVyZWZvcmUgbWFpbnRhaW4geidzIGRlbHRhIGluIHksIGFuZCBhZGp1c3Qgb25seSB4XG5cdFx0eC5zdGFydCArPSB5LmRlbHRhO1xuXHRcdHguZW5kICs9IHkuZGVsdGE7XG5cdFx0eC5kZWx0YSArPSB5LmRlbHRhO1xuXHRcdGlmICh4LmRlbHRhIDwgQ29uc3RhbnRzLk1JTl9TQUZFX0RFTFRBIHx8IHguZGVsdGEgPiBDb25zdGFudHMuTUFYX1NBRkVfREVMVEEpIHtcblx0XHRcdFQucmVxdWVzdE5vcm1hbGl6ZURlbHRhID0gdHJ1ZTtcblx0XHR9XG5cblx0XHR5LnN0YXJ0ICs9IHouZGVsdGE7XG5cdFx0eS5lbmQgKz0gei5kZWx0YTtcblx0XHR5LmRlbHRhID0gei5kZWx0YTtcblx0XHRpZiAoeS5kZWx0YSA8IENvbnN0YW50cy5NSU5fU0FGRV9ERUxUQSB8fCB5LmRlbHRhID4gQ29uc3RhbnRzLk1BWF9TQUZFX0RFTFRBKSB7XG5cdFx0XHRULnJlcXVlc3ROb3JtYWxpemVEZWx0YSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHkgPT09IFQucm9vdCkge1xuXHRcdFQucm9vdCA9IHg7XG5cdFx0c2V0Tm9kZUNvbG9yKHgsIE5vZGVDb2xvci5CbGFjayk7XG5cblx0XHR6LmRldGFjaCgpO1xuXHRcdHJlc2V0U2VudGluZWwoKTtcblx0XHRyZWNvbXB1dGVNYXhFbmQoeCk7XG5cdFx0VC5yb290LnBhcmVudCA9IFNFTlRJTkVMO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHlXYXNSZWQgPSAoZ2V0Tm9kZUNvbG9yKHkpID09PSBOb2RlQ29sb3IuUmVkKTtcblxuXHRpZiAoeSA9PT0geS5wYXJlbnQubGVmdCkge1xuXHRcdHkucGFyZW50LmxlZnQgPSB4O1xuXHR9IGVsc2Uge1xuXHRcdHkucGFyZW50LnJpZ2h0ID0geDtcblx0fVxuXG5cdGlmICh5ID09PSB6KSB7XG5cdFx0eC5wYXJlbnQgPSB5LnBhcmVudDtcblx0fSBlbHNlIHtcblxuXHRcdGlmICh5LnBhcmVudCA9PT0geikge1xuXHRcdFx0eC5wYXJlbnQgPSB5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR4LnBhcmVudCA9IHkucGFyZW50O1xuXHRcdH1cblxuXHRcdHkubGVmdCA9IHoubGVmdDtcblx0XHR5LnJpZ2h0ID0gei5yaWdodDtcblx0XHR5LnBhcmVudCA9IHoucGFyZW50O1xuXHRcdHNldE5vZGVDb2xvcih5LCBnZXROb2RlQ29sb3IoeikpO1xuXG5cdFx0aWYgKHogPT09IFQucm9vdCkge1xuXHRcdFx0VC5yb290ID0geTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHogPT09IHoucGFyZW50LmxlZnQpIHtcblx0XHRcdFx0ei5wYXJlbnQubGVmdCA9IHk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR6LnBhcmVudC5yaWdodCA9IHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHkubGVmdCAhPT0gU0VOVElORUwpIHtcblx0XHRcdHkubGVmdC5wYXJlbnQgPSB5O1xuXHRcdH1cblx0XHRpZiAoeS5yaWdodCAhPT0gU0VOVElORUwpIHtcblx0XHRcdHkucmlnaHQucGFyZW50ID0geTtcblx0XHR9XG5cdH1cblxuXHR6LmRldGFjaCgpO1xuXG5cdGlmICh5V2FzUmVkKSB7XG5cdFx0cmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdCh4LnBhcmVudCk7XG5cdFx0aWYgKHkgIT09IHopIHtcblx0XHRcdHJlY29tcHV0ZU1heEVuZFdhbGtUb1Jvb3QoeSk7XG5cdFx0XHRyZWNvbXB1dGVNYXhFbmRXYWxrVG9Sb290KHkucGFyZW50KTtcblx0XHR9XG5cdFx0cmVzZXRTZW50aW5lbCgpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJlY29tcHV0ZU1heEVuZFdhbGtUb1Jvb3QoeCk7XG5cdHJlY29tcHV0ZU1heEVuZFdhbGtUb1Jvb3QoeC5wYXJlbnQpO1xuXHRpZiAoeSAhPT0geikge1xuXHRcdHJlY29tcHV0ZU1heEVuZFdhbGtUb1Jvb3QoeSk7XG5cdFx0cmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdCh5LnBhcmVudCk7XG5cdH1cblxuXHQvLyBSQi1ERUxFVEUtRklYVVBcblx0bGV0IHc6IEludGVydmFsTm9kZTtcblx0d2hpbGUgKHggIT09IFQucm9vdCAmJiBnZXROb2RlQ29sb3IoeCkgPT09IE5vZGVDb2xvci5CbGFjaykge1xuXG5cdFx0aWYgKHggPT09IHgucGFyZW50LmxlZnQpIHtcblx0XHRcdHcgPSB4LnBhcmVudC5yaWdodDtcblxuXHRcdFx0aWYgKGdldE5vZGVDb2xvcih3KSA9PT0gTm9kZUNvbG9yLlJlZCkge1xuXHRcdFx0XHRzZXROb2RlQ29sb3IodywgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LCBOb2RlQ29sb3IuUmVkKTtcblx0XHRcdFx0bGVmdFJvdGF0ZShULCB4LnBhcmVudCk7XG5cdFx0XHRcdHcgPSB4LnBhcmVudC5yaWdodDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGdldE5vZGVDb2xvcih3LmxlZnQpID09PSBOb2RlQ29sb3IuQmxhY2sgJiYgZ2V0Tm9kZUNvbG9yKHcucmlnaHQpID09PSBOb2RlQ29sb3IuQmxhY2spIHtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHcsIE5vZGVDb2xvci5SZWQpO1xuXHRcdFx0XHR4ID0geC5wYXJlbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZ2V0Tm9kZUNvbG9yKHcucmlnaHQpID09PSBOb2RlQ29sb3IuQmxhY2spIHtcblx0XHRcdFx0XHRzZXROb2RlQ29sb3Iody5sZWZ0LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRcdHNldE5vZGVDb2xvcih3LCBOb2RlQ29sb3IuUmVkKTtcblx0XHRcdFx0XHRyaWdodFJvdGF0ZShULCB3KTtcblx0XHRcdFx0XHR3ID0geC5wYXJlbnQucmlnaHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXROb2RlQ29sb3IodywgZ2V0Tm9kZUNvbG9yKHgucGFyZW50KSk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih4LnBhcmVudCwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHcucmlnaHQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdGxlZnRSb3RhdGUoVCwgeC5wYXJlbnQpO1xuXHRcdFx0XHR4ID0gVC5yb290O1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHcgPSB4LnBhcmVudC5sZWZ0O1xuXG5cdFx0XHRpZiAoZ2V0Tm9kZUNvbG9yKHcpID09PSBOb2RlQ29sb3IuUmVkKSB7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih3LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5SZWQpO1xuXHRcdFx0XHRyaWdodFJvdGF0ZShULCB4LnBhcmVudCk7XG5cdFx0XHRcdHcgPSB4LnBhcmVudC5sZWZ0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZ2V0Tm9kZUNvbG9yKHcubGVmdCkgPT09IE5vZGVDb2xvci5CbGFjayAmJiBnZXROb2RlQ29sb3Iody5yaWdodCkgPT09IE5vZGVDb2xvci5CbGFjaykge1xuXHRcdFx0XHRzZXROb2RlQ29sb3IodywgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdHggPSB4LnBhcmVudDtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGdldE5vZGVDb2xvcih3LmxlZnQpID09PSBOb2RlQ29sb3IuQmxhY2spIHtcblx0XHRcdFx0XHRzZXROb2RlQ29sb3Iody5yaWdodCwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0XHRzZXROb2RlQ29sb3IodywgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdFx0bGVmdFJvdGF0ZShULCB3KTtcblx0XHRcdFx0XHR3ID0geC5wYXJlbnQubGVmdDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNldE5vZGVDb2xvcih3LCBnZXROb2RlQ29sb3IoeC5wYXJlbnQpKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3Iody5sZWZ0LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRyaWdodFJvdGF0ZShULCB4LnBhcmVudCk7XG5cdFx0XHRcdHggPSBULnJvb3Q7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0Tm9kZUNvbG9yKHgsIE5vZGVDb2xvci5CbGFjayk7XG5cdHJlc2V0U2VudGluZWwoKTtcbn1cblxuZnVuY3Rpb24gbGVmdGVzdChub2RlOiBJbnRlcnZhbE5vZGUpOiBJbnRlcnZhbE5vZGUge1xuXHR3aGlsZSAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCkge1xuXHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdH1cblx0cmV0dXJuIG5vZGU7XG59XG5cbmZ1bmN0aW9uIHJlc2V0U2VudGluZWwoKTogdm9pZCB7XG5cdFNFTlRJTkVMLnBhcmVudCA9IFNFTlRJTkVMO1xuXHRTRU5USU5FTC5kZWx0YSA9IDA7IC8vIG9wdGlvbmFsXG5cdFNFTlRJTkVMLnN0YXJ0ID0gMDsgLy8gb3B0aW9uYWxcblx0U0VOVElORUwuZW5kID0gMDsgLy8gb3B0aW9uYWxcbn1cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUm90YXRpb25zXG5mdW5jdGlvbiBsZWZ0Um90YXRlKFQ6IEludGVydmFsVHJlZSwgeDogSW50ZXJ2YWxOb2RlKTogdm9pZCB7XG5cdGNvbnN0IHkgPSB4LnJpZ2h0O1x0XHRcdFx0Ly8gc2V0IHkuXG5cblx0eS5kZWx0YSArPSB4LmRlbHRhO1x0XHRcdFx0Ly8geSdzIGRlbHRhIGlzIG5vIGxvbmdlciBpbmZsdWVuY2VkIGJ5IHgncyBkZWx0YVxuXHRpZiAoeS5kZWx0YSA8IENvbnN0YW50cy5NSU5fU0FGRV9ERUxUQSB8fCB5LmRlbHRhID4gQ29uc3RhbnRzLk1BWF9TQUZFX0RFTFRBKSB7XG5cdFx0VC5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEgPSB0cnVlO1xuXHR9XG5cdHkuc3RhcnQgKz0geC5kZWx0YTtcblx0eS5lbmQgKz0geC5kZWx0YTtcblxuXHR4LnJpZ2h0ID0geS5sZWZ0O1x0XHRcdFx0Ly8gdHVybiB5J3MgbGVmdCBzdWJ0cmVlIGludG8geCdzIHJpZ2h0IHN1YnRyZWUuXG5cdGlmICh5LmxlZnQgIT09IFNFTlRJTkVMKSB7XG5cdFx0eS5sZWZ0LnBhcmVudCA9IHg7XG5cdH1cblx0eS5wYXJlbnQgPSB4LnBhcmVudDtcdFx0XHQvLyBsaW5rIHgncyBwYXJlbnQgdG8geS5cblx0aWYgKHgucGFyZW50ID09PSBTRU5USU5FTCkge1xuXHRcdFQucm9vdCA9IHk7XG5cdH0gZWxzZSBpZiAoeCA9PT0geC5wYXJlbnQubGVmdCkge1xuXHRcdHgucGFyZW50LmxlZnQgPSB5O1xuXHR9IGVsc2Uge1xuXHRcdHgucGFyZW50LnJpZ2h0ID0geTtcblx0fVxuXG5cdHkubGVmdCA9IHg7XHRcdFx0XHRcdFx0Ly8gcHV0IHggb24geSdzIGxlZnQuXG5cdHgucGFyZW50ID0geTtcblxuXHRyZWNvbXB1dGVNYXhFbmQoeCk7XG5cdHJlY29tcHV0ZU1heEVuZCh5KTtcbn1cblxuZnVuY3Rpb24gcmlnaHRSb3RhdGUoVDogSW50ZXJ2YWxUcmVlLCB5OiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0Y29uc3QgeCA9IHkubGVmdDtcblxuXHR5LmRlbHRhIC09IHguZGVsdGE7XG5cdGlmICh5LmRlbHRhIDwgQ29uc3RhbnRzLk1JTl9TQUZFX0RFTFRBIHx8IHkuZGVsdGEgPiBDb25zdGFudHMuTUFYX1NBRkVfREVMVEEpIHtcblx0XHRULnJlcXVlc3ROb3JtYWxpemVEZWx0YSA9IHRydWU7XG5cdH1cblx0eS5zdGFydCAtPSB4LmRlbHRhO1xuXHR5LmVuZCAtPSB4LmRlbHRhO1xuXG5cdHkubGVmdCA9IHgucmlnaHQ7XG5cdGlmICh4LnJpZ2h0ICE9PSBTRU5USU5FTCkge1xuXHRcdHgucmlnaHQucGFyZW50ID0geTtcblx0fVxuXHR4LnBhcmVudCA9IHkucGFyZW50O1xuXHRpZiAoeS5wYXJlbnQgPT09IFNFTlRJTkVMKSB7XG5cdFx0VC5yb290ID0geDtcblx0fSBlbHNlIGlmICh5ID09PSB5LnBhcmVudC5yaWdodCkge1xuXHRcdHkucGFyZW50LnJpZ2h0ID0geDtcblx0fSBlbHNlIHtcblx0XHR5LnBhcmVudC5sZWZ0ID0geDtcblx0fVxuXG5cdHgucmlnaHQgPSB5O1xuXHR5LnBhcmVudCA9IHg7XG5cblx0cmVjb21wdXRlTWF4RW5kKHkpO1xuXHRyZWNvbXB1dGVNYXhFbmQoeCk7XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIG1heCBlbmQgY29tcHV0YXRpb25cblxuZnVuY3Rpb24gY29tcHV0ZU1heEVuZChub2RlOiBJbnRlcnZhbE5vZGUpOiBudW1iZXIge1xuXHRsZXQgbWF4RW5kID0gbm9kZS5lbmQ7XG5cdGlmIChub2RlLmxlZnQgIT09IFNFTlRJTkVMKSB7XG5cdFx0Y29uc3QgbGVmdE1heEVuZCA9IG5vZGUubGVmdC5tYXhFbmQ7XG5cdFx0aWYgKGxlZnRNYXhFbmQgPiBtYXhFbmQpIHtcblx0XHRcdG1heEVuZCA9IGxlZnRNYXhFbmQ7XG5cdFx0fVxuXHR9XG5cdGlmIChub2RlLnJpZ2h0ICE9PSBTRU5USU5FTCkge1xuXHRcdGNvbnN0IHJpZ2h0TWF4RW5kID0gbm9kZS5yaWdodC5tYXhFbmQgKyBub2RlLmRlbHRhO1xuXHRcdGlmIChyaWdodE1heEVuZCA+IG1heEVuZCkge1xuXHRcdFx0bWF4RW5kID0gcmlnaHRNYXhFbmQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBtYXhFbmQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWNvbXB1dGVNYXhFbmQobm9kZTogSW50ZXJ2YWxOb2RlKTogdm9pZCB7XG5cdG5vZGUubWF4RW5kID0gY29tcHV0ZU1heEVuZChub2RlKTtcbn1cblxuZnVuY3Rpb24gcmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdChub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cblx0XHRjb25zdCBtYXhFbmQgPSBjb21wdXRlTWF4RW5kKG5vZGUpO1xuXG5cdFx0aWYgKG5vZGUubWF4RW5kID09PSBtYXhFbmQpIHtcblx0XHRcdC8vIG5vIG5lZWQgdG8gZ28gZnVydGhlclxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG5vZGUubWF4RW5kID0gbWF4RW5kO1xuXHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHV0aWxzXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJ2YWxDb21wYXJlKGFTdGFydDogbnVtYmVyLCBhRW5kOiBudW1iZXIsIGJTdGFydDogbnVtYmVyLCBiRW5kOiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAoYVN0YXJ0ID09PSBiU3RhcnQpIHtcblx0XHRyZXR1cm4gYUVuZCAtIGJFbmQ7XG5cdH1cblx0cmV0dXJuIGFTdGFydCAtIGJTdGFydDtcbn1cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyw4QkFBc0Y7QUFPeEYsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBQ04sRUFBQUEsV0FBQSwwQkFBdUI7QUFDdkIsRUFBQUEsV0FBQSwwQkFBdUI7QUFDdkIsRUFBQUEsV0FBQSw2QkFBMEI7QUFDMUIsRUFBQUEsV0FBQSwyQkFBd0I7QUFDeEIsRUFBQUEsV0FBQSxpQ0FBOEI7QUFDOUIsRUFBQUEsV0FBQSx1Q0FBb0M7QUFDcEMsRUFBQUEsV0FBQSxzQ0FBbUM7QUFQbEIsU0FBQUE7QUFBQSxHQUFBO0FBVVgsSUFBVyxZQUFYLGtCQUFXQyxlQUFYO0FBQ04sRUFBQUEsc0JBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsc0JBQUEsU0FBTSxLQUFOO0FBRmlCLFNBQUFBO0FBQUEsR0FBQTtBQUtsQixJQUFXLFlBQVgsa0JBQVdDLGVBQVg7QUFDQyxFQUFBQSxzQkFBQSxlQUFZLEtBQVo7QUFDQSxFQUFBQSxzQkFBQSxzQkFBbUIsT0FBbkI7QUFDQSxFQUFBQSxzQkFBQSxpQkFBYyxLQUFkO0FBRUEsRUFBQUEsc0JBQUEsbUJBQWdCLEtBQWhCO0FBQ0EsRUFBQUEsc0JBQUEsMEJBQXVCLE9BQXZCO0FBQ0EsRUFBQUEsc0JBQUEscUJBQWtCLEtBQWxCO0FBRUEsRUFBQUEsc0JBQUEseUJBQXNCLEtBQXRCO0FBQ0EsRUFBQUEsc0JBQUEsZ0NBQTZCLE9BQTdCO0FBQ0EsRUFBQUEsc0JBQUEsMkJBQXdCLEtBQXhCO0FBRUEsRUFBQUEsc0JBQUEsb0JBQWlCLE1BQWpCO0FBQ0EsRUFBQUEsc0JBQUEsMkJBQXdCLE9BQXhCO0FBQ0EsRUFBQUEsc0JBQUEsc0JBQW1CLEtBQW5CO0FBRUEsRUFBQUEsc0JBQUEsK0JBQTRCLE1BQTVCO0FBQ0EsRUFBQUEsc0JBQUEsc0NBQW1DLE9BQW5DO0FBQ0EsRUFBQUEsc0JBQUEsaUNBQThCLEtBQTlCO0FBRUEsRUFBQUEsc0JBQUEsa0JBQWUsTUFBZjtBQUNBLEVBQUFBLHNCQUFBLHlCQUFzQixPQUF0QjtBQUNBLEVBQUFBLHNCQUFBLG9CQUFpQixLQUFqQjtBQUVBLEVBQUFBLHNCQUFBLHFCQUFrQixPQUFsQjtBQUNBLEVBQUFBLHNCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLHNCQUFBLHVCQUFvQixLQUFwQjtBQWVBLEVBQUFBLHNCQUFBLG9CQUFpQixlQUFqQjtBQU9BLEVBQUFBLHNCQUFBLG9CQUFpQixjQUFqQjtBQWpEVSxTQUFBQTtBQUFBLEdBQUE7QUFvREosU0FBUyxhQUFhLE1BQStCO0FBQzNELFVBQVMsS0FBSyxXQUFXLHVCQUF5QjtBQUNuRDtBQUNBLFNBQVMsYUFBYSxNQUFvQixPQUF3QjtBQUNqRSxPQUFLLFdBQ0gsS0FBSyxXQUFXLDZCQUErQixTQUFTO0FBRTNEO0FBQ0EsU0FBUyxpQkFBaUIsTUFBNkI7QUFDdEQsVUFBUyxLQUFLLFdBQVcsMkJBQTZCLDRCQUErQjtBQUN0RjtBQUNBLFNBQVMsaUJBQWlCLE1BQW9CLE9BQXNCO0FBQ25FLE9BQUssV0FDSCxLQUFLLFdBQVcsa0NBQW9DLFFBQVEsSUFBSSxNQUFNO0FBRXpFO0FBQ0EsU0FBUyx1QkFBdUIsTUFBNkI7QUFDNUQsVUFBUyxLQUFLLFdBQVcsaUNBQW1DLGtDQUFxQztBQUNsRztBQUNBLFNBQVMsdUJBQXVCLE1BQW9CLE9BQXNCO0FBQ3pFLE9BQUssV0FDSCxLQUFLLFdBQVcsd0NBQTBDLFFBQVEsSUFBSSxNQUFNO0FBRS9FO0FBQ0EsU0FBUyx1QkFBdUIsTUFBNkI7QUFDNUQsVUFBUyxLQUFLLFdBQVcsMkJBQTRCLDJCQUE4QjtBQUNwRjtBQUNBLFNBQVMsdUJBQXVCLE1BQW9CLE9BQXNCO0FBQ3pFLE9BQUssV0FDSCxLQUFLLFdBQVcsaUNBQW1DLFFBQVEsSUFBSSxNQUFNO0FBRXhFO0FBQ0EsU0FBUyxtQkFBbUIsTUFBNkI7QUFDeEQsVUFBUyxLQUFLLFdBQVcsK0JBQStCLDhCQUFpQztBQUMxRjtBQUNBLFNBQVMsbUJBQW1CLE1BQW9CLE9BQXNCO0FBQ3JFLE9BQUssV0FDSCxLQUFLLFdBQVcsb0NBQXNDLFFBQVEsSUFBSSxNQUFNO0FBRTNFO0FBQ0EsU0FBUyxrQkFBa0IsTUFBNEM7QUFDdEUsVUFBUyxLQUFLLFdBQVcsNkJBQThCO0FBQ3hEO0FBQ0EsU0FBUyxtQkFBbUIsTUFBb0IsWUFBMEM7QUFDekYsT0FBSyxXQUNILEtBQUssV0FBVyxrQ0FBb0MsY0FBYztBQUVyRTtBQUNBLFNBQVMseUJBQXlCLE1BQTZCO0FBQzlELFVBQVMsS0FBSyxXQUFXLHdDQUF5Qyx3Q0FBMkM7QUFDOUc7QUFDQSxTQUFTLHlCQUF5QixNQUFvQixPQUFzQjtBQUMzRSxPQUFLLFdBQ0gsS0FBSyxXQUFXLDhDQUFnRCxRQUFRLElBQUksTUFBTTtBQUVyRjtBQUNPLFNBQVMsa0JBQWtCLE1BQW9CLFlBQWdEO0FBQ3JHLHFCQUFtQixNQUFjLFVBQVU7QUFDNUM7QUFFTyxNQUFNLGFBQWE7QUFBQSxFQXlCekIsWUFBWSxJQUFZLE9BQWUsS0FBYTtBQUNuRCxTQUFLLFdBQVc7QUFFaEIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxPQUFPO0FBQ1osU0FBSyxRQUFRO0FBQ2IsaUJBQWEsTUFBTSxXQUFhO0FBRWhDLFNBQUssUUFBUTtBQUNiLFNBQUssTUFBTTtBQUVYLFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUVkLFNBQUssS0FBSztBQUNWLFNBQUssVUFBVTtBQUNmLFNBQUssVUFBVTtBQUNmLDJCQUF1QixNQUFNLEtBQUs7QUFDbEMsMkJBQXVCLE1BQU0sS0FBSztBQUNsQyx1QkFBbUIsTUFBTSx1QkFBdUIsMkJBQTJCO0FBQzNFLDZCQUF5QixNQUFNLEtBQUs7QUFDcEMsdUJBQW1CLE1BQU0sS0FBSztBQUU5QixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLFFBQVE7QUFFYixxQkFBaUIsTUFBTSxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUVPLE1BQU0sV0FBbUIsT0FBZSxLQUFhLE9BQW9CO0FBQy9FLFNBQUssUUFBUTtBQUNiLFNBQUssTUFBTTtBQUNYLFNBQUssU0FBUztBQUNkLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVPLFdBQVcsU0FBaUM7QUFDbEQsU0FBSyxVQUFVO0FBQ2YsVUFBTSxZQUFZLEtBQUssUUFBUTtBQUMvQiwyQkFBdUIsTUFDdEIsY0FBYyxnREFDWCxjQUFjLG9EQUNkLGNBQWMsMENBQ2pCO0FBQ0QsMkJBQXVCLE1BQU0sS0FBSyxRQUFRLHlCQUF5QixJQUFJO0FBQ3ZFLHVCQUFtQixNQUFjLEtBQUssUUFBUSxVQUFVO0FBQ3hELDZCQUF5QixNQUFNLEtBQUssUUFBUSxxQkFBcUI7QUFDakUsdUJBQW1CLE1BQU0sS0FBSyxRQUFRLGVBQWUsS0FBSztBQUFBLEVBQzNEO0FBQUEsRUFFTyxpQkFBaUIsZUFBdUIsYUFBcUIsaUJBQStCO0FBQ2xHLFFBQUksS0FBSyxvQkFBb0IsaUJBQWlCO0FBQzdDLFdBQUssUUFBUTtBQUFBLElBQ2Q7QUFDQSxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFTyxTQUFlO0FBQ3JCLFNBQUssU0FBUztBQUNkLFNBQUssT0FBTztBQUNaLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFDRDtBQUVPLE1BQU0sV0FBeUIsSUFBSSxhQUFhLE1BQU8sR0FBRyxDQUFDO0FBQ2xFLFNBQVMsU0FBUztBQUNsQixTQUFTLE9BQU87QUFDaEIsU0FBUyxRQUFRO0FBQ2pCLGFBQWEsVUFBVSxhQUFlO0FBRS9CLE1BQU0sYUFBYTtBQUFBLEVBS3pCLGNBQWM7QUFDYixTQUFLLE9BQU87QUFDWixTQUFLLHdCQUF3QjtBQUFBLEVBQzlCO0FBQUEsRUFFTyxlQUFlLE9BQWUsS0FBYSxlQUF1QixxQkFBOEIsdUJBQWdDLGlCQUF5Qix1QkFBZ0Q7QUFDL00sUUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsV0FBTyxlQUFlLE1BQU0sT0FBTyxLQUFLLGVBQWUscUJBQXFCLHVCQUF1QixpQkFBaUIscUJBQXFCO0FBQUEsRUFDMUk7QUFBQSxFQUVPLE9BQU8sZUFBdUIscUJBQThCLHVCQUFnQyxpQkFBeUIsdUJBQWdEO0FBQzNLLFFBQUksS0FBSyxTQUFTLFVBQVU7QUFDM0IsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFdBQU8sT0FBTyxNQUFNLGVBQWUscUJBQXFCLHVCQUF1QixpQkFBaUIscUJBQXFCO0FBQUEsRUFDdEg7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLHNCQUFzQixTQUFpQztBQUM3RCxXQUFPLHNCQUFzQixNQUFNLE9BQU87QUFBQSxFQUMzQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sd0JBQXdDO0FBQzlDLFdBQU8sc0JBQXNCLElBQUk7QUFBQSxFQUNsQztBQUFBLEVBRU8sT0FBTyxNQUEwQjtBQUN2QyxpQkFBYSxNQUFNLElBQUk7QUFDdkIsU0FBSywyQkFBMkI7QUFBQSxFQUNqQztBQUFBLEVBRU8sT0FBTyxNQUEwQjtBQUN2QyxpQkFBYSxNQUFNLElBQUk7QUFDdkIsU0FBSywyQkFBMkI7QUFBQSxFQUNqQztBQUFBLEVBRU8sWUFBWSxNQUFvQixpQkFBK0I7QUFDckUsVUFBTSxjQUFjO0FBQ3BCLFFBQUksUUFBUTtBQUNaLFdBQU8sU0FBUyxLQUFLLE1BQU07QUFDMUIsVUFBSSxTQUFTLEtBQUssT0FBTyxPQUFPO0FBQy9CLGlCQUFTLEtBQUssT0FBTztBQUFBLE1BQ3RCO0FBQ0EsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUVBLFVBQU0sWUFBWSxZQUFZLFFBQVE7QUFDdEMsVUFBTSxVQUFVLFlBQVksTUFBTTtBQUNsQyxnQkFBWSxpQkFBaUIsV0FBVyxTQUFTLGVBQWU7QUFBQSxFQUNqRTtBQUFBLEVBRU8sY0FBYyxRQUFnQixRQUFnQixZQUFvQixrQkFBaUM7QUFJekcsVUFBTSxrQkFBa0IsaUJBQWlCLE1BQU0sUUFBUSxTQUFTLE1BQU07QUFHdEUsYUFBUyxJQUFJLEdBQUcsTUFBTSxnQkFBZ0IsUUFBUSxJQUFJLEtBQUssS0FBSztBQUMzRCxZQUFNLE9BQU8sZ0JBQWdCLENBQUM7QUFDOUIsbUJBQWEsTUFBTSxJQUFJO0FBQUEsSUFDeEI7QUFDQSxTQUFLLDJCQUEyQjtBQUdoQyxxQkFBaUIsTUFBTSxRQUFRLFNBQVMsUUFBUSxVQUFVO0FBQzFELFNBQUssMkJBQTJCO0FBR2hDLGFBQVMsSUFBSSxHQUFHLE1BQU0sZ0JBQWdCLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDM0QsWUFBTSxPQUFPLGdCQUFnQixDQUFDO0FBQzlCLFdBQUssUUFBUSxLQUFLO0FBQ2xCLFdBQUssTUFBTSxLQUFLO0FBQ2hCLHFCQUFlLE1BQU0sUUFBUyxTQUFTLFFBQVMsWUFBWSxnQkFBZ0I7QUFDNUUsV0FBSyxTQUFTLEtBQUs7QUFDbkIsbUJBQWEsTUFBTSxJQUFJO0FBQUEsSUFDeEI7QUFDQSxTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFFTyxnQkFBZ0M7QUFDdEMsV0FBTyxPQUFPLE1BQU0sR0FBRyxPQUFPLE9BQU8sR0FBRyxLQUFLO0FBQUEsRUFDOUM7QUFBQSxFQUVRLDZCQUFtQztBQUMxQyxRQUFJLENBQUMsS0FBSyx1QkFBdUI7QUFDaEM7QUFBQSxJQUNEO0FBQ0EsU0FBSyx3QkFBd0I7QUFDN0IsbUJBQWUsSUFBSTtBQUFBLEVBQ3BCO0FBQ0Q7QUFHQSxTQUFTLGVBQWUsR0FBdUI7QUFDOUMsTUFBSSxPQUFPLEVBQUU7QUFDYixNQUFJLFFBQVE7QUFDWixTQUFPLFNBQVMsVUFBVTtBQUV6QixRQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsaUJBQWlCLEtBQUssSUFBSSxHQUFHO0FBRTNELGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxVQUFVLFlBQVksQ0FBQyxpQkFBaUIsS0FBSyxLQUFLLEdBQUc7QUFFN0QsZUFBUyxLQUFLO0FBQ2QsYUFBTyxLQUFLO0FBQ1o7QUFBQSxJQUNEO0FBR0EsU0FBSyxRQUFRLFFBQVEsS0FBSztBQUMxQixTQUFLLE1BQU0sUUFBUSxLQUFLO0FBQ3hCLFNBQUssUUFBUTtBQUNiLG9CQUFnQixJQUFJO0FBRXBCLHFCQUFpQixNQUFNLElBQUk7QUFHM0IscUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQ2pDLHFCQUFpQixLQUFLLE9BQU8sS0FBSztBQUNsQyxRQUFJLFNBQVMsS0FBSyxPQUFPLE9BQU87QUFDL0IsZUFBUyxLQUFLLE9BQU87QUFBQSxJQUN0QjtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFFQSxtQkFBaUIsRUFBRSxNQUFNLEtBQUs7QUFDL0I7QUFLQSxJQUFXLHNCQUFYLGtCQUFXQyx5QkFBWDtBQUNDLEVBQUFBLDBDQUFBLG1CQUFnQixLQUFoQjtBQUNBLEVBQUFBLDBDQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLDBDQUFBLGVBQVksS0FBWjtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQU1YLFNBQVMseUJBQXlCLGNBQXNCLGdDQUF5QyxhQUFxQixlQUE2QztBQUNsSyxNQUFJLGVBQWUsYUFBYTtBQUMvQixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksZUFBZSxhQUFhO0FBQy9CLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxrQkFBa0IsbUJBQStCO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxrQkFBa0IsbUJBQStCO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBTU8sU0FBUyxlQUFlLE1BQW9CLE9BQWUsS0FBYSxZQUFvQixrQkFBaUM7QUFDbkksUUFBTSxpQkFBaUIsa0JBQWtCLElBQUk7QUFDN0MsUUFBTSxnQ0FDTCxtQkFBbUIsdUJBQXVCLGdDQUN2QyxtQkFBbUIsdUJBQXVCO0FBRTlDLFFBQU0sOEJBQ0wsbUJBQW1CLHVCQUF1QiwrQkFDdkMsbUJBQW1CLHVCQUF1QjtBQUc5QyxRQUFNLGNBQWUsTUFBTTtBQUMzQixRQUFNLGVBQWU7QUFDckIsUUFBTSxlQUFlLEtBQUssSUFBSSxhQUFhLFlBQVk7QUFFdkQsUUFBTSxZQUFZLEtBQUs7QUFDdkIsTUFBSSxZQUFZO0FBRWhCLFFBQU0sVUFBVSxLQUFLO0FBQ3JCLE1BQUksVUFBVTtBQUVkLE1BQUksU0FBUyxhQUFhLFdBQVcsT0FBTyx5QkFBeUIsSUFBSSxHQUFHO0FBRzNFLFNBQUssUUFBUTtBQUNiLGdCQUFZO0FBQ1osU0FBSyxNQUFNO0FBQ1gsY0FBVTtBQUFBLEVBQ1g7QUFFQTtBQUNDLFVBQU0sZ0JBQWdCLG1CQUFtQixvQkFBaUMsY0FBYyxJQUFJLG9CQUFnQztBQUM1SCxRQUFJLENBQUMsYUFBYSx5QkFBeUIsV0FBVywrQkFBK0IsT0FBTyxhQUFhLEdBQUc7QUFDM0csa0JBQVk7QUFBQSxJQUNiO0FBQ0EsUUFBSSxDQUFDLFdBQVcseUJBQXlCLFNBQVMsNkJBQTZCLE9BQU8sYUFBYSxHQUFHO0FBQ3JHLGdCQUFVO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFFQSxNQUFJLGVBQWUsS0FBSyxDQUFDLGtCQUFrQjtBQUMxQyxVQUFNLGdCQUFpQixjQUFjLGVBQWUsb0JBQWdDO0FBQ3BGLFFBQUksQ0FBQyxhQUFhLHlCQUF5QixXQUFXLCtCQUErQixRQUFRLGNBQWMsYUFBYSxHQUFHO0FBQzFILGtCQUFZO0FBQUEsSUFDYjtBQUNBLFFBQUksQ0FBQyxXQUFXLHlCQUF5QixTQUFTLDZCQUE2QixRQUFRLGNBQWMsYUFBYSxHQUFHO0FBQ3BILGdCQUFVO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFFQTtBQUNDLFVBQU0sZ0JBQWdCLG1CQUFtQixvQkFBZ0M7QUFDekUsUUFBSSxDQUFDLGFBQWEseUJBQXlCLFdBQVcsK0JBQStCLEtBQUssYUFBYSxHQUFHO0FBQ3pHLFdBQUssUUFBUSxRQUFRO0FBQ3JCLGtCQUFZO0FBQUEsSUFDYjtBQUNBLFFBQUksQ0FBQyxXQUFXLHlCQUF5QixTQUFTLDZCQUE2QixLQUFLLGFBQWEsR0FBRztBQUNuRyxXQUFLLE1BQU0sUUFBUTtBQUNuQixnQkFBVTtBQUFBLElBQ1g7QUFBQSxFQUNEO0FBR0EsUUFBTSxjQUFlLGVBQWU7QUFDcEMsTUFBSSxDQUFDLFdBQVc7QUFDZixTQUFLLFFBQVEsS0FBSyxJQUFJLEdBQUcsWUFBWSxXQUFXO0FBQUEsRUFDakQ7QUFDQSxNQUFJLENBQUMsU0FBUztBQUNiLFNBQUssTUFBTSxLQUFLLElBQUksR0FBRyxVQUFVLFdBQVc7QUFBQSxFQUM3QztBQUVBLE1BQUksS0FBSyxRQUFRLEtBQUssS0FBSztBQUMxQixTQUFLLE1BQU0sS0FBSztBQUFBLEVBQ2pCO0FBQ0Q7QUFFQSxTQUFTLGlCQUFpQixHQUFpQixPQUFlLEtBQTZCO0FBT3RGLE1BQUksT0FBTyxFQUFFO0FBQ2IsTUFBSSxRQUFRO0FBQ1osTUFBSSxhQUFhO0FBQ2pCLE1BQUksWUFBWTtBQUNoQixNQUFJLFVBQVU7QUFDZCxRQUFNLFNBQXlCLENBQUM7QUFDaEMsTUFBSSxZQUFZO0FBQ2hCLFNBQU8sU0FBUyxVQUFVO0FBQ3pCLFFBQUksaUJBQWlCLElBQUksR0FBRztBQUUzQix1QkFBaUIsS0FBSyxNQUFNLEtBQUs7QUFDakMsdUJBQWlCLEtBQUssT0FBTyxLQUFLO0FBQ2xDLFVBQUksU0FBUyxLQUFLLE9BQU8sT0FBTztBQUMvQixpQkFBUyxLQUFLLE9BQU87QUFBQSxNQUN0QjtBQUNBLGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxpQkFBaUIsS0FBSyxJQUFJLEdBQUc7QUFFakMsbUJBQWEsUUFBUSxLQUFLO0FBQzFCLFVBQUksYUFBYSxPQUFPO0FBR3ZCLHlCQUFpQixNQUFNLElBQUk7QUFDM0I7QUFBQSxNQUNEO0FBRUEsVUFBSSxLQUFLLFNBQVMsVUFBVTtBQUUzQixlQUFPLEtBQUs7QUFDWjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsZ0JBQVksUUFBUSxLQUFLO0FBQ3pCLFFBQUksWUFBWSxLQUFLO0FBR3BCLHVCQUFpQixNQUFNLElBQUk7QUFDM0I7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRLEtBQUs7QUFDdkIsUUFBSSxXQUFXLE9BQU87QUFDckIsV0FBSyxpQkFBaUIsV0FBVyxTQUFTLENBQUM7QUFDM0MsYUFBTyxXQUFXLElBQUk7QUFBQSxJQUN2QjtBQUNBLHFCQUFpQixNQUFNLElBQUk7QUFFM0IsUUFBSSxLQUFLLFVBQVUsWUFBWSxDQUFDLGlCQUFpQixLQUFLLEtBQUssR0FBRztBQUU3RCxlQUFTLEtBQUs7QUFDZCxhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsbUJBQWlCLEVBQUUsTUFBTSxLQUFLO0FBRTlCLFNBQU87QUFDUjtBQUVBLFNBQVMsaUJBQWlCLEdBQWlCLE9BQWUsS0FBYSxZQUEwQjtBQU9oRyxNQUFJLE9BQU8sRUFBRTtBQUNiLE1BQUksUUFBUTtBQUNaLE1BQUksYUFBYTtBQUNqQixNQUFJLFlBQVk7QUFDaEIsUUFBTSxZQUFhLGNBQWMsTUFBTTtBQUN2QyxTQUFPLFNBQVMsVUFBVTtBQUN6QixRQUFJLGlCQUFpQixJQUFJLEdBQUc7QUFFM0IsdUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQ2pDLHVCQUFpQixLQUFLLE9BQU8sS0FBSztBQUNsQyxVQUFJLFNBQVMsS0FBSyxPQUFPLE9BQU87QUFDL0IsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFDQSxzQkFBZ0IsSUFBSTtBQUNwQixhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsaUJBQWlCLEtBQUssSUFBSSxHQUFHO0FBRWpDLG1CQUFhLFFBQVEsS0FBSztBQUMxQixVQUFJLGFBQWEsT0FBTztBQUd2Qix5QkFBaUIsTUFBTSxJQUFJO0FBQzNCO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSyxTQUFTLFVBQVU7QUFFM0IsZUFBTyxLQUFLO0FBQ1o7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLGdCQUFZLFFBQVEsS0FBSztBQUN6QixRQUFJLFlBQVksS0FBSztBQUNwQixXQUFLLFNBQVM7QUFDZCxXQUFLLE9BQU87QUFDWixXQUFLLFNBQVM7QUFDZCxVQUFJLEtBQUssUUFBUSxvQ0FBNEIsS0FBSyxRQUFRLGlDQUEwQjtBQUNuRixVQUFFLHdCQUF3QjtBQUFBLE1BQzNCO0FBR0EsdUJBQWlCLE1BQU0sSUFBSTtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxxQkFBaUIsTUFBTSxJQUFJO0FBRTNCLFFBQUksS0FBSyxVQUFVLFlBQVksQ0FBQyxpQkFBaUIsS0FBSyxLQUFLLEdBQUc7QUFFN0QsZUFBUyxLQUFLO0FBQ2QsYUFBTyxLQUFLO0FBQ1o7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLG1CQUFpQixFQUFFLE1BQU0sS0FBSztBQUMvQjtBQU1BLFNBQVMsc0JBQXNCLEdBQWlCLFNBQWlDO0FBQ2hGLE1BQUksT0FBTyxFQUFFO0FBQ2IsUUFBTSxTQUF5QixDQUFDO0FBQ2hDLE1BQUksWUFBWTtBQUNoQixTQUFPLFNBQVMsVUFBVTtBQUN6QixRQUFJLGlCQUFpQixJQUFJLEdBQUc7QUFFM0IsdUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQ2pDLHVCQUFpQixLQUFLLE9BQU8sS0FBSztBQUNsQyxhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsaUJBQWlCLEtBQUssSUFBSSxHQUFHO0FBRTNELGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxZQUFZLFNBQVM7QUFDN0IsYUFBTyxXQUFXLElBQUk7QUFBQSxJQUN2QjtBQUVBLHFCQUFpQixNQUFNLElBQUk7QUFFM0IsUUFBSSxLQUFLLFVBQVUsWUFBWSxDQUFDLGlCQUFpQixLQUFLLEtBQUssR0FBRztBQUU3RCxhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsbUJBQWlCLEVBQUUsTUFBTSxLQUFLO0FBRTlCLFNBQU87QUFDUjtBQUVBLFNBQVMsc0JBQXNCLEdBQWlDO0FBQy9ELE1BQUksT0FBTyxFQUFFO0FBQ2IsUUFBTSxTQUF5QixDQUFDO0FBQ2hDLE1BQUksWUFBWTtBQUNoQixTQUFPLFNBQVMsVUFBVTtBQUN6QixRQUFJLGlCQUFpQixJQUFJLEdBQUc7QUFFM0IsdUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQ2pDLHVCQUFpQixLQUFLLE9BQU8sS0FBSztBQUNsQyxhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsaUJBQWlCLEtBQUssSUFBSSxHQUFHO0FBRTNELGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxVQUFVLFlBQVksQ0FBQyxpQkFBaUIsS0FBSyxLQUFLLEdBQUc7QUFFN0QsYUFBTyxLQUFLO0FBQ1o7QUFBQSxJQUNEO0FBR0EsV0FBTyxXQUFXLElBQUk7QUFDdEIscUJBQWlCLE1BQU0sSUFBSTtBQUFBLEVBQzVCO0FBRUEsbUJBQWlCLEVBQUUsTUFBTSxLQUFLO0FBRTlCLFNBQU87QUFDUjtBQUVBLFNBQVMsT0FBTyxHQUFpQixlQUF1QixxQkFBOEIsdUJBQWdDLGlCQUF5Qix1QkFBZ0Q7QUFDOUwsTUFBSSxPQUFPLEVBQUU7QUFDYixNQUFJLFFBQVE7QUFDWixNQUFJLFlBQVk7QUFDaEIsTUFBSSxVQUFVO0FBQ2QsUUFBTSxTQUF5QixDQUFDO0FBQ2hDLE1BQUksWUFBWTtBQUNoQixTQUFPLFNBQVMsVUFBVTtBQUN6QixRQUFJLGlCQUFpQixJQUFJLEdBQUc7QUFFM0IsdUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQ2pDLHVCQUFpQixLQUFLLE9BQU8sS0FBSztBQUNsQyxVQUFJLFNBQVMsS0FBSyxPQUFPLE9BQU87QUFDL0IsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFDQSxhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsaUJBQWlCLEtBQUssSUFBSSxHQUFHO0FBRTNELGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUdBLGdCQUFZLFFBQVEsS0FBSztBQUN6QixjQUFVLFFBQVEsS0FBSztBQUV2QixTQUFLLGlCQUFpQixXQUFXLFNBQVMsZUFBZTtBQUV6RCxRQUFJLFVBQVU7QUFDZCxRQUFJLGlCQUFpQixLQUFLLFdBQVcsS0FBSyxZQUFZLGVBQWU7QUFDcEUsZ0JBQVU7QUFBQSxJQUNYO0FBQ0EsUUFBSSx1QkFBdUIsdUJBQXVCLElBQUksR0FBRztBQUN4RCxnQkFBVTtBQUFBLElBQ1g7QUFDQSxRQUFJLHlCQUF5QixtQkFBbUIsSUFBSSxHQUFHO0FBQ3RELGdCQUFVO0FBQUEsSUFDWDtBQUNBLFFBQUkseUJBQXlCLENBQUMsdUJBQXVCLElBQUksR0FBRztBQUMzRCxnQkFBVTtBQUFBLElBQ1g7QUFFQSxRQUFJLFNBQVM7QUFDWixhQUFPLFdBQVcsSUFBSTtBQUFBLElBQ3ZCO0FBRUEscUJBQWlCLE1BQU0sSUFBSTtBQUUzQixRQUFJLEtBQUssVUFBVSxZQUFZLENBQUMsaUJBQWlCLEtBQUssS0FBSyxHQUFHO0FBRTdELGVBQVMsS0FBSztBQUNkLGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxtQkFBaUIsRUFBRSxNQUFNLEtBQUs7QUFFOUIsU0FBTztBQUNSO0FBRUEsU0FBUyxlQUFlLEdBQWlCLGVBQXVCLGFBQXFCLGVBQXVCLHFCQUE4Qix1QkFBZ0MsaUJBQXlCLHVCQUFnRDtBQVFsUCxNQUFJLE9BQU8sRUFBRTtBQUNiLE1BQUksUUFBUTtBQUNaLE1BQUksYUFBYTtBQUNqQixNQUFJLFlBQVk7QUFDaEIsTUFBSSxVQUFVO0FBQ2QsUUFBTSxTQUF5QixDQUFDO0FBQ2hDLE1BQUksWUFBWTtBQUNoQixTQUFPLFNBQVMsVUFBVTtBQUN6QixRQUFJLGlCQUFpQixJQUFJLEdBQUc7QUFFM0IsdUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQ2pDLHVCQUFpQixLQUFLLE9BQU8sS0FBSztBQUNsQyxVQUFJLFNBQVMsS0FBSyxPQUFPLE9BQU87QUFDL0IsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFDQSxhQUFPLEtBQUs7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsaUJBQWlCLEtBQUssSUFBSSxHQUFHO0FBRWpDLG1CQUFhLFFBQVEsS0FBSztBQUMxQixVQUFJLGFBQWEsZUFBZTtBQUcvQix5QkFBaUIsTUFBTSxJQUFJO0FBQzNCO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSyxTQUFTLFVBQVU7QUFFM0IsZUFBTyxLQUFLO0FBQ1o7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLGdCQUFZLFFBQVEsS0FBSztBQUN6QixRQUFJLFlBQVksYUFBYTtBQUc1Qix1QkFBaUIsTUFBTSxJQUFJO0FBQzNCO0FBQUEsSUFDRDtBQUVBLGNBQVUsUUFBUSxLQUFLO0FBRXZCLFFBQUksV0FBVyxlQUFlO0FBRTdCLFdBQUssaUJBQWlCLFdBQVcsU0FBUyxlQUFlO0FBRXpELFVBQUksVUFBVTtBQUNkLFVBQUksaUJBQWlCLEtBQUssV0FBVyxLQUFLLFlBQVksZUFBZTtBQUNwRSxrQkFBVTtBQUFBLE1BQ1g7QUFDQSxVQUFJLHVCQUF1Qix1QkFBdUIsSUFBSSxHQUFHO0FBQ3hELGtCQUFVO0FBQUEsTUFDWDtBQUNBLFVBQUkseUJBQXlCLG1CQUFtQixJQUFJLEdBQUc7QUFDdEQsa0JBQVU7QUFBQSxNQUNYO0FBQ0EsVUFBSSx5QkFBeUIsQ0FBQyx1QkFBdUIsSUFBSSxHQUFHO0FBQzNELGtCQUFVO0FBQUEsTUFDWDtBQUVBLFVBQUksU0FBUztBQUNaLGVBQU8sV0FBVyxJQUFJO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBRUEscUJBQWlCLE1BQU0sSUFBSTtBQUUzQixRQUFJLEtBQUssVUFBVSxZQUFZLENBQUMsaUJBQWlCLEtBQUssS0FBSyxHQUFHO0FBRTdELGVBQVMsS0FBSztBQUNkLGFBQU8sS0FBSztBQUNaO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxtQkFBaUIsRUFBRSxNQUFNLEtBQUs7QUFFOUIsU0FBTztBQUNSO0FBS0EsU0FBUyxhQUFhLEdBQWlCLFNBQXFDO0FBQzNFLE1BQUksRUFBRSxTQUFTLFVBQVU7QUFDeEIsWUFBUSxTQUFTO0FBQ2pCLFlBQVEsT0FBTztBQUNmLFlBQVEsUUFBUTtBQUNoQixpQkFBYSxTQUFTLGFBQWU7QUFDckMsTUFBRSxPQUFPO0FBQ1QsV0FBTyxFQUFFO0FBQUEsRUFDVjtBQUVBLGFBQVcsR0FBRyxPQUFPO0FBRXJCLDRCQUEwQixRQUFRLE1BQU07QUFHeEMsTUFBSSxJQUFJO0FBQ1IsU0FBTyxNQUFNLEVBQUUsUUFBUSxhQUFhLEVBQUUsTUFBTSxNQUFNLGFBQWU7QUFDaEUsUUFBSSxFQUFFLFdBQVcsRUFBRSxPQUFPLE9BQU8sTUFBTTtBQUN0QyxZQUFNLElBQUksRUFBRSxPQUFPLE9BQU87QUFFMUIsVUFBSSxhQUFhLENBQUMsTUFBTSxhQUFlO0FBQ3RDLHFCQUFhLEVBQUUsUUFBUSxhQUFlO0FBQ3RDLHFCQUFhLEdBQUcsYUFBZTtBQUMvQixxQkFBYSxFQUFFLE9BQU8sUUFBUSxXQUFhO0FBQzNDLFlBQUksRUFBRSxPQUFPO0FBQUEsTUFDZCxPQUFPO0FBQ04sWUFBSSxNQUFNLEVBQUUsT0FBTyxPQUFPO0FBQ3pCLGNBQUksRUFBRTtBQUNOLHFCQUFXLEdBQUcsQ0FBQztBQUFBLFFBQ2hCO0FBQ0EscUJBQWEsRUFBRSxRQUFRLGFBQWU7QUFDdEMscUJBQWEsRUFBRSxPQUFPLFFBQVEsV0FBYTtBQUMzQyxvQkFBWSxHQUFHLEVBQUUsT0FBTyxNQUFNO0FBQUEsTUFDL0I7QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLElBQUksRUFBRSxPQUFPLE9BQU87QUFFMUIsVUFBSSxhQUFhLENBQUMsTUFBTSxhQUFlO0FBQ3RDLHFCQUFhLEVBQUUsUUFBUSxhQUFlO0FBQ3RDLHFCQUFhLEdBQUcsYUFBZTtBQUMvQixxQkFBYSxFQUFFLE9BQU8sUUFBUSxXQUFhO0FBQzNDLFlBQUksRUFBRSxPQUFPO0FBQUEsTUFDZCxPQUFPO0FBQ04sWUFBSSxNQUFNLEVBQUUsT0FBTyxNQUFNO0FBQ3hCLGNBQUksRUFBRTtBQUNOLHNCQUFZLEdBQUcsQ0FBQztBQUFBLFFBQ2pCO0FBQ0EscUJBQWEsRUFBRSxRQUFRLGFBQWU7QUFDdEMscUJBQWEsRUFBRSxPQUFPLFFBQVEsV0FBYTtBQUMzQyxtQkFBVyxHQUFHLEVBQUUsT0FBTyxNQUFNO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLGVBQWEsRUFBRSxNQUFNLGFBQWU7QUFFcEMsU0FBTztBQUNSO0FBRUEsU0FBUyxXQUFXLEdBQWlCLEdBQXVCO0FBQzNELE1BQUksUUFBZ0I7QUFDcEIsTUFBSSxJQUFJLEVBQUU7QUFDVixRQUFNLGlCQUFpQixFQUFFO0FBQ3pCLFFBQU0sZUFBZSxFQUFFO0FBQ3ZCLFNBQU8sTUFBTTtBQUNaLFVBQU0sTUFBTSxnQkFBZ0IsZ0JBQWdCLGNBQWMsRUFBRSxRQUFRLE9BQU8sRUFBRSxNQUFNLEtBQUs7QUFDeEYsUUFBSSxNQUFNLEdBQUc7QUFHWixVQUFJLEVBQUUsU0FBUyxVQUFVO0FBQ3hCLFVBQUUsU0FBUztBQUNYLFVBQUUsT0FBTztBQUNULFVBQUUsVUFBVTtBQUNaLFVBQUUsT0FBTztBQUNUO0FBQUEsTUFDRCxPQUFPO0FBQ04sWUFBSSxFQUFFO0FBQUEsTUFDUDtBQUFBLElBQ0QsT0FBTztBQUdOLFVBQUksRUFBRSxVQUFVLFVBQVU7QUFDekIsVUFBRSxTQUFVLFFBQVEsRUFBRTtBQUN0QixVQUFFLE9BQVEsUUFBUSxFQUFFO0FBQ3BCLFVBQUUsVUFBVyxRQUFRLEVBQUU7QUFDdkIsVUFBRSxRQUFRO0FBQ1Y7QUFBQSxNQUNELE9BQU87QUFDTixpQkFBUyxFQUFFO0FBQ1gsWUFBSSxFQUFFO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsSUFBRSxTQUFTO0FBQ1gsSUFBRSxPQUFPO0FBQ1QsSUFBRSxRQUFRO0FBQ1YsZUFBYSxHQUFHLFdBQWE7QUFDOUI7QUFJQSxTQUFTLGFBQWEsR0FBaUIsR0FBdUI7QUFFN0QsTUFBSTtBQUNKLE1BQUk7QUFLSixNQUFJLEVBQUUsU0FBUyxVQUFVO0FBQ3hCLFFBQUksRUFBRTtBQUNOLFFBQUk7QUFHSixNQUFFLFNBQVMsRUFBRTtBQUNiLFFBQUksRUFBRSxRQUFRLG9DQUE0QixFQUFFLFFBQVEsaUNBQTBCO0FBQzdFLFFBQUUsd0JBQXdCO0FBQUEsSUFDM0I7QUFDQSxNQUFFLFNBQVMsRUFBRTtBQUNiLE1BQUUsT0FBTyxFQUFFO0FBQUEsRUFFWixXQUFXLEVBQUUsVUFBVSxVQUFVO0FBQ2hDLFFBQUksRUFBRTtBQUNOLFFBQUk7QUFBQSxFQUVMLE9BQU87QUFDTixRQUFJLFFBQVEsRUFBRSxLQUFLO0FBQ25CLFFBQUksRUFBRTtBQUtOLE1BQUUsU0FBUyxFQUFFO0FBQ2IsTUFBRSxPQUFPLEVBQUU7QUFDWCxNQUFFLFNBQVMsRUFBRTtBQUNiLFFBQUksRUFBRSxRQUFRLG9DQUE0QixFQUFFLFFBQVEsaUNBQTBCO0FBQzdFLFFBQUUsd0JBQXdCO0FBQUEsSUFDM0I7QUFFQSxNQUFFLFNBQVMsRUFBRTtBQUNiLE1BQUUsT0FBTyxFQUFFO0FBQ1gsTUFBRSxRQUFRLEVBQUU7QUFDWixRQUFJLEVBQUUsUUFBUSxvQ0FBNEIsRUFBRSxRQUFRLGlDQUEwQjtBQUM3RSxRQUFFLHdCQUF3QjtBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUVBLE1BQUksTUFBTSxFQUFFLE1BQU07QUFDakIsTUFBRSxPQUFPO0FBQ1QsaUJBQWEsR0FBRyxhQUFlO0FBRS9CLE1BQUUsT0FBTztBQUNULGtCQUFjO0FBQ2Qsb0JBQWdCLENBQUM7QUFDakIsTUFBRSxLQUFLLFNBQVM7QUFDaEI7QUFBQSxFQUNEO0FBRUEsUUFBTSxVQUFXLGFBQWEsQ0FBQyxNQUFNO0FBRXJDLE1BQUksTUFBTSxFQUFFLE9BQU8sTUFBTTtBQUN4QixNQUFFLE9BQU8sT0FBTztBQUFBLEVBQ2pCLE9BQU87QUFDTixNQUFFLE9BQU8sUUFBUTtBQUFBLEVBQ2xCO0FBRUEsTUFBSSxNQUFNLEdBQUc7QUFDWixNQUFFLFNBQVMsRUFBRTtBQUFBLEVBQ2QsT0FBTztBQUVOLFFBQUksRUFBRSxXQUFXLEdBQUc7QUFDbkIsUUFBRSxTQUFTO0FBQUEsSUFDWixPQUFPO0FBQ04sUUFBRSxTQUFTLEVBQUU7QUFBQSxJQUNkO0FBRUEsTUFBRSxPQUFPLEVBQUU7QUFDWCxNQUFFLFFBQVEsRUFBRTtBQUNaLE1BQUUsU0FBUyxFQUFFO0FBQ2IsaUJBQWEsR0FBRyxhQUFhLENBQUMsQ0FBQztBQUUvQixRQUFJLE1BQU0sRUFBRSxNQUFNO0FBQ2pCLFFBQUUsT0FBTztBQUFBLElBQ1YsT0FBTztBQUNOLFVBQUksTUFBTSxFQUFFLE9BQU8sTUFBTTtBQUN4QixVQUFFLE9BQU8sT0FBTztBQUFBLE1BQ2pCLE9BQU87QUFDTixVQUFFLE9BQU8sUUFBUTtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUVBLFFBQUksRUFBRSxTQUFTLFVBQVU7QUFDeEIsUUFBRSxLQUFLLFNBQVM7QUFBQSxJQUNqQjtBQUNBLFFBQUksRUFBRSxVQUFVLFVBQVU7QUFDekIsUUFBRSxNQUFNLFNBQVM7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFFQSxJQUFFLE9BQU87QUFFVCxNQUFJLFNBQVM7QUFDWiw4QkFBMEIsRUFBRSxNQUFNO0FBQ2xDLFFBQUksTUFBTSxHQUFHO0FBQ1osZ0NBQTBCLENBQUM7QUFDM0IsZ0NBQTBCLEVBQUUsTUFBTTtBQUFBLElBQ25DO0FBQ0Esa0JBQWM7QUFDZDtBQUFBLEVBQ0Q7QUFFQSw0QkFBMEIsQ0FBQztBQUMzQiw0QkFBMEIsRUFBRSxNQUFNO0FBQ2xDLE1BQUksTUFBTSxHQUFHO0FBQ1osOEJBQTBCLENBQUM7QUFDM0IsOEJBQTBCLEVBQUUsTUFBTTtBQUFBLEVBQ25DO0FBR0EsTUFBSTtBQUNKLFNBQU8sTUFBTSxFQUFFLFFBQVEsYUFBYSxDQUFDLE1BQU0sZUFBaUI7QUFFM0QsUUFBSSxNQUFNLEVBQUUsT0FBTyxNQUFNO0FBQ3hCLFVBQUksRUFBRSxPQUFPO0FBRWIsVUFBSSxhQUFhLENBQUMsTUFBTSxhQUFlO0FBQ3RDLHFCQUFhLEdBQUcsYUFBZTtBQUMvQixxQkFBYSxFQUFFLFFBQVEsV0FBYTtBQUNwQyxtQkFBVyxHQUFHLEVBQUUsTUFBTTtBQUN0QixZQUFJLEVBQUUsT0FBTztBQUFBLE1BQ2Q7QUFFQSxVQUFJLGFBQWEsRUFBRSxJQUFJLE1BQU0saUJBQW1CLGFBQWEsRUFBRSxLQUFLLE1BQU0sZUFBaUI7QUFDMUYscUJBQWEsR0FBRyxXQUFhO0FBQzdCLFlBQUksRUFBRTtBQUFBLE1BQ1AsT0FBTztBQUNOLFlBQUksYUFBYSxFQUFFLEtBQUssTUFBTSxlQUFpQjtBQUM5Qyx1QkFBYSxFQUFFLE1BQU0sYUFBZTtBQUNwQyx1QkFBYSxHQUFHLFdBQWE7QUFDN0Isc0JBQVksR0FBRyxDQUFDO0FBQ2hCLGNBQUksRUFBRSxPQUFPO0FBQUEsUUFDZDtBQUVBLHFCQUFhLEdBQUcsYUFBYSxFQUFFLE1BQU0sQ0FBQztBQUN0QyxxQkFBYSxFQUFFLFFBQVEsYUFBZTtBQUN0QyxxQkFBYSxFQUFFLE9BQU8sYUFBZTtBQUNyQyxtQkFBVyxHQUFHLEVBQUUsTUFBTTtBQUN0QixZQUFJLEVBQUU7QUFBQSxNQUNQO0FBQUEsSUFFRCxPQUFPO0FBQ04sVUFBSSxFQUFFLE9BQU87QUFFYixVQUFJLGFBQWEsQ0FBQyxNQUFNLGFBQWU7QUFDdEMscUJBQWEsR0FBRyxhQUFlO0FBQy9CLHFCQUFhLEVBQUUsUUFBUSxXQUFhO0FBQ3BDLG9CQUFZLEdBQUcsRUFBRSxNQUFNO0FBQ3ZCLFlBQUksRUFBRSxPQUFPO0FBQUEsTUFDZDtBQUVBLFVBQUksYUFBYSxFQUFFLElBQUksTUFBTSxpQkFBbUIsYUFBYSxFQUFFLEtBQUssTUFBTSxlQUFpQjtBQUMxRixxQkFBYSxHQUFHLFdBQWE7QUFDN0IsWUFBSSxFQUFFO0FBQUEsTUFFUCxPQUFPO0FBQ04sWUFBSSxhQUFhLEVBQUUsSUFBSSxNQUFNLGVBQWlCO0FBQzdDLHVCQUFhLEVBQUUsT0FBTyxhQUFlO0FBQ3JDLHVCQUFhLEdBQUcsV0FBYTtBQUM3QixxQkFBVyxHQUFHLENBQUM7QUFDZixjQUFJLEVBQUUsT0FBTztBQUFBLFFBQ2Q7QUFFQSxxQkFBYSxHQUFHLGFBQWEsRUFBRSxNQUFNLENBQUM7QUFDdEMscUJBQWEsRUFBRSxRQUFRLGFBQWU7QUFDdEMscUJBQWEsRUFBRSxNQUFNLGFBQWU7QUFDcEMsb0JBQVksR0FBRyxFQUFFLE1BQU07QUFDdkIsWUFBSSxFQUFFO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsZUFBYSxHQUFHLGFBQWU7QUFDL0IsZ0JBQWM7QUFDZjtBQUVBLFNBQVMsUUFBUSxNQUFrQztBQUNsRCxTQUFPLEtBQUssU0FBUyxVQUFVO0FBQzlCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLGdCQUFzQjtBQUM5QixXQUFTLFNBQVM7QUFDbEIsV0FBUyxRQUFRO0FBQ2pCLFdBQVMsUUFBUTtBQUNqQixXQUFTLE1BQU07QUFDaEI7QUFJQSxTQUFTLFdBQVcsR0FBaUIsR0FBdUI7QUFDM0QsUUFBTSxJQUFJLEVBQUU7QUFFWixJQUFFLFNBQVMsRUFBRTtBQUNiLE1BQUksRUFBRSxRQUFRLG9DQUE0QixFQUFFLFFBQVEsaUNBQTBCO0FBQzdFLE1BQUUsd0JBQXdCO0FBQUEsRUFDM0I7QUFDQSxJQUFFLFNBQVMsRUFBRTtBQUNiLElBQUUsT0FBTyxFQUFFO0FBRVgsSUFBRSxRQUFRLEVBQUU7QUFDWixNQUFJLEVBQUUsU0FBUyxVQUFVO0FBQ3hCLE1BQUUsS0FBSyxTQUFTO0FBQUEsRUFDakI7QUFDQSxJQUFFLFNBQVMsRUFBRTtBQUNiLE1BQUksRUFBRSxXQUFXLFVBQVU7QUFDMUIsTUFBRSxPQUFPO0FBQUEsRUFDVixXQUFXLE1BQU0sRUFBRSxPQUFPLE1BQU07QUFDL0IsTUFBRSxPQUFPLE9BQU87QUFBQSxFQUNqQixPQUFPO0FBQ04sTUFBRSxPQUFPLFFBQVE7QUFBQSxFQUNsQjtBQUVBLElBQUUsT0FBTztBQUNULElBQUUsU0FBUztBQUVYLGtCQUFnQixDQUFDO0FBQ2pCLGtCQUFnQixDQUFDO0FBQ2xCO0FBRUEsU0FBUyxZQUFZLEdBQWlCLEdBQXVCO0FBQzVELFFBQU0sSUFBSSxFQUFFO0FBRVosSUFBRSxTQUFTLEVBQUU7QUFDYixNQUFJLEVBQUUsUUFBUSxvQ0FBNEIsRUFBRSxRQUFRLGlDQUEwQjtBQUM3RSxNQUFFLHdCQUF3QjtBQUFBLEVBQzNCO0FBQ0EsSUFBRSxTQUFTLEVBQUU7QUFDYixJQUFFLE9BQU8sRUFBRTtBQUVYLElBQUUsT0FBTyxFQUFFO0FBQ1gsTUFBSSxFQUFFLFVBQVUsVUFBVTtBQUN6QixNQUFFLE1BQU0sU0FBUztBQUFBLEVBQ2xCO0FBQ0EsSUFBRSxTQUFTLEVBQUU7QUFDYixNQUFJLEVBQUUsV0FBVyxVQUFVO0FBQzFCLE1BQUUsT0FBTztBQUFBLEVBQ1YsV0FBVyxNQUFNLEVBQUUsT0FBTyxPQUFPO0FBQ2hDLE1BQUUsT0FBTyxRQUFRO0FBQUEsRUFDbEIsT0FBTztBQUNOLE1BQUUsT0FBTyxPQUFPO0FBQUEsRUFDakI7QUFFQSxJQUFFLFFBQVE7QUFDVixJQUFFLFNBQVM7QUFFWCxrQkFBZ0IsQ0FBQztBQUNqQixrQkFBZ0IsQ0FBQztBQUNsQjtBQUtBLFNBQVMsY0FBYyxNQUE0QjtBQUNsRCxNQUFJLFNBQVMsS0FBSztBQUNsQixNQUFJLEtBQUssU0FBUyxVQUFVO0FBQzNCLFVBQU0sYUFBYSxLQUFLLEtBQUs7QUFDN0IsUUFBSSxhQUFhLFFBQVE7QUFDeEIsZUFBUztBQUFBLElBQ1Y7QUFBQSxFQUNEO0FBQ0EsTUFBSSxLQUFLLFVBQVUsVUFBVTtBQUM1QixVQUFNLGNBQWMsS0FBSyxNQUFNLFNBQVMsS0FBSztBQUM3QyxRQUFJLGNBQWMsUUFBUTtBQUN6QixlQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLGdCQUFnQixNQUEwQjtBQUN6RCxPQUFLLFNBQVMsY0FBYyxJQUFJO0FBQ2pDO0FBRUEsU0FBUywwQkFBMEIsTUFBMEI7QUFDNUQsU0FBTyxTQUFTLFVBQVU7QUFFekIsVUFBTSxTQUFTLGNBQWMsSUFBSTtBQUVqQyxRQUFJLEtBQUssV0FBVyxRQUFRO0FBRTNCO0FBQUEsSUFDRDtBQUVBLFNBQUssU0FBUztBQUNkLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUtPLFNBQVMsZ0JBQWdCLFFBQWdCLE1BQWMsUUFBZ0IsTUFBc0I7QUFDbkcsTUFBSSxXQUFXLFFBQVE7QUFDdEIsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUNBLFNBQU8sU0FBUztBQUNqQjsiLAogICJuYW1lcyI6IFsiQ2xhc3NOYW1lIiwgIk5vZGVDb2xvciIsICJDb25zdGFudHMiLCAiTWFya2VyTW92ZVNlbWFudGljcyJdCn0K
