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
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Disposable, isDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import Severity from "../../../base/common/severity.js";
import * as nls from "../../../nls.js";
import { IDialogService } from "../../dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { INotificationService } from "../../notification/common/notification.js";
import { IUndoRedoService, ResourceEditStackSnapshot, UndoRedoElementType, UndoRedoGroup, UndoRedoSource } from "./undoRedo.js";
const DEBUG = false;
function getResourceLabel(resource) {
  return resource.scheme === Schemas.file ? resource.fsPath : resource.path;
}
let stackElementCounter = 0;
class ResourceStackElement {
  constructor(actual, resourceLabel, strResource, groupId, groupOrder, sourceId, sourceOrder) {
    this.id = ++stackElementCounter;
    this.type = UndoRedoElementType.Resource;
    this.actual = actual;
    this.label = actual.label;
    this.confirmBeforeUndo = actual.confirmBeforeUndo || false;
    this.resourceLabel = resourceLabel;
    this.strResource = strResource;
    this.resourceLabels = [this.resourceLabel];
    this.strResources = [this.strResource];
    this.groupId = groupId;
    this.groupOrder = groupOrder;
    this.sourceId = sourceId;
    this.sourceOrder = sourceOrder;
    this.isValid = true;
  }
  setValid(isValid) {
    this.isValid = isValid;
  }
  toString() {
    return `[id:${this.id}] [group:${this.groupId}] [${this.isValid ? "  VALID" : "INVALID"}] ${this.actual.constructor.name} - ${this.actual}`;
  }
}
var RemovedResourceReason = /* @__PURE__ */ ((RemovedResourceReason2) => {
  RemovedResourceReason2[RemovedResourceReason2["ExternalRemoval"] = 0] = "ExternalRemoval";
  RemovedResourceReason2[RemovedResourceReason2["NoParallelUniverses"] = 1] = "NoParallelUniverses";
  return RemovedResourceReason2;
})(RemovedResourceReason || {});
class ResourceReasonPair {
  constructor(resourceLabel, reason) {
    this.resourceLabel = resourceLabel;
    this.reason = reason;
  }
}
class RemovedResources {
  constructor() {
    this.elements = /* @__PURE__ */ new Map();
  }
  createMessage() {
    const externalRemoval = [];
    const noParallelUniverses = [];
    for (const [, element] of this.elements) {
      const dest = element.reason === 0 /* ExternalRemoval */ ? externalRemoval : noParallelUniverses;
      dest.push(element.resourceLabel);
    }
    const messages = [];
    if (externalRemoval.length > 0) {
      messages.push(
        nls.localize(
          { key: "externalRemoval", comment: ["{0} is a list of filenames"] },
          "The following files have been closed and modified on disk: {0}.",
          externalRemoval.join(", ")
        )
      );
    }
    if (noParallelUniverses.length > 0) {
      messages.push(
        nls.localize(
          { key: "noParallelUniverses", comment: ["{0} is a list of filenames"] },
          "The following files have been modified in an incompatible way: {0}.",
          noParallelUniverses.join(", ")
        )
      );
    }
    return messages.join("\n");
  }
  get size() {
    return this.elements.size;
  }
  has(strResource) {
    return this.elements.has(strResource);
  }
  set(strResource, value) {
    this.elements.set(strResource, value);
  }
  delete(strResource) {
    return this.elements.delete(strResource);
  }
}
class WorkspaceStackElement {
  constructor(actual, resourceLabels, strResources, groupId, groupOrder, sourceId, sourceOrder) {
    this.id = ++stackElementCounter;
    this.type = UndoRedoElementType.Workspace;
    this.actual = actual;
    this.label = actual.label;
    this.confirmBeforeUndo = actual.confirmBeforeUndo || false;
    this.resourceLabels = resourceLabels;
    this.strResources = strResources;
    this.groupId = groupId;
    this.groupOrder = groupOrder;
    this.sourceId = sourceId;
    this.sourceOrder = sourceOrder;
    this.removedResources = null;
    this.invalidatedResources = null;
  }
  canSplit() {
    return typeof this.actual.split === "function";
  }
  removeResource(resourceLabel, strResource, reason) {
    if (!this.removedResources) {
      this.removedResources = new RemovedResources();
    }
    if (!this.removedResources.has(strResource)) {
      this.removedResources.set(strResource, new ResourceReasonPair(resourceLabel, reason));
    }
  }
  setValid(resourceLabel, strResource, isValid) {
    if (isValid) {
      if (this.invalidatedResources) {
        this.invalidatedResources.delete(strResource);
        if (this.invalidatedResources.size === 0) {
          this.invalidatedResources = null;
        }
      }
    } else {
      if (!this.invalidatedResources) {
        this.invalidatedResources = new RemovedResources();
      }
      if (!this.invalidatedResources.has(strResource)) {
        this.invalidatedResources.set(strResource, new ResourceReasonPair(resourceLabel, 0 /* ExternalRemoval */));
      }
    }
  }
  toString() {
    return `[id:${this.id}] [group:${this.groupId}] [${this.invalidatedResources ? "INVALID" : "  VALID"}] ${this.actual.constructor.name} - ${this.actual}`;
  }
}
class ResourceEditStack {
  constructor(resourceLabel, strResource) {
    this.resourceLabel = resourceLabel;
    this.strResource = strResource;
    this._past = [];
    this._future = [];
    this.locked = false;
    this.versionId = 1;
  }
  dispose() {
    for (const element of this._past) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    for (const element of this._future) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    this.versionId++;
  }
  toString() {
    const result = [];
    result.push(`* ${this.strResource}:`);
    for (let i = 0; i < this._past.length; i++) {
      result.push(`   * [UNDO] ${this._past[i]}`);
    }
    for (let i = this._future.length - 1; i >= 0; i--) {
      result.push(`   * [REDO] ${this._future[i]}`);
    }
    return result.join("\n");
  }
  flushAllElements() {
    this._past = [];
    this._future = [];
    this.versionId++;
  }
  setElementsIsValid(isValid) {
    for (const element of this._past) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.setValid(this.resourceLabel, this.strResource, isValid);
      } else {
        element.setValid(isValid);
      }
    }
    for (const element of this._future) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.setValid(this.resourceLabel, this.strResource, isValid);
      } else {
        element.setValid(isValid);
      }
    }
  }
  _setElementValidFlag(element, isValid) {
    if (element.type === UndoRedoElementType.Workspace) {
      element.setValid(this.resourceLabel, this.strResource, isValid);
    } else {
      element.setValid(isValid);
    }
  }
  setElementsValidFlag(isValid, filter) {
    for (const element of this._past) {
      if (filter(element.actual)) {
        this._setElementValidFlag(element, isValid);
      }
    }
    for (const element of this._future) {
      if (filter(element.actual)) {
        this._setElementValidFlag(element, isValid);
      }
    }
  }
  pushElement(element) {
    for (const futureElement of this._future) {
      if (futureElement.type === UndoRedoElementType.Workspace) {
        futureElement.removeResource(this.resourceLabel, this.strResource, 1 /* NoParallelUniverses */);
      }
    }
    this._future = [];
    this._past.push(element);
    this.versionId++;
  }
  createSnapshot(resource) {
    const elements = [];
    for (let i = 0, len = this._past.length; i < len; i++) {
      elements.push(this._past[i].id);
    }
    for (let i = this._future.length - 1; i >= 0; i--) {
      elements.push(this._future[i].id);
    }
    return new ResourceEditStackSnapshot(resource, elements);
  }
  restoreSnapshot(snapshot) {
    const snapshotLength = snapshot.elements.length;
    let isOK = true;
    let snapshotIndex = 0;
    let removePastAfter = -1;
    for (let i = 0, len = this._past.length; i < len; i++, snapshotIndex++) {
      const element = this._past[i];
      if (isOK && (snapshotIndex >= snapshotLength || element.id !== snapshot.elements[snapshotIndex])) {
        isOK = false;
        removePastAfter = i;
      }
      if (!isOK && element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    let removeFutureBefore = -1;
    for (let i = this._future.length - 1; i >= 0; i--, snapshotIndex++) {
      const element = this._future[i];
      if (isOK && (snapshotIndex >= snapshotLength || element.id !== snapshot.elements[snapshotIndex])) {
        isOK = false;
        removeFutureBefore = i;
      }
      if (!isOK && element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    if (removePastAfter !== -1) {
      this._past = this._past.slice(0, removePastAfter);
    }
    if (removeFutureBefore !== -1) {
      this._future = this._future.slice(removeFutureBefore + 1);
    }
    this.versionId++;
  }
  getElements() {
    const past = [];
    const future = [];
    for (const element of this._past) {
      past.push(element.actual);
    }
    for (const element of this._future) {
      future.push(element.actual);
    }
    return { past, future };
  }
  getClosestPastElement() {
    if (this._past.length === 0) {
      return null;
    }
    return this._past[this._past.length - 1];
  }
  getSecondClosestPastElement() {
    if (this._past.length < 2) {
      return null;
    }
    return this._past[this._past.length - 2];
  }
  getClosestFutureElement() {
    if (this._future.length === 0) {
      return null;
    }
    return this._future[this._future.length - 1];
  }
  hasPastElements() {
    return this._past.length > 0;
  }
  hasFutureElements() {
    return this._future.length > 0;
  }
  splitPastWorkspaceElement(toRemove, individualMap) {
    for (let j = this._past.length - 1; j >= 0; j--) {
      if (this._past[j] === toRemove) {
        if (individualMap.has(this.strResource)) {
          this._past[j] = individualMap.get(this.strResource);
        } else {
          this._past.splice(j, 1);
        }
        break;
      }
    }
    this.versionId++;
  }
  splitFutureWorkspaceElement(toRemove, individualMap) {
    for (let j = this._future.length - 1; j >= 0; j--) {
      if (this._future[j] === toRemove) {
        if (individualMap.has(this.strResource)) {
          this._future[j] = individualMap.get(this.strResource);
        } else {
          this._future.splice(j, 1);
        }
        break;
      }
    }
    this.versionId++;
  }
  moveBackward(element) {
    this._past.pop();
    this._future.push(element);
    this.versionId++;
  }
  moveForward(element) {
    this._future.pop();
    this._past.push(element);
    this.versionId++;
  }
}
class EditStackSnapshot {
  constructor(editStacks) {
    this.editStacks = editStacks;
    this._versionIds = [];
    for (let i = 0, len = this.editStacks.length; i < len; i++) {
      this._versionIds[i] = this.editStacks[i].versionId;
    }
  }
  isValid() {
    for (let i = 0, len = this.editStacks.length; i < len; i++) {
      if (this._versionIds[i] !== this.editStacks[i].versionId) {
        return false;
      }
    }
    return true;
  }
}
const missingEditStack = new ResourceEditStack("", "");
missingEditStack.locked = true;
let UndoRedoService = class {
  constructor(_dialogService, _notificationService) {
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._editStacks = /* @__PURE__ */ new Map();
    this._uriComparisonKeyComputers = [];
  }
  registerUriComparisonKeyComputer(scheme, uriComparisonKeyComputer) {
    this._uriComparisonKeyComputers.push([scheme, uriComparisonKeyComputer]);
    return {
      dispose: () => {
        for (let i = 0, len = this._uriComparisonKeyComputers.length; i < len; i++) {
          if (this._uriComparisonKeyComputers[i][1] === uriComparisonKeyComputer) {
            this._uriComparisonKeyComputers.splice(i, 1);
            return;
          }
        }
      }
    };
  }
  getUriComparisonKey(resource) {
    for (const uriComparisonKeyComputer of this._uriComparisonKeyComputers) {
      if (uriComparisonKeyComputer[0] === resource.scheme) {
        return uriComparisonKeyComputer[1].getComparisonKey(resource);
      }
    }
    return resource.toString();
  }
  _print(label) {
    console.log(`------------------------------------`);
    console.log(`AFTER ${label}: `);
    const str = [];
    for (const element of this._editStacks) {
      str.push(element[1].toString());
    }
    console.log(str.join("\n"));
  }
  pushElement(element, group = UndoRedoGroup.None, source = UndoRedoSource.None) {
    if (element.type === UndoRedoElementType.Resource) {
      const resourceLabel = getResourceLabel(element.resource);
      const strResource = this.getUriComparisonKey(element.resource);
      this._pushElement(new ResourceStackElement(element, resourceLabel, strResource, group.id, group.nextOrder(), source.id, source.nextOrder()));
    } else {
      const seen = /* @__PURE__ */ new Set();
      const resourceLabels = [];
      const strResources = [];
      for (const resource of element.resources) {
        const resourceLabel = getResourceLabel(resource);
        const strResource = this.getUriComparisonKey(resource);
        if (seen.has(strResource)) {
          continue;
        }
        seen.add(strResource);
        resourceLabels.push(resourceLabel);
        strResources.push(strResource);
      }
      if (resourceLabels.length === 1) {
        this._pushElement(new ResourceStackElement(element, resourceLabels[0], strResources[0], group.id, group.nextOrder(), source.id, source.nextOrder()));
      } else {
        this._pushElement(new WorkspaceStackElement(element, resourceLabels, strResources, group.id, group.nextOrder(), source.id, source.nextOrder()));
      }
    }
    if (DEBUG) {
      this._print("pushElement");
    }
  }
  _pushElement(element) {
    for (let i = 0, len = element.strResources.length; i < len; i++) {
      const resourceLabel = element.resourceLabels[i];
      const strResource = element.strResources[i];
      let editStack;
      if (this._editStacks.has(strResource)) {
        editStack = this._editStacks.get(strResource);
      } else {
        editStack = new ResourceEditStack(resourceLabel, strResource);
        this._editStacks.set(strResource, editStack);
      }
      editStack.pushElement(element);
    }
  }
  getLastElement(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      if (editStack.hasFutureElements()) {
        return null;
      }
      const closestPastElement = editStack.getClosestPastElement();
      return closestPastElement ? closestPastElement.actual : null;
    }
    return null;
  }
  _splitPastWorkspaceElement(toRemove, ignoreResources) {
    const individualArr = toRemove.actual.split();
    const individualMap = /* @__PURE__ */ new Map();
    for (const _element of individualArr) {
      const resourceLabel = getResourceLabel(_element.resource);
      const strResource = this.getUriComparisonKey(_element.resource);
      const element = new ResourceStackElement(_element, resourceLabel, strResource, 0, 0, 0, 0);
      individualMap.set(element.strResource, element);
    }
    for (const strResource of toRemove.strResources) {
      if (ignoreResources && ignoreResources.has(strResource)) {
        continue;
      }
      const editStack = this._editStacks.get(strResource);
      editStack.splitPastWorkspaceElement(toRemove, individualMap);
    }
  }
  _splitFutureWorkspaceElement(toRemove, ignoreResources) {
    const individualArr = toRemove.actual.split();
    const individualMap = /* @__PURE__ */ new Map();
    for (const _element of individualArr) {
      const resourceLabel = getResourceLabel(_element.resource);
      const strResource = this.getUriComparisonKey(_element.resource);
      const element = new ResourceStackElement(_element, resourceLabel, strResource, 0, 0, 0, 0);
      individualMap.set(element.strResource, element);
    }
    for (const strResource of toRemove.strResources) {
      if (ignoreResources && ignoreResources.has(strResource)) {
        continue;
      }
      const editStack = this._editStacks.get(strResource);
      editStack.splitFutureWorkspaceElement(toRemove, individualMap);
    }
  }
  removeElements(resource) {
    const strResource = typeof resource === "string" ? resource : this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      editStack.dispose();
      this._editStacks.delete(strResource);
    }
    if (DEBUG) {
      this._print("removeElements");
    }
  }
  setElementsValidFlag(resource, isValid, filter) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      editStack.setElementsValidFlag(isValid, filter);
    }
    if (DEBUG) {
      this._print("setElementsValidFlag");
    }
  }
  hasElements(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.hasPastElements() || editStack.hasFutureElements();
    }
    return false;
  }
  createSnapshot(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.createSnapshot(resource);
    }
    return new ResourceEditStackSnapshot(resource, []);
  }
  restoreSnapshot(snapshot) {
    const strResource = this.getUriComparisonKey(snapshot.resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      editStack.restoreSnapshot(snapshot);
      if (!editStack.hasPastElements() && !editStack.hasFutureElements()) {
        editStack.dispose();
        this._editStacks.delete(strResource);
      }
    }
    if (DEBUG) {
      this._print("restoreSnapshot");
    }
  }
  getElements(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.getElements();
    }
    return { past: [], future: [] };
  }
  _findClosestUndoElementWithSource(sourceId) {
    if (!sourceId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestPastElement();
      if (!candidate) {
        continue;
      }
      if (candidate.sourceId === sourceId) {
        if (!matchedElement || candidate.sourceOrder > matchedElement.sourceOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  canUndo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestUndoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? true : false;
    }
    const strResource = this.getUriComparisonKey(resourceOrSource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.hasPastElements();
    }
    return false;
  }
  _onError(err, element) {
    onUnexpectedError(err);
    for (const strResource of element.strResources) {
      this.removeElements(strResource);
    }
    this._notificationService.error(err);
  }
  _acquireLocks(editStackSnapshot) {
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.locked) {
        throw new Error("Cannot acquire edit stack lock");
      }
    }
    for (const editStack of editStackSnapshot.editStacks) {
      editStack.locked = true;
    }
    return () => {
      for (const editStack of editStackSnapshot.editStacks) {
        editStack.locked = false;
      }
    };
  }
  _safeInvokeWithLocks(element, invoke, editStackSnapshot, cleanup, continuation) {
    const releaseLocks = this._acquireLocks(editStackSnapshot);
    let result;
    try {
      result = invoke();
    } catch (err) {
      releaseLocks();
      cleanup.dispose();
      return this._onError(err, element);
    }
    if (result) {
      return result.then(
        () => {
          releaseLocks();
          cleanup.dispose();
          return continuation();
        },
        (err) => {
          releaseLocks();
          cleanup.dispose();
          return this._onError(err, element);
        }
      );
    } else {
      releaseLocks();
      cleanup.dispose();
      return continuation();
    }
  }
  async _invokeWorkspacePrepare(element) {
    if (typeof element.actual.prepareUndoRedo === "undefined") {
      return Disposable.None;
    }
    const result = element.actual.prepareUndoRedo();
    if (typeof result === "undefined") {
      return Disposable.None;
    }
    return result;
  }
  _invokeResourcePrepare(element, callback) {
    if (element.actual.type !== UndoRedoElementType.Workspace || typeof element.actual.prepareUndoRedo === "undefined") {
      return callback(Disposable.None);
    }
    const r = element.actual.prepareUndoRedo();
    if (!r) {
      return callback(Disposable.None);
    }
    if (isDisposable(r)) {
      return callback(r);
    }
    return r.then((disposable) => {
      return callback(disposable);
    });
  }
  _getAffectedEditStacks(element) {
    const affectedEditStacks = [];
    for (const strResource of element.strResources) {
      affectedEditStacks.push(this._editStacks.get(strResource) || missingEditStack);
    }
    return new EditStackSnapshot(affectedEditStacks);
  }
  _tryToSplitAndUndo(strResource, element, ignoreResources, message) {
    if (element.canSplit()) {
      this._splitPastWorkspaceElement(element, ignoreResources);
      this._notificationService.warn(message);
      return new WorkspaceVerificationError(this._undo(strResource, 0, true));
    } else {
      for (const strResource2 of element.strResources) {
        this.removeElements(strResource2);
      }
      this._notificationService.warn(message);
      return new WorkspaceVerificationError();
    }
  }
  _checkWorkspaceUndo(strResource, element, editStackSnapshot, checkInvalidatedResources) {
    if (element.removedResources) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        element.removedResources,
        nls.localize(
          { key: "cannotWorkspaceUndo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not undo '{0}' across all files. {1}",
          element.label,
          element.removedResources.createMessage()
        )
      );
    }
    if (checkInvalidatedResources && element.invalidatedResources) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        element.invalidatedResources,
        nls.localize(
          { key: "cannotWorkspaceUndo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not undo '{0}' across all files. {1}",
          element.label,
          element.invalidatedResources.createMessage()
        )
      );
    }
    const cannotUndoDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.getClosestPastElement() !== element) {
        cannotUndoDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotUndoDueToResources.length > 0) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceUndoDueToChanges", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not undo '{0}' across all files because changes were made to {1}",
          element.label,
          cannotUndoDueToResources.join(", ")
        )
      );
    }
    const cannotLockDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.locked) {
        cannotLockDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotLockDueToResources.length > 0) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceUndoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not undo '{0}' across all files because there is already an undo or redo operation running on {1}",
          element.label,
          cannotLockDueToResources.join(", ")
        )
      );
    }
    if (!editStackSnapshot.isValid()) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceUndoDueToInMeantimeUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not undo '{0}' across all files because an undo or redo operation occurred in the meantime",
          element.label
        )
      );
    }
    return null;
  }
  _workspaceUndo(strResource, element, undoConfirmed) {
    const affectedEditStacks = this._getAffectedEditStacks(element);
    const verificationError = this._checkWorkspaceUndo(
      strResource,
      element,
      affectedEditStacks,
      /*invalidated resources will be checked after the prepare call*/
      false
    );
    if (verificationError) {
      return verificationError.returnValue;
    }
    return this._confirmAndExecuteWorkspaceUndo(strResource, element, affectedEditStacks, undoConfirmed);
  }
  _isPartOfUndoGroup(element) {
    if (!element.groupId) {
      return false;
    }
    for (const [, editStack] of this._editStacks) {
      const pastElement = editStack.getClosestPastElement();
      if (!pastElement) {
        continue;
      }
      if (pastElement === element) {
        const secondPastElement = editStack.getSecondClosestPastElement();
        if (secondPastElement && secondPastElement.groupId === element.groupId) {
          return true;
        }
      }
      if (pastElement.groupId === element.groupId) {
        return true;
      }
    }
    return false;
  }
  async _confirmAndExecuteWorkspaceUndo(strResource, element, editStackSnapshot, undoConfirmed) {
    if (element.canSplit() && !this._isPartOfUndoGroup(element)) {
      let UndoChoice;
      ((UndoChoice2) => {
        UndoChoice2[UndoChoice2["All"] = 0] = "All";
        UndoChoice2[UndoChoice2["This"] = 1] = "This";
        UndoChoice2[UndoChoice2["Cancel"] = 2] = "Cancel";
      })(UndoChoice || (UndoChoice = {}));
      const { result } = await this._dialogService.prompt({
        type: Severity.Info,
        message: nls.localize("confirmWorkspace", "Would you like to undo '{0}' across all files?", element.label),
        buttons: [
          {
            label: nls.localize({ key: "ok", comment: ["{0} denotes a number that is > 1, && denotes a mnemonic"] }, "&&Undo in {0} Files", editStackSnapshot.editStacks.length),
            run: () => 0 /* All */
          },
          {
            label: nls.localize({ key: "nok", comment: ["&& denotes a mnemonic"] }, "Undo this &&File"),
            run: () => 1 /* This */
          }
        ],
        cancelButton: {
          run: () => 2 /* Cancel */
        }
      });
      if (result === 2 /* Cancel */) {
        return;
      }
      if (result === 1 /* This */) {
        this._splitPastWorkspaceElement(element, null);
        return this._undo(strResource, 0, true);
      }
      const verificationError1 = this._checkWorkspaceUndo(
        strResource,
        element,
        editStackSnapshot,
        /*invalidated resources will be checked after the prepare call*/
        false
      );
      if (verificationError1) {
        return verificationError1.returnValue;
      }
      undoConfirmed = true;
    }
    let cleanup;
    try {
      cleanup = await this._invokeWorkspacePrepare(element);
    } catch (err) {
      return this._onError(err, element);
    }
    const verificationError2 = this._checkWorkspaceUndo(
      strResource,
      element,
      editStackSnapshot,
      /*now also check that there are no more invalidated resources*/
      true
    );
    if (verificationError2) {
      cleanup.dispose();
      return verificationError2.returnValue;
    }
    for (const editStack of editStackSnapshot.editStacks) {
      editStack.moveBackward(element);
    }
    return this._safeInvokeWithLocks(element, () => element.actual.undo(), editStackSnapshot, cleanup, () => this._continueUndoInGroup(element.groupId, undoConfirmed));
  }
  _resourceUndo(editStack, element, undoConfirmed) {
    if (!element.isValid) {
      editStack.flushAllElements();
      return;
    }
    if (editStack.locked) {
      const message = nls.localize(
        { key: "cannotResourceUndoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation."] },
        "Could not undo '{0}' because there is already an undo or redo operation running.",
        element.label
      );
      this._notificationService.warn(message);
      return;
    }
    return this._invokeResourcePrepare(element, (cleanup) => {
      editStack.moveBackward(element);
      return this._safeInvokeWithLocks(element, () => element.actual.undo(), new EditStackSnapshot([editStack]), cleanup, () => this._continueUndoInGroup(element.groupId, undoConfirmed));
    });
  }
  _findClosestUndoElementInGroup(groupId) {
    if (!groupId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestPastElement();
      if (!candidate) {
        continue;
      }
      if (candidate.groupId === groupId) {
        if (!matchedElement || candidate.groupOrder > matchedElement.groupOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  _continueUndoInGroup(groupId, undoConfirmed) {
    if (!groupId) {
      return;
    }
    const [, matchedStrResource] = this._findClosestUndoElementInGroup(groupId);
    if (matchedStrResource) {
      return this._undo(matchedStrResource, 0, undoConfirmed);
    }
  }
  undo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestUndoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? this._undo(matchedStrResource, resourceOrSource.id, false) : void 0;
    }
    if (typeof resourceOrSource === "string") {
      return this._undo(resourceOrSource, 0, false);
    }
    return this._undo(this.getUriComparisonKey(resourceOrSource), 0, false);
  }
  _undo(strResource, sourceId = 0, undoConfirmed) {
    if (!this._editStacks.has(strResource)) {
      return;
    }
    const editStack = this._editStacks.get(strResource);
    const element = editStack.getClosestPastElement();
    if (!element) {
      return;
    }
    if (element.groupId) {
      const [matchedElement, matchedStrResource] = this._findClosestUndoElementInGroup(element.groupId);
      if (element !== matchedElement && matchedStrResource) {
        return this._undo(matchedStrResource, sourceId, undoConfirmed);
      }
    }
    const shouldPromptForConfirmation = element.sourceId !== sourceId || element.confirmBeforeUndo;
    if (shouldPromptForConfirmation && !undoConfirmed) {
      return this._confirmAndContinueUndo(strResource, sourceId, element);
    }
    try {
      if (element.type === UndoRedoElementType.Workspace) {
        return this._workspaceUndo(strResource, element, undoConfirmed);
      } else {
        return this._resourceUndo(editStack, element, undoConfirmed);
      }
    } finally {
      if (DEBUG) {
        this._print("undo");
      }
    }
  }
  async _confirmAndContinueUndo(strResource, sourceId, element) {
    const result = await this._dialogService.confirm({
      message: nls.localize("confirmDifferentSource", "Would you like to undo '{0}'?", element.label),
      primaryButton: nls.localize({ key: "confirmDifferentSource.yes", comment: ["&& denotes a mnemonic"] }, "&&Yes"),
      cancelButton: nls.localize("confirmDifferentSource.no", "No")
    });
    if (!result.confirmed) {
      return;
    }
    return this._undo(strResource, sourceId, true);
  }
  _findClosestRedoElementWithSource(sourceId) {
    if (!sourceId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestFutureElement();
      if (!candidate) {
        continue;
      }
      if (candidate.sourceId === sourceId) {
        if (!matchedElement || candidate.sourceOrder < matchedElement.sourceOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  canRedo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestRedoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? true : false;
    }
    const strResource = this.getUriComparisonKey(resourceOrSource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.hasFutureElements();
    }
    return false;
  }
  _tryToSplitAndRedo(strResource, element, ignoreResources, message) {
    if (element.canSplit()) {
      this._splitFutureWorkspaceElement(element, ignoreResources);
      this._notificationService.warn(message);
      return new WorkspaceVerificationError(this._redo(strResource));
    } else {
      for (const strResource2 of element.strResources) {
        this.removeElements(strResource2);
      }
      this._notificationService.warn(message);
      return new WorkspaceVerificationError();
    }
  }
  _checkWorkspaceRedo(strResource, element, editStackSnapshot, checkInvalidatedResources) {
    if (element.removedResources) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        element.removedResources,
        nls.localize(
          { key: "cannotWorkspaceRedo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not redo '{0}' across all files. {1}",
          element.label,
          element.removedResources.createMessage()
        )
      );
    }
    if (checkInvalidatedResources && element.invalidatedResources) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        element.invalidatedResources,
        nls.localize(
          { key: "cannotWorkspaceRedo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not redo '{0}' across all files. {1}",
          element.label,
          element.invalidatedResources.createMessage()
        )
      );
    }
    const cannotRedoDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.getClosestFutureElement() !== element) {
        cannotRedoDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotRedoDueToResources.length > 0) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceRedoDueToChanges", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not redo '{0}' across all files because changes were made to {1}",
          element.label,
          cannotRedoDueToResources.join(", ")
        )
      );
    }
    const cannotLockDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.locked) {
        cannotLockDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotLockDueToResources.length > 0) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceRedoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not redo '{0}' across all files because there is already an undo or redo operation running on {1}",
          element.label,
          cannotLockDueToResources.join(", ")
        )
      );
    }
    if (!editStackSnapshot.isValid()) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceRedoDueToInMeantimeUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not redo '{0}' across all files because an undo or redo operation occurred in the meantime",
          element.label
        )
      );
    }
    return null;
  }
  _workspaceRedo(strResource, element) {
    const affectedEditStacks = this._getAffectedEditStacks(element);
    const verificationError = this._checkWorkspaceRedo(
      strResource,
      element,
      affectedEditStacks,
      /*invalidated resources will be checked after the prepare call*/
      false
    );
    if (verificationError) {
      return verificationError.returnValue;
    }
    return this._executeWorkspaceRedo(strResource, element, affectedEditStacks);
  }
  async _executeWorkspaceRedo(strResource, element, editStackSnapshot) {
    let cleanup;
    try {
      cleanup = await this._invokeWorkspacePrepare(element);
    } catch (err) {
      return this._onError(err, element);
    }
    const verificationError = this._checkWorkspaceRedo(
      strResource,
      element,
      editStackSnapshot,
      /*now also check that there are no more invalidated resources*/
      true
    );
    if (verificationError) {
      cleanup.dispose();
      return verificationError.returnValue;
    }
    for (const editStack of editStackSnapshot.editStacks) {
      editStack.moveForward(element);
    }
    return this._safeInvokeWithLocks(element, () => element.actual.redo(), editStackSnapshot, cleanup, () => this._continueRedoInGroup(element.groupId));
  }
  _resourceRedo(editStack, element) {
    if (!element.isValid) {
      editStack.flushAllElements();
      return;
    }
    if (editStack.locked) {
      const message = nls.localize(
        { key: "cannotResourceRedoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation."] },
        "Could not redo '{0}' because there is already an undo or redo operation running.",
        element.label
      );
      this._notificationService.warn(message);
      return;
    }
    return this._invokeResourcePrepare(element, (cleanup) => {
      editStack.moveForward(element);
      return this._safeInvokeWithLocks(element, () => element.actual.redo(), new EditStackSnapshot([editStack]), cleanup, () => this._continueRedoInGroup(element.groupId));
    });
  }
  _findClosestRedoElementInGroup(groupId) {
    if (!groupId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestFutureElement();
      if (!candidate) {
        continue;
      }
      if (candidate.groupId === groupId) {
        if (!matchedElement || candidate.groupOrder < matchedElement.groupOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  _continueRedoInGroup(groupId) {
    if (!groupId) {
      return;
    }
    const [, matchedStrResource] = this._findClosestRedoElementInGroup(groupId);
    if (matchedStrResource) {
      return this._redo(matchedStrResource);
    }
  }
  redo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestRedoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? this._redo(matchedStrResource) : void 0;
    }
    if (typeof resourceOrSource === "string") {
      return this._redo(resourceOrSource);
    }
    return this._redo(this.getUriComparisonKey(resourceOrSource));
  }
  _redo(strResource) {
    if (!this._editStacks.has(strResource)) {
      return;
    }
    const editStack = this._editStacks.get(strResource);
    const element = editStack.getClosestFutureElement();
    if (!element) {
      return;
    }
    if (element.groupId) {
      const [matchedElement, matchedStrResource] = this._findClosestRedoElementInGroup(element.groupId);
      if (element !== matchedElement && matchedStrResource) {
        return this._redo(matchedStrResource);
      }
    }
    try {
      if (element.type === UndoRedoElementType.Workspace) {
        return this._workspaceRedo(strResource, element);
      } else {
        return this._resourceRedo(editStack, element);
      }
    } finally {
      if (DEBUG) {
        this._print("redo");
      }
    }
  }
};
UndoRedoService = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, INotificationService)
], UndoRedoService);
class WorkspaceVerificationError {
  constructor(returnValue) {
    this.returnValue = returnValue;
  }
}
registerSingleton(IUndoRedoService, UndoRedoService, InstantiationType.Delayed);
export {
  UndoRedoService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdW5kb1JlZG9cXGNvbW1vblxcdW5kb1JlZG9TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUGFzdEZ1dHVyZUVsZW1lbnRzLCBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnQsIElVbmRvUmVkb0VsZW1lbnQsIElVbmRvUmVkb1NlcnZpY2UsIElXb3Jrc3BhY2VVbmRvUmVkb0VsZW1lbnQsIFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QsIFVuZG9SZWRvRWxlbWVudFR5cGUsIFVuZG9SZWRvR3JvdXAsIFVuZG9SZWRvU291cmNlLCBVcmlDb21wYXJpc29uS2V5Q29tcHV0ZXIgfSBmcm9tICcuL3VuZG9SZWRvLmpzJztcblxuY29uc3QgREVCVUcgPSBmYWxzZTtcblxuZnVuY3Rpb24gZ2V0UmVzb3VyY2VMYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0cmV0dXJuIHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gcmVzb3VyY2UuZnNQYXRoIDogcmVzb3VyY2UucGF0aDtcbn1cblxubGV0IHN0YWNrRWxlbWVudENvdW50ZXIgPSAwO1xuXG5jbGFzcyBSZXNvdXJjZVN0YWNrRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSBpZCA9ICgrK3N0YWNrRWxlbWVudENvdW50ZXIpO1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2U7XG5cdHB1YmxpYyByZWFkb25seSBhY3R1YWw6IElVbmRvUmVkb0VsZW1lbnQ7XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29uZmlybUJlZm9yZVVuZG86IGJvb2xlYW47XG5cblx0cHVibGljIHJlYWRvbmx5IHJlc291cmNlTGFiZWw6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHN0clJlc291cmNlOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSByZXNvdXJjZUxhYmVsczogc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSBzdHJSZXNvdXJjZXM6IHN0cmluZ1tdO1xuXHRwdWJsaWMgcmVhZG9ubHkgZ3JvdXBJZDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgZ3JvdXBPcmRlcjogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc291cmNlSWQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHNvdXJjZU9yZGVyOiBudW1iZXI7XG5cdHB1YmxpYyBpc1ZhbGlkOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGFjdHVhbDogSVVuZG9SZWRvRWxlbWVudCwgcmVzb3VyY2VMYWJlbDogc3RyaW5nLCBzdHJSZXNvdXJjZTogc3RyaW5nLCBncm91cElkOiBudW1iZXIsIGdyb3VwT3JkZXI6IG51bWJlciwgc291cmNlSWQ6IG51bWJlciwgc291cmNlT3JkZXI6IG51bWJlcikge1xuXHRcdHRoaXMuYWN0dWFsID0gYWN0dWFsO1xuXHRcdHRoaXMubGFiZWwgPSBhY3R1YWwubGFiZWw7XG5cdFx0dGhpcy5jb25maXJtQmVmb3JlVW5kbyA9IGFjdHVhbC5jb25maXJtQmVmb3JlVW5kbyB8fCBmYWxzZTtcblx0XHR0aGlzLnJlc291cmNlTGFiZWwgPSByZXNvdXJjZUxhYmVsO1xuXHRcdHRoaXMuc3RyUmVzb3VyY2UgPSBzdHJSZXNvdXJjZTtcblx0XHR0aGlzLnJlc291cmNlTGFiZWxzID0gW3RoaXMucmVzb3VyY2VMYWJlbF07XG5cdFx0dGhpcy5zdHJSZXNvdXJjZXMgPSBbdGhpcy5zdHJSZXNvdXJjZV07XG5cdFx0dGhpcy5ncm91cElkID0gZ3JvdXBJZDtcblx0XHR0aGlzLmdyb3VwT3JkZXIgPSBncm91cE9yZGVyO1xuXHRcdHRoaXMuc291cmNlSWQgPSBzb3VyY2VJZDtcblx0XHR0aGlzLnNvdXJjZU9yZGVyID0gc291cmNlT3JkZXI7XG5cdFx0dGhpcy5pc1ZhbGlkID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWYWxpZChpc1ZhbGlkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pc1ZhbGlkID0gaXNWYWxpZDtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgW2lkOiR7dGhpcy5pZH1dIFtncm91cDoke3RoaXMuZ3JvdXBJZH1dIFske3RoaXMuaXNWYWxpZCA/ICcgIFZBTElEJyA6ICdJTlZBTElEJ31dICR7dGhpcy5hY3R1YWwuY29uc3RydWN0b3IubmFtZX0gLSAke3RoaXMuYWN0dWFsfWA7XG5cdH1cbn1cblxuY29uc3QgZW51bSBSZW1vdmVkUmVzb3VyY2VSZWFzb24ge1xuXHRFeHRlcm5hbFJlbW92YWwgPSAwLFxuXHROb1BhcmFsbGVsVW5pdmVyc2VzID0gMVxufVxuXG5jbGFzcyBSZXNvdXJjZVJlYXNvblBhaXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVzb3VyY2VMYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSByZWFzb246IFJlbW92ZWRSZXNvdXJjZVJlYXNvblxuXHQpIHsgfVxufVxuXG5jbGFzcyBSZW1vdmVkUmVzb3VyY2VzIHtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvdXJjZVJlYXNvblBhaXI+KCk7XG5cblx0cHVibGljIGNyZWF0ZU1lc3NhZ2UoKTogc3RyaW5nIHtcblx0XHRjb25zdCBleHRlcm5hbFJlbW92YWw6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgbm9QYXJhbGxlbFVuaXZlcnNlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFssIGVsZW1lbnRdIG9mIHRoaXMuZWxlbWVudHMpIHtcblx0XHRcdGNvbnN0IGRlc3QgPSAoXG5cdFx0XHRcdGVsZW1lbnQucmVhc29uID09PSBSZW1vdmVkUmVzb3VyY2VSZWFzb24uRXh0ZXJuYWxSZW1vdmFsXG5cdFx0XHRcdFx0PyBleHRlcm5hbFJlbW92YWxcblx0XHRcdFx0XHQ6IG5vUGFyYWxsZWxVbml2ZXJzZXNcblx0XHRcdCk7XG5cdFx0XHRkZXN0LnB1c2goZWxlbWVudC5yZXNvdXJjZUxhYmVsKTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoZXh0ZXJuYWxSZW1vdmFsLmxlbmd0aCA+IDApIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2goXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2V4dGVybmFsUmVtb3ZhbCcsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGlzdCBvZiBmaWxlbmFtZXMnXSB9LFxuXHRcdFx0XHRcdFwiVGhlIGZvbGxvd2luZyBmaWxlcyBoYXZlIGJlZW4gY2xvc2VkIGFuZCBtb2RpZmllZCBvbiBkaXNrOiB7MH0uXCIsIGV4dGVybmFsUmVtb3ZhbC5qb2luKCcsICcpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChub1BhcmFsbGVsVW5pdmVyc2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2goXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ25vUGFyYWxsZWxVbml2ZXJzZXMnLCBjb21tZW50OiBbJ3swfSBpcyBhIGxpc3Qgb2YgZmlsZW5hbWVzJ10gfSxcblx0XHRcdFx0XHRcIlRoZSBmb2xsb3dpbmcgZmlsZXMgaGF2ZSBiZWVuIG1vZGlmaWVkIGluIGFuIGluY29tcGF0aWJsZSB3YXk6IHswfS5cIiwgbm9QYXJhbGxlbFVuaXZlcnNlcy5qb2luKCcsICcpXG5cdFx0XHRcdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWVzc2FnZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50cy5zaXplO1xuXHR9XG5cblx0cHVibGljIGhhcyhzdHJSZXNvdXJjZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHMuaGFzKHN0clJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQoc3RyUmVzb3VyY2U6IHN0cmluZywgdmFsdWU6IFJlc291cmNlUmVhc29uUGFpcik6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudHMuc2V0KHN0clJlc291cmNlLCB2YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZGVsZXRlKHN0clJlc291cmNlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50cy5kZWxldGUoc3RyUmVzb3VyY2UpO1xuXHR9XG59XG5cbmNsYXNzIFdvcmtzcGFjZVN0YWNrRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSBpZCA9ICgrK3N0YWNrRWxlbWVudENvdW50ZXIpO1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWN0dWFsOiBJV29ya3NwYWNlVW5kb1JlZG9FbGVtZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGNvbmZpcm1CZWZvcmVVbmRvOiBib29sZWFuO1xuXG5cdHB1YmxpYyByZWFkb25seSByZXNvdXJjZUxhYmVsczogc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSBzdHJSZXNvdXJjZXM6IHN0cmluZ1tdO1xuXHRwdWJsaWMgcmVhZG9ubHkgZ3JvdXBJZDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgZ3JvdXBPcmRlcjogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc291cmNlSWQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHNvdXJjZU9yZGVyOiBudW1iZXI7XG5cdHB1YmxpYyByZW1vdmVkUmVzb3VyY2VzOiBSZW1vdmVkUmVzb3VyY2VzIHwgbnVsbDtcblx0cHVibGljIGludmFsaWRhdGVkUmVzb3VyY2VzOiBSZW1vdmVkUmVzb3VyY2VzIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihhY3R1YWw6IElXb3Jrc3BhY2VVbmRvUmVkb0VsZW1lbnQsIHJlc291cmNlTGFiZWxzOiBzdHJpbmdbXSwgc3RyUmVzb3VyY2VzOiBzdHJpbmdbXSwgZ3JvdXBJZDogbnVtYmVyLCBncm91cE9yZGVyOiBudW1iZXIsIHNvdXJjZUlkOiBudW1iZXIsIHNvdXJjZU9yZGVyOiBudW1iZXIpIHtcblx0XHR0aGlzLmFjdHVhbCA9IGFjdHVhbDtcblx0XHR0aGlzLmxhYmVsID0gYWN0dWFsLmxhYmVsO1xuXHRcdHRoaXMuY29uZmlybUJlZm9yZVVuZG8gPSBhY3R1YWwuY29uZmlybUJlZm9yZVVuZG8gfHwgZmFsc2U7XG5cdFx0dGhpcy5yZXNvdXJjZUxhYmVscyA9IHJlc291cmNlTGFiZWxzO1xuXHRcdHRoaXMuc3RyUmVzb3VyY2VzID0gc3RyUmVzb3VyY2VzO1xuXHRcdHRoaXMuZ3JvdXBJZCA9IGdyb3VwSWQ7XG5cdFx0dGhpcy5ncm91cE9yZGVyID0gZ3JvdXBPcmRlcjtcblx0XHR0aGlzLnNvdXJjZUlkID0gc291cmNlSWQ7XG5cdFx0dGhpcy5zb3VyY2VPcmRlciA9IHNvdXJjZU9yZGVyO1xuXHRcdHRoaXMucmVtb3ZlZFJlc291cmNlcyA9IG51bGw7XG5cdFx0dGhpcy5pbnZhbGlkYXRlZFJlc291cmNlcyA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgY2FuU3BsaXQoKTogdGhpcyBpcyBXb3Jrc3BhY2VTdGFja0VsZW1lbnQgJiB7IGFjdHVhbDogeyBzcGxpdCgpOiBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnRbXSB9IH0ge1xuXHRcdHJldHVybiAodHlwZW9mIHRoaXMuYWN0dWFsLnNwbGl0ID09PSAnZnVuY3Rpb24nKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVSZXNvdXJjZShyZXNvdXJjZUxhYmVsOiBzdHJpbmcsIHN0clJlc291cmNlOiBzdHJpbmcsIHJlYXNvbjogUmVtb3ZlZFJlc291cmNlUmVhc29uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlbW92ZWRSZXNvdXJjZXMpIHtcblx0XHRcdHRoaXMucmVtb3ZlZFJlc291cmNlcyA9IG5ldyBSZW1vdmVkUmVzb3VyY2VzKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5yZW1vdmVkUmVzb3VyY2VzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMucmVtb3ZlZFJlc291cmNlcy5zZXQoc3RyUmVzb3VyY2UsIG5ldyBSZXNvdXJjZVJlYXNvblBhaXIocmVzb3VyY2VMYWJlbCwgcmVhc29uKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldFZhbGlkKHJlc291cmNlTGFiZWw6IHN0cmluZywgc3RyUmVzb3VyY2U6IHN0cmluZywgaXNWYWxpZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc1ZhbGlkKSB7XG5cdFx0XHRpZiAodGhpcy5pbnZhbGlkYXRlZFJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzLmRlbGV0ZShzdHJSZXNvdXJjZSk7XG5cdFx0XHRcdGlmICh0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuaW52YWxpZGF0ZWRSZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5pbnZhbGlkYXRlZFJlc291cmNlcyA9IG5ldyBSZW1vdmVkUmVzb3VyY2VzKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuaW52YWxpZGF0ZWRSZXNvdXJjZXMuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzLnNldChzdHJSZXNvdXJjZSwgbmV3IFJlc291cmNlUmVhc29uUGFpcihyZXNvdXJjZUxhYmVsLCBSZW1vdmVkUmVzb3VyY2VSZWFzb24uRXh0ZXJuYWxSZW1vdmFsKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBbaWQ6JHt0aGlzLmlkfV0gW2dyb3VwOiR7dGhpcy5ncm91cElkfV0gWyR7dGhpcy5pbnZhbGlkYXRlZFJlc291cmNlcyA/ICdJTlZBTElEJyA6ICcgIFZBTElEJ31dICR7dGhpcy5hY3R1YWwuY29uc3RydWN0b3IubmFtZX0gLSAke3RoaXMuYWN0dWFsfWA7XG5cdH1cbn1cblxudHlwZSBTdGFja0VsZW1lbnQgPSBSZXNvdXJjZVN0YWNrRWxlbWVudCB8IFdvcmtzcGFjZVN0YWNrRWxlbWVudDtcblxuY2xhc3MgUmVzb3VyY2VFZGl0U3RhY2sge1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVzb3VyY2VMYWJlbDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0clJlc291cmNlOiBzdHJpbmc7XG5cdHByaXZhdGUgX3Bhc3Q6IFN0YWNrRWxlbWVudFtdO1xuXHRwcml2YXRlIF9mdXR1cmU6IFN0YWNrRWxlbWVudFtdO1xuXHRwdWJsaWMgbG9ja2VkOiBib29sZWFuO1xuXHRwdWJsaWMgdmVyc2lvbklkOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IocmVzb3VyY2VMYWJlbDogc3RyaW5nLCBzdHJSZXNvdXJjZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5yZXNvdXJjZUxhYmVsID0gcmVzb3VyY2VMYWJlbDtcblx0XHR0aGlzLnN0clJlc291cmNlID0gc3RyUmVzb3VyY2U7XG5cdFx0dGhpcy5fcGFzdCA9IFtdO1xuXHRcdHRoaXMuX2Z1dHVyZSA9IFtdO1xuXHRcdHRoaXMubG9ja2VkID0gZmFsc2U7XG5cdFx0dGhpcy52ZXJzaW9uSWQgPSAxO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX3Bhc3QpIHtcblx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlUmVzb3VyY2UodGhpcy5yZXNvdXJjZUxhYmVsLCB0aGlzLnN0clJlc291cmNlLCBSZW1vdmVkUmVzb3VyY2VSZWFzb24uRXh0ZXJuYWxSZW1vdmFsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX2Z1dHVyZSkge1xuXHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVSZXNvdXJjZSh0aGlzLnJlc291cmNlTGFiZWwsIHRoaXMuc3RyUmVzb3VyY2UsIFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5FeHRlcm5hbFJlbW92YWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdHJlc3VsdC5wdXNoKGAqICR7dGhpcy5zdHJSZXNvdXJjZX06YCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9wYXN0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZXN1bHQucHVzaChgICAgKiBbVU5ET10gJHt0aGlzLl9wYXN0W2ldfWApO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gdGhpcy5fZnV0dXJlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRyZXN1bHQucHVzaChgICAgKiBbUkVET10gJHt0aGlzLl9mdXR1cmVbaV19YCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgZmx1c2hBbGxFbGVtZW50cygpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXN0ID0gW107XG5cdFx0dGhpcy5fZnV0dXJlID0gW107XG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblx0fVxuXG5cdHB1YmxpYyBzZXRFbGVtZW50c0lzVmFsaWQoaXNWYWxpZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9wYXN0KSB7XG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0XHRlbGVtZW50LnNldFZhbGlkKHRoaXMucmVzb3VyY2VMYWJlbCwgdGhpcy5zdHJSZXNvdXJjZSwgaXNWYWxpZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbGVtZW50LnNldFZhbGlkKGlzVmFsaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5fZnV0dXJlKSB7XG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0XHRlbGVtZW50LnNldFZhbGlkKHRoaXMucmVzb3VyY2VMYWJlbCwgdGhpcy5zdHJSZXNvdXJjZSwgaXNWYWxpZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbGVtZW50LnNldFZhbGlkKGlzVmFsaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEVsZW1lbnRWYWxpZEZsYWcoZWxlbWVudDogU3RhY2tFbGVtZW50LCBpc1ZhbGlkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdGVsZW1lbnQuc2V0VmFsaWQodGhpcy5yZXNvdXJjZUxhYmVsLCB0aGlzLnN0clJlc291cmNlLCBpc1ZhbGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWxlbWVudC5zZXRWYWxpZChpc1ZhbGlkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0RWxlbWVudHNWYWxpZEZsYWcoaXNWYWxpZDogYm9vbGVhbiwgZmlsdGVyOiAoZWxlbWVudDogSVVuZG9SZWRvRWxlbWVudCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9wYXN0KSB7XG5cdFx0XHRpZiAoZmlsdGVyKGVsZW1lbnQuYWN0dWFsKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRFbGVtZW50VmFsaWRGbGFnKGVsZW1lbnQsIGlzVmFsaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5fZnV0dXJlKSB7XG5cdFx0XHRpZiAoZmlsdGVyKGVsZW1lbnQuYWN0dWFsKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRFbGVtZW50VmFsaWRGbGFnKGVsZW1lbnQsIGlzVmFsaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwdXNoRWxlbWVudChlbGVtZW50OiBTdGFja0VsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyByZW1vdmUgdGhlIGZ1dHVyZVxuXHRcdGZvciAoY29uc3QgZnV0dXJlRWxlbWVudCBvZiB0aGlzLl9mdXR1cmUpIHtcblx0XHRcdGlmIChmdXR1cmVFbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdGZ1dHVyZUVsZW1lbnQucmVtb3ZlUmVzb3VyY2UodGhpcy5yZXNvdXJjZUxhYmVsLCB0aGlzLnN0clJlc291cmNlLCBSZW1vdmVkUmVzb3VyY2VSZWFzb24uTm9QYXJhbGxlbFVuaXZlcnNlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2Z1dHVyZSA9IFtdO1xuXHRcdHRoaXMuX3Bhc3QucHVzaChlbGVtZW50KTtcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVNuYXBzaG90KHJlc291cmNlOiBVUkkpOiBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90IHtcblx0XHRjb25zdCBlbGVtZW50czogbnVtYmVyW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9wYXN0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRlbGVtZW50cy5wdXNoKHRoaXMuX3Bhc3RbaV0uaWQpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gdGhpcy5fZnV0dXJlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRlbGVtZW50cy5wdXNoKHRoaXMuX2Z1dHVyZVtpXS5pZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90KHJlc291cmNlLCBlbGVtZW50cyk7XG5cdH1cblxuXHRwdWJsaWMgcmVzdG9yZVNuYXBzaG90KHNuYXBzaG90OiBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90KTogdm9pZCB7XG5cdFx0Y29uc3Qgc25hcHNob3RMZW5ndGggPSBzbmFwc2hvdC5lbGVtZW50cy5sZW5ndGg7XG5cdFx0bGV0IGlzT0sgPSB0cnVlO1xuXHRcdGxldCBzbmFwc2hvdEluZGV4ID0gMDtcblx0XHRsZXQgcmVtb3ZlUGFzdEFmdGVyID0gLTE7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3Bhc3QubGVuZ3RoOyBpIDwgbGVuOyBpKyssIHNuYXBzaG90SW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuX3Bhc3RbaV07XG5cdFx0XHRpZiAoaXNPSyAmJiAoc25hcHNob3RJbmRleCA+PSBzbmFwc2hvdExlbmd0aCB8fCBlbGVtZW50LmlkICE9PSBzbmFwc2hvdC5lbGVtZW50c1tzbmFwc2hvdEluZGV4XSkpIHtcblx0XHRcdFx0aXNPSyA9IGZhbHNlO1xuXHRcdFx0XHRyZW1vdmVQYXN0QWZ0ZXIgPSBpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc09LICYmIGVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVSZXNvdXJjZSh0aGlzLnJlc291cmNlTGFiZWwsIHRoaXMuc3RyUmVzb3VyY2UsIFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5FeHRlcm5hbFJlbW92YWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgcmVtb3ZlRnV0dXJlQmVmb3JlID0gLTE7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2Z1dHVyZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSwgc25hcHNob3RJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fZnV0dXJlW2ldO1xuXHRcdFx0aWYgKGlzT0sgJiYgKHNuYXBzaG90SW5kZXggPj0gc25hcHNob3RMZW5ndGggfHwgZWxlbWVudC5pZCAhPT0gc25hcHNob3QuZWxlbWVudHNbc25hcHNob3RJbmRleF0pKSB7XG5cdFx0XHRcdGlzT0sgPSBmYWxzZTtcblx0XHRcdFx0cmVtb3ZlRnV0dXJlQmVmb3JlID0gaTtcblx0XHRcdH1cblx0XHRcdGlmICghaXNPSyAmJiBlbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlUmVzb3VyY2UodGhpcy5yZXNvdXJjZUxhYmVsLCB0aGlzLnN0clJlc291cmNlLCBSZW1vdmVkUmVzb3VyY2VSZWFzb24uRXh0ZXJuYWxSZW1vdmFsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlbW92ZVBhc3RBZnRlciAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX3Bhc3QgPSB0aGlzLl9wYXN0LnNsaWNlKDAsIHJlbW92ZVBhc3RBZnRlcik7XG5cdFx0fVxuXHRcdGlmIChyZW1vdmVGdXR1cmVCZWZvcmUgIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9mdXR1cmUgPSB0aGlzLl9mdXR1cmUuc2xpY2UocmVtb3ZlRnV0dXJlQmVmb3JlICsgMSk7XG5cdFx0fVxuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWxlbWVudHMoKTogSVBhc3RGdXR1cmVFbGVtZW50cyB7XG5cdFx0Y29uc3QgcGFzdDogSVVuZG9SZWRvRWxlbWVudFtdID0gW107XG5cdFx0Y29uc3QgZnV0dXJlOiBJVW5kb1JlZG9FbGVtZW50W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9wYXN0KSB7XG5cdFx0XHRwYXN0LnB1c2goZWxlbWVudC5hY3R1YWwpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5fZnV0dXJlKSB7XG5cdFx0XHRmdXR1cmUucHVzaChlbGVtZW50LmFjdHVhbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgcGFzdCwgZnV0dXJlIH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCk6IFN0YWNrRWxlbWVudCB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9wYXN0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wYXN0W3RoaXMuX3Bhc3QubGVuZ3RoIC0gMV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Vjb25kQ2xvc2VzdFBhc3RFbGVtZW50KCk6IFN0YWNrRWxlbWVudCB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9wYXN0Lmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGFzdFt0aGlzLl9wYXN0Lmxlbmd0aCAtIDJdO1xuXHR9XG5cblx0cHVibGljIGdldENsb3Nlc3RGdXR1cmVFbGVtZW50KCk6IFN0YWNrRWxlbWVudCB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9mdXR1cmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Z1dHVyZVt0aGlzLl9mdXR1cmUubGVuZ3RoIC0gMV07XG5cdH1cblxuXHRwdWJsaWMgaGFzUGFzdEVsZW1lbnRzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5fcGFzdC5sZW5ndGggPiAwKTtcblx0fVxuXG5cdHB1YmxpYyBoYXNGdXR1cmVFbGVtZW50cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX2Z1dHVyZS5sZW5ndGggPiAwKTtcblx0fVxuXG5cdHB1YmxpYyBzcGxpdFBhc3RXb3Jrc3BhY2VFbGVtZW50KHRvUmVtb3ZlOiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGluZGl2aWR1YWxNYXA6IE1hcDxzdHJpbmcsIFJlc291cmNlU3RhY2tFbGVtZW50Pik6IHZvaWQge1xuXHRcdGZvciAobGV0IGogPSB0aGlzLl9wYXN0Lmxlbmd0aCAtIDE7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRpZiAodGhpcy5fcGFzdFtqXSA9PT0gdG9SZW1vdmUpIHtcblx0XHRcdFx0aWYgKGluZGl2aWR1YWxNYXAuaGFzKHRoaXMuc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Ly8gZ2V0cyByZXBsYWNlZFxuXHRcdFx0XHRcdHRoaXMuX3Bhc3Rbal0gPSBpbmRpdmlkdWFsTWFwLmdldCh0aGlzLnN0clJlc291cmNlKSE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gZ2V0cyBkZWxldGVkXG5cdFx0XHRcdFx0dGhpcy5fcGFzdC5zcGxpY2UoaiwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdH1cblxuXHRwdWJsaWMgc3BsaXRGdXR1cmVXb3Jrc3BhY2VFbGVtZW50KHRvUmVtb3ZlOiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGluZGl2aWR1YWxNYXA6IE1hcDxzdHJpbmcsIFJlc291cmNlU3RhY2tFbGVtZW50Pik6IHZvaWQge1xuXHRcdGZvciAobGV0IGogPSB0aGlzLl9mdXR1cmUubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcblx0XHRcdGlmICh0aGlzLl9mdXR1cmVbal0gPT09IHRvUmVtb3ZlKSB7XG5cdFx0XHRcdGlmIChpbmRpdmlkdWFsTWFwLmhhcyh0aGlzLnN0clJlc291cmNlKSkge1xuXHRcdFx0XHRcdC8vIGdldHMgcmVwbGFjZWRcblx0XHRcdFx0XHR0aGlzLl9mdXR1cmVbal0gPSBpbmRpdmlkdWFsTWFwLmdldCh0aGlzLnN0clJlc291cmNlKSE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gZ2V0cyBkZWxldGVkXG5cdFx0XHRcdFx0dGhpcy5fZnV0dXJlLnNwbGljZShqLCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblx0fVxuXG5cdHB1YmxpYyBtb3ZlQmFja3dhcmQoZWxlbWVudDogU3RhY2tFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcGFzdC5wb3AoKTtcblx0XHR0aGlzLl9mdXR1cmUucHVzaChlbGVtZW50KTtcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHR9XG5cblx0cHVibGljIG1vdmVGb3J3YXJkKGVsZW1lbnQ6IFN0YWNrRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2Z1dHVyZS5wb3AoKTtcblx0XHR0aGlzLl9wYXN0LnB1c2goZWxlbWVudCk7XG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblx0fVxufVxuXG5jbGFzcyBFZGl0U3RhY2tTbmFwc2hvdCB7XG5cblx0cHVibGljIHJlYWRvbmx5IGVkaXRTdGFja3M6IFJlc291cmNlRWRpdFN0YWNrW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZlcnNpb25JZHM6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKGVkaXRTdGFja3M6IFJlc291cmNlRWRpdFN0YWNrW10pIHtcblx0XHR0aGlzLmVkaXRTdGFja3MgPSBlZGl0U3RhY2tzO1xuXHRcdHRoaXMuX3ZlcnNpb25JZHMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5lZGl0U3RhY2tzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHR0aGlzLl92ZXJzaW9uSWRzW2ldID0gdGhpcy5lZGl0U3RhY2tzW2ldLnZlcnNpb25JZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaXNWYWxpZCgpOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5lZGl0U3RhY2tzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5fdmVyc2lvbklkc1tpXSAhPT0gdGhpcy5lZGl0U3RhY2tzW2ldLnZlcnNpb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNvbnN0IG1pc3NpbmdFZGl0U3RhY2sgPSBuZXcgUmVzb3VyY2VFZGl0U3RhY2soJycsICcnKTtcbm1pc3NpbmdFZGl0U3RhY2subG9ja2VkID0gdHJ1ZTtcblxuZXhwb3J0IGNsYXNzIFVuZG9SZWRvU2VydmljZSBpbXBsZW1lbnRzIElVbmRvUmVkb1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0U3RhY2tzOiBNYXA8c3RyaW5nLCBSZXNvdXJjZUVkaXRTdGFjaz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcnM6IFtzdHJpbmcsIFVyaUNvbXBhcmlzb25LZXlDb21wdXRlcl1bXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9lZGl0U3RhY2tzID0gbmV3IE1hcDxzdHJpbmcsIFJlc291cmNlRWRpdFN0YWNrPigpO1xuXHRcdHRoaXMuX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcnMgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclVyaUNvbXBhcmlzb25LZXlDb21wdXRlcihzY2hlbWU6IHN0cmluZywgdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyOiBVcmlDb21wYXJpc29uS2V5Q29tcHV0ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVycy5wdXNoKFtzY2hlbWUsIHVyaUNvbXBhcmlzb25LZXlDb21wdXRlcl0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcnNbaV1bMV0gPT09IHVyaUNvbXBhcmlzb25LZXlDb21wdXRlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVycy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGZvciAoY29uc3QgdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyIG9mIHRoaXMuX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcnMpIHtcblx0XHRcdGlmICh1cmlDb21wYXJpc29uS2V5Q29tcHV0ZXJbMF0gPT09IHJlc291cmNlLnNjaGVtZSkge1xuXHRcdFx0XHRyZXR1cm4gdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyWzFdLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByaW50KGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zb2xlLmxvZyhgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tYCk7XG5cdFx0Y29uc29sZS5sb2coYEFGVEVSICR7bGFiZWx9OiBgKTtcblx0XHRjb25zdCBzdHI6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX2VkaXRTdGFja3MpIHtcblx0XHRcdHN0ci5wdXNoKGVsZW1lbnRbMV0udG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nKHN0ci5qb2luKCdcXG4nKSk7XG5cdH1cblxuXHRwdWJsaWMgcHVzaEVsZW1lbnQoZWxlbWVudDogSVVuZG9SZWRvRWxlbWVudCwgZ3JvdXA6IFVuZG9SZWRvR3JvdXAgPSBVbmRvUmVkb0dyb3VwLk5vbmUsIHNvdXJjZTogVW5kb1JlZG9Tb3VyY2UgPSBVbmRvUmVkb1NvdXJjZS5Ob25lKTogdm9pZCB7XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VMYWJlbCA9IGdldFJlc291cmNlTGFiZWwoZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShlbGVtZW50LnJlc291cmNlKTtcblx0XHRcdHRoaXMuX3B1c2hFbGVtZW50KG5ldyBSZXNvdXJjZVN0YWNrRWxlbWVudChlbGVtZW50LCByZXNvdXJjZUxhYmVsLCBzdHJSZXNvdXJjZSwgZ3JvdXAuaWQsIGdyb3VwLm5leHRPcmRlcigpLCBzb3VyY2UuaWQsIHNvdXJjZS5uZXh0T3JkZXIoKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZUxhYmVsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHN0clJlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZWxlbWVudC5yZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VMYWJlbCA9IGdldFJlc291cmNlTGFiZWwocmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZSk7XG5cblx0XHRcdFx0aWYgKHNlZW4uaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKHN0clJlc291cmNlKTtcblx0XHRcdFx0cmVzb3VyY2VMYWJlbHMucHVzaChyZXNvdXJjZUxhYmVsKTtcblx0XHRcdFx0c3RyUmVzb3VyY2VzLnB1c2goc3RyUmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzb3VyY2VMYWJlbHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHRoaXMuX3B1c2hFbGVtZW50KG5ldyBSZXNvdXJjZVN0YWNrRWxlbWVudChlbGVtZW50LCByZXNvdXJjZUxhYmVsc1swXSwgc3RyUmVzb3VyY2VzWzBdLCBncm91cC5pZCwgZ3JvdXAubmV4dE9yZGVyKCksIHNvdXJjZS5pZCwgc291cmNlLm5leHRPcmRlcigpKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wdXNoRWxlbWVudChuZXcgV29ya3NwYWNlU3RhY2tFbGVtZW50KGVsZW1lbnQsIHJlc291cmNlTGFiZWxzLCBzdHJSZXNvdXJjZXMsIGdyb3VwLmlkLCBncm91cC5uZXh0T3JkZXIoKSwgc291cmNlLmlkLCBzb3VyY2UubmV4dE9yZGVyKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKERFQlVHKSB7XG5cdFx0XHR0aGlzLl9wcmludCgncHVzaEVsZW1lbnQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wdXNoRWxlbWVudChlbGVtZW50OiBTdGFja0VsZW1lbnQpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZWxlbWVudC5zdHJSZXNvdXJjZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlc291cmNlTGFiZWwgPSBlbGVtZW50LnJlc291cmNlTGFiZWxzW2ldO1xuXHRcdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSBlbGVtZW50LnN0clJlc291cmNlc1tpXTtcblxuXHRcdFx0bGV0IGVkaXRTdGFjazogUmVzb3VyY2VFZGl0U3RhY2s7XG5cdFx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlZGl0U3RhY2sgPSBuZXcgUmVzb3VyY2VFZGl0U3RhY2socmVzb3VyY2VMYWJlbCwgc3RyUmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9lZGl0U3RhY2tzLnNldChzdHJSZXNvdXJjZSwgZWRpdFN0YWNrKTtcblx0XHRcdH1cblxuXHRcdFx0ZWRpdFN0YWNrLnB1c2hFbGVtZW50KGVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRMYXN0RWxlbWVudChyZXNvdXJjZTogVVJJKTogSVVuZG9SZWRvRWxlbWVudCB8IG51bGwge1xuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0aWYgKGVkaXRTdGFjay5oYXNGdXR1cmVFbGVtZW50cygpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2xvc2VzdFBhc3RFbGVtZW50ID0gZWRpdFN0YWNrLmdldENsb3Nlc3RQYXN0RWxlbWVudCgpO1xuXHRcdFx0cmV0dXJuIGNsb3Nlc3RQYXN0RWxlbWVudCA/IGNsb3Nlc3RQYXN0RWxlbWVudC5hY3R1YWwgOiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3NwbGl0UGFzdFdvcmtzcGFjZUVsZW1lbnQodG9SZW1vdmU6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCAmIHsgYWN0dWFsOiB7IHNwbGl0KCk6IElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudFtdIH0gfSwgaWdub3JlUmVzb3VyY2VzOiBSZW1vdmVkUmVzb3VyY2VzIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGl2aWR1YWxBcnIgPSB0b1JlbW92ZS5hY3R1YWwuc3BsaXQoKTtcblx0XHRjb25zdCBpbmRpdmlkdWFsTWFwID0gbmV3IE1hcDxzdHJpbmcsIFJlc291cmNlU3RhY2tFbGVtZW50PigpO1xuXHRcdGZvciAoY29uc3QgX2VsZW1lbnQgb2YgaW5kaXZpZHVhbEFycikge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VMYWJlbCA9IGdldFJlc291cmNlTGFiZWwoX2VsZW1lbnQucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSB0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkoX2VsZW1lbnQucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IG5ldyBSZXNvdXJjZVN0YWNrRWxlbWVudChfZWxlbWVudCwgcmVzb3VyY2VMYWJlbCwgc3RyUmVzb3VyY2UsIDAsIDAsIDAsIDApO1xuXHRcdFx0aW5kaXZpZHVhbE1hcC5zZXQoZWxlbWVudC5zdHJSZXNvdXJjZSwgZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzdHJSZXNvdXJjZSBvZiB0b1JlbW92ZS5zdHJSZXNvdXJjZXMpIHtcblx0XHRcdGlmIChpZ25vcmVSZXNvdXJjZXMgJiYgaWdub3JlUmVzb3VyY2VzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0ZWRpdFN0YWNrLnNwbGl0UGFzdFdvcmtzcGFjZUVsZW1lbnQodG9SZW1vdmUsIGluZGl2aWR1YWxNYXApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NwbGl0RnV0dXJlV29ya3NwYWNlRWxlbWVudCh0b1JlbW92ZTogV29ya3NwYWNlU3RhY2tFbGVtZW50ICYgeyBhY3R1YWw6IHsgc3BsaXQoKTogSVJlc291cmNlVW5kb1JlZG9FbGVtZW50W10gfSB9LCBpZ25vcmVSZXNvdXJjZXM6IFJlbW92ZWRSZXNvdXJjZXMgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kaXZpZHVhbEFyciA9IHRvUmVtb3ZlLmFjdHVhbC5zcGxpdCgpO1xuXHRcdGNvbnN0IGluZGl2aWR1YWxNYXAgPSBuZXcgTWFwPHN0cmluZywgUmVzb3VyY2VTdGFja0VsZW1lbnQ+KCk7XG5cdFx0Zm9yIChjb25zdCBfZWxlbWVudCBvZiBpbmRpdmlkdWFsQXJyKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gZ2V0UmVzb3VyY2VMYWJlbChfZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShfZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gbmV3IFJlc291cmNlU3RhY2tFbGVtZW50KF9lbGVtZW50LCByZXNvdXJjZUxhYmVsLCBzdHJSZXNvdXJjZSwgMCwgMCwgMCwgMCk7XG5cdFx0XHRpbmRpdmlkdWFsTWFwLnNldChlbGVtZW50LnN0clJlc291cmNlLCBlbGVtZW50KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHN0clJlc291cmNlIG9mIHRvUmVtb3ZlLnN0clJlc291cmNlcykge1xuXHRcdFx0aWYgKGlnbm9yZVJlc291cmNlcyAmJiBpZ25vcmVSZXNvdXJjZXMuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRlZGl0U3RhY2suc3BsaXRGdXR1cmVXb3Jrc3BhY2VFbGVtZW50KHRvUmVtb3ZlLCBpbmRpdmlkdWFsTWFwKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlRWxlbWVudHMocmVzb3VyY2U6IFVSSSB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdHlwZW9mIHJlc291cmNlID09PSAnc3RyaW5nJyA/IHJlc291cmNlIDogdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0ZWRpdFN0YWNrLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2VkaXRTdGFja3MuZGVsZXRlKHN0clJlc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKERFQlVHKSB7XG5cdFx0XHR0aGlzLl9wcmludCgncmVtb3ZlRWxlbWVudHMnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0RWxlbWVudHNWYWxpZEZsYWcocmVzb3VyY2U6IFVSSSwgaXNWYWxpZDogYm9vbGVhbiwgZmlsdGVyOiAoZWxlbWVudDogSVVuZG9SZWRvRWxlbWVudCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0ZWRpdFN0YWNrLnNldEVsZW1lbnRzVmFsaWRGbGFnKGlzVmFsaWQsIGZpbHRlcik7XG5cdFx0fVxuXHRcdGlmIChERUJVRykge1xuXHRcdFx0dGhpcy5fcHJpbnQoJ3NldEVsZW1lbnRzVmFsaWRGbGFnJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhc0VsZW1lbnRzKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX2VkaXRTdGFja3MuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdHJldHVybiAoZWRpdFN0YWNrLmhhc1Bhc3RFbGVtZW50cygpIHx8IGVkaXRTdGFjay5oYXNGdXR1cmVFbGVtZW50cygpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVNuYXBzaG90KHJlc291cmNlOiBVUkkpOiBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90IHtcblx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX2VkaXRTdGFja3MuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdHJldHVybiBlZGl0U3RhY2suY3JlYXRlU25hcHNob3QocmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QocmVzb3VyY2UsIFtdKTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlU25hcHNob3Qoc25hcHNob3Q6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QpOiB2b2lkIHtcblx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShzbmFwc2hvdC5yZXNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX2VkaXRTdGFja3MuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdGVkaXRTdGFjay5yZXN0b3JlU25hcHNob3Qoc25hcHNob3QpO1xuXG5cdFx0XHRpZiAoIWVkaXRTdGFjay5oYXNQYXN0RWxlbWVudHMoKSAmJiAhZWRpdFN0YWNrLmhhc0Z1dHVyZUVsZW1lbnRzKCkpIHtcblx0XHRcdFx0Ly8gdGhlIGVkaXQgc3RhY2sgaXMgbm93IGVtcHR5LCBqdXN0IHJlbW92ZSBpdCBlbnRpcmVseVxuXHRcdFx0XHRlZGl0U3RhY2suZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0U3RhY2tzLmRlbGV0ZShzdHJSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChERUJVRykge1xuXHRcdFx0dGhpcy5fcHJpbnQoJ3Jlc3RvcmVTbmFwc2hvdCcpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRFbGVtZW50cyhyZXNvdXJjZTogVVJJKTogSVBhc3RGdXR1cmVFbGVtZW50cyB7XG5cdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSB0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRyZXR1cm4gZWRpdFN0YWNrLmdldEVsZW1lbnRzKCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHBhc3Q6IFtdLCBmdXR1cmU6IFtdIH07XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQ2xvc2VzdFVuZG9FbGVtZW50V2l0aFNvdXJjZShzb3VyY2VJZDogbnVtYmVyKTogW1N0YWNrRWxlbWVudCB8IG51bGwsIHN0cmluZyB8IG51bGxdIHtcblx0XHRpZiAoIXNvdXJjZUlkKSB7XG5cdFx0XHRyZXR1cm4gW251bGwsIG51bGxdO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgYW4gZWxlbWVudCB3aXRoIHRoZSBzb3VyY2VJZCBhbmQgd2l0aCB0aGUgaGlnaGVzdCBzb3VyY2VPcmRlciByZWFkeSB0byBiZSB1bmRvbmVcblx0XHRsZXQgbWF0Y2hlZEVsZW1lbnQ6IFN0YWNrRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtYXRjaGVkU3RyUmVzb3VyY2U6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBbc3RyUmVzb3VyY2UsIGVkaXRTdGFja10gb2YgdGhpcy5fZWRpdFN0YWNrcykge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gZWRpdFN0YWNrLmdldENsb3Nlc3RQYXN0RWxlbWVudCgpO1xuXHRcdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FuZGlkYXRlLnNvdXJjZUlkID09PSBzb3VyY2VJZCkge1xuXHRcdFx0XHRpZiAoIW1hdGNoZWRFbGVtZW50IHx8IGNhbmRpZGF0ZS5zb3VyY2VPcmRlciA+IG1hdGNoZWRFbGVtZW50LnNvdXJjZU9yZGVyKSB7XG5cdFx0XHRcdFx0bWF0Y2hlZEVsZW1lbnQgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdFx0bWF0Y2hlZFN0clJlc291cmNlID0gc3RyUmVzb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gW21hdGNoZWRFbGVtZW50LCBtYXRjaGVkU3RyUmVzb3VyY2VdO1xuXHR9XG5cblx0cHVibGljIGNhblVuZG8ocmVzb3VyY2VPclNvdXJjZTogVVJJIHwgVW5kb1JlZG9Tb3VyY2UpOiBib29sZWFuIHtcblx0XHRpZiAocmVzb3VyY2VPclNvdXJjZSBpbnN0YW5jZW9mIFVuZG9SZWRvU291cmNlKSB7XG5cdFx0XHRjb25zdCBbLCBtYXRjaGVkU3RyUmVzb3VyY2VdID0gdGhpcy5fZmluZENsb3Nlc3RVbmRvRWxlbWVudFdpdGhTb3VyY2UocmVzb3VyY2VPclNvdXJjZS5pZCk7XG5cdFx0XHRyZXR1cm4gbWF0Y2hlZFN0clJlc291cmNlID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZU9yU291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0cmV0dXJuIGVkaXRTdGFjay5oYXNQYXN0RWxlbWVudHMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FcnJvcihlcnI6IEVycm9yLCBlbGVtZW50OiBTdGFja0VsZW1lbnQpOiB2b2lkIHtcblx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdC8vIEFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHVuZG9pbmcgb3IgcmVkb2luZyA9PiBkcm9wIHRoZSB1bmRvL3JlZG8gc3RhY2sgZm9yIGFsbCBhZmZlY3RlZCByZXNvdXJjZXNcblx0XHRmb3IgKGNvbnN0IHN0clJlc291cmNlIG9mIGVsZW1lbnQuc3RyUmVzb3VyY2VzKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUVsZW1lbnRzKHN0clJlc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNxdWlyZUxvY2tzKGVkaXRTdGFja1NuYXBzaG90OiBFZGl0U3RhY2tTbmFwc2hvdCk6ICgpID0+IHZvaWQge1xuXHRcdC8vIGZpcnN0LCBjaGVjayBpZiBhbGwgbG9ja3MgY2FuIGJlIGFjcXVpcmVkXG5cdFx0Zm9yIChjb25zdCBlZGl0U3RhY2sgb2YgZWRpdFN0YWNrU25hcHNob3QuZWRpdFN0YWNrcykge1xuXHRcdFx0aWYgKGVkaXRTdGFjay5sb2NrZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgYWNxdWlyZSBlZGl0IHN0YWNrIGxvY2snKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjYW4gYWNxdWlyZSBhbGwgbG9ja3Ncblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFjayBvZiBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzKSB7XG5cdFx0XHRlZGl0U3RhY2subG9ja2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0Ly8gcmVsZWFzZSBhbGwgbG9ja3Ncblx0XHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdFx0ZWRpdFN0YWNrLmxvY2tlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zYWZlSW52b2tlV2l0aExvY2tzKGVsZW1lbnQ6IFN0YWNrRWxlbWVudCwgaW52b2tlOiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCwgZWRpdFN0YWNrU25hcHNob3Q6IEVkaXRTdGFja1NuYXBzaG90LCBjbGVhbnVwOiBJRGlzcG9zYWJsZSwgY29udGludWF0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCk6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRjb25zdCByZWxlYXNlTG9ja3MgPSB0aGlzLl9hY3F1aXJlTG9ja3MoZWRpdFN0YWNrU25hcHNob3QpO1xuXG5cdFx0bGV0IHJlc3VsdDogUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGludm9rZSgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmVsZWFzZUxvY2tzKCk7XG5cdFx0XHRjbGVhbnVwLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB0aGlzLl9vbkVycm9yKGVyciwgZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0Ly8gcmVzdWx0IGlzIFByb21pc2U8dm9pZD5cblx0XHRcdHJldHVybiByZXN1bHQudGhlbihcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHJlbGVhc2VMb2NrcygpO1xuXHRcdFx0XHRcdGNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiBjb250aW51YXRpb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0KGVycikgPT4ge1xuXHRcdFx0XHRcdHJlbGVhc2VMb2NrcygpO1xuXHRcdFx0XHRcdGNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9vbkVycm9yKGVyciwgZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHJlc3VsdCBpcyB2b2lkXG5cdFx0XHRyZWxlYXNlTG9ja3MoKTtcblx0XHRcdGNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIGNvbnRpbnVhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ludm9rZVdvcmtzcGFjZVByZXBhcmUoZWxlbWVudDogV29ya3NwYWNlU3RhY2tFbGVtZW50KTogUHJvbWlzZTxJRGlzcG9zYWJsZT4ge1xuXHRcdGlmICh0eXBlb2YgZWxlbWVudC5hY3R1YWwucHJlcGFyZVVuZG9SZWRvID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gZWxlbWVudC5hY3R1YWwucHJlcGFyZVVuZG9SZWRvKCk7XG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52b2tlUmVzb3VyY2VQcmVwYXJlKGVsZW1lbnQ6IFJlc291cmNlU3RhY2tFbGVtZW50LCBjYWxsYmFjazogKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZWxlbWVudC5hY3R1YWwudHlwZSAhPT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UgfHwgdHlwZW9mIGVsZW1lbnQuYWN0dWFsLnByZXBhcmVVbmRvUmVkbyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdC8vIG5vIHByZXBhcmF0aW9uIG5lZWRlZFxuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKERpc3Bvc2FibGUuTm9uZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgciA9IGVsZW1lbnQuYWN0dWFsLnByZXBhcmVVbmRvUmVkbygpO1xuXHRcdGlmICghcikge1xuXHRcdFx0Ly8gbm90aGluZyB0byBjbGVhbiB1cFxuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKERpc3Bvc2FibGUuTm9uZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRGlzcG9zYWJsZShyKSkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKHIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByLnRoZW4oKGRpc3Bvc2FibGUpID0+IHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhkaXNwb3NhYmxlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFmZmVjdGVkRWRpdFN0YWNrcyhlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQpOiBFZGl0U3RhY2tTbmFwc2hvdCB7XG5cdFx0Y29uc3QgYWZmZWN0ZWRFZGl0U3RhY2tzOiBSZXNvdXJjZUVkaXRTdGFja1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBzdHJSZXNvdXJjZSBvZiBlbGVtZW50LnN0clJlc291cmNlcykge1xuXHRcdFx0YWZmZWN0ZWRFZGl0U3RhY2tzLnB1c2godGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpIHx8IG1pc3NpbmdFZGl0U3RhY2spO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEVkaXRTdGFja1NuYXBzaG90KGFmZmVjdGVkRWRpdFN0YWNrcyk7XG5cdH1cblxuXHRwcml2YXRlIF90cnlUb1NwbGl0QW5kVW5kbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGlnbm9yZVJlc291cmNlczogUmVtb3ZlZFJlc291cmNlcyB8IG51bGwsIG1lc3NhZ2U6IHN0cmluZyk6IFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yIHtcblx0XHRpZiAoZWxlbWVudC5jYW5TcGxpdCgpKSB7XG5cdFx0XHR0aGlzLl9zcGxpdFBhc3RXb3Jrc3BhY2VFbGVtZW50KGVsZW1lbnQsIGlnbm9yZVJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRyZXR1cm4gbmV3IFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yKHRoaXMuX3VuZG8oc3RyUmVzb3VyY2UsIDAsIHRydWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ2Fubm90IHNhZmVseSBzcGxpdCB0aGlzIHdvcmtzcGFjZSBlbGVtZW50ID0+IGZsdXNoIGFsbCB1bmRvL3JlZG8gc3RhY2tzXG5cdFx0XHRmb3IgKGNvbnN0IHN0clJlc291cmNlIG9mIGVsZW1lbnQuc3RyUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRWxlbWVudHMoc3RyUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2VWZXJpZmljYXRpb25FcnJvcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrV29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGVkaXRTdGFja1NuYXBzaG90OiBFZGl0U3RhY2tTbmFwc2hvdCwgY2hlY2tJbnZhbGlkYXRlZFJlc291cmNlczogYm9vbGVhbik6IFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yIHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQucmVtb3ZlZFJlc291cmNlcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RyeVRvU3BsaXRBbmRVbmRvKFxuXHRcdFx0XHRzdHJSZXNvdXJjZSxcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVkUmVzb3VyY2VzLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VVbmRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYW5vdGhlciBtZXNzYWdlLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgdW5kbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzLiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5yZW1vdmVkUmVzb3VyY2VzLmNyZWF0ZU1lc3NhZ2UoKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoY2hlY2tJbnZhbGlkYXRlZFJlc291cmNlcyAmJiBlbGVtZW50LmludmFsaWRhdGVkUmVzb3VyY2VzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFVuZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRlbGVtZW50LmludmFsaWRhdGVkUmVzb3VyY2VzLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VVbmRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYW5vdGhlciBtZXNzYWdlLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgdW5kbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzLiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5pbnZhbGlkYXRlZFJlc291cmNlcy5jcmVhdGVNZXNzYWdlKClcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyB0aGlzIG11c3QgYmUgdGhlIGxhc3QgcGFzdCBlbGVtZW50IGluIGFsbCB0aGUgaW1wYWN0ZWQgcmVzb3VyY2VzIVxuXHRcdGNvbnN0IGNhbm5vdFVuZG9EdWVUb1Jlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFjayBvZiBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzKSB7XG5cdFx0XHRpZiAoZWRpdFN0YWNrLmdldENsb3Nlc3RQYXN0RWxlbWVudCgpICE9PSBlbGVtZW50KSB7XG5cdFx0XHRcdGNhbm5vdFVuZG9EdWVUb1Jlc291cmNlcy5wdXNoKGVkaXRTdGFjay5yZXNvdXJjZUxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNhbm5vdFVuZG9EdWVUb1Jlc291cmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFVuZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VVbmRvRHVlVG9DaGFuZ2VzJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYSBsaXN0IG9mIGZpbGVuYW1lcy4nXSB9LFxuXHRcdFx0XHRcdFwiQ291bGQgbm90IHVuZG8gJ3swfScgYWNyb3NzIGFsbCBmaWxlcyBiZWNhdXNlIGNoYW5nZXMgd2VyZSBtYWRlIHRvIHsxfVwiLCBlbGVtZW50LmxhYmVsLCBjYW5ub3RVbmRvRHVlVG9SZXNvdXJjZXMuam9pbignLCAnKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhbm5vdExvY2tEdWVUb1Jlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFjayBvZiBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzKSB7XG5cdFx0XHRpZiAoZWRpdFN0YWNrLmxvY2tlZCkge1xuXHRcdFx0XHRjYW5ub3RMb2NrRHVlVG9SZXNvdXJjZXMucHVzaChlZGl0U3RhY2sucmVzb3VyY2VMYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjYW5ub3RMb2NrRHVlVG9SZXNvdXJjZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RyeVRvU3BsaXRBbmRVbmRvKFxuXHRcdFx0XHRzdHJSZXNvdXJjZSxcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0bnVsbCxcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnY2Fubm90V29ya3NwYWNlVW5kb0R1ZVRvSW5Qcm9ncmVzc1VuZG9SZWRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYSBsaXN0IG9mIGZpbGVuYW1lcy4nXSB9LFxuXHRcdFx0XHRcdFwiQ291bGQgbm90IHVuZG8gJ3swfScgYWNyb3NzIGFsbCBmaWxlcyBiZWNhdXNlIHRoZXJlIGlzIGFscmVhZHkgYW4gdW5kbyBvciByZWRvIG9wZXJhdGlvbiBydW5uaW5nIG9uIHsxfVwiLCBlbGVtZW50LmxhYmVsLCBjYW5ub3RMb2NrRHVlVG9SZXNvdXJjZXMuam9pbignLCAnKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGlmIG5ldyBzdGFjayBlbGVtZW50cyB3ZXJlIGFkZGVkIGluIHRoZSBtZWFudGltZS4uLlxuXHRcdGlmICghZWRpdFN0YWNrU25hcHNob3QuaXNWYWxpZCgpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFVuZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VVbmRvRHVlVG9Jbk1lYW50aW1lVW5kb1JlZG8nLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhIGxpc3Qgb2YgZmlsZW5hbWVzLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgdW5kbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzIGJlY2F1c2UgYW4gdW5kbyBvciByZWRvIG9wZXJhdGlvbiBvY2N1cnJlZCBpbiB0aGUgbWVhbnRpbWVcIiwgZWxlbWVudC5sYWJlbFxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIHVuZG9Db25maXJtZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0Y29uc3QgYWZmZWN0ZWRFZGl0U3RhY2tzID0gdGhpcy5fZ2V0QWZmZWN0ZWRFZGl0U3RhY2tzKGVsZW1lbnQpO1xuXHRcdGNvbnN0IHZlcmlmaWNhdGlvbkVycm9yID0gdGhpcy5fY2hlY2tXb3Jrc3BhY2VVbmRvKHN0clJlc291cmNlLCBlbGVtZW50LCBhZmZlY3RlZEVkaXRTdGFja3MsIC8qaW52YWxpZGF0ZWQgcmVzb3VyY2VzIHdpbGwgYmUgY2hlY2tlZCBhZnRlciB0aGUgcHJlcGFyZSBjYWxsKi9mYWxzZSk7XG5cdFx0aWYgKHZlcmlmaWNhdGlvbkVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdmVyaWZpY2F0aW9uRXJyb3IucmV0dXJuVmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb25maXJtQW5kRXhlY3V0ZVdvcmtzcGFjZVVuZG8oc3RyUmVzb3VyY2UsIGVsZW1lbnQsIGFmZmVjdGVkRWRpdFN0YWNrcywgdW5kb0NvbmZpcm1lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1BhcnRPZlVuZG9Hcm91cChlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIWVsZW1lbnQuZ3JvdXBJZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBjaGVjayB0aGF0IHRoZXJlIGlzIGF0IGxlYXN0IGFub3RoZXIgZWxlbWVudCB3aXRoIHRoZSBzYW1lIGdyb3VwSWQgcmVhZHkgdG8gYmUgdW5kb25lXG5cdFx0Zm9yIChjb25zdCBbLCBlZGl0U3RhY2tdIG9mIHRoaXMuX2VkaXRTdGFja3MpIHtcblx0XHRcdGNvbnN0IHBhc3RFbGVtZW50ID0gZWRpdFN0YWNrLmdldENsb3Nlc3RQYXN0RWxlbWVudCgpO1xuXHRcdFx0aWYgKCFwYXN0RWxlbWVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXN0RWxlbWVudCA9PT0gZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBzZWNvbmRQYXN0RWxlbWVudCA9IGVkaXRTdGFjay5nZXRTZWNvbmRDbG9zZXN0UGFzdEVsZW1lbnQoKTtcblx0XHRcdFx0aWYgKHNlY29uZFBhc3RFbGVtZW50ICYmIHNlY29uZFBhc3RFbGVtZW50Lmdyb3VwSWQgPT09IGVsZW1lbnQuZ3JvdXBJZCkge1xuXHRcdFx0XHRcdC8vIHRoZXJlIGlzIGFub3RoZXIgZWxlbWVudCB3aXRoIHRoZSBzYW1lIGdyb3VwIGlkIGluIHRoZSBzYW1lIHN0YWNrIVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFzdEVsZW1lbnQuZ3JvdXBJZCA9PT0gZWxlbWVudC5ncm91cElkKSB7XG5cdFx0XHRcdC8vIHRoZXJlIGlzIGFub3RoZXIgZWxlbWVudCB3aXRoIHRoZSBzYW1lIGdyb3VwIGlkIGluIGFub3RoZXIgc3RhY2shXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maXJtQW5kRXhlY3V0ZVdvcmtzcGFjZVVuZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgZWxlbWVudDogV29ya3NwYWNlU3RhY2tFbGVtZW50LCBlZGl0U3RhY2tTbmFwc2hvdDogRWRpdFN0YWNrU25hcHNob3QsIHVuZG9Db25maXJtZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGlmIChlbGVtZW50LmNhblNwbGl0KCkgJiYgIXRoaXMuX2lzUGFydE9mVW5kb0dyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHQvLyB0aGlzIGVsZW1lbnQgY2FuIGJlIHNwbGl0XG5cblx0XHRcdGVudW0gVW5kb0Nob2ljZSB7XG5cdFx0XHRcdEFsbCA9IDAsXG5cdFx0XHRcdFRoaXMgPSAxLFxuXHRcdFx0XHRDYW5jZWwgPSAyXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdDxVbmRvQ2hvaWNlPih7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybVdvcmtzcGFjZScsIFwiV291bGQgeW91IGxpa2UgdG8gdW5kbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzP1wiLCBlbGVtZW50LmxhYmVsKSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnezB9IGRlbm90ZXMgYSBudW1iZXIgdGhhdCBpcyA+IDEsICYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZVbmRvIGluIHswfSBGaWxlc1wiLCBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzLmxlbmd0aCksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IFVuZG9DaG9pY2UuQWxsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAnbm9rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlVuZG8gdGhpcyAmJkZpbGVcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IFVuZG9DaG9pY2UuVGhpc1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBVbmRvQ2hvaWNlLkNhbmNlbFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gVW5kb0Nob2ljZS5DYW5jZWwpIHtcblx0XHRcdFx0Ly8gY2hvaWNlOiBjYW5jZWxcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0ID09PSBVbmRvQ2hvaWNlLlRoaXMpIHtcblx0XHRcdFx0Ly8gY2hvaWNlOiB1bmRvIHRoaXMgZmlsZVxuXHRcdFx0XHR0aGlzLl9zcGxpdFBhc3RXb3Jrc3BhY2VFbGVtZW50KGVsZW1lbnQsIG51bGwpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdW5kbyhzdHJSZXNvdXJjZSwgMCwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNob2ljZTogdW5kbyBpbiBhbGwgZmlsZXNcblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCwgaXQgaXMgcG9zc2libGUgdGhhdCB0aGUgZWxlbWVudCBoYXMgYmVlbiBtYWRlIGludmFsaWQgaW4gdGhlIG1lYW50aW1lIChkdWUgdG8gdGhlIGNvbmZpcm1hdGlvbiBhd2FpdClcblx0XHRcdGNvbnN0IHZlcmlmaWNhdGlvbkVycm9yMSA9IHRoaXMuX2NoZWNrV29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZSwgZWxlbWVudCwgZWRpdFN0YWNrU25hcHNob3QsIC8qaW52YWxpZGF0ZWQgcmVzb3VyY2VzIHdpbGwgYmUgY2hlY2tlZCBhZnRlciB0aGUgcHJlcGFyZSBjYWxsKi9mYWxzZSk7XG5cdFx0XHRpZiAodmVyaWZpY2F0aW9uRXJyb3IxKSB7XG5cdFx0XHRcdHJldHVybiB2ZXJpZmljYXRpb25FcnJvcjEucmV0dXJuVmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdHVuZG9Db25maXJtZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIHByZXBhcmVcblx0XHRsZXQgY2xlYW51cDogSURpc3Bvc2FibGU7XG5cdFx0dHJ5IHtcblx0XHRcdGNsZWFudXAgPSBhd2FpdCB0aGlzLl9pbnZva2VXb3Jrc3BhY2VQcmVwYXJlKGVsZW1lbnQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29uRXJyb3IoZXJyLCBlbGVtZW50KTtcblx0XHR9XG5cblx0XHQvLyBBdCB0aGlzIHBvaW50LCBpdCBpcyBwb3NzaWJsZSB0aGF0IHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgaW52YWxpZCBpbiB0aGUgbWVhbnRpbWUgKGR1ZSB0byB0aGUgcHJlcGFyZSBhd2FpdClcblx0XHRjb25zdCB2ZXJpZmljYXRpb25FcnJvcjIgPSB0aGlzLl9jaGVja1dvcmtzcGFjZVVuZG8oc3RyUmVzb3VyY2UsIGVsZW1lbnQsIGVkaXRTdGFja1NuYXBzaG90LCAvKm5vdyBhbHNvIGNoZWNrIHRoYXQgdGhlcmUgYXJlIG5vIG1vcmUgaW52YWxpZGF0ZWQgcmVzb3VyY2VzKi90cnVlKTtcblx0XHRpZiAodmVyaWZpY2F0aW9uRXJyb3IyKSB7XG5cdFx0XHRjbGVhbnVwLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB2ZXJpZmljYXRpb25FcnJvcjIucmV0dXJuVmFsdWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlZGl0U3RhY2sgb2YgZWRpdFN0YWNrU25hcHNob3QuZWRpdFN0YWNrcykge1xuXHRcdFx0ZWRpdFN0YWNrLm1vdmVCYWNrd2FyZChlbGVtZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhZmVJbnZva2VXaXRoTG9ja3MoZWxlbWVudCwgKCkgPT4gZWxlbWVudC5hY3R1YWwudW5kbygpLCBlZGl0U3RhY2tTbmFwc2hvdCwgY2xlYW51cCwgKCkgPT4gdGhpcy5fY29udGludWVVbmRvSW5Hcm91cChlbGVtZW50Lmdyb3VwSWQsIHVuZG9Db25maXJtZWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc291cmNlVW5kbyhlZGl0U3RhY2s6IFJlc291cmNlRWRpdFN0YWNrLCBlbGVtZW50OiBSZXNvdXJjZVN0YWNrRWxlbWVudCwgdW5kb0NvbmZpcm1lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNWYWxpZCkge1xuXHRcdFx0Ly8gaW52YWxpZCBlbGVtZW50ID0+IGltbWVkaWF0ZWx5IGZsdXNoIGVkaXQgc3RhY2shXG5cdFx0XHRlZGl0U3RhY2suZmx1c2hBbGxFbGVtZW50cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZWRpdFN0YWNrLmxvY2tlZCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0eyBrZXk6ICdjYW5ub3RSZXNvdXJjZVVuZG9EdWVUb0luUHJvZ3Jlc3NVbmRvUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4nXSB9LFxuXHRcdFx0XHRcIkNvdWxkIG5vdCB1bmRvICd7MH0nIGJlY2F1c2UgdGhlcmUgaXMgYWxyZWFkeSBhbiB1bmRvIG9yIHJlZG8gb3BlcmF0aW9uIHJ1bm5pbmcuXCIsIGVsZW1lbnQubGFiZWxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pbnZva2VSZXNvdXJjZVByZXBhcmUoZWxlbWVudCwgKGNsZWFudXApID0+IHtcblx0XHRcdGVkaXRTdGFjay5tb3ZlQmFja3dhcmQoZWxlbWVudCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2FmZUludm9rZVdpdGhMb2NrcyhlbGVtZW50LCAoKSA9PiBlbGVtZW50LmFjdHVhbC51bmRvKCksIG5ldyBFZGl0U3RhY2tTbmFwc2hvdChbZWRpdFN0YWNrXSksIGNsZWFudXAsICgpID0+IHRoaXMuX2NvbnRpbnVlVW5kb0luR3JvdXAoZWxlbWVudC5ncm91cElkLCB1bmRvQ29uZmlybWVkKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQ2xvc2VzdFVuZG9FbGVtZW50SW5Hcm91cChncm91cElkOiBudW1iZXIpOiBbU3RhY2tFbGVtZW50IHwgbnVsbCwgc3RyaW5nIHwgbnVsbF0ge1xuXHRcdGlmICghZ3JvdXBJZCkge1xuXHRcdFx0cmV0dXJuIFtudWxsLCBudWxsXTtcblx0XHR9XG5cblx0XHQvLyBmaW5kIGFub3RoZXIgZWxlbWVudCB3aXRoIHRoZSBzYW1lIGdyb3VwSWQgYW5kIHdpdGggdGhlIGhpZ2hlc3QgZ3JvdXBPcmRlciByZWFkeSB0byBiZSB1bmRvbmVcblx0XHRsZXQgbWF0Y2hlZEVsZW1lbnQ6IFN0YWNrRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtYXRjaGVkU3RyUmVzb3VyY2U6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBbc3RyUmVzb3VyY2UsIGVkaXRTdGFja10gb2YgdGhpcy5fZWRpdFN0YWNrcykge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gZWRpdFN0YWNrLmdldENsb3Nlc3RQYXN0RWxlbWVudCgpO1xuXHRcdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FuZGlkYXRlLmdyb3VwSWQgPT09IGdyb3VwSWQpIHtcblx0XHRcdFx0aWYgKCFtYXRjaGVkRWxlbWVudCB8fCBjYW5kaWRhdGUuZ3JvdXBPcmRlciA+IG1hdGNoZWRFbGVtZW50Lmdyb3VwT3JkZXIpIHtcblx0XHRcdFx0XHRtYXRjaGVkRWxlbWVudCA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRtYXRjaGVkU3RyUmVzb3VyY2UgPSBzdHJSZXNvdXJjZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbbWF0Y2hlZEVsZW1lbnQsIG1hdGNoZWRTdHJSZXNvdXJjZV07XG5cdH1cblxuXHRwcml2YXRlIF9jb250aW51ZVVuZG9Jbkdyb3VwKGdyb3VwSWQ6IG51bWJlciwgdW5kb0NvbmZpcm1lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRpZiAoIWdyb3VwSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbLCBtYXRjaGVkU3RyUmVzb3VyY2VdID0gdGhpcy5fZmluZENsb3Nlc3RVbmRvRWxlbWVudEluR3JvdXAoZ3JvdXBJZCk7XG5cdFx0aWYgKG1hdGNoZWRTdHJSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VuZG8obWF0Y2hlZFN0clJlc291cmNlLCAwLCB1bmRvQ29uZmlybWVkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdW5kbyhyZXNvdXJjZU9yU291cmNlOiBVUkkgfCBVbmRvUmVkb1NvdXJjZSk6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRpZiAocmVzb3VyY2VPclNvdXJjZSBpbnN0YW5jZW9mIFVuZG9SZWRvU291cmNlKSB7XG5cdFx0XHRjb25zdCBbLCBtYXRjaGVkU3RyUmVzb3VyY2VdID0gdGhpcy5fZmluZENsb3Nlc3RVbmRvRWxlbWVudFdpdGhTb3VyY2UocmVzb3VyY2VPclNvdXJjZS5pZCk7XG5cdFx0XHRyZXR1cm4gbWF0Y2hlZFN0clJlc291cmNlID8gdGhpcy5fdW5kbyhtYXRjaGVkU3RyUmVzb3VyY2UsIHJlc291cmNlT3JTb3VyY2UuaWQsIGZhbHNlKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiByZXNvdXJjZU9yU291cmNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VuZG8ocmVzb3VyY2VPclNvdXJjZSwgMCwgZmFsc2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdW5kbyh0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2VPclNvdXJjZSksIDAsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VuZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgc291cmNlSWQ6IG51bWJlciA9IDAsIHVuZG9Db25maXJtZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCk7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuZ3JvdXBJZCkge1xuXHRcdFx0Ly8gdGhpcyBlbGVtZW50IGlzIGEgcGFydCBvZiBhIGdyb3VwLCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB1bmRvaW5nIGluIGEgZ3JvdXAgaXMgaW4gb3JkZXJcblx0XHRcdGNvbnN0IFttYXRjaGVkRWxlbWVudCwgbWF0Y2hlZFN0clJlc291cmNlXSA9IHRoaXMuX2ZpbmRDbG9zZXN0VW5kb0VsZW1lbnRJbkdyb3VwKGVsZW1lbnQuZ3JvdXBJZCk7XG5cdFx0XHRpZiAoZWxlbWVudCAhPT0gbWF0Y2hlZEVsZW1lbnQgJiYgbWF0Y2hlZFN0clJlc291cmNlKSB7XG5cdFx0XHRcdC8vIHRoZXJlIGlzIGFuIGVsZW1lbnQgaW4gdGhlIHNhbWUgZ3JvdXAgdGhhdCBzaG91bGQgYmUgdW5kb25lIGJlZm9yZSB0aGlzIG9uZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdW5kbyhtYXRjaGVkU3RyUmVzb3VyY2UsIHNvdXJjZUlkLCB1bmRvQ29uZmlybWVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRQcm9tcHRGb3JDb25maXJtYXRpb24gPSAoZWxlbWVudC5zb3VyY2VJZCAhPT0gc291cmNlSWQgfHwgZWxlbWVudC5jb25maXJtQmVmb3JlVW5kbyk7XG5cdFx0aWYgKHNob3VsZFByb21wdEZvckNvbmZpcm1hdGlvbiAmJiAhdW5kb0NvbmZpcm1lZCkge1xuXHRcdFx0Ly8gSGl0IGEgZGlmZmVyZW50IHNvdXJjZSBvciB0aGUgZWxlbWVudCBhc2tzIGZvciBwcm9tcHQgYmVmb3JlIHVuZG8sIHByb21wdCBmb3IgY29uZmlybWF0aW9uXG5cdFx0XHRyZXR1cm4gdGhpcy5fY29uZmlybUFuZENvbnRpbnVlVW5kbyhzdHJSZXNvdXJjZSwgc291cmNlSWQsIGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZSwgZWxlbWVudCwgdW5kb0NvbmZpcm1lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VVbmRvKGVkaXRTdGFjaywgZWxlbWVudCwgdW5kb0NvbmZpcm1lZCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChERUJVRykge1xuXHRcdFx0XHR0aGlzLl9wcmludCgndW5kbycpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpcm1BbmRDb250aW51ZVVuZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgc291cmNlSWQ6IG51bWJlciwgZWxlbWVudDogU3RhY2tFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybURpZmZlcmVudFNvdXJjZScsIFwiV291bGQgeW91IGxpa2UgdG8gdW5kbyAnezB9Jz9cIiwgZWxlbWVudC5sYWJlbCksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdjb25maXJtRGlmZmVyZW50U291cmNlLnllcycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlllc1wiKSxcblx0XHRcdGNhbmNlbEJ1dHRvbjogbmxzLmxvY2FsaXplKCdjb25maXJtRGlmZmVyZW50U291cmNlLm5vJywgXCJOb1wiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3VuZG8oc3RyUmVzb3VyY2UsIHNvdXJjZUlkLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDbG9zZXN0UmVkb0VsZW1lbnRXaXRoU291cmNlKHNvdXJjZUlkOiBudW1iZXIpOiBbU3RhY2tFbGVtZW50IHwgbnVsbCwgc3RyaW5nIHwgbnVsbF0ge1xuXHRcdGlmICghc291cmNlSWQpIHtcblx0XHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCBhbiBlbGVtZW50IHdpdGggc291cmNlSWQgYW5kIHdpdGggdGhlIGxvd2VzdCBzb3VyY2VPcmRlciByZWFkeSB0byBiZSByZWRvbmVcblx0XHRsZXQgbWF0Y2hlZEVsZW1lbnQ6IFN0YWNrRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtYXRjaGVkU3RyUmVzb3VyY2U6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBbc3RyUmVzb3VyY2UsIGVkaXRTdGFja10gb2YgdGhpcy5fZWRpdFN0YWNrcykge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gZWRpdFN0YWNrLmdldENsb3Nlc3RGdXR1cmVFbGVtZW50KCk7XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjYW5kaWRhdGUuc291cmNlSWQgPT09IHNvdXJjZUlkKSB7XG5cdFx0XHRcdGlmICghbWF0Y2hlZEVsZW1lbnQgfHwgY2FuZGlkYXRlLnNvdXJjZU9yZGVyIDwgbWF0Y2hlZEVsZW1lbnQuc291cmNlT3JkZXIpIHtcblx0XHRcdFx0XHRtYXRjaGVkRWxlbWVudCA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRtYXRjaGVkU3RyUmVzb3VyY2UgPSBzdHJSZXNvdXJjZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbbWF0Y2hlZEVsZW1lbnQsIG1hdGNoZWRTdHJSZXNvdXJjZV07XG5cdH1cblxuXHRwdWJsaWMgY2FuUmVkbyhyZXNvdXJjZU9yU291cmNlOiBVUkkgfCBVbmRvUmVkb1NvdXJjZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChyZXNvdXJjZU9yU291cmNlIGluc3RhbmNlb2YgVW5kb1JlZG9Tb3VyY2UpIHtcblx0XHRcdGNvbnN0IFssIG1hdGNoZWRTdHJSZXNvdXJjZV0gPSB0aGlzLl9maW5kQ2xvc2VzdFJlZG9FbGVtZW50V2l0aFNvdXJjZShyZXNvdXJjZU9yU291cmNlLmlkKTtcblx0XHRcdHJldHVybiBtYXRjaGVkU3RyUmVzb3VyY2UgPyB0cnVlIDogZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlT3JTb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRyZXR1cm4gZWRpdFN0YWNrLmhhc0Z1dHVyZUVsZW1lbnRzKCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3RyeVRvU3BsaXRBbmRSZWRvKHN0clJlc291cmNlOiBzdHJpbmcsIGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCwgaWdub3JlUmVzb3VyY2VzOiBSZW1vdmVkUmVzb3VyY2VzIHwgbnVsbCwgbWVzc2FnZTogc3RyaW5nKTogV29ya3NwYWNlVmVyaWZpY2F0aW9uRXJyb3Ige1xuXHRcdGlmIChlbGVtZW50LmNhblNwbGl0KCkpIHtcblx0XHRcdHRoaXMuX3NwbGl0RnV0dXJlV29ya3NwYWNlRWxlbWVudChlbGVtZW50LCBpZ25vcmVSZXNvdXJjZXMpO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2VWZXJpZmljYXRpb25FcnJvcih0aGlzLl9yZWRvKHN0clJlc291cmNlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIENhbm5vdCBzYWZlbHkgc3BsaXQgdGhpcyB3b3Jrc3BhY2UgZWxlbWVudCA9PiBmbHVzaCBhbGwgdW5kby9yZWRvIHN0YWNrc1xuXHRcdFx0Zm9yIChjb25zdCBzdHJSZXNvdXJjZSBvZiBlbGVtZW50LnN0clJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUVsZW1lbnRzKHN0clJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihtZXNzYWdlKTtcblx0XHRcdHJldHVybiBuZXcgV29ya3NwYWNlVmVyaWZpY2F0aW9uRXJyb3IoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja1dvcmtzcGFjZVJlZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgZWxlbWVudDogV29ya3NwYWNlU3RhY2tFbGVtZW50LCBlZGl0U3RhY2tTbmFwc2hvdDogRWRpdFN0YWNrU25hcHNob3QsIGNoZWNrSW52YWxpZGF0ZWRSZXNvdXJjZXM6IGJvb2xlYW4pOiBXb3Jrc3BhY2VWZXJpZmljYXRpb25FcnJvciB8IG51bGwge1xuXHRcdGlmIChlbGVtZW50LnJlbW92ZWRSZXNvdXJjZXMpIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kUmVkbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlZFJlc291cmNlcyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnY2Fubm90V29ya3NwYWNlUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4gezF9IGlzIGFub3RoZXIgbWVzc2FnZS4nXSB9LFxuXHRcdFx0XHRcdFwiQ291bGQgbm90IHJlZG8gJ3swfScgYWNyb3NzIGFsbCBmaWxlcy4gezF9XCIsIGVsZW1lbnQubGFiZWwsIGVsZW1lbnQucmVtb3ZlZFJlc291cmNlcy5jcmVhdGVNZXNzYWdlKClcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKGNoZWNrSW52YWxpZGF0ZWRSZXNvdXJjZXMgJiYgZWxlbWVudC5pbnZhbGlkYXRlZFJlc291cmNlcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RyeVRvU3BsaXRBbmRSZWRvKFxuXHRcdFx0XHRzdHJSZXNvdXJjZSxcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0ZWxlbWVudC5pbnZhbGlkYXRlZFJlc291cmNlcyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnY2Fubm90V29ya3NwYWNlUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4gezF9IGlzIGFub3RoZXIgbWVzc2FnZS4nXSB9LFxuXHRcdFx0XHRcdFwiQ291bGQgbm90IHJlZG8gJ3swfScgYWNyb3NzIGFsbCBmaWxlcy4gezF9XCIsIGVsZW1lbnQubGFiZWwsIGVsZW1lbnQuaW52YWxpZGF0ZWRSZXNvdXJjZXMuY3JlYXRlTWVzc2FnZSgpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gdGhpcyBtdXN0IGJlIHRoZSBsYXN0IGZ1dHVyZSBlbGVtZW50IGluIGFsbCB0aGUgaW1wYWN0ZWQgcmVzb3VyY2VzIVxuXHRcdGNvbnN0IGNhbm5vdFJlZG9EdWVUb1Jlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFjayBvZiBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzKSB7XG5cdFx0XHRpZiAoZWRpdFN0YWNrLmdldENsb3Nlc3RGdXR1cmVFbGVtZW50KCkgIT09IGVsZW1lbnQpIHtcblx0XHRcdFx0Y2Fubm90UmVkb0R1ZVRvUmVzb3VyY2VzLnB1c2goZWRpdFN0YWNrLnJlc291cmNlTGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2Fubm90UmVkb0R1ZVRvUmVzb3VyY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kUmVkbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVJlZG9EdWVUb0NoYW5nZXMnLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhIGxpc3Qgb2YgZmlsZW5hbWVzLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgcmVkbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzIGJlY2F1c2UgY2hhbmdlcyB3ZXJlIG1hZGUgdG8gezF9XCIsIGVsZW1lbnQubGFiZWwsIGNhbm5vdFJlZG9EdWVUb1Jlc291cmNlcy5qb2luKCcsICcpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2Fubm90TG9ja0R1ZVRvUmVzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdGlmIChlZGl0U3RhY2subG9ja2VkKSB7XG5cdFx0XHRcdGNhbm5vdExvY2tEdWVUb1Jlc291cmNlcy5wdXNoKGVkaXRTdGFjay5yZXNvdXJjZUxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNhbm5vdExvY2tEdWVUb1Jlc291cmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFJlZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VSZWRvRHVlVG9JblByb2dyZXNzVW5kb1JlZG8nLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhIGxpc3Qgb2YgZmlsZW5hbWVzLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgcmVkbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzIGJlY2F1c2UgdGhlcmUgaXMgYWxyZWFkeSBhbiB1bmRvIG9yIHJlZG8gb3BlcmF0aW9uIHJ1bm5pbmcgb24gezF9XCIsIGVsZW1lbnQubGFiZWwsIGNhbm5vdExvY2tEdWVUb1Jlc291cmNlcy5qb2luKCcsICcpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgaWYgbmV3IHN0YWNrIGVsZW1lbnRzIHdlcmUgYWRkZWQgaW4gdGhlIG1lYW50aW1lLi4uXG5cdFx0aWYgKCFlZGl0U3RhY2tTbmFwc2hvdC5pc1ZhbGlkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kUmVkbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVJlZG9EdWVUb0luTWVhbnRpbWVVbmRvUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4gezF9IGlzIGEgbGlzdCBvZiBmaWxlbmFtZXMuJ10gfSxcblx0XHRcdFx0XHRcIkNvdWxkIG5vdCByZWRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXMgYmVjYXVzZSBhbiB1bmRvIG9yIHJlZG8gb3BlcmF0aW9uIG9jY3VycmVkIGluIHRoZSBtZWFudGltZVwiLCBlbGVtZW50LmxhYmVsXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF93b3Jrc3BhY2VSZWRvKHN0clJlc291cmNlOiBzdHJpbmcsIGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCk6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRjb25zdCBhZmZlY3RlZEVkaXRTdGFja3MgPSB0aGlzLl9nZXRBZmZlY3RlZEVkaXRTdGFja3MoZWxlbWVudCk7XG5cdFx0Y29uc3QgdmVyaWZpY2F0aW9uRXJyb3IgPSB0aGlzLl9jaGVja1dvcmtzcGFjZVJlZG8oc3RyUmVzb3VyY2UsIGVsZW1lbnQsIGFmZmVjdGVkRWRpdFN0YWNrcywgLyppbnZhbGlkYXRlZCByZXNvdXJjZXMgd2lsbCBiZSBjaGVja2VkIGFmdGVyIHRoZSBwcmVwYXJlIGNhbGwqL2ZhbHNlKTtcblx0XHRpZiAodmVyaWZpY2F0aW9uRXJyb3IpIHtcblx0XHRcdHJldHVybiB2ZXJpZmljYXRpb25FcnJvci5yZXR1cm5WYWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVXb3Jrc3BhY2VSZWRvKHN0clJlc291cmNlLCBlbGVtZW50LCBhZmZlY3RlZEVkaXRTdGFja3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZVdvcmtzcGFjZVJlZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgZWxlbWVudDogV29ya3NwYWNlU3RhY2tFbGVtZW50LCBlZGl0U3RhY2tTbmFwc2hvdDogRWRpdFN0YWNrU25hcHNob3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBwcmVwYXJlXG5cdFx0bGV0IGNsZWFudXA6IElEaXNwb3NhYmxlO1xuXHRcdHRyeSB7XG5cdFx0XHRjbGVhbnVwID0gYXdhaXQgdGhpcy5faW52b2tlV29ya3NwYWNlUHJlcGFyZShlbGVtZW50KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiB0aGlzLl9vbkVycm9yKGVyciwgZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQXQgdGhpcyBwb2ludCwgaXQgaXMgcG9zc2libGUgdGhhdCB0aGUgZWxlbWVudCBoYXMgYmVlbiBtYWRlIGludmFsaWQgaW4gdGhlIG1lYW50aW1lIChkdWUgdG8gdGhlIHByZXBhcmUgYXdhaXQpXG5cdFx0Y29uc3QgdmVyaWZpY2F0aW9uRXJyb3IgPSB0aGlzLl9jaGVja1dvcmtzcGFjZVJlZG8oc3RyUmVzb3VyY2UsIGVsZW1lbnQsIGVkaXRTdGFja1NuYXBzaG90LCAvKm5vdyBhbHNvIGNoZWNrIHRoYXQgdGhlcmUgYXJlIG5vIG1vcmUgaW52YWxpZGF0ZWQgcmVzb3VyY2VzKi90cnVlKTtcblx0XHRpZiAodmVyaWZpY2F0aW9uRXJyb3IpIHtcblx0XHRcdGNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHZlcmlmaWNhdGlvbkVycm9yLnJldHVyblZhbHVlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdGVkaXRTdGFjay5tb3ZlRm9yd2FyZChlbGVtZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhZmVJbnZva2VXaXRoTG9ja3MoZWxlbWVudCwgKCkgPT4gZWxlbWVudC5hY3R1YWwucmVkbygpLCBlZGl0U3RhY2tTbmFwc2hvdCwgY2xlYW51cCwgKCkgPT4gdGhpcy5fY29udGludWVSZWRvSW5Hcm91cChlbGVtZW50Lmdyb3VwSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc291cmNlUmVkbyhlZGl0U3RhY2s6IFJlc291cmNlRWRpdFN0YWNrLCBlbGVtZW50OiBSZXNvdXJjZVN0YWNrRWxlbWVudCk6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNWYWxpZCkge1xuXHRcdFx0Ly8gaW52YWxpZCBlbGVtZW50ID0+IGltbWVkaWF0ZWx5IGZsdXNoIGVkaXQgc3RhY2shXG5cdFx0XHRlZGl0U3RhY2suZmx1c2hBbGxFbGVtZW50cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZWRpdFN0YWNrLmxvY2tlZCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0eyBrZXk6ICdjYW5ub3RSZXNvdXJjZVJlZG9EdWVUb0luUHJvZ3Jlc3NVbmRvUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4nXSB9LFxuXHRcdFx0XHRcIkNvdWxkIG5vdCByZWRvICd7MH0nIGJlY2F1c2UgdGhlcmUgaXMgYWxyZWFkeSBhbiB1bmRvIG9yIHJlZG8gb3BlcmF0aW9uIHJ1bm5pbmcuXCIsIGVsZW1lbnQubGFiZWxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2ludm9rZVJlc291cmNlUHJlcGFyZShlbGVtZW50LCAoY2xlYW51cCkgPT4ge1xuXHRcdFx0ZWRpdFN0YWNrLm1vdmVGb3J3YXJkKGVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NhZmVJbnZva2VXaXRoTG9ja3MoZWxlbWVudCwgKCkgPT4gZWxlbWVudC5hY3R1YWwucmVkbygpLCBuZXcgRWRpdFN0YWNrU25hcHNob3QoW2VkaXRTdGFja10pLCBjbGVhbnVwLCAoKSA9PiB0aGlzLl9jb250aW51ZVJlZG9Jbkdyb3VwKGVsZW1lbnQuZ3JvdXBJZCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENsb3Nlc3RSZWRvRWxlbWVudEluR3JvdXAoZ3JvdXBJZDogbnVtYmVyKTogW1N0YWNrRWxlbWVudCB8IG51bGwsIHN0cmluZyB8IG51bGxdIHtcblx0XHRpZiAoIWdyb3VwSWQpIHtcblx0XHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCBhbm90aGVyIGVsZW1lbnQgd2l0aCB0aGUgc2FtZSBncm91cElkIGFuZCB3aXRoIHRoZSBsb3dlc3QgZ3JvdXBPcmRlciByZWFkeSB0byBiZSByZWRvbmVcblx0XHRsZXQgbWF0Y2hlZEVsZW1lbnQ6IFN0YWNrRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtYXRjaGVkU3RyUmVzb3VyY2U6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBbc3RyUmVzb3VyY2UsIGVkaXRTdGFja10gb2YgdGhpcy5fZWRpdFN0YWNrcykge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gZWRpdFN0YWNrLmdldENsb3Nlc3RGdXR1cmVFbGVtZW50KCk7XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjYW5kaWRhdGUuZ3JvdXBJZCA9PT0gZ3JvdXBJZCkge1xuXHRcdFx0XHRpZiAoIW1hdGNoZWRFbGVtZW50IHx8IGNhbmRpZGF0ZS5ncm91cE9yZGVyIDwgbWF0Y2hlZEVsZW1lbnQuZ3JvdXBPcmRlcikge1xuXHRcdFx0XHRcdG1hdGNoZWRFbGVtZW50ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdG1hdGNoZWRTdHJSZXNvdXJjZSA9IHN0clJlc291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFttYXRjaGVkRWxlbWVudCwgbWF0Y2hlZFN0clJlc291cmNlXTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRpbnVlUmVkb0luR3JvdXAoZ3JvdXBJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmICghZ3JvdXBJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFssIG1hdGNoZWRTdHJSZXNvdXJjZV0gPSB0aGlzLl9maW5kQ2xvc2VzdFJlZG9FbGVtZW50SW5Hcm91cChncm91cElkKTtcblx0XHRpZiAobWF0Y2hlZFN0clJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVkbyhtYXRjaGVkU3RyUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWRvKHJlc291cmNlT3JTb3VyY2U6IFVSSSB8IFVuZG9SZWRvU291cmNlIHwgc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmIChyZXNvdXJjZU9yU291cmNlIGluc3RhbmNlb2YgVW5kb1JlZG9Tb3VyY2UpIHtcblx0XHRcdGNvbnN0IFssIG1hdGNoZWRTdHJSZXNvdXJjZV0gPSB0aGlzLl9maW5kQ2xvc2VzdFJlZG9FbGVtZW50V2l0aFNvdXJjZShyZXNvdXJjZU9yU291cmNlLmlkKTtcblx0XHRcdHJldHVybiBtYXRjaGVkU3RyUmVzb3VyY2UgPyB0aGlzLl9yZWRvKG1hdGNoZWRTdHJSZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgcmVzb3VyY2VPclNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZWRvKHJlc291cmNlT3JTb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVkbyh0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2VPclNvdXJjZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVkbyhzdHJSZXNvdXJjZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRjb25zdCBlbGVtZW50ID0gZWRpdFN0YWNrLmdldENsb3Nlc3RGdXR1cmVFbGVtZW50KCk7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuZ3JvdXBJZCkge1xuXHRcdFx0Ly8gdGhpcyBlbGVtZW50IGlzIGEgcGFydCBvZiBhIGdyb3VwLCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSByZWRvaW5nIGluIGEgZ3JvdXAgaXMgaW4gb3JkZXJcblx0XHRcdGNvbnN0IFttYXRjaGVkRWxlbWVudCwgbWF0Y2hlZFN0clJlc291cmNlXSA9IHRoaXMuX2ZpbmRDbG9zZXN0UmVkb0VsZW1lbnRJbkdyb3VwKGVsZW1lbnQuZ3JvdXBJZCk7XG5cdFx0XHRpZiAoZWxlbWVudCAhPT0gbWF0Y2hlZEVsZW1lbnQgJiYgbWF0Y2hlZFN0clJlc291cmNlKSB7XG5cdFx0XHRcdC8vIHRoZXJlIGlzIGFuIGVsZW1lbnQgaW4gdGhlIHNhbWUgZ3JvdXAgdGhhdCBzaG91bGQgYmUgcmVkb25lIGJlZm9yZSB0aGlzIG9uZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVkbyhtYXRjaGVkU3RyUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlUmVkbyhzdHJSZXNvdXJjZSwgZWxlbWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VSZWRvKGVkaXRTdGFjaywgZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChERUJVRykge1xuXHRcdFx0XHR0aGlzLl9wcmludCgncmVkbycpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBXb3Jrc3BhY2VWZXJpZmljYXRpb25FcnJvciB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSByZXR1cm5WYWx1ZTogUHJvbWlzZTx2b2lkPiB8IHZvaWQpIHsgfVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVW5kb1JlZG9TZXJ2aWNlLCBVbmRvUmVkb1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGVBQWU7QUFDeEIsT0FBTyxjQUFjO0FBRXJCLFlBQVksU0FBUztBQUNyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw0QkFBNEI7QUFDckMsU0FBMEUsa0JBQTZDLDJCQUEyQixxQkFBcUIsZUFBZSxzQkFBZ0Q7QUFFdE8sTUFBTSxRQUFRO0FBRWQsU0FBUyxpQkFBaUIsVUFBdUI7QUFDaEQsU0FBTyxTQUFTLFdBQVcsUUFBUSxPQUFPLFNBQVMsU0FBUyxTQUFTO0FBQ3RFO0FBRUEsSUFBSSxzQkFBc0I7QUFFMUIsTUFBTSxxQkFBcUI7QUFBQSxFQWlCMUIsWUFBWSxRQUEwQixlQUF1QixhQUFxQixTQUFpQixZQUFvQixVQUFrQixhQUFxQjtBQWhCOUosU0FBZ0IsS0FBTSxFQUFFO0FBQ3hCLFNBQWdCLE9BQU8sb0JBQW9CO0FBZ0IxQyxTQUFLLFNBQVM7QUFDZCxTQUFLLFFBQVEsT0FBTztBQUNwQixTQUFLLG9CQUFvQixPQUFPLHFCQUFxQjtBQUNyRCxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLGNBQWM7QUFDbkIsU0FBSyxpQkFBaUIsQ0FBQyxLQUFLLGFBQWE7QUFDekMsU0FBSyxlQUFlLENBQUMsS0FBSyxXQUFXO0FBQ3JDLFNBQUssVUFBVTtBQUNmLFNBQUssYUFBYTtBQUNsQixTQUFLLFdBQVc7QUFDaEIsU0FBSyxjQUFjO0FBQ25CLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFTyxTQUFTLFNBQXdCO0FBQ3ZDLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFTyxX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QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sQ0FBQyxnQkFBZ0Isa0JBQWtCO0FBQUEsRUFDM0M7QUFBQSxFQUVRLHFCQUFxQixTQUF1QztBQUNuRSxRQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsSUFDRDtBQUVBLFVBQU0sQ0FBQyxFQUFFLGtCQUFrQixJQUFJLEtBQUssK0JBQStCLE9BQU87QUFDMUUsUUFBSSxvQkFBb0I7QUFDdkIsYUFBTyxLQUFLLE1BQU0sa0JBQWtCO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQUEsRUFFTyxLQUFLLGtCQUF1RTtBQUNsRixRQUFJLDRCQUE0QixnQkFBZ0I7QUFDL0MsWUFBTSxDQUFDLEVBQUUsa0JBQWtCLElBQUksS0FBSyxrQ0FBa0MsaUJBQWlCLEVBQUU7QUFDekYsYUFBTyxxQkFBcUIsS0FBSyxNQUFNLGtCQUFrQixJQUFJO0FBQUEsSUFDOUQ7QUFDQSxRQUFJLE9BQU8scUJBQXFCLFVBQVU7QUFDekMsYUFBTyxLQUFLLE1BQU0sZ0JBQWdCO0FBQUEsSUFDbkM7QUFDQSxXQUFPLEtBQUssTUFBTSxLQUFLLG9CQUFvQixnQkFBZ0IsQ0FBQztBQUFBLEVBQzdEO0FBQUEsRUFFUSxNQUFNLGFBQTJDO0FBQ3hELFFBQUksQ0FBQyxLQUFLLFlBQVksSUFBSSxXQUFXLEdBQUc7QUFDdkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLEtBQUssWUFBWSxJQUFJLFdBQVc7QUFDbEQsVUFBTSxVQUFVLFVBQVUsd0JBQXdCO0FBQ2xELFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLFNBQVM7QUFFcEIsWUFBTSxDQUFDLGdCQUFnQixrQkFBa0IsSUFBSSxLQUFLLCtCQUErQixRQUFRLE9BQU87QUFDaEcsVUFBSSxZQUFZLGtCQUFrQixvQkFBb0I7QUFFckQsZUFBTyxLQUFLLE1BQU0sa0JBQWtCO0FBQUEsTUFDckM7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILFVBQUksUUFBUSxTQUFTLG9CQUFvQixXQUFXO0FBQ25ELGVBQU8sS0FBSyxlQUFlLGFBQWEsT0FBTztBQUFBLE1BQ2hELE9BQU87QUFDTixlQUFPLEtBQUssY0FBYyxXQUFXLE9BQU87QUFBQSxNQUM3QztBQUFBLElBQ0QsVUFBRTtBQUNELFVBQUksT0FBTztBQUNWLGFBQUssT0FBTyxNQUFNO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBdjZCYSxrQkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsR0FSVTtBQXk2QmIsTUFBTSwyQkFBMkI7QUFBQSxFQUNoQyxZQUE0QixhQUFtQztBQUFuQztBQUFBLEVBQXFDO0FBQ2xFO0FBRUEsa0JBQWtCLGtCQUFrQixpQkFBaUIsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbIlJlbW92ZWRSZXNvdXJjZVJlYXNvbiIsICJzdHJSZXNvdXJjZSIsICJVbmRvQ2hvaWNlIl0KfQo=
