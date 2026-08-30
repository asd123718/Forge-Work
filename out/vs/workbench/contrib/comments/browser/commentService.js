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
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Range } from "../../../../editor/common/core/range.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CommentMenus } from "./commentMenus.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { COMMENTS_SECTION } from "../common/commentsConfiguration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CommentsModel } from "./commentsModel.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Schemas } from "../../../../base/common/network.js";
const ICommentService = createDecorator("commentService");
const CONTINUE_ON_COMMENTS = "comments.continueOnComments";
let CommentService = class extends Disposable {
  // schemes
  constructor(instantiationService, layoutService, configurationService, contextKeyService, storageService, logService, modelService) {
    super();
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.logService = logService;
    this.modelService = modelService;
    this._onDidSetDataProvider = this._register(new Emitter());
    this.onDidSetDataProvider = this._onDidSetDataProvider.event;
    this._onDidDeleteDataProvider = this._register(new Emitter());
    this.onDidDeleteDataProvider = this._onDidDeleteDataProvider.event;
    this._onDidSetResourceCommentInfos = this._register(new Emitter());
    this.onDidSetResourceCommentInfos = this._onDidSetResourceCommentInfos.event;
    this._onDidSetAllCommentThreads = this._register(new Emitter());
    this.onDidSetAllCommentThreads = this._onDidSetAllCommentThreads.event;
    this._onDidUpdateCommentThreads = this._register(new Emitter());
    this.onDidUpdateCommentThreads = this._onDidUpdateCommentThreads.event;
    this._onDidUpdateNotebookCommentThreads = this._register(new Emitter());
    this.onDidUpdateNotebookCommentThreads = this._onDidUpdateNotebookCommentThreads.event;
    this._onDidUpdateCommentingRanges = this._register(new Emitter());
    this.onDidUpdateCommentingRanges = this._onDidUpdateCommentingRanges.event;
    this._onDidChangeActiveEditingCommentThread = this._register(new Emitter());
    this.onDidChangeActiveEditingCommentThread = this._onDidChangeActiveEditingCommentThread.event;
    this._onDidChangeCurrentCommentThread = this._register(new Emitter());
    this.onDidChangeCurrentCommentThread = this._onDidChangeCurrentCommentThread.event;
    this._onDidChangeCommentingEnabled = this._register(new Emitter());
    this.onDidChangeCommentingEnabled = this._onDidChangeCommentingEnabled.event;
    this._onResourceHasCommentingRanges = this._register(new Emitter());
    this.onResourceHasCommentingRanges = this._onResourceHasCommentingRanges.event;
    this._onDidChangeActiveCommentingRange = this._register(new Emitter());
    this.onDidChangeActiveCommentingRange = this._onDidChangeActiveCommentingRange.event;
    this._commentControls = /* @__PURE__ */ new Map();
    this._commentMenus = /* @__PURE__ */ new Map();
    this._isCommentingEnabled = true;
    this._continueOnComments = /* @__PURE__ */ new Map();
    // uniqueOwner -> PendingCommentThread[]
    this._continueOnCommentProviders = /* @__PURE__ */ new Set();
    this._commentsModel = this._register(new CommentsModel());
    this.commentsModel = this._commentsModel;
    this._commentingRangeResources = /* @__PURE__ */ new Set();
    // URIs
    this._commentingRangeResourceHintSchemes = /* @__PURE__ */ new Set();
    this._handleConfiguration();
    this._handleZenMode();
    this._workspaceHasCommenting = CommentContextKeys.WorkspaceHasCommenting.bindTo(contextKeyService);
    this._commentingEnabled = CommentContextKeys.commentingEnabled.bindTo(contextKeyService);
    const storageListener = this._register(new DisposableStore());
    const storageEvent = Event.debounce(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, CONTINUE_ON_COMMENTS, storageListener), (last, event) => last?.external ? last : event, 500);
    storageListener.add(storageEvent((v) => {
      if (!v.external) {
        return;
      }
      const commentsToRestore = this.storageService.getObject(CONTINUE_ON_COMMENTS, StorageScope.WORKSPACE);
      if (!commentsToRestore) {
        return;
      }
      this.logService.debug(`Comments: URIs of continue on comments from storage ${commentsToRestore.map((thread) => thread.uri.toString()).join(", ")}.`);
      const changedOwners = this._addContinueOnComments(commentsToRestore, this._continueOnComments);
      for (const uniqueOwner of changedOwners) {
        const control = this._commentControls.get(uniqueOwner);
        if (!control) {
          continue;
        }
        const evt = {
          uniqueOwner,
          owner: control.owner,
          ownerLabel: control.label,
          pending: this._continueOnComments.get(uniqueOwner) || [],
          added: [],
          removed: [],
          changed: []
        };
        this.updateModelThreads(evt);
      }
    }));
    this._register(storageService.onWillSaveState(() => {
      const map = /* @__PURE__ */ new Map();
      for (const provider of this._continueOnCommentProviders) {
        const pendingComments = provider.provideContinueOnComments();
        this._addContinueOnComments(pendingComments, map);
      }
      this._saveContinueOnComments(map);
    }));
    this._register(this.modelService.onModelAdded((model) => {
      if (model.uri.scheme === Schemas.vscodeSourceControl) {
        return;
      }
      if (!this._commentingRangeResources.has(model.uri.toString())) {
        this.getDocumentComments(model.uri);
      }
    }));
  }
  _updateResourcesWithCommentingRanges(resource, commentInfos) {
    let addedResources = false;
    for (const comments of commentInfos) {
      if (comments && (comments.commentingRanges.ranges.length > 0 || comments.threads.length > 0)) {
        this._commentingRangeResources.add(resource.toString());
        addedResources = true;
      }
    }
    if (addedResources) {
      this._onResourceHasCommentingRanges.fire();
    }
  }
  _handleConfiguration() {
    this._isCommentingEnabled = this._defaultCommentingEnablement;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("comments.visible")) {
        this.enableCommenting(this._defaultCommentingEnablement);
      }
    }));
  }
  _handleZenMode() {
    let preZenModeValue = this._isCommentingEnabled;
    this._register(this.layoutService.onDidChangeZenMode((e) => {
      if (e) {
        preZenModeValue = this._isCommentingEnabled;
        this.enableCommenting(false);
      } else {
        this.enableCommenting(preZenModeValue);
      }
    }));
  }
  get _defaultCommentingEnablement() {
    return !!this.configurationService.getValue(COMMENTS_SECTION)?.visible;
  }
  get isCommentingEnabled() {
    return this._isCommentingEnabled;
  }
  enableCommenting(enable) {
    if (enable !== this._isCommentingEnabled) {
      this._isCommentingEnabled = enable;
      this._commentingEnabled.set(enable);
      this._onDidChangeCommentingEnabled.fire(enable);
    }
  }
  /**
   * The current comment thread is the thread that has focus or is being hovered.
   * @param commentThread
   */
  setCurrentCommentThread(commentThread) {
    this._onDidChangeCurrentCommentThread.fire(commentThread);
  }
  /**
   * The active comment thread is the thread that is currently being edited.
   * @param commentThread
   */
  setActiveEditingCommentThread(commentThread) {
    this._onDidChangeActiveEditingCommentThread.fire(commentThread);
  }
  get lastActiveCommentcontroller() {
    return this._lastActiveCommentController;
  }
  async setActiveCommentAndThread(uniqueOwner, commentInfo) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (!commentController) {
      return;
    }
    if (commentController !== this._lastActiveCommentController) {
      await this._lastActiveCommentController?.setActiveCommentAndThread(void 0);
    }
    this._lastActiveCommentController = commentController;
    return commentController.setActiveCommentAndThread(commentInfo);
  }
  setDocumentComments(resource, commentInfos) {
    this._onDidSetResourceCommentInfos.fire({ resource, commentInfos });
  }
  setModelThreads(ownerId, owner, ownerLabel, commentThreads) {
    this._commentsModel.setCommentThreads(ownerId, owner, ownerLabel, commentThreads);
    this._onDidSetAllCommentThreads.fire({ ownerId, ownerLabel, commentThreads });
  }
  updateModelThreads(event) {
    this._commentsModel.updateCommentThreads(event);
    this._onDidUpdateCommentThreads.fire(event);
  }
  setWorkspaceComments(uniqueOwner, commentsByResource) {
    if (commentsByResource.length) {
      this._workspaceHasCommenting.set(true);
    }
    const control = this._commentControls.get(uniqueOwner);
    if (control) {
      this.setModelThreads(uniqueOwner, control.owner, control.label, commentsByResource);
    }
  }
  removeWorkspaceComments(uniqueOwner) {
    const control = this._commentControls.get(uniqueOwner);
    if (control) {
      this.setModelThreads(uniqueOwner, control.owner, control.label, []);
    }
  }
  registerCommentController(uniqueOwner, commentControl) {
    this._commentControls.set(uniqueOwner, commentControl);
    this._onDidSetDataProvider.fire();
  }
  unregisterCommentController(uniqueOwner) {
    if (uniqueOwner) {
      this._commentControls.delete(uniqueOwner);
    } else {
      this._commentControls.clear();
    }
    this._commentsModel.deleteCommentsByOwner(uniqueOwner);
    this._onDidDeleteDataProvider.fire(uniqueOwner);
  }
  getCommentController(uniqueOwner) {
    return this._commentControls.get(uniqueOwner);
  }
  async createCommentThreadTemplate(uniqueOwner, resource, range, editorId) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (!commentController) {
      return;
    }
    return commentController.createCommentThreadTemplate(resource, range, editorId);
  }
  async updateCommentThreadTemplate(uniqueOwner, threadHandle, range) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (!commentController) {
      return;
    }
    await commentController.updateCommentThreadTemplate(threadHandle, range);
  }
  disposeCommentThread(uniqueOwner, threadId) {
    const controller = this.getCommentController(uniqueOwner);
    controller?.deleteCommentThreadMain(threadId);
  }
  getCommentMenus(uniqueOwner) {
    if (this._commentMenus.get(uniqueOwner)) {
      return this._commentMenus.get(uniqueOwner);
    }
    const menu = this.instantiationService.createInstance(CommentMenus);
    this._commentMenus.set(uniqueOwner, menu);
    return menu;
  }
  updateComments(ownerId, event) {
    const control = this._commentControls.get(ownerId);
    if (control) {
      const evt = Object.assign({}, event, { uniqueOwner: ownerId, ownerLabel: control.label, owner: control.owner });
      this.updateModelThreads(evt);
    }
  }
  updateNotebookComments(ownerId, event) {
    const evt = Object.assign({}, event, { uniqueOwner: ownerId });
    this._onDidUpdateNotebookCommentThreads.fire(evt);
  }
  updateCommentingRanges(ownerId, resourceHints) {
    if (resourceHints?.schemes && resourceHints.schemes.length > 0) {
      for (const scheme of resourceHints.schemes) {
        this._commentingRangeResourceHintSchemes.add(scheme);
      }
    }
    this._workspaceHasCommenting.set(true);
    this._onDidUpdateCommentingRanges.fire({ uniqueOwner: ownerId });
  }
  async toggleReaction(uniqueOwner, resource, thread, comment, reaction) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (commentController) {
      return commentController.toggleReaction(resource, thread, comment, reaction, CancellationToken.None);
    } else {
      throw new Error("Not supported");
    }
  }
  hasReactionHandler(uniqueOwner) {
    const commentProvider = this._commentControls.get(uniqueOwner);
    if (commentProvider) {
      return !!commentProvider.features.reactionHandler;
    }
    return false;
  }
  async getDocumentComments(resource) {
    const commentControlResult = [];
    for (const control of this._commentControls.values()) {
      commentControlResult.push(control.getDocumentComments(resource, CancellationToken.None).then((documentComments) => {
        for (const documentCommentThread of documentComments.threads) {
          if (documentCommentThread.comments?.length === 0 && documentCommentThread.range) {
            this.removeContinueOnComment({ range: documentCommentThread.range, uri: resource, uniqueOwner: documentComments.uniqueOwner });
          }
        }
        const pendingComments = this._continueOnComments.get(documentComments.uniqueOwner);
        documentComments.pendingCommentThreads = pendingComments?.filter((pendingComment) => pendingComment.uri.toString() === resource.toString());
        return documentComments;
      }).catch((_) => {
        return null;
      }));
    }
    const commentInfos = await Promise.all(commentControlResult);
    this._updateResourcesWithCommentingRanges(resource, commentInfos);
    return commentInfos;
  }
  async getNotebookComments(resource) {
    const commentControlResult = [];
    this._commentControls.forEach((control) => {
      commentControlResult.push(control.getNotebookComments(resource, CancellationToken.None).catch((_) => {
        return null;
      }));
    });
    return Promise.all(commentControlResult);
  }
  registerContinueOnCommentProvider(provider) {
    this._continueOnCommentProviders.add(provider);
    return {
      dispose: () => {
        this._continueOnCommentProviders.delete(provider);
      }
    };
  }
  _saveContinueOnComments(map) {
    const commentsToSave = [];
    for (const pendingComments of map.values()) {
      commentsToSave.push(...pendingComments);
    }
    this.logService.debug(`Comments: URIs of continue on comments to add to storage ${commentsToSave.map((thread) => thread.uri.toString()).join(", ")}.`);
    this.storageService.store(CONTINUE_ON_COMMENTS, commentsToSave, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  removeContinueOnComment(pendingComment) {
    const pendingComments = this._continueOnComments.get(pendingComment.uniqueOwner);
    if (pendingComments) {
      const commentIndex = pendingComments.findIndex((comment) => comment.uri.toString() === pendingComment.uri.toString() && Range.equalsRange(comment.range, pendingComment.range) && (pendingComment.isReply === void 0 || comment.isReply === pendingComment.isReply));
      if (commentIndex > -1) {
        return pendingComments.splice(commentIndex, 1)[0];
      }
    }
    return void 0;
  }
  _addContinueOnComments(pendingComments, map) {
    const changedOwners = /* @__PURE__ */ new Set();
    for (const pendingComment of pendingComments) {
      if (!map.has(pendingComment.uniqueOwner)) {
        map.set(pendingComment.uniqueOwner, [pendingComment]);
        changedOwners.add(pendingComment.uniqueOwner);
      } else {
        const commentsForOwner = map.get(pendingComment.uniqueOwner);
        if (commentsForOwner.every((comment) => comment.uri.toString() !== pendingComment.uri.toString() || !Range.equalsRange(comment.range, pendingComment.range))) {
          commentsForOwner.push(pendingComment);
          changedOwners.add(pendingComment.uniqueOwner);
        }
      }
    }
    return changedOwners;
  }
  resourceHasCommentingRanges(resource) {
    return this._commentingRangeResourceHintSchemes.has(resource.scheme) || this._commentingRangeResources.has(resource.toString());
  }
};
CommentService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkbenchLayoutService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IModelService)
], CommentService);
export {
  CommentService,
  ICommentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQsIENvbW1lbnRJbmZvLCBDb21tZW50LCBDb21tZW50UmVhY3Rpb24sIENvbW1lbnRpbmdSYW5nZXMsIENvbW1lbnRUaHJlYWQsIENvbW1lbnRPcHRpb25zLCBQZW5kaW5nQ29tbWVudFRocmVhZCwgQ29tbWVudGluZ1JhbmdlUmVzb3VyY2VIaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UsIElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFRocmVhZENoYW5nZWRFdmVudCB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50TW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tbWVudE1lbnVzIH0gZnJvbSAnLi9jb21tZW50TWVudXMuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENPTU1FTlRTX1NFQ1RJT04sIElDb21tZW50c0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29tbWVudHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDb21tZW50Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vY29tbWVudENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ29tbWVudHNNb2RlbCwgSUNvbW1lbnRzTW9kZWwgfSBmcm9tICcuL2NvbW1lbnRzTW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG5leHBvcnQgY29uc3QgSUNvbW1lbnRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDb21tZW50U2VydmljZT4oJ2NvbW1lbnRTZXJ2aWNlJyk7XG5cbmludGVyZmFjZSBJUmVzb3VyY2VDb21tZW50VGhyZWFkRXZlbnQge1xuXHRyZXNvdXJjZTogVVJJO1xuXHRjb21tZW50SW5mb3M6IElDb21tZW50SW5mb1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tZW50SW5mbzxUID0gSVJhbmdlPiBleHRlbmRzIENvbW1lbnRJbmZvPFQ+IHtcblx0dW5pcXVlT3duZXI6IHN0cmluZztcblx0bGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rQ29tbWVudEluZm8ge1xuXHRleHRlbnNpb25JZD86IHN0cmluZztcblx0dGhyZWFkczogQ29tbWVudFRocmVhZDxJQ2VsbFJhbmdlPltdO1xuXHR1bmlxdWVPd25lcjogc3RyaW5nO1xuXHRsYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlQ29tbWVudFRocmVhZHNFdmVudCB7XG5cdG93bmVySWQ6IHN0cmluZztcblx0b3duZXJMYWJlbDogc3RyaW5nO1xuXHRjb21tZW50VGhyZWFkczogQ29tbWVudFRocmVhZFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0NvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PElDZWxsUmFuZ2U+IHtcblx0dW5pcXVlT3duZXI6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWVudENvbnRyb2xsZXIge1xuXHRpZDogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRmZWF0dXJlczoge1xuXHRcdHJlYWN0aW9uR3JvdXA/OiBDb21tZW50UmVhY3Rpb25bXTtcblx0XHRyZWFjdGlvbkhhbmRsZXI/OiBib29sZWFuO1xuXHRcdG9wdGlvbnM/OiBDb21tZW50T3B0aW9ucztcblx0fTtcblx0b3B0aW9ucz86IENvbW1lbnRPcHRpb25zO1xuXHRjb250ZXh0VmFsdWU/OiBzdHJpbmc7XG5cdG93bmVyOiBzdHJpbmc7XG5cdGFjdGl2ZUNvbW1lbnQ6IHsgdGhyZWFkOiBDb21tZW50VGhyZWFkOyBjb21tZW50PzogQ29tbWVudCB9IHwgdW5kZWZpbmVkO1xuXHRjcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUocmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIGVkaXRvcklkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHRocmVhZEhhbmRsZTogbnVtYmVyLCByYW5nZTogSVJhbmdlKTogUHJvbWlzZTx2b2lkPjtcblx0ZGVsZXRlQ29tbWVudFRocmVhZE1haW4oY29tbWVudFRocmVhZElkOiBzdHJpbmcpOiB2b2lkO1xuXHR0b2dnbGVSZWFjdGlvbih1cmk6IFVSSSwgdGhyZWFkOiBDb21tZW50VGhyZWFkLCBjb21tZW50OiBDb21tZW50LCByZWFjdGlvbjogQ29tbWVudFJlYWN0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+O1xuXHRnZXREb2N1bWVudENvbW1lbnRzKHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNvbW1lbnRJbmZvPElSYW5nZT4+O1xuXHRnZXROb3RlYm9va0NvbW1lbnRzKHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU5vdGVib29rQ29tbWVudEluZm8+O1xuXHRzZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKGNvbW1lbnRJbmZvOiB7IHRocmVhZDogQ29tbWVudFRocmVhZDsgY29tbWVudD86IENvbW1lbnQgfSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRpbnVlT25Db21tZW50UHJvdmlkZXIge1xuXHRwcm92aWRlQ29udGludWVPbkNvbW1lbnRzKCk6IFBlbmRpbmdDb21tZW50VGhyZWFkW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1lbnRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZFNldFJlc291cmNlQ29tbWVudEluZm9zOiBFdmVudDxJUmVzb3VyY2VDb21tZW50VGhyZWFkRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZFNldEFsbENvbW1lbnRUaHJlYWRzOiBFdmVudDxJV29ya3NwYWNlQ29tbWVudFRocmVhZHNFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlQ29tbWVudFRocmVhZHM6IEV2ZW50PElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVOb3RlYm9va0NvbW1lbnRUaHJlYWRzOiBFdmVudDxJTm90ZWJvb2tDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZDogRXZlbnQ8Q29tbWVudFRocmVhZCB8IG51bGw+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1cnJlbnRDb21tZW50VGhyZWFkOiBFdmVudDxDb21tZW50VGhyZWFkIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb21tZW50aW5nUmFuZ2VzOiBFdmVudDx7IHVuaXF1ZU93bmVyOiBzdHJpbmcgfT47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlQ29tbWVudGluZ1JhbmdlOiBFdmVudDx7IHJhbmdlOiBSYW5nZTsgY29tbWVudGluZ1Jhbmdlc0luZm86IENvbW1lbnRpbmdSYW5nZXMgfT47XG5cdHJlYWRvbmx5IG9uRGlkU2V0RGF0YVByb3ZpZGVyOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWREZWxldGVEYXRhUHJvdmlkZXI6IEV2ZW50PHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29tbWVudGluZ0VuYWJsZWQ6IEV2ZW50PGJvb2xlYW4+O1xuXHRyZWFkb25seSBvblJlc291cmNlSGFzQ29tbWVudGluZ1JhbmdlczogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IGlzQ29tbWVudGluZ0VuYWJsZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbW1lbnRzTW9kZWw6IElDb21tZW50c01vZGVsO1xuXHRyZWFkb25seSBsYXN0QWN0aXZlQ29tbWVudGNvbnRyb2xsZXI6IElDb21tZW50Q29udHJvbGxlciB8IHVuZGVmaW5lZDtcblx0c2V0RG9jdW1lbnRDb21tZW50cyhyZXNvdXJjZTogVVJJLCBjb21tZW50SW5mb3M6IElDb21tZW50SW5mb1tdKTogdm9pZDtcblx0c2V0V29ya3NwYWNlQ29tbWVudHModW5pcXVlT3duZXI6IHN0cmluZywgY29tbWVudHNCeVJlc291cmNlOiBDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+W10pOiB2b2lkO1xuXHRyZW1vdmVXb3Jrc3BhY2VDb21tZW50cyh1bmlxdWVPd25lcjogc3RyaW5nKTogdm9pZDtcblx0cmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcih1bmlxdWVPd25lcjogc3RyaW5nLCBjb21tZW50Q29udHJvbDogSUNvbW1lbnRDb250cm9sbGVyKTogdm9pZDtcblx0dW5yZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKHVuaXF1ZU93bmVyPzogc3RyaW5nKTogdm9pZDtcblx0Z2V0Q29tbWVudENvbnRyb2xsZXIodW5pcXVlT3duZXI6IHN0cmluZyk6IElDb21tZW50Q29udHJvbGxlciB8IHVuZGVmaW5lZDtcblx0Y3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIHJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCwgZWRpdG9ySWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodW5pcXVlT3duZXI6IHN0cmluZywgdGhyZWFkSGFuZGxlOiBudW1iZXIsIHJhbmdlOiBSYW5nZSk6IFByb21pc2U8dm9pZD47XG5cdGdldENvbW1lbnRNZW51cyh1bmlxdWVPd25lcjogc3RyaW5nKTogQ29tbWVudE1lbnVzO1xuXHR1cGRhdGVDb21tZW50cyhvd25lcklkOiBzdHJpbmcsIGV2ZW50OiBDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PElSYW5nZT4pOiB2b2lkO1xuXHR1cGRhdGVOb3RlYm9va0NvbW1lbnRzKG93bmVySWQ6IHN0cmluZywgZXZlbnQ6IENvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ8SUNlbGxSYW5nZT4pOiB2b2lkO1xuXHRkaXNwb3NlQ29tbWVudFRocmVhZChvd25lcklkOiBzdHJpbmcsIHRocmVhZElkOiBzdHJpbmcpOiB2b2lkO1xuXHRnZXREb2N1bWVudENvbW1lbnRzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPChJQ29tbWVudEluZm8gfCBudWxsKVtdPjtcblx0Z2V0Tm90ZWJvb2tDb21tZW50cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTwoSU5vdGVib29rQ29tbWVudEluZm8gfCBudWxsKVtdPjtcblx0dXBkYXRlQ29tbWVudGluZ1Jhbmdlcyhvd25lcklkOiBzdHJpbmcsIHJlc291cmNlSGludHM/OiBDb21tZW50aW5nUmFuZ2VSZXNvdXJjZUhpbnQpOiB2b2lkO1xuXHRoYXNSZWFjdGlvbkhhbmRsZXIodW5pcXVlT3duZXI6IHN0cmluZyk6IGJvb2xlYW47XG5cdHRvZ2dsZVJlYWN0aW9uKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIHRocmVhZDogQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPiwgY29tbWVudDogQ29tbWVudCwgcmVhY3Rpb246IENvbW1lbnRSZWFjdGlvbik6IFByb21pc2U8dm9pZD47XG5cdHNldEFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWQ6IENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4gfCBudWxsKTogdm9pZDtcblx0c2V0Q3VycmVudENvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZDogQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPiB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdHNldEFjdGl2ZUNvbW1lbnRBbmRUaHJlYWQodW5pcXVlT3duZXI6IHN0cmluZywgY29tbWVudEluZm86IHsgdGhyZWFkOiBDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+OyBjb21tZW50PzogQ29tbWVudCB9IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblx0ZW5hYmxlQ29tbWVudGluZyhlbmFibGU6IGJvb2xlYW4pOiB2b2lkO1xuXHRyZWdpc3RlckNvbnRpbnVlT25Db21tZW50UHJvdmlkZXIocHJvdmlkZXI6IElDb250aW51ZU9uQ29tbWVudFByb3ZpZGVyKTogSURpc3Bvc2FibGU7XG5cdHJlbW92ZUNvbnRpbnVlT25Db21tZW50KHBlbmRpbmdDb21tZW50OiB7IHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQ7IHVyaTogVVJJOyB1bmlxdWVPd25lcjogc3RyaW5nOyBpc1JlcGx5PzogYm9vbGVhbiB9KTogUGVuZGluZ0NvbW1lbnRUaHJlYWQgfCB1bmRlZmluZWQ7XG5cdHJlc291cmNlSGFzQ29tbWVudGluZ1JhbmdlcyhyZXNvdXJjZTogVVJJKTogYm9vbGVhbjtcbn1cblxuY29uc3QgQ09OVElOVUVfT05fQ09NTUVOVFMgPSAnY29tbWVudHMuY29udGludWVPbkNvbW1lbnRzJztcblxuZXhwb3J0IGNsYXNzIENvbW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21tZW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2V0RGF0YVByb3ZpZGVyOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2V0RGF0YVByb3ZpZGVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkU2V0RGF0YVByb3ZpZGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGVsZXRlRGF0YVByb3ZpZGVyOiBFbWl0dGVyPHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlbGV0ZURhdGFQcm92aWRlcjogRXZlbnQ8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkRGVsZXRlRGF0YVByb3ZpZGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2V0UmVzb3VyY2VDb21tZW50SW5mb3M6IEVtaXR0ZXI8SVJlc291cmNlQ29tbWVudFRocmVhZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSZXNvdXJjZUNvbW1lbnRUaHJlYWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2V0UmVzb3VyY2VDb21tZW50SW5mb3M6IEV2ZW50PElSZXNvdXJjZUNvbW1lbnRUaHJlYWRFdmVudD4gPSB0aGlzLl9vbkRpZFNldFJlc291cmNlQ29tbWVudEluZm9zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2V0QWxsQ29tbWVudFRocmVhZHM6IEVtaXR0ZXI8SVdvcmtzcGFjZUNvbW1lbnRUaHJlYWRzRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtzcGFjZUNvbW1lbnRUaHJlYWRzRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNldEFsbENvbW1lbnRUaHJlYWRzOiBFdmVudDxJV29ya3NwYWNlQ29tbWVudFRocmVhZHNFdmVudD4gPSB0aGlzLl9vbkRpZFNldEFsbENvbW1lbnRUaHJlYWRzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZHM6IEVtaXR0ZXI8SUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWRzOiBFdmVudDxJQ29tbWVudFRocmVhZENoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWRzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlTm90ZWJvb2tDb21tZW50VGhyZWFkczogRW1pdHRlcjxJTm90ZWJvb2tDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RlYm9va0NvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZU5vdGVib29rQ29tbWVudFRocmVhZHM6IEV2ZW50PElOb3RlYm9va0NvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRVcGRhdGVOb3RlYm9va0NvbW1lbnRUaHJlYWRzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlQ29tbWVudGluZ1JhbmdlczogRW1pdHRlcjx7IHVuaXF1ZU93bmVyOiBzdHJpbmcgfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHVuaXF1ZU93bmVyOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlQ29tbWVudGluZ1JhbmdlczogRXZlbnQ8eyB1bmlxdWVPd25lcjogc3RyaW5nIH0+ID0gdGhpcy5fb25EaWRVcGRhdGVDb21tZW50aW5nUmFuZ2VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDb21tZW50VGhyZWFkIHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3VycmVudENvbW1lbnRUaHJlYWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDb21tZW50VGhyZWFkIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXJyZW50Q29tbWVudFRocmVhZCA9IHRoaXMuX29uRGlkQ2hhbmdlQ3VycmVudENvbW1lbnRUaHJlYWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb21tZW50aW5nRW5hYmxlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbW1lbnRpbmdFbmFibGVkID0gdGhpcy5fb25EaWRDaGFuZ2VDb21tZW50aW5nRW5hYmxlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlc291cmNlSGFzQ29tbWVudGluZ1JhbmdlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblJlc291cmNlSGFzQ29tbWVudGluZ1JhbmdlcyA9IHRoaXMuX29uUmVzb3VyY2VIYXNDb21tZW50aW5nUmFuZ2VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlQ29tbWVudGluZ1JhbmdlOiBFbWl0dGVyPHtcblx0XHRyYW5nZTogUmFuZ2U7IGNvbW1lbnRpbmdSYW5nZXNJbmZvOlxuXHRcdENvbW1lbnRpbmdSYW5nZXM7XG5cdH0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8e1xuXHRcdHJhbmdlOiBSYW5nZTsgY29tbWVudGluZ1Jhbmdlc0luZm86XG5cdFx0Q29tbWVudGluZ1Jhbmdlcztcblx0fT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlQ29tbWVudGluZ1JhbmdlOiBFdmVudDx7IHJhbmdlOiBSYW5nZTsgY29tbWVudGluZ1Jhbmdlc0luZm86IENvbW1lbnRpbmdSYW5nZXMgfT4gPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNvbW1lbnRpbmdSYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9jb21tZW50Q29udHJvbHMgPSBuZXcgTWFwPHN0cmluZywgSUNvbW1lbnRDb250cm9sbGVyPigpO1xuXHRwcml2YXRlIF9jb21tZW50TWVudXMgPSBuZXcgTWFwPHN0cmluZywgQ29tbWVudE1lbnVzPigpO1xuXHRwcml2YXRlIF9pc0NvbW1lbnRpbmdFbmFibGVkOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBfd29ya3NwYWNlSGFzQ29tbWVudGluZzogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2NvbW1lbnRpbmdFbmFibGVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9jb250aW51ZU9uQ29tbWVudHMgPSBuZXcgTWFwPHN0cmluZywgUGVuZGluZ0NvbW1lbnRUaHJlYWRbXT4oKTsgLy8gdW5pcXVlT3duZXIgLT4gUGVuZGluZ0NvbW1lbnRUaHJlYWRbXVxuXHRwcml2YXRlIF9jb250aW51ZU9uQ29tbWVudFByb3ZpZGVycyA9IG5ldyBTZXQ8SUNvbnRpbnVlT25Db21tZW50UHJvdmlkZXI+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudHNNb2RlbDogQ29tbWVudHNNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb21tZW50c01vZGVsKCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29tbWVudHNNb2RlbDogSUNvbW1lbnRzTW9kZWwgPSB0aGlzLl9jb21tZW50c01vZGVsO1xuXG5cdHByaXZhdGUgX2NvbW1lbnRpbmdSYW5nZVJlc291cmNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpOyAvLyBVUklzXG5cdHByaXZhdGUgX2NvbW1lbnRpbmdSYW5nZVJlc291cmNlSGludFNjaGVtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gc2NoZW1lc1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faGFuZGxlQ29uZmlndXJhdGlvbigpO1xuXHRcdHRoaXMuX2hhbmRsZVplbk1vZGUoKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VIYXNDb21tZW50aW5nID0gQ29tbWVudENvbnRleHRLZXlzLldvcmtzcGFjZUhhc0NvbW1lbnRpbmcuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb21tZW50aW5nRW5hYmxlZCA9IENvbW1lbnRDb250ZXh0S2V5cy5jb21tZW50aW5nRW5hYmxlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2VMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRjb25zdCBzdG9yYWdlRXZlbnQgPSBFdmVudC5kZWJvdW5jZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgQ09OVElOVUVfT05fQ09NTUVOVFMsIHN0b3JhZ2VMaXN0ZW5lciksIChsYXN0LCBldmVudCkgPT4gbGFzdD8uZXh0ZXJuYWwgPyBsYXN0IDogZXZlbnQsIDUwMCk7XG5cdFx0c3RvcmFnZUxpc3RlbmVyLmFkZChzdG9yYWdlRXZlbnQodiA9PiB7XG5cdFx0XHRpZiAoIXYuZXh0ZXJuYWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29tbWVudHNUb1Jlc3RvcmU6IFBlbmRpbmdDb21tZW50VGhyZWFkW10gfCB1bmRlZmluZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChDT05USU5VRV9PTl9DT01NRU5UUywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAoIWNvbW1lbnRzVG9SZXN0b3JlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgQ29tbWVudHM6IFVSSXMgb2YgY29udGludWUgb24gY29tbWVudHMgZnJvbSBzdG9yYWdlICR7Y29tbWVudHNUb1Jlc3RvcmUubWFwKHRocmVhZCA9PiB0aHJlYWQudXJpLnRvU3RyaW5nKCkpLmpvaW4oJywgJyl9LmApO1xuXHRcdFx0Y29uc3QgY2hhbmdlZE93bmVycyA9IHRoaXMuX2FkZENvbnRpbnVlT25Db21tZW50cyhjb21tZW50c1RvUmVzdG9yZSwgdGhpcy5fY29udGludWVPbkNvbW1lbnRzKTtcblx0XHRcdGZvciAoY29uc3QgdW5pcXVlT3duZXIgb2YgY2hhbmdlZE93bmVycykge1xuXHRcdFx0XHRjb25zdCBjb250cm9sID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cdFx0XHRcdGlmICghY29udHJvbCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGV2dDogSUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHRcdFx0dW5pcXVlT3duZXI6IHVuaXF1ZU93bmVyLFxuXHRcdFx0XHRcdG93bmVyOiBjb250cm9sLm93bmVyLFxuXHRcdFx0XHRcdG93bmVyTGFiZWw6IGNvbnRyb2wubGFiZWwsXG5cdFx0XHRcdFx0cGVuZGluZzogdGhpcy5fY29udGludWVPbkNvbW1lbnRzLmdldCh1bmlxdWVPd25lcikgfHwgW10sXG5cdFx0XHRcdFx0YWRkZWQ6IFtdLFxuXHRcdFx0XHRcdHJlbW92ZWQ6IFtdLFxuXHRcdFx0XHRcdGNoYW5nZWQ6IFtdXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudXBkYXRlTW9kZWxUaHJlYWRzKGV2dCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXA6IE1hcDxzdHJpbmcsIFBlbmRpbmdDb21tZW50VGhyZWFkW10+ID0gbmV3IE1hcCgpO1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9jb250aW51ZU9uQ29tbWVudFByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ29tbWVudHMgPSBwcm92aWRlci5wcm92aWRlQ29udGludWVPbkNvbW1lbnRzKCk7XG5cdFx0XHRcdHRoaXMuX2FkZENvbnRpbnVlT25Db21tZW50cyhwZW5kaW5nQ29tbWVudHMsIG1hcCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zYXZlQ29udGludWVPbkNvbW1lbnRzKG1hcCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKG1vZGVsID0+IHtcblx0XHRcdC8vIEV4Y2x1ZGVkIHNjaGVtZXNcblx0XHRcdGlmICgobW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVTb3VyY2VDb250cm9sKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBBbGxvd3MgY29tbWVudCBwcm92aWRlcnMgdG8gY2F1c2UgdGhlaXIgY29tbWVudGluZyByYW5nZXMgdG8gYmUgcHJlZmV0Y2hlZCBieSBvcGVuaW5nIHRleHQgZG9jdW1lbnRzIGluIHRoZSBiYWNrZ3JvdW5kLlxuXHRcdFx0aWYgKCF0aGlzLl9jb21tZW50aW5nUmFuZ2VSZXNvdXJjZXMuaGFzKG1vZGVsLnVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHR0aGlzLmdldERvY3VtZW50Q29tbWVudHMobW9kZWwudXJpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVSZXNvdXJjZXNXaXRoQ29tbWVudGluZ1JhbmdlcyhyZXNvdXJjZTogVVJJLCBjb21tZW50SW5mb3M6IChJQ29tbWVudEluZm8gfCBudWxsKVtdKSB7XG5cdFx0bGV0IGFkZGVkUmVzb3VyY2VzID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBjb21tZW50cyBvZiBjb21tZW50SW5mb3MpIHtcblx0XHRcdGlmIChjb21tZW50cyAmJiAoY29tbWVudHMuY29tbWVudGluZ1Jhbmdlcy5yYW5nZXMubGVuZ3RoID4gMCB8fCBjb21tZW50cy50aHJlYWRzLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZVJlc291cmNlcy5hZGQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFkZGVkUmVzb3VyY2VzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGFkZGVkUmVzb3VyY2VzKSB7XG5cdFx0XHR0aGlzLl9vblJlc291cmNlSGFzQ29tbWVudGluZ1Jhbmdlcy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ29uZmlndXJhdGlvbigpIHtcblx0XHR0aGlzLl9pc0NvbW1lbnRpbmdFbmFibGVkID0gdGhpcy5fZGVmYXVsdENvbW1lbnRpbmdFbmFibGVtZW50O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2NvbW1lbnRzLnZpc2libGUnKSkge1xuXHRcdFx0XHR0aGlzLmVuYWJsZUNvbW1lbnRpbmcodGhpcy5fZGVmYXVsdENvbW1lbnRpbmdFbmFibGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVaZW5Nb2RlKCkge1xuXHRcdGxldCBwcmVaZW5Nb2RlVmFsdWU6IGJvb2xlYW4gPSB0aGlzLl9pc0NvbW1lbnRpbmdFbmFibGVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVplbk1vZGUoZSA9PiB7XG5cdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRwcmVaZW5Nb2RlVmFsdWUgPSB0aGlzLl9pc0NvbW1lbnRpbmdFbmFibGVkO1xuXHRcdFx0XHR0aGlzLmVuYWJsZUNvbW1lbnRpbmcoZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbmFibGVDb21tZW50aW5nKHByZVplbk1vZGVWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2RlZmF1bHRDb21tZW50aW5nRW5hYmxlbWVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElDb21tZW50c0NvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQ+KENPTU1FTlRTX1NFQ1RJT04pPy52aXNpYmxlO1xuXHR9XG5cblx0Z2V0IGlzQ29tbWVudGluZ0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQ29tbWVudGluZ0VuYWJsZWQ7XG5cdH1cblxuXHRlbmFibGVDb21tZW50aW5nKGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChlbmFibGUgIT09IHRoaXMuX2lzQ29tbWVudGluZ0VuYWJsZWQpIHtcblx0XHRcdHRoaXMuX2lzQ29tbWVudGluZ0VuYWJsZWQgPSBlbmFibGU7XG5cdFx0XHR0aGlzLl9jb21tZW50aW5nRW5hYmxlZC5zZXQoZW5hYmxlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29tbWVudGluZ0VuYWJsZWQuZmlyZShlbmFibGUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudCBjb21tZW50IHRocmVhZCBpcyB0aGUgdGhyZWFkIHRoYXQgaGFzIGZvY3VzIG9yIGlzIGJlaW5nIGhvdmVyZWQuXG5cdCAqIEBwYXJhbSBjb21tZW50VGhyZWFkXG5cdCAqL1xuXHRzZXRDdXJyZW50Q29tbWVudFRocmVhZChjb21tZW50VGhyZWFkOiBDb21tZW50VGhyZWFkIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXJyZW50Q29tbWVudFRocmVhZC5maXJlKGNvbW1lbnRUaHJlYWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBhY3RpdmUgY29tbWVudCB0aHJlYWQgaXMgdGhlIHRocmVhZCB0aGF0IGlzIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQuXG5cdCAqIEBwYXJhbSBjb21tZW50VGhyZWFkXG5cdCAqL1xuXHRzZXRBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkOiBDb21tZW50VGhyZWFkIHwgbnVsbCkge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQuZmlyZShjb21tZW50VGhyZWFkKTtcblx0fVxuXG5cdGdldCBsYXN0QWN0aXZlQ29tbWVudGNvbnRyb2xsZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RBY3RpdmVDb21tZW50Q29udHJvbGxlcjtcblx0fVxuXG5cdHByaXZhdGUgX2xhc3RBY3RpdmVDb21tZW50Q29udHJvbGxlcjogSUNvbW1lbnRDb250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXHRhc3luYyBzZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKHVuaXF1ZU93bmVyOiBzdHJpbmcsIGNvbW1lbnRJbmZvOiB7IHRocmVhZDogQ29tbWVudFRocmVhZDxJUmFuZ2U+OyBjb21tZW50PzogQ29tbWVudCB9IHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KHVuaXF1ZU93bmVyKTtcblxuXHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY29tbWVudENvbnRyb2xsZXIgIT09IHRoaXMuX2xhc3RBY3RpdmVDb21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fbGFzdEFjdGl2ZUNvbW1lbnRDb250cm9sbGVyPy5zZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RBY3RpdmVDb21tZW50Q29udHJvbGxlciA9IGNvbW1lbnRDb250cm9sbGVyO1xuXHRcdHJldHVybiBjb21tZW50Q29udHJvbGxlci5zZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKGNvbW1lbnRJbmZvKTtcblx0fVxuXG5cdHNldERvY3VtZW50Q29tbWVudHMocmVzb3VyY2U6IFVSSSwgY29tbWVudEluZm9zOiBJQ29tbWVudEluZm9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2V0UmVzb3VyY2VDb21tZW50SW5mb3MuZmlyZSh7IHJlc291cmNlLCBjb21tZW50SW5mb3MgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNldE1vZGVsVGhyZWFkcyhvd25lcklkOiBzdHJpbmcsIG93bmVyOiBzdHJpbmcsIG93bmVyTGFiZWw6IHN0cmluZywgY29tbWVudFRocmVhZHM6IENvbW1lbnRUaHJlYWQ8SVJhbmdlPltdKSB7XG5cdFx0dGhpcy5fY29tbWVudHNNb2RlbC5zZXRDb21tZW50VGhyZWFkcyhvd25lcklkLCBvd25lciwgb3duZXJMYWJlbCwgY29tbWVudFRocmVhZHMpO1xuXHRcdHRoaXMuX29uRGlkU2V0QWxsQ29tbWVudFRocmVhZHMuZmlyZSh7IG93bmVySWQsIG93bmVyTGFiZWwsIGNvbW1lbnRUaHJlYWRzIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb2RlbFRocmVhZHMoZXZlbnQ6IElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50KSB7XG5cdFx0dGhpcy5fY29tbWVudHNNb2RlbC51cGRhdGVDb21tZW50VGhyZWFkcyhldmVudCk7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkcy5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHNldFdvcmtzcGFjZUNvbW1lbnRzKHVuaXF1ZU93bmVyOiBzdHJpbmcsIGNvbW1lbnRzQnlSZXNvdXJjZTogQ29tbWVudFRocmVhZFtdKTogdm9pZCB7XG5cblx0XHRpZiAoY29tbWVudHNCeVJlc291cmNlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlSGFzQ29tbWVudGluZy5zZXQodHJ1ZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyb2wgPSB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KHVuaXF1ZU93bmVyKTtcblx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0dGhpcy5zZXRNb2RlbFRocmVhZHModW5pcXVlT3duZXIsIGNvbnRyb2wub3duZXIsIGNvbnRyb2wubGFiZWwsIGNvbW1lbnRzQnlSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlV29ya3NwYWNlQ29tbWVudHModW5pcXVlT3duZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2wgPSB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KHVuaXF1ZU93bmVyKTtcblx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0dGhpcy5zZXRNb2RlbFRocmVhZHModW5pcXVlT3duZXIsIGNvbnRyb2wub3duZXIsIGNvbnRyb2wubGFiZWwsIFtdKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKHVuaXF1ZU93bmVyOiBzdHJpbmcsIGNvbW1lbnRDb250cm9sOiBJQ29tbWVudENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50Q29udHJvbHMuc2V0KHVuaXF1ZU93bmVyLCBjb21tZW50Q29udHJvbCk7XG5cdFx0dGhpcy5fb25EaWRTZXREYXRhUHJvdmlkZXIuZmlyZSgpO1xuXHR9XG5cblx0dW5yZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKHVuaXF1ZU93bmVyPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHVuaXF1ZU93bmVyKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50Q29udHJvbHMuZGVsZXRlKHVuaXF1ZU93bmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29tbWVudENvbnRyb2xzLmNsZWFyKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRzTW9kZWwuZGVsZXRlQ29tbWVudHNCeU93bmVyKHVuaXF1ZU93bmVyKTtcblx0XHR0aGlzLl9vbkRpZERlbGV0ZURhdGFQcm92aWRlci5maXJlKHVuaXF1ZU93bmVyKTtcblx0fVxuXG5cdGdldENvbW1lbnRDb250cm9sbGVyKHVuaXF1ZU93bmVyOiBzdHJpbmcpOiBJQ29tbWVudENvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KHVuaXF1ZU93bmVyKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh1bmlxdWVPd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCByYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQsIGVkaXRvcklkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KHVuaXF1ZU93bmVyKTtcblxuXHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tbWVudENvbnRyb2xsZXIuY3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHJlc291cmNlLCByYW5nZSwgZWRpdG9ySWQpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHRocmVhZEhhbmRsZTogbnVtYmVyLCByYW5nZTogUmFuZ2UpIHtcblx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9scy5nZXQodW5pcXVlT3duZXIpO1xuXG5cdFx0aWYgKCFjb21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGNvbW1lbnRDb250cm9sbGVyLnVwZGF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh0aHJlYWRIYW5kbGUsIHJhbmdlKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21tZW50VGhyZWFkKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHRocmVhZElkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5nZXRDb21tZW50Q29udHJvbGxlcih1bmlxdWVPd25lcik7XG5cdFx0Y29udHJvbGxlcj8uZGVsZXRlQ29tbWVudFRocmVhZE1haW4odGhyZWFkSWQpO1xuXHR9XG5cblx0Z2V0Q29tbWVudE1lbnVzKHVuaXF1ZU93bmVyOiBzdHJpbmcpOiBDb21tZW50TWVudXMge1xuXHRcdGlmICh0aGlzLl9jb21tZW50TWVudXMuZ2V0KHVuaXF1ZU93bmVyKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRNZW51cy5nZXQodW5pcXVlT3duZXIpITtcblx0XHR9XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tZW50TWVudXMpO1xuXHRcdHRoaXMuX2NvbW1lbnRNZW51cy5zZXQodW5pcXVlT3duZXIsIG1lbnUpO1xuXHRcdHJldHVybiBtZW51O1xuXHR9XG5cblx0dXBkYXRlQ29tbWVudHMob3duZXJJZDogc3RyaW5nLCBldmVudDogQ29tbWVudFRocmVhZENoYW5nZWRFdmVudDxJUmFuZ2U+KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbCA9IHRoaXMuX2NvbW1lbnRDb250cm9scy5nZXQob3duZXJJZCk7XG5cdFx0aWYgKGNvbnRyb2wpIHtcblx0XHRcdGNvbnN0IGV2dDogSUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQgPSBPYmplY3QuYXNzaWduKHt9LCBldmVudCwgeyB1bmlxdWVPd25lcjogb3duZXJJZCwgb3duZXJMYWJlbDogY29udHJvbC5sYWJlbCwgb3duZXI6IGNvbnRyb2wub3duZXIgfSk7XG5cdFx0XHR0aGlzLnVwZGF0ZU1vZGVsVGhyZWFkcyhldnQpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZU5vdGVib29rQ29tbWVudHMob3duZXJJZDogc3RyaW5nLCBldmVudDogQ29tbWVudFRocmVhZENoYW5nZWRFdmVudDxJQ2VsbFJhbmdlPik6IHZvaWQge1xuXHRcdGNvbnN0IGV2dDogSU5vdGVib29rQ29tbWVudFRocmVhZENoYW5nZWRFdmVudCA9IE9iamVjdC5hc3NpZ24oe30sIGV2ZW50LCB7IHVuaXF1ZU93bmVyOiBvd25lcklkIH0pO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlTm90ZWJvb2tDb21tZW50VGhyZWFkcy5maXJlKGV2dCk7XG5cdH1cblxuXHR1cGRhdGVDb21tZW50aW5nUmFuZ2VzKG93bmVySWQ6IHN0cmluZywgcmVzb3VyY2VIaW50cz86IENvbW1lbnRpbmdSYW5nZVJlc291cmNlSGludCkge1xuXHRcdGlmIChyZXNvdXJjZUhpbnRzPy5zY2hlbWVzICYmIHJlc291cmNlSGludHMuc2NoZW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiByZXNvdXJjZUhpbnRzLnNjaGVtZXMpIHtcblx0XHRcdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlUmVzb3VyY2VIaW50U2NoZW1lcy5hZGQoc2NoZW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fd29ya3NwYWNlSGFzQ29tbWVudGluZy5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50aW5nUmFuZ2VzLmZpcmUoeyB1bmlxdWVPd25lcjogb3duZXJJZCB9KTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZVJlYWN0aW9uKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIHRocmVhZDogQ29tbWVudFRocmVhZCwgY29tbWVudDogQ29tbWVudCwgcmVhY3Rpb246IENvbW1lbnRSZWFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cblx0XHRpZiAoY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBjb21tZW50Q29udHJvbGxlci50b2dnbGVSZWFjdGlvbihyZXNvdXJjZSwgdGhyZWFkLCBjb21tZW50LCByZWFjdGlvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHRcdH1cblx0fVxuXG5cdGhhc1JlYWN0aW9uSGFuZGxlcih1bmlxdWVPd25lcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29tbWVudFByb3ZpZGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cblx0XHRpZiAoY29tbWVudFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gISFjb21tZW50UHJvdmlkZXIuZmVhdHVyZXMucmVhY3Rpb25IYW5kbGVyO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIGdldERvY3VtZW50Q29tbWVudHMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8KElDb21tZW50SW5mbyB8IG51bGwpW10+IHtcblx0XHRjb25zdCBjb21tZW50Q29udHJvbFJlc3VsdDogUHJvbWlzZTxJQ29tbWVudEluZm8gfCBudWxsPltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRyb2wgb2YgdGhpcy5fY29tbWVudENvbnRyb2xzLnZhbHVlcygpKSB7XG5cdFx0XHRjb21tZW50Q29udHJvbFJlc3VsdC5wdXNoKGNvbnRyb2wuZ2V0RG9jdW1lbnRDb21tZW50cyhyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSlcblx0XHRcdFx0LnRoZW4oZG9jdW1lbnRDb21tZW50cyA9PiB7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCB0aGVyZSBhcmVuJ3QgYW55IGNvbnRpbnVlIG9uIGNvbW1lbnRzIGluIHRoZSBwcm92aWRlZCBjb21tZW50c1xuXHRcdFx0XHRcdC8vIFRoaXMgY2FuIGhhcHBlbiBiZWNhdXNlIGNvbnRpbnVlIG9uIGNvbW1lbnRzIGFyZSBzdG9yZWQgc2VwYXJhdGVseSBmcm9tIGxvY2FsIHVuLXN1Ym1pdHRlZCBjb21tZW50cy5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRvY3VtZW50Q29tbWVudFRocmVhZCBvZiBkb2N1bWVudENvbW1lbnRzLnRocmVhZHMpIHtcblx0XHRcdFx0XHRcdGlmIChkb2N1bWVudENvbW1lbnRUaHJlYWQuY29tbWVudHM/Lmxlbmd0aCA9PT0gMCAmJiBkb2N1bWVudENvbW1lbnRUaHJlYWQucmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVDb250aW51ZU9uQ29tbWVudCh7IHJhbmdlOiBkb2N1bWVudENvbW1lbnRUaHJlYWQucmFuZ2UsIHVyaTogcmVzb3VyY2UsIHVuaXF1ZU93bmVyOiBkb2N1bWVudENvbW1lbnRzLnVuaXF1ZU93bmVyIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwZW5kaW5nQ29tbWVudHMgPSB0aGlzLl9jb250aW51ZU9uQ29tbWVudHMuZ2V0KGRvY3VtZW50Q29tbWVudHMudW5pcXVlT3duZXIpO1xuXHRcdFx0XHRcdGRvY3VtZW50Q29tbWVudHMucGVuZGluZ0NvbW1lbnRUaHJlYWRzID0gcGVuZGluZ0NvbW1lbnRzPy5maWx0ZXIocGVuZGluZ0NvbW1lbnQgPT4gcGVuZGluZ0NvbW1lbnQudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdHJldHVybiBkb2N1bWVudENvbW1lbnRzO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQuY2F0Y2goXyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tZW50SW5mb3MgPSBhd2FpdCBQcm9taXNlLmFsbChjb21tZW50Q29udHJvbFJlc3VsdCk7XG5cdFx0dGhpcy5fdXBkYXRlUmVzb3VyY2VzV2l0aENvbW1lbnRpbmdSYW5nZXMocmVzb3VyY2UsIGNvbW1lbnRJbmZvcyk7XG5cdFx0cmV0dXJuIGNvbW1lbnRJbmZvcztcblx0fVxuXG5cdGFzeW5jIGdldE5vdGVib29rQ29tbWVudHMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8KElOb3RlYm9va0NvbW1lbnRJbmZvIHwgbnVsbClbXT4ge1xuXHRcdGNvbnN0IGNvbW1lbnRDb250cm9sUmVzdWx0OiBQcm9taXNlPElOb3RlYm9va0NvbW1lbnRJbmZvIHwgbnVsbD5bXSA9IFtdO1xuXG5cdFx0dGhpcy5fY29tbWVudENvbnRyb2xzLmZvckVhY2goY29udHJvbCA9PiB7XG5cdFx0XHRjb21tZW50Q29udHJvbFJlc3VsdC5wdXNoKGNvbnRyb2wuZ2V0Tm90ZWJvb2tDb21tZW50cyhyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSlcblx0XHRcdFx0LmNhdGNoKF8gPT4ge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoY29tbWVudENvbnRyb2xSZXN1bHQpO1xuXHR9XG5cblx0cmVnaXN0ZXJDb250aW51ZU9uQ29tbWVudFByb3ZpZGVyKHByb3ZpZGVyOiBJQ29udGludWVPbkNvbW1lbnRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jb250aW51ZU9uQ29tbWVudFByb3ZpZGVycy5hZGQocHJvdmlkZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRpbnVlT25Db21tZW50UHJvdmlkZXJzLmRlbGV0ZShwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVDb250aW51ZU9uQ29tbWVudHMobWFwOiBNYXA8c3RyaW5nLCBQZW5kaW5nQ29tbWVudFRocmVhZFtdPikge1xuXHRcdGNvbnN0IGNvbW1lbnRzVG9TYXZlOiBQZW5kaW5nQ29tbWVudFRocmVhZFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nQ29tbWVudHMgb2YgbWFwLnZhbHVlcygpKSB7XG5cdFx0XHRjb21tZW50c1RvU2F2ZS5wdXNoKC4uLnBlbmRpbmdDb21tZW50cyk7XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgQ29tbWVudHM6IFVSSXMgb2YgY29udGludWUgb24gY29tbWVudHMgdG8gYWRkIHRvIHN0b3JhZ2UgJHtjb21tZW50c1RvU2F2ZS5tYXAodGhyZWFkID0+IHRocmVhZC51cmkudG9TdHJpbmcoKSkuam9pbignLCAnKX0uYCk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDT05USU5VRV9PTl9DT01NRU5UUywgY29tbWVudHNUb1NhdmUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRyZW1vdmVDb250aW51ZU9uQ29tbWVudChwZW5kaW5nQ29tbWVudDogeyByYW5nZTogSVJhbmdlOyB1cmk6IFVSSTsgdW5pcXVlT3duZXI6IHN0cmluZzsgaXNSZXBseT86IGJvb2xlYW4gfSk6IFBlbmRpbmdDb21tZW50VGhyZWFkIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwZW5kaW5nQ29tbWVudHMgPSB0aGlzLl9jb250aW51ZU9uQ29tbWVudHMuZ2V0KHBlbmRpbmdDb21tZW50LnVuaXF1ZU93bmVyKTtcblx0XHRpZiAocGVuZGluZ0NvbW1lbnRzKSB7XG5cdFx0XHRjb25zdCBjb21tZW50SW5kZXggPSBwZW5kaW5nQ29tbWVudHMuZmluZEluZGV4KGNvbW1lbnQgPT4gY29tbWVudC51cmkudG9TdHJpbmcoKSA9PT0gcGVuZGluZ0NvbW1lbnQudXJpLnRvU3RyaW5nKCkgJiYgUmFuZ2UuZXF1YWxzUmFuZ2UoY29tbWVudC5yYW5nZSwgcGVuZGluZ0NvbW1lbnQucmFuZ2UpICYmIChwZW5kaW5nQ29tbWVudC5pc1JlcGx5ID09PSB1bmRlZmluZWQgfHwgY29tbWVudC5pc1JlcGx5ID09PSBwZW5kaW5nQ29tbWVudC5pc1JlcGx5KSk7XG5cdFx0XHRpZiAoY29tbWVudEluZGV4ID4gLTEpIHtcblx0XHRcdFx0cmV0dXJuIHBlbmRpbmdDb21tZW50cy5zcGxpY2UoY29tbWVudEluZGV4LCAxKVswXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2FkZENvbnRpbnVlT25Db21tZW50cyhwZW5kaW5nQ29tbWVudHM6IFBlbmRpbmdDb21tZW50VGhyZWFkW10sIG1hcDogTWFwPHN0cmluZywgUGVuZGluZ0NvbW1lbnRUaHJlYWRbXT4pOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2hhbmdlZE93bmVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcGVuZGluZ0NvbW1lbnQgb2YgcGVuZGluZ0NvbW1lbnRzKSB7XG5cdFx0XHRpZiAoIW1hcC5oYXMocGVuZGluZ0NvbW1lbnQudW5pcXVlT3duZXIpKSB7XG5cdFx0XHRcdG1hcC5zZXQocGVuZGluZ0NvbW1lbnQudW5pcXVlT3duZXIsIFtwZW5kaW5nQ29tbWVudF0pO1xuXHRcdFx0XHRjaGFuZ2VkT3duZXJzLmFkZChwZW5kaW5nQ29tbWVudC51bmlxdWVPd25lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb21tZW50c0Zvck93bmVyID0gbWFwLmdldChwZW5kaW5nQ29tbWVudC51bmlxdWVPd25lcikhO1xuXHRcdFx0XHRpZiAoY29tbWVudHNGb3JPd25lci5ldmVyeShjb21tZW50ID0+IChjb21tZW50LnVyaS50b1N0cmluZygpICE9PSBwZW5kaW5nQ29tbWVudC51cmkudG9TdHJpbmcoKSkgfHwgIVJhbmdlLmVxdWFsc1JhbmdlKGNvbW1lbnQucmFuZ2UsIHBlbmRpbmdDb21tZW50LnJhbmdlKSkpIHtcblx0XHRcdFx0XHRjb21tZW50c0Zvck93bmVyLnB1c2gocGVuZGluZ0NvbW1lbnQpO1xuXHRcdFx0XHRcdGNoYW5nZWRPd25lcnMuYWRkKHBlbmRpbmdDb21tZW50LnVuaXF1ZU93bmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY2hhbmdlZE93bmVycztcblx0fVxuXG5cdHJlc291cmNlSGFzQ29tbWVudGluZ1JhbmdlcyhyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRpbmdSYW5nZVJlc291cmNlSGludFNjaGVtZXMuaGFzKHJlc291cmNlLnNjaGVtZSkgfHwgdGhpcy5fY29tbWVudGluZ1JhbmdlUmVzb3VyY2VzLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUV6RCxTQUFTLGFBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQWdEO0FBQ3pELFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQztBQUM5QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFFakIsTUFBTSxrQkFBa0IsZ0JBQWlDLGdCQUFnQjtBQWlHaEYsTUFBTSx1QkFBdUI7QUFFdEIsSUFBTSxpQkFBTixjQUE2QixXQUFzQztBQUFBO0FBQUEsRUE0RHpFLFlBQzJDLHNCQUNBLGVBQ0Ysc0JBQ3BCLG1C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
