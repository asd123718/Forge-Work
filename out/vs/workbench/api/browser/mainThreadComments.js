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
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { Range } from "../../../editor/common/core/range.js";
import * as languages from "../../../editor/common/languages.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ICommentService } from "../../contrib/comments/browser/commentService.js";
import { CommentsPanel } from "../../contrib/comments/browser/commentsView.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { COMMENTS_VIEW_ID, COMMENTS_VIEW_STORAGE_ID, COMMENTS_VIEW_TITLE } from "../../contrib/comments/browser/commentsTreeViewer.js";
import { Extensions as ViewExtensions, ViewContainerLocation, IViewDescriptorService } from "../../common/views.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { ViewPaneContainer } from "../../browser/parts/views/viewPaneContainer.js";
import { Codicon } from "../../../base/common/codicons.js";
import { registerIcon } from "../../../platform/theme/common/iconRegistry.js";
import { localize } from "../../../nls.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { Schemas } from "../../../base/common/network.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
import { revealCommentThread } from "../../contrib/comments/browser/commentsController.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
class MainThreadCommentThread {
  constructor(commentThreadHandle, controllerHandle, extensionId, threadId, resource, _range, comments, _canReply, _isTemplate, editorId) {
    this.commentThreadHandle = commentThreadHandle;
    this.controllerHandle = controllerHandle;
    this.extensionId = extensionId;
    this.threadId = threadId;
    this.resource = resource;
    this._range = _range;
    this._canReply = _canReply;
    this._isTemplate = _isTemplate;
    this.editorId = editorId;
    this._onDidChangeInput = new Emitter();
    this._onDidChangeLabel = new Emitter();
    this.onDidChangeLabel = this._onDidChangeLabel.event;
    this._onDidChangeComments = new Emitter();
    this._onDidChangeCanReply = new Emitter();
    this._collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
    this._onDidChangeCollapsibleState = new Emitter();
    this.onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;
    this._onDidChangeInitialCollapsibleState = new Emitter();
    this.onDidChangeInitialCollapsibleState = this._onDidChangeInitialCollapsibleState.event;
    this._onDidChangeApplicability = new Emitter();
    this.onDidChangeApplicability = this._onDidChangeApplicability.event;
    this._onDidChangeState = new Emitter();
    this.onDidChangeState = this._onDidChangeState.event;
    this._isDisposed = false;
    if (_isTemplate) {
      this.comments = [];
    } else if (comments) {
      this._comments = comments;
    }
  }
  get input() {
    return this._input;
  }
  set input(value) {
    this._input = value;
    this._onDidChangeInput.fire(value);
  }
  get onDidChangeInput() {
    return this._onDidChangeInput.event;
  }
  get label() {
    return this._label;
  }
  set label(label) {
    this._label = label;
    this._onDidChangeLabel.fire(this._label);
  }
  get contextValue() {
    return this._contextValue;
  }
  set contextValue(context) {
    this._contextValue = context;
  }
  get comments() {
    return this._comments;
  }
  set comments(newComments) {
    this._comments = newComments;
    this._onDidChangeComments.fire(this._comments);
  }
  get onDidChangeComments() {
    return this._onDidChangeComments.event;
  }
  set range(range) {
    this._range = range;
  }
  get range() {
    return this._range;
  }
  get onDidChangeCanReply() {
    return this._onDidChangeCanReply.event;
  }
  set canReply(state) {
    this._canReply = state;
    this._onDidChangeCanReply.fire(!!this._canReply);
  }
  get canReply() {
    return this._canReply;
  }
  get collapsibleState() {
    return this._collapsibleState;
  }
  set collapsibleState(newState) {
    if (this.initialCollapsibleState === void 0) {
      this.initialCollapsibleState = newState;
    }
    if (newState !== this._collapsibleState) {
      this._collapsibleState = newState;
      this._onDidChangeCollapsibleState.fire(this._collapsibleState);
    }
  }
  get initialCollapsibleState() {
    return this._initialCollapsibleState;
  }
  set initialCollapsibleState(initialCollapsibleState) {
    this._initialCollapsibleState = initialCollapsibleState;
    this._onDidChangeInitialCollapsibleState.fire(initialCollapsibleState);
  }
  get isDisposed() {
    return this._isDisposed;
  }
  isDocumentCommentThread() {
    return this._range === void 0 || Range.isIRange(this._range);
  }
  get state() {
    return this._state;
  }
  set state(newState) {
    this._state = newState;
    this._onDidChangeState.fire(this._state);
  }
  get applicability() {
    return this._applicability;
  }
  set applicability(value) {
    this._applicability = value;
    this._onDidChangeApplicability.fire(value);
  }
  get isTemplate() {
    return this._isTemplate;
  }
  batchUpdate(changes) {
    const modified = (value) => Object.prototype.hasOwnProperty.call(changes, value);
    if (modified("range")) {
      this._range = changes.range;
    }
    if (modified("label")) {
      this._label = changes.label;
    }
    if (modified("contextValue")) {
      this._contextValue = changes.contextValue === null ? void 0 : changes.contextValue;
    }
    if (modified("comments")) {
      this.comments = changes.comments;
    }
    if (modified("collapseState")) {
      this.collapsibleState = changes.collapseState;
    }
    if (modified("canReply")) {
      this.canReply = changes.canReply;
    }
    if (modified("state")) {
      this.state = changes.state;
    }
    if (modified("applicability")) {
      this.applicability = changes.applicability;
    }
    if (modified("isTemplate")) {
      this._isTemplate = changes.isTemplate;
    }
  }
  hasComments() {
    return !!this.comments && this.comments.length > 0;
  }
  dispose() {
    this._isDisposed = true;
    this._onDidChangeCollapsibleState.dispose();
    this._onDidChangeInitialCollapsibleState.dispose();
    this._onDidChangeComments.dispose();
    this._onDidChangeInput.dispose();
    this._onDidChangeLabel.dispose();
    this._onDidChangeCanReply.dispose();
    this._onDidChangeState.dispose();
    this._onDidChangeApplicability.dispose();
  }
  toJSON() {
    return {
      $mid: MarshalledId.CommentThread,
      commentControlHandle: this.controllerHandle,
      commentThreadHandle: this.commentThreadHandle
    };
  }
}
class CommentThreadWithDisposable {
  constructor(thread) {
    this.thread = thread;
    this.disposableStore = new DisposableStore();
  }
  dispose() {
    this.disposableStore.dispose();
  }
}
let MainThreadCommentController = class extends Disposable {
  constructor(_proxy, _handle, _uniqueId, _id, _label, _features, _commentService, _uriIdentityService) {
    super();
    this._proxy = _proxy;
    this._handle = _handle;
    this._uniqueId = _uniqueId;
    this._id = _id;
    this._label = _label;
    this._features = _features;
    this._commentService = _commentService;
    this._uriIdentityService = _uriIdentityService;
    this._threads = this._register(new DisposableMap());
  }
  get handle() {
    return this._handle;
  }
  get id() {
    return this._id;
  }
  get contextValue() {
    return this._id;
  }
  get proxy() {
    return this._proxy;
  }
  get label() {
    return this._label;
  }
  get reactions() {
    return this._reactions;
  }
  set reactions(reactions) {
    this._reactions = reactions;
  }
  get options() {
    return this._features.options;
  }
  get features() {
    return this._features;
  }
  get owner() {
    return this._id;
  }
  get activeComment() {
    return this._activeComment;
  }
  async setActiveCommentAndThread(commentInfo) {
    this._activeComment = commentInfo;
    return this._proxy.$setActiveComment(this._handle, commentInfo ? { commentThreadHandle: commentInfo.thread.commentThreadHandle, uniqueIdInThread: commentInfo.comment?.uniqueIdInThread } : void 0);
  }
  updateFeatures(features) {
    this._features = features;
  }
  createCommentThread(extensionId, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId) {
    const thread = new MainThreadCommentThread(
      commentThreadHandle,
      this.handle,
      extensionId,
      threadId,
      URI.revive(resource).toString(),
      range,
      comments,
      true,
      isTemplate,
      editorId
    );
    const threadWithDisposable = new CommentThreadWithDisposable(thread);
    this._threads.set(commentThreadHandle, threadWithDisposable);
    threadWithDisposable.disposableStore.add(thread.onDidChangeCollapsibleState(() => {
      this.proxy.$updateCommentThread(this.handle, thread.commentThreadHandle, { collapseState: thread.collapsibleState });
    }));
    if (thread.isDocumentCommentThread()) {
      this._commentService.updateComments(this._uniqueId, {
        added: [thread],
        removed: [],
        changed: [],
        pending: []
      });
    } else {
      this._commentService.updateNotebookComments(this._uniqueId, {
        added: [thread],
        removed: [],
        changed: [],
        pending: []
      });
    }
    return thread;
  }
  updateCommentThread(commentThreadHandle, threadId, resource, changes) {
    const thread = this.getKnownThread(commentThreadHandle);
    thread.batchUpdate(changes);
    if (thread.isDocumentCommentThread()) {
      this._commentService.updateComments(this._uniqueId, {
        added: [],
        removed: [],
        changed: [thread],
        pending: []
      });
    } else {
      this._commentService.updateNotebookComments(this._uniqueId, {
        added: [],
        removed: [],
        changed: [thread],
        pending: []
      });
    }
  }
  deleteCommentThread(commentThreadHandle) {
    const thread = this.getKnownThread(commentThreadHandle);
    this._threads.deleteAndDispose(commentThreadHandle);
    thread.dispose();
    if (thread.isDocumentCommentThread()) {
      this._commentService.updateComments(this._uniqueId, {
        added: [],
        removed: [thread],
        changed: [],
        pending: []
      });
    } else {
      this._commentService.updateNotebookComments(this._uniqueId, {
        added: [],
        removed: [thread],
        changed: [],
        pending: []
      });
    }
  }
  deleteCommentThreadMain(commentThreadId) {
    for (const { thread } of this._threads.values()) {
      if (thread.threadId === commentThreadId) {
        this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
      }
    }
  }
  updateInput(input) {
    const thread = this.activeEditingCommentThread;
    if (thread && thread.input) {
      const commentInput = thread.input;
      commentInput.value = input;
      thread.input = commentInput;
    }
  }
  updateCommentingRanges(resourceHints) {
    this._commentService.updateCommentingRanges(this._uniqueId, resourceHints);
  }
  getKnownThread(commentThreadHandle) {
    const thread = this._threads.get(commentThreadHandle);
    if (!thread) {
      throw new Error("unknown thread");
    }
    return thread.thread;
  }
  async getDocumentComments(resource, token) {
    if (resource.scheme === Schemas.vscodeNotebookCell) {
      return {
        uniqueOwner: this._uniqueId,
        label: this.label,
        threads: [],
        commentingRanges: {
          resource,
          ranges: [],
          fileComments: false
        }
      };
    }
    const ret = [];
    for (const thread of [...this._threads.keys()]) {
      const commentThread = this._threads.get(thread);
      if (commentThread.thread.resource && this._uriIdentityService.extUri.isEqual(URI.parse(commentThread.thread.resource), resource)) {
        if (commentThread.thread.isDocumentCommentThread()) {
          ret.push(commentThread.thread);
        }
      }
    }
    const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);
    return {
      uniqueOwner: this._uniqueId,
      label: this.label,
      threads: ret,
      commentingRanges: {
        resource,
        ranges: commentingRanges?.ranges || [],
        fileComments: !!commentingRanges?.fileComments
      }
    };
  }
  async getNotebookComments(resource, token) {
    if (resource.scheme !== Schemas.vscodeNotebookCell) {
      return {
        uniqueOwner: this._uniqueId,
        label: this.label,
        threads: []
      };
    }
    const ret = [];
    for (const thread of [...this._threads.keys()]) {
      const commentThread = this._threads.get(thread);
      if (commentThread.thread.resource === resource.toString()) {
        if (!commentThread.thread.isDocumentCommentThread()) {
          ret.push(commentThread.thread);
        }
      }
    }
    return {
      uniqueOwner: this._uniqueId,
      label: this.label,
      threads: ret
    };
  }
  async toggleReaction(uri, thread, comment, reaction, token) {
    return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
  }
  getAllComments() {
    const ret = [];
    for (const thread of [...this._threads.keys()]) {
      ret.push(this._threads.get(thread).thread);
    }
    return ret;
  }
  createCommentThreadTemplate(resource, range, editorId) {
    return this._proxy.$createCommentThreadTemplate(this.handle, resource, range, editorId);
  }
  async updateCommentThreadTemplate(threadHandle, range) {
    await this._proxy.$updateCommentThreadTemplate(this.handle, threadHandle, range);
  }
  toJSON() {
    return {
      $mid: MarshalledId.CommentController,
      handle: this.handle
    };
  }
};
MainThreadCommentController = __decorateClass([
  __decorateParam(6, ICommentService),
  __decorateParam(7, IUriIdentityService)
], MainThreadCommentController);
const commentsViewIcon = registerIcon("comments-view-icon", Codicon.commentDiscussion, localize("commentsViewIcon", "View icon of the comments view."));
let MainThreadComments = class extends Disposable {
  constructor(extHostContext, _commentService, _viewsService, _viewDescriptorService, _uriIdentityService, _editorService, _instantiationService) {
    super();
    this._commentService = _commentService;
    this._viewsService = _viewsService;
    this._viewDescriptorService = _viewDescriptorService;
    this._uriIdentityService = _uriIdentityService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._handlers = /* @__PURE__ */ new Map();
    this._commentControllers = /* @__PURE__ */ new Map();
    this._activeEditingCommentThreadDisposables = this._register(new DisposableStore());
    this._openViewListener = this._register(new MutableDisposable());
    this._onChangeContainerListener = this._register(new MutableDisposable());
    this._onChangeContainerLocationListener = this._register(new MutableDisposable());
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
    this._commentService.unregisterCommentController();
    this._register(this._commentService.onDidChangeActiveEditingCommentThread(async (thread) => {
      const handle = thread.controllerHandle;
      const controller = this._commentControllers.get(handle);
      if (!controller) {
        return;
      }
      this._activeEditingCommentThreadDisposables.clear();
      this._activeEditingCommentThread = thread;
      controller.activeEditingCommentThread = this._activeEditingCommentThread;
    }));
    this._register(this._commentService.onResourceHasCommentingRanges(() => {
      this.registerView();
    }));
    this._register(this._commentService.onDidUpdateCommentThreads(() => {
      this.registerView();
    }));
  }
  $registerCommentController(handle, id, label, extensionId) {
    const providerId = `${id}-${extensionId}`;
    this._handlers.set(handle, providerId);
    const provider = this._instantiationService.createInstance(MainThreadCommentController, this._proxy, handle, providerId, id, label, {});
    this._commentService.registerCommentController(providerId, provider);
    this._commentControllers.set(handle, provider);
    this._commentService.setWorkspaceComments(String(handle), []);
  }
  $unregisterCommentController(handle) {
    const providerId = this._handlers.get(handle);
    this._handlers.delete(handle);
    this._commentControllers.get(handle)?.dispose();
    this._commentControllers.delete(handle);
    if (typeof providerId !== "string") {
      return;
    } else {
      this._commentService.unregisterCommentController(providerId);
    }
  }
  $updateCommentControllerFeatures(handle, features) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return void 0;
    }
    provider.updateFeatures(features);
  }
  $createCommentThread(handle, commentThreadHandle, threadId, resource, range, comments, extensionId, isTemplate, editorId) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return void 0;
    }
    return provider.createCommentThread(extensionId.value, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId);
  }
  $updateCommentThread(handle, commentThreadHandle, threadId, resource, changes) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return void 0;
    }
    return provider.updateCommentThread(commentThreadHandle, threadId, resource, changes);
  }
  $deleteCommentThread(handle, commentThreadHandle) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return;
    }
    return provider.deleteCommentThread(commentThreadHandle);
  }
  $updateCommentingRanges(handle, resourceHints) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return;
    }
    provider.updateCommentingRanges(resourceHints);
  }
  async $revealCommentThread(handle, commentThreadHandle, commentUniqueIdInThread, options) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return Promise.resolve();
    }
    const thread = provider.getAllComments().find((thread2) => thread2.commentThreadHandle === commentThreadHandle);
    if (!thread || !thread.isDocumentCommentThread()) {
      return Promise.resolve();
    }
    const comment = thread.comments?.find((comment2) => comment2.uniqueIdInThread === commentUniqueIdInThread);
    revealCommentThread(this._commentService, this._editorService, this._uriIdentityService, thread, comment, options.focusReply, void 0, options.preserveFocus);
  }
  async $hideCommentThread(handle, commentThreadHandle) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return Promise.resolve();
    }
    const thread = provider.getAllComments().find((thread2) => thread2.commentThreadHandle === commentThreadHandle);
    if (!thread || !thread.isDocumentCommentThread()) {
      return Promise.resolve();
    }
    thread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
  }
  registerView() {
    const commentsPanelAlreadyConstructed = !!this._viewDescriptorService.getViewDescriptorById(COMMENTS_VIEW_ID);
    if (!commentsPanelAlreadyConstructed) {
      const VIEW_CONTAINER = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
        id: COMMENTS_VIEW_ID,
        title: COMMENTS_VIEW_TITLE,
        ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [COMMENTS_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
        storageId: COMMENTS_VIEW_STORAGE_ID,
        hideIfEmpty: true,
        icon: commentsViewIcon,
        order: 10
      }, ViewContainerLocation.Panel);
      Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
        id: COMMENTS_VIEW_ID,
        name: COMMENTS_VIEW_TITLE,
        canToggleVisibility: false,
        ctorDescriptor: new SyncDescriptor(CommentsPanel),
        canMoveView: true,
        containerIcon: commentsViewIcon,
        focusCommand: {
          id: "workbench.action.focusCommentsPanel"
        }
      }], VIEW_CONTAINER);
    }
    this.registerViewListeners(commentsPanelAlreadyConstructed);
  }
  setComments() {
    [...this._commentControllers.keys()].forEach((handle) => {
      const threads = this._commentControllers.get(handle).getAllComments();
      if (threads.length) {
        const providerId = this.getHandler(handle);
        this._commentService.setWorkspaceComments(providerId, threads);
      }
    });
  }
  registerViewOpenedListener() {
    if (!this._openViewListener.value) {
      this._openViewListener.value = this._viewsService.onDidChangeViewVisibility((e) => {
        if (e.id === COMMENTS_VIEW_ID && e.visible) {
          this.setComments();
          if (this._openViewListener) {
            this._openViewListener.dispose();
          }
        }
      });
    }
  }
  /**
   * If the comments view has never been opened, the constructor for it has not yet run so it has
   * no listeners for comment threads being set or updated. Listen for the view opening for the
   * first time and send it comments then.
   */
  registerViewListeners(commentsPanelAlreadyConstructed) {
    if (!commentsPanelAlreadyConstructed) {
      this.registerViewOpenedListener();
    }
    if (!this._onChangeContainerListener.value) {
      this._onChangeContainerListener.value = this._viewDescriptorService.onDidChangeContainer((e) => {
        if (e.views.find((view) => view.id === COMMENTS_VIEW_ID)) {
          this.setComments();
          this.registerViewOpenedListener();
        }
      });
    }
    if (!this._onChangeContainerLocationListener.value) {
      this._onChangeContainerLocationListener.value = this._viewDescriptorService.onDidChangeContainerLocation((e) => {
        const commentsContainer = this._viewDescriptorService.getViewContainerByViewId(COMMENTS_VIEW_ID);
        if (e.viewContainer.id === commentsContainer?.id) {
          this.setComments();
          this.registerViewOpenedListener();
        }
      });
    }
  }
  getHandler(handle) {
    if (!this._handlers.has(handle)) {
      throw new Error("Unknown handler");
    }
    return this._handlers.get(handle);
  }
};
MainThreadComments = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadComments),
  __decorateParam(1, ICommentService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IInstantiationService)
], MainThreadComments);
export {
  MainThreadCommentController,
  MainThreadCommentThread,
  MainThreadComments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZENvbW1lbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRDb250cm9sbGVyLCBJQ29tbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWVudHNQYW5lbCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50c1ZpZXcuanMnO1xuaW1wb3J0IHsgQ29tbWVudFByb3ZpZGVyRmVhdHVyZXMsIEV4dEhvc3RDb21tZW50c1NoYXBlLCBFeHRIb3N0Q29udGV4dCwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDb21tZW50c1NoYXBlLCBDb21tZW50VGhyZWFkQ2hhbmdlcyB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENPTU1FTlRTX1ZJRVdfSUQsIENPTU1FTlRTX1ZJRVdfU1RPUkFHRV9JRCwgQ09NTUVOVFNfVklFV19USVRMRSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50c1RyZWVWaWV3ZXIuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lciwgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMsIFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdzUmVnaXN0cnksIElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZENvbW1lbnRUaHJlYWQgfSBmcm9tICcuLi8uLi9jb21tb24vY29tbWVudHMuanMnO1xuaW1wb3J0IHsgcmV2ZWFsQ29tbWVudFRocmVhZCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50c0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDb21tZW50VGhyZWFkPFQ+IGltcGxlbWVudHMgbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8VD4ge1xuXHRwcml2YXRlIF9pbnB1dD86IGxhbmd1YWdlcy5Db21tZW50SW5wdXQ7XG5cdGdldCBpbnB1dCgpOiBsYW5ndWFnZXMuQ29tbWVudElucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXQ7XG5cdH1cblxuXHRzZXQgaW5wdXQodmFsdWU6IGxhbmd1YWdlcy5Db21tZW50SW5wdXQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9pbnB1dCA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXQuZmlyZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUlucHV0ID0gbmV3IEVtaXR0ZXI8bGFuZ3VhZ2VzLkNvbW1lbnRJbnB1dCB8IHVuZGVmaW5lZD4oKTtcblx0Z2V0IG9uRGlkQ2hhbmdlSW5wdXQoKTogRXZlbnQ8bGFuZ3VhZ2VzLkNvbW1lbnRJbnB1dCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VJbnB1dC5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHR9XG5cblx0c2V0IGxhYmVsKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSh0aGlzLl9sYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb250ZXh0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRnZXQgY29udGV4dFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRWYWx1ZTtcblx0fVxuXG5cdHNldCBjb250ZXh0VmFsdWUoY29udGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY29udGV4dFZhbHVlID0gY29udGV4dDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTGFiZWwgPSBuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWw6IEV2ZW50PHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmV2ZW50O1xuXG5cdHByaXZhdGUgX2NvbW1lbnRzOiBSZWFkb25seUFycmF5PGxhbmd1YWdlcy5Db21tZW50PiB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgZ2V0IGNvbW1lbnRzKCk6IFJlYWRvbmx5QXJyYXk8bGFuZ3VhZ2VzLkNvbW1lbnQ+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWVudHM7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGNvbW1lbnRzKG5ld0NvbW1lbnRzOiBSZWFkb25seUFycmF5PGxhbmd1YWdlcy5Db21tZW50PiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2NvbW1lbnRzID0gbmV3Q29tbWVudHM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb21tZW50cy5maXJlKHRoaXMuX2NvbW1lbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29tbWVudHMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBsYW5ndWFnZXMuQ29tbWVudFtdIHwgdW5kZWZpbmVkPigpO1xuXHRnZXQgb25EaWRDaGFuZ2VDb21tZW50cygpOiBFdmVudDxyZWFkb25seSBsYW5ndWFnZXMuQ29tbWVudFtdIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNvbW1lbnRzLmV2ZW50OyB9XG5cblx0c2V0IHJhbmdlKHJhbmdlOiBUIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fcmFuZ2UgPSByYW5nZTtcblx0fVxuXG5cdGdldCByYW5nZSgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNhblJlcGx5ID0gbmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQ2FuUmVwbHkoKTogRXZlbnQ8Ym9vbGVhbj4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDYW5SZXBseS5ldmVudDsgfVxuXHRzZXQgY2FuUmVwbHkoc3RhdGU6IGJvb2xlYW4gfCBsYW5ndWFnZXMuQ29tbWVudEF1dGhvckluZm9ybWF0aW9uKSB7XG5cdFx0dGhpcy5fY2FuUmVwbHkgPSBzdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNhblJlcGx5LmZpcmUoISF0aGlzLl9jYW5SZXBseSk7XG5cdH1cblxuXHRnZXQgY2FuUmVwbHkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhblJlcGx5O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGFwc2libGVTdGF0ZTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlIHwgdW5kZWZpbmVkID0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZDtcblx0Z2V0IGNvbGxhcHNpYmxlU3RhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlU3RhdGU7XG5cdH1cblxuXHRzZXQgY29sbGFwc2libGVTdGF0ZShuZXdTdGF0ZTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuaW5pdGlhbENvbGxhcHNpYmxlU3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdH1cblxuXHRcdGlmIChuZXdTdGF0ZSAhPT0gdGhpcy5fY29sbGFwc2libGVTdGF0ZSkge1xuXHRcdFx0dGhpcy5fY29sbGFwc2libGVTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsYXBzaWJsZVN0YXRlLmZpcmUodGhpcy5fY29sbGFwc2libGVTdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdGlhbENvbGxhcHNpYmxlU3RhdGU6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB8IHVuZGVmaW5lZDtcblx0Z2V0IGluaXRpYWxDb2xsYXBzaWJsZVN0YXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsQ29sbGFwc2libGVTdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGluaXRpYWxDb2xsYXBzaWJsZVN0YXRlKGluaXRpYWxDb2xsYXBzaWJsZVN0YXRlOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9IGluaXRpYWxDb2xsYXBzaWJsZVN0YXRlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUuZmlyZShpbml0aWFsQ29sbGFwc2libGVTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUgPSBuZXcgRW1pdHRlcjxsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUgfCB1bmRlZmluZWQ+KCk7XG5cdHB1YmxpYyBvbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUgPSBuZXcgRW1pdHRlcjxsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUgfCB1bmRlZmluZWQ+KCk7XG5cdHB1YmxpYyBvbkRpZENoYW5nZUluaXRpYWxDb2xsYXBzaWJsZVN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VJbml0aWFsQ29sbGFwc2libGVTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXG5cdGdldCBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0Rpc3Bvc2VkO1xuXHR9XG5cblx0aXNEb2N1bWVudENvbW1lbnRUaHJlYWQoKTogdGhpcyBpcyBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxJUmFuZ2U+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2UgPT09IHVuZGVmaW5lZCB8fCBSYW5nZS5pc0lSYW5nZSh0aGlzLl9yYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGF0ZTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0Z2V0IHN0YXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdHNldCBzdGF0ZShuZXdTdGF0ZTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3N0YXRlID0gbmV3U3RhdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKHRoaXMuX3N0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGxpY2FiaWxpdHk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB8IHVuZGVmaW5lZDtcblxuXHRnZXQgYXBwbGljYWJpbGl0eSgpOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hcHBsaWNhYmlsaXR5O1xuXHR9XG5cblx0c2V0IGFwcGxpY2FiaWxpdHkodmFsdWU6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2FwcGxpY2FiaWxpdHkgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFwcGxpY2FiaWxpdHkuZmlyZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFwcGxpY2FiaWxpdHkgPSBuZXcgRW1pdHRlcjxsYW5ndWFnZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfCB1bmRlZmluZWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXBwbGljYWJpbGl0eTogRXZlbnQ8bGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQXBwbGljYWJpbGl0eS5ldmVudDtcblxuXHRwdWJsaWMgZ2V0IGlzVGVtcGxhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVGVtcGxhdGU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlID0gbmV3IEVtaXR0ZXI8bGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHVuZGVmaW5lZD4oKTtcblx0cHVibGljIG9uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsXG5cdFx0cHVibGljIGNvbnRyb2xsZXJIYW5kbGU6IG51bWJlcixcblx0XHRwdWJsaWMgZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgdGhyZWFkSWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVzb3VyY2U6IHN0cmluZyxcblx0XHRwcml2YXRlIF9yYW5nZTogVCB8IHVuZGVmaW5lZCxcblx0XHRjb21tZW50czogbGFuZ3VhZ2VzLkNvbW1lbnRbXSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIF9jYW5SZXBseTogYm9vbGVhbiB8IGxhbmd1YWdlcy5Db21tZW50QXV0aG9ySW5mb3JtYXRpb24sXG5cdFx0cHJpdmF0ZSBfaXNUZW1wbGF0ZTogYm9vbGVhbixcblx0XHRwdWJsaWMgZWRpdG9ySWQ/OiBzdHJpbmdcblx0KSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGlmIChfaXNUZW1wbGF0ZSkge1xuXHRcdFx0dGhpcy5jb21tZW50cyA9IFtdO1xuXHRcdH0gZWxzZSBpZiAoY29tbWVudHMpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRzID0gY29tbWVudHM7XG5cdFx0fVxuXHR9XG5cblx0YmF0Y2hVcGRhdGUoY2hhbmdlczogQ29tbWVudFRocmVhZENoYW5nZXM8VD4pIHtcblx0XHRjb25zdCBtb2RpZmllZCA9ICh2YWx1ZToga2V5b2YgQ29tbWVudFRocmVhZENoYW5nZXMpOiBib29sZWFuID0+XG5cdFx0XHRPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoY2hhbmdlcywgdmFsdWUpO1xuXG5cdFx0aWYgKG1vZGlmaWVkKCdyYW5nZScpKSB7IHRoaXMuX3JhbmdlID0gY2hhbmdlcy5yYW5nZSE7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2xhYmVsJykpIHsgdGhpcy5fbGFiZWwgPSBjaGFuZ2VzLmxhYmVsOyB9XG5cdFx0aWYgKG1vZGlmaWVkKCdjb250ZXh0VmFsdWUnKSkgeyB0aGlzLl9jb250ZXh0VmFsdWUgPSBjaGFuZ2VzLmNvbnRleHRWYWx1ZSA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IGNoYW5nZXMuY29udGV4dFZhbHVlOyB9XG5cdFx0aWYgKG1vZGlmaWVkKCdjb21tZW50cycpKSB7IHRoaXMuY29tbWVudHMgPSBjaGFuZ2VzLmNvbW1lbnRzOyB9XG5cdFx0aWYgKG1vZGlmaWVkKCdjb2xsYXBzZVN0YXRlJykpIHsgdGhpcy5jb2xsYXBzaWJsZVN0YXRlID0gY2hhbmdlcy5jb2xsYXBzZVN0YXRlOyB9XG5cdFx0aWYgKG1vZGlmaWVkKCdjYW5SZXBseScpKSB7IHRoaXMuY2FuUmVwbHkgPSBjaGFuZ2VzLmNhblJlcGx5ITsgfVxuXHRcdGlmIChtb2RpZmllZCgnc3RhdGUnKSkgeyB0aGlzLnN0YXRlID0gY2hhbmdlcy5zdGF0ZSE7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2FwcGxpY2FiaWxpdHknKSkgeyB0aGlzLmFwcGxpY2FiaWxpdHkgPSBjaGFuZ2VzLmFwcGxpY2FiaWxpdHkhOyB9XG5cdFx0aWYgKG1vZGlmaWVkKCdpc1RlbXBsYXRlJykpIHsgdGhpcy5faXNUZW1wbGF0ZSA9IGNoYW5nZXMuaXNUZW1wbGF0ZSE7IH1cblx0fVxuXG5cdGhhc0NvbW1lbnRzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuY29tbWVudHMgJiYgdGhpcy5jb21tZW50cy5sZW5ndGggPiAwO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29tbWVudHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FuUmVwbHkuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXBwbGljYWJpbGl0eS5kaXNwb3NlKCk7XG5cdH1cblxuXHR0b0pTT04oKTogTWFyc2hhbGxlZENvbW1lbnRUaHJlYWQge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZCxcblx0XHRcdGNvbW1lbnRDb250cm9sSGFuZGxlOiB0aGlzLmNvbnRyb2xsZXJIYW5kbGUsXG5cdFx0XHRjb21tZW50VGhyZWFkSGFuZGxlOiB0aGlzLmNvbW1lbnRUaHJlYWRIYW5kbGUsXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBDb21tZW50VGhyZWFkV2l0aERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB0aHJlYWQ6IE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+KSB7IH1cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDb21tZW50Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29tbWVudENvbnRyb2xsZXIge1xuXHRnZXQgaGFuZGxlKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRsZTtcblx0fVxuXG5cdGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldCBjb250ZXh0VmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRnZXQgcHJveHkoKTogRXh0SG9zdENvbW1lbnRzU2hhcGUge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eTtcblx0fVxuXG5cdGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9sYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWN0aW9uczogbGFuZ3VhZ2VzLkNvbW1lbnRSZWFjdGlvbltdIHwgdW5kZWZpbmVkO1xuXG5cdGdldCByZWFjdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWN0aW9ucztcblx0fVxuXG5cdHNldCByZWFjdGlvbnMocmVhY3Rpb25zOiBsYW5ndWFnZXMuQ29tbWVudFJlYWN0aW9uW10gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9yZWFjdGlvbnMgPSByZWFjdGlvbnM7XG5cdH1cblxuXHRnZXQgb3B0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmVhdHVyZXMub3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RocmVhZHM6IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBDb21tZW50VGhyZWFkV2l0aERpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBDb21tZW50VGhyZWFkV2l0aERpc3Bvc2FibGU+KCkpO1xuXHRwdWJsaWMgYWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQ/OiBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPjtcblxuXHRnZXQgZmVhdHVyZXMoKTogQ29tbWVudFByb3ZpZGVyRmVhdHVyZXMge1xuXHRcdHJldHVybiB0aGlzLl9mZWF0dXJlcztcblx0fVxuXG5cdGdldCBvd25lcigpIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdENvbW1lbnRzU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5pcXVlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfZmVhdHVyZXM6IENvbW1lbnRQcm92aWRlckZlYXR1cmVzLFxuXHRcdEBJQ29tbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWVudFNlcnZpY2U6IElDb21tZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXQgYWN0aXZlQ29tbWVudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlQ29tbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2ZUNvbW1lbnQ6IHsgdGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDsgY29tbWVudD86IGxhbmd1YWdlcy5Db21tZW50IH0gfCB1bmRlZmluZWQ7XG5cdGFzeW5jIHNldEFjdGl2ZUNvbW1lbnRBbmRUaHJlYWQoY29tbWVudEluZm86IHsgdGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDsgY29tbWVudD86IGxhbmd1YWdlcy5Db21tZW50IH0gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9hY3RpdmVDb21tZW50ID0gY29tbWVudEluZm87XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRzZXRBY3RpdmVDb21tZW50KHRoaXMuX2hhbmRsZSwgY29tbWVudEluZm8gPyB7IGNvbW1lbnRUaHJlYWRIYW5kbGU6IGNvbW1lbnRJbmZvLnRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlLCB1bmlxdWVJZEluVGhyZWFkOiBjb21tZW50SW5mby5jb21tZW50Py51bmlxdWVJZEluVGhyZWFkIH0gOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0dXBkYXRlRmVhdHVyZXMoZmVhdHVyZXM6IENvbW1lbnRQcm92aWRlckZlYXR1cmVzKSB7XG5cdFx0dGhpcy5fZmVhdHVyZXMgPSBmZWF0dXJlcztcblx0fVxuXG5cdGNyZWF0ZUNvbW1lbnRUaHJlYWQoZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsXG5cdFx0dGhyZWFkSWQ6IHN0cmluZyxcblx0XHRyZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRyYW5nZTogSVJhbmdlIHwgSUNlbGxSYW5nZSB8IHVuZGVmaW5lZCxcblx0XHRjb21tZW50czogbGFuZ3VhZ2VzLkNvbW1lbnRbXSxcblx0XHRpc1RlbXBsYXRlOiBib29sZWFuLFxuXHRcdGVkaXRvcklkPzogc3RyaW5nXG5cdCk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+IHtcblx0XHRjb25zdCB0aHJlYWQgPSBuZXcgTWFpblRocmVhZENvbW1lbnRUaHJlYWQoXG5cdFx0XHRjb21tZW50VGhyZWFkSGFuZGxlLFxuXHRcdFx0dGhpcy5oYW5kbGUsXG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdHRocmVhZElkLFxuXHRcdFx0VVJJLnJldml2ZShyZXNvdXJjZSkudG9TdHJpbmcoKSxcblx0XHRcdHJhbmdlLFxuXHRcdFx0Y29tbWVudHMsXG5cdFx0XHR0cnVlLFxuXHRcdFx0aXNUZW1wbGF0ZSxcblx0XHRcdGVkaXRvcklkXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRocmVhZFdpdGhEaXNwb3NhYmxlID0gbmV3IENvbW1lbnRUaHJlYWRXaXRoRGlzcG9zYWJsZSh0aHJlYWQpO1xuXHRcdHRoaXMuX3RocmVhZHMuc2V0KGNvbW1lbnRUaHJlYWRIYW5kbGUsIHRocmVhZFdpdGhEaXNwb3NhYmxlKTtcblx0XHR0aHJlYWRXaXRoRGlzcG9zYWJsZS5kaXNwb3NhYmxlU3RvcmUuYWRkKHRocmVhZC5vbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5wcm94eS4kdXBkYXRlQ29tbWVudFRocmVhZCh0aGlzLmhhbmRsZSwgdGhyZWFkLmNvbW1lbnRUaHJlYWRIYW5kbGUsIHsgY29sbGFwc2VTdGF0ZTogdGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgfSk7XG5cdFx0fSkpO1xuXG5cblx0XHRpZiAodGhyZWFkLmlzRG9jdW1lbnRDb21tZW50VGhyZWFkKCkpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZUNvbW1lbnRzKHRoaXMuX3VuaXF1ZUlkLCB7XG5cdFx0XHRcdGFkZGVkOiBbdGhyZWFkXSxcblx0XHRcdFx0cmVtb3ZlZDogW10sXG5cdFx0XHRcdGNoYW5nZWQ6IFtdLFxuXHRcdFx0XHRwZW5kaW5nOiBbXVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZU5vdGVib29rQ29tbWVudHModGhpcy5fdW5pcXVlSWQsIHtcblx0XHRcdFx0YWRkZWQ6IFt0aHJlYWQgYXMgTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SUNlbGxSYW5nZT5dLFxuXHRcdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdFx0Y2hhbmdlZDogW10sXG5cdFx0XHRcdHBlbmRpbmc6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhyZWFkO1xuXHR9XG5cblx0dXBkYXRlQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsXG5cdFx0dGhyZWFkSWQ6IHN0cmluZyxcblx0XHRyZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRjaGFuZ2VzOiBDb21tZW50VGhyZWFkQ2hhbmdlcyk6IHZvaWQge1xuXHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuZ2V0S25vd25UaHJlYWQoY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0dGhyZWFkLmJhdGNoVXBkYXRlKGNoYW5nZXMpO1xuXG5cdFx0aWYgKHRocmVhZC5pc0RvY3VtZW50Q29tbWVudFRocmVhZCgpKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50U2VydmljZS51cGRhdGVDb21tZW50cyh0aGlzLl91bmlxdWVJZCwge1xuXHRcdFx0XHRhZGRlZDogW10sXG5cdFx0XHRcdHJlbW92ZWQ6IFtdLFxuXHRcdFx0XHRjaGFuZ2VkOiBbdGhyZWFkXSxcblx0XHRcdFx0cGVuZGluZzogW11cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb21tZW50U2VydmljZS51cGRhdGVOb3RlYm9va0NvbW1lbnRzKHRoaXMuX3VuaXF1ZUlkLCB7XG5cdFx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdFx0cmVtb3ZlZDogW10sXG5cdFx0XHRcdGNoYW5nZWQ6IFt0aHJlYWQgYXMgTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SUNlbGxSYW5nZT5dLFxuXHRcdFx0XHRwZW5kaW5nOiBbXVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdH1cblxuXHRkZWxldGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcikge1xuXHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuZ2V0S25vd25UaHJlYWQoY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0dGhpcy5fdGhyZWFkcy5kZWxldGVBbmREaXNwb3NlKGNvbW1lbnRUaHJlYWRIYW5kbGUpO1xuXHRcdHRocmVhZC5kaXNwb3NlKCk7XG5cblx0XHRpZiAodGhyZWFkLmlzRG9jdW1lbnRDb21tZW50VGhyZWFkKCkpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZUNvbW1lbnRzKHRoaXMuX3VuaXF1ZUlkLCB7XG5cdFx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdFx0cmVtb3ZlZDogW3RocmVhZF0sXG5cdFx0XHRcdGNoYW5nZWQ6IFtdLFxuXHRcdFx0XHRwZW5kaW5nOiBbXVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZU5vdGVib29rQ29tbWVudHModGhpcy5fdW5pcXVlSWQsIHtcblx0XHRcdFx0YWRkZWQ6IFtdLFxuXHRcdFx0XHRyZW1vdmVkOiBbdGhyZWFkIGFzIE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElDZWxsUmFuZ2U+XSxcblx0XHRcdFx0Y2hhbmdlZDogW10sXG5cdFx0XHRcdHBlbmRpbmc6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRkZWxldGVDb21tZW50VGhyZWFkTWFpbihjb21tZW50VGhyZWFkSWQ6IHN0cmluZykge1xuXHRcdGZvciAoY29uc3QgeyB0aHJlYWQgfSBvZiB0aGlzLl90aHJlYWRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAodGhyZWFkLnRocmVhZElkID09PSBjb21tZW50VGhyZWFkSWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGRlbGV0ZUNvbW1lbnRUaHJlYWQodGhpcy5faGFuZGxlLCB0aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlSW5wdXQoaW5wdXQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuYWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQ7XG5cblx0XHRpZiAodGhyZWFkICYmIHRocmVhZC5pbnB1dCkge1xuXHRcdFx0Y29uc3QgY29tbWVudElucHV0ID0gdGhyZWFkLmlucHV0O1xuXHRcdFx0Y29tbWVudElucHV0LnZhbHVlID0gaW5wdXQ7XG5cdFx0XHR0aHJlYWQuaW5wdXQgPSBjb21tZW50SW5wdXQ7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlQ29tbWVudGluZ1JhbmdlcyhyZXNvdXJjZUhpbnRzPzogbGFuZ3VhZ2VzLkNvbW1lbnRpbmdSYW5nZVJlc291cmNlSGludCkge1xuXHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZUNvbW1lbnRpbmdSYW5nZXModGhpcy5fdW5pcXVlSWQsIHJlc291cmNlSGludHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLbm93blRocmVhZChjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIpOiBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPiB7XG5cdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5fdGhyZWFkcy5nZXQoY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0aWYgKCF0aHJlYWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigndW5rbm93biB0aHJlYWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRocmVhZC50aHJlYWQ7XG5cdH1cblxuXHRhc3luYyBnZXREb2N1bWVudENvbW1lbnRzKHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1bmlxdWVPd25lcjogdGhpcy5fdW5pcXVlSWQsXG5cdFx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0XHR0aHJlYWRzOiBbXSxcblx0XHRcdFx0Y29tbWVudGluZ1Jhbmdlczoge1xuXHRcdFx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRyYW5nZXM6IFtdLFxuXHRcdFx0XHRcdGZpbGVDb21tZW50czogZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCByZXQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIFsuLi50aGlzLl90aHJlYWRzLmtleXMoKV0pIHtcblx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldCh0aHJlYWQpITtcblx0XHRcdGlmIChjb21tZW50VGhyZWFkLnRocmVhZC5yZXNvdXJjZSAmJiB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoVVJJLnBhcnNlKGNvbW1lbnRUaHJlYWQudGhyZWFkLnJlc291cmNlKSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdGlmIChjb21tZW50VGhyZWFkLnRocmVhZC5pc0RvY3VtZW50Q29tbWVudFRocmVhZCgpKSB7XG5cdFx0XHRcdFx0cmV0LnB1c2goY29tbWVudFRocmVhZC50aHJlYWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWVudGluZ1JhbmdlcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlQ29tbWVudGluZ1Jhbmdlcyh0aGlzLmhhbmRsZSwgcmVzb3VyY2UsIHRva2VuKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR1bmlxdWVPd25lcjogdGhpcy5fdW5pcXVlSWQsXG5cdFx0XHRsYWJlbDogdGhpcy5sYWJlbCxcblx0XHRcdHRocmVhZHM6IHJldCxcblx0XHRcdGNvbW1lbnRpbmdSYW5nZXM6IHtcblx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRyYW5nZXM6IGNvbW1lbnRpbmdSYW5nZXM/LnJhbmdlcyB8fCBbXSxcblx0XHRcdFx0ZmlsZUNvbW1lbnRzOiAhIWNvbW1lbnRpbmdSYW5nZXM/LmZpbGVDb21tZW50c1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXROb3RlYm9va0NvbW1lbnRzKHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1bmlxdWVPd25lcjogdGhpcy5fdW5pcXVlSWQsXG5cdFx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0XHR0aHJlYWRzOiBbXVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCByZXQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElDZWxsUmFuZ2U+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBbLi4udGhpcy5fdGhyZWFkcy5rZXlzKCldKSB7XG5cdFx0XHRjb25zdCBjb21tZW50VGhyZWFkID0gdGhpcy5fdGhyZWFkcy5nZXQodGhyZWFkKSE7XG5cdFx0XHRpZiAoY29tbWVudFRocmVhZC50aHJlYWQucmVzb3VyY2UgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0aWYgKCFjb21tZW50VGhyZWFkLnRocmVhZC5pc0RvY3VtZW50Q29tbWVudFRocmVhZCgpKSB7XG5cdFx0XHRcdFx0cmV0LnB1c2goY29tbWVudFRocmVhZC50aHJlYWQgYXMgbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SUNlbGxSYW5nZT4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHVuaXF1ZU93bmVyOiB0aGlzLl91bmlxdWVJZCxcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0dGhyZWFkczogcmV0XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZVJlYWN0aW9uKHVyaTogVVJJLCB0aHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkLCBjb21tZW50OiBsYW5ndWFnZXMuQ29tbWVudCwgcmVhY3Rpb246IGxhbmd1YWdlcy5Db21tZW50UmVhY3Rpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kdG9nZ2xlUmVhY3Rpb24odGhpcy5faGFuZGxlLCB0aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSwgdXJpLCBjb21tZW50LCByZWFjdGlvbik7XG5cdH1cblxuXHRnZXRBbGxDb21tZW50cygpOiBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPltdIHtcblx0XHRjb25zdCByZXQ6IE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBbLi4udGhpcy5fdGhyZWFkcy5rZXlzKCldKSB7XG5cdFx0XHRyZXQucHVzaCh0aGlzLl90aHJlYWRzLmdldCh0aHJlYWQpIS50aHJlYWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRjcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUocmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIGVkaXRvcklkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRjcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhpcy5oYW5kbGUsIHJlc291cmNlLCByYW5nZSwgZWRpdG9ySWQpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHRocmVhZEhhbmRsZTogbnVtYmVyLCByYW5nZTogSVJhbmdlKSB7XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkuJHVwZGF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh0aGlzLmhhbmRsZSwgdGhyZWFkSGFuZGxlLCByYW5nZSk7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50Q29udHJvbGxlcixcblx0XHRcdGhhbmRsZTogdGhpcy5oYW5kbGVcblx0XHR9O1xuXHR9XG59XG5cblxuY29uc3QgY29tbWVudHNWaWV3SWNvbiA9IHJlZ2lzdGVySWNvbignY29tbWVudHMtdmlldy1pY29uJywgQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiwgbG9jYWxpemUoJ2NvbW1lbnRzVmlld0ljb24nLCAnVmlldyBpY29uIG9mIHRoZSBjb21tZW50cyB2aWV3LicpKTtcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRDb21tZW50cylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ29tbWVudHMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZENvbW1lbnRzU2hhcGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdENvbW1lbnRzU2hhcGU7XG5cblx0cHJpdmF0ZSBfaGFuZGxlcnMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXHRwcml2YXRlIF9jb21tZW50Q29udHJvbGxlcnMgPSBuZXcgTWFwPG51bWJlciwgTWFpblRocmVhZENvbW1lbnRDb250cm9sbGVyPigpO1xuXG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkPzogTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wZW5WaWV3TGlzdGVuZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25DaGFuZ2VDb250YWluZXJMaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZUNvbnRhaW5lckxvY2F0aW9uTGlzdGVuZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQ29tbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWVudFNlcnZpY2U6IElDb21tZW50U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdENvbW1lbnRzKTtcblx0XHR0aGlzLl9jb21tZW50U2VydmljZS51bnJlZ2lzdGVyQ29tbWVudENvbnRyb2xsZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQoYXN5bmMgdGhyZWFkID0+IHtcblx0XHRcdGNvbnN0IGhhbmRsZSA9ICh0aHJlYWQgYXMgTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4pLmNvbnRyb2xsZXJIYW5kbGU7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZCA9IHRocmVhZCBhcyBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPjtcblx0XHRcdGNvbnRyb2xsZXIuYWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQgPSB0aGlzLl9hY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb21tZW50U2VydmljZS5vblJlc291cmNlSGFzQ29tbWVudGluZ1JhbmdlcygoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVmlldygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1lbnRTZXJ2aWNlLm9uRGlkVXBkYXRlQ29tbWVudFRocmVhZHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlclZpZXcoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcihoYW5kbGU6IG51bWJlciwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBgJHtpZH0tJHtleHRlbnNpb25JZH1gO1xuXHRcdHRoaXMuX2hhbmRsZXJzLnNldChoYW5kbGUsIHByb3ZpZGVySWQpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkQ29tbWVudENvbnRyb2xsZXIsIHRoaXMuX3Byb3h5LCBoYW5kbGUsIHByb3ZpZGVySWQsIGlkLCBsYWJlbCwge30pO1xuXHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnJlZ2lzdGVyQ29tbWVudENvbnRyb2xsZXIocHJvdmlkZXJJZCwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cblx0XHR0aGlzLl9jb21tZW50U2VydmljZS5zZXRXb3Jrc3BhY2VDb21tZW50cyhTdHJpbmcoaGFuZGxlKSwgW10pO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSB0aGlzLl9oYW5kbGVycy5nZXQoaGFuZGxlKTtcblx0XHR0aGlzLl9oYW5kbGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHR0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZGVsZXRlKGhhbmRsZSk7XG5cblx0XHRpZiAodHlwZW9mIHByb3ZpZGVySWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ3Vua25vd24gaGFuZGxlcicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb21tZW50U2VydmljZS51bnJlZ2lzdGVyQ29tbWVudENvbnRyb2xsZXIocHJvdmlkZXJJZCk7XG5cdFx0fVxuXHR9XG5cblx0JHVwZGF0ZUNvbW1lbnRDb250cm9sbGVyRmVhdHVyZXMoaGFuZGxlOiBudW1iZXIsIGZlYXR1cmVzOiBDb21tZW50UHJvdmlkZXJGZWF0dXJlcyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRwcm92aWRlci51cGRhdGVGZWF0dXJlcyhmZWF0dXJlcyk7XG5cdH1cblxuXHQkY3JlYXRlQ29tbWVudFRocmVhZChoYW5kbGU6IG51bWJlcixcblx0XHRjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsXG5cdFx0dGhyZWFkSWQ6IHN0cmluZyxcblx0XHRyZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRyYW5nZTogSVJhbmdlIHwgSUNlbGxSYW5nZSB8IHVuZGVmaW5lZCxcblx0XHRjb21tZW50czogbGFuZ3VhZ2VzLkNvbW1lbnRbXSxcblx0XHRleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRpc1RlbXBsYXRlOiBib29sZWFuLFxuXHRcdGVkaXRvcklkPzogc3RyaW5nXG5cdCk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoaGFuZGxlKTtcblxuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3ZpZGVyLmNyZWF0ZUNvbW1lbnRUaHJlYWQoZXh0ZW5zaW9uSWQudmFsdWUsIGNvbW1lbnRUaHJlYWRIYW5kbGUsIHRocmVhZElkLCByZXNvdXJjZSwgcmFuZ2UsIGNvbW1lbnRzLCBpc1RlbXBsYXRlLCBlZGl0b3JJZCk7XG5cdH1cblxuXHQkdXBkYXRlQ29tbWVudFRocmVhZChoYW5kbGU6IG51bWJlcixcblx0XHRjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsXG5cdFx0dGhyZWFkSWQ6IHN0cmluZyxcblx0XHRyZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRjaGFuZ2VzOiBDb21tZW50VGhyZWFkQ2hhbmdlcyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvdmlkZXIudXBkYXRlQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkSGFuZGxlLCB0aHJlYWRJZCwgcmVzb3VyY2UsIGNoYW5nZXMpO1xuXHR9XG5cblx0JGRlbGV0ZUNvbW1lbnRUaHJlYWQoaGFuZGxlOiBudW1iZXIsIGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcikge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlci5kZWxldGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWRIYW5kbGUpO1xuXHR9XG5cblx0JHVwZGF0ZUNvbW1lbnRpbmdSYW5nZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlSGludHM/OiBsYW5ndWFnZXMuQ29tbWVudGluZ1JhbmdlUmVzb3VyY2VIaW50KSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cHJvdmlkZXIudXBkYXRlQ29tbWVudGluZ1JhbmdlcyhyZXNvdXJjZUhpbnRzKTtcblx0fVxuXG5cdGFzeW5jICRyZXZlYWxDb21tZW50VGhyZWFkKGhhbmRsZTogbnVtYmVyLCBjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsIGNvbW1lbnRVbmlxdWVJZEluVGhyZWFkOiBudW1iZXIsIG9wdGlvbnM6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkUmV2ZWFsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRocmVhZCA9IHByb3ZpZGVyLmdldEFsbENvbW1lbnRzKCkuZmluZCh0aHJlYWQgPT4gdGhyZWFkLmNvbW1lbnRUaHJlYWRIYW5kbGUgPT09IGNvbW1lbnRUaHJlYWRIYW5kbGUpO1xuXHRcdGlmICghdGhyZWFkIHx8ICF0aHJlYWQuaXNEb2N1bWVudENvbW1lbnRUaHJlYWQoKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1lbnQgPSB0aHJlYWQuY29tbWVudHM/LmZpbmQoY29tbWVudCA9PiBjb21tZW50LnVuaXF1ZUlkSW5UaHJlYWQgPT09IGNvbW1lbnRVbmlxdWVJZEluVGhyZWFkKTtcblxuXHRcdHJldmVhbENvbW1lbnRUaHJlYWQodGhpcy5fY29tbWVudFNlcnZpY2UsIHRoaXMuX2VkaXRvclNlcnZpY2UsIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZSwgdGhyZWFkLCBjb21tZW50LCBvcHRpb25zLmZvY3VzUmVwbHksIHVuZGVmaW5lZCwgb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdGFzeW5jICRoaWRlQ29tbWVudFRocmVhZChoYW5kbGU6IG51bWJlciwgY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhyZWFkID0gcHJvdmlkZXIuZ2V0QWxsQ29tbWVudHMoKS5maW5kKHRocmVhZCA9PiB0aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSA9PT0gY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0aWYgKCF0aHJlYWQgfHwgIXRocmVhZC5pc0RvY3VtZW50Q29tbWVudFRocmVhZCgpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0dGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXcoKSB7XG5cdFx0Y29uc3QgY29tbWVudHNQYW5lbEFscmVhZHlDb25zdHJ1Y3RlZCA9ICEhdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChDT01NRU5UU19WSUVXX0lEKTtcblx0XHRpZiAoIWNvbW1lbnRzUGFuZWxBbHJlYWR5Q29uc3RydWN0ZWQpIHtcblx0XHRcdGNvbnN0IFZJRVdfQ09OVEFJTkVSOiBWaWV3Q29udGFpbmVyID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7XG5cdFx0XHRcdGlkOiBDT01NRU5UU19WSUVXX0lELFxuXHRcdFx0XHR0aXRsZTogQ09NTUVOVFNfVklFV19USVRMRSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihWaWV3UGFuZUNvbnRhaW5lciwgW0NPTU1FTlRTX1ZJRVdfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dKSxcblx0XHRcdFx0c3RvcmFnZUlkOiBDT01NRU5UU19WSUVXX1NUT1JBR0VfSUQsXG5cdFx0XHRcdGhpZGVJZkVtcHR5OiB0cnVlLFxuXHRcdFx0XHRpY29uOiBjb21tZW50c1ZpZXdJY29uLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHR9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXG5cdFx0XHRSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkucmVnaXN0ZXJWaWV3cyhbe1xuXHRcdFx0XHRpZDogQ09NTUVOVFNfVklFV19JRCxcblx0XHRcdFx0bmFtZTogQ09NTUVOVFNfVklFV19USVRMRSxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogZmFsc2UsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ29tbWVudHNQYW5lbCksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHRcdFx0XHRjb250YWluZXJJY29uOiBjb21tZW50c1ZpZXdJY29uLFxuXHRcdFx0XHRmb2N1c0NvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNDb21tZW50c1BhbmVsJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XSwgVklFV19DT05UQUlORVIpO1xuXHRcdH1cblx0XHR0aGlzLnJlZ2lzdGVyVmlld0xpc3RlbmVycyhjb21tZW50c1BhbmVsQWxyZWFkeUNvbnN0cnVjdGVkKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q29tbWVudHMoKSB7XG5cdFx0Wy4uLnRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5rZXlzKCldLmZvckVhY2goaGFuZGxlID0+IHtcblx0XHRcdGNvbnN0IHRocmVhZHMgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSkhLmdldEFsbENvbW1lbnRzKCk7XG5cblx0XHRcdGlmICh0aHJlYWRzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlcklkID0gdGhpcy5nZXRIYW5kbGVyKGhhbmRsZSk7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnNldFdvcmtzcGFjZUNvbW1lbnRzKHByb3ZpZGVySWQsIHRocmVhZHMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdPcGVuZWRMaXN0ZW5lcigpIHtcblx0XHRpZiAoIXRoaXMuX29wZW5WaWV3TGlzdGVuZXIudmFsdWUpIHtcblx0XHRcdHRoaXMuX29wZW5WaWV3TGlzdGVuZXIudmFsdWUgPSB0aGlzLl92aWV3c1NlcnZpY2Uub25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdFx0aWYgKGUuaWQgPT09IENPTU1FTlRTX1ZJRVdfSUQgJiYgZS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb21tZW50cygpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9vcGVuVmlld0xpc3RlbmVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuVmlld0xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJZiB0aGUgY29tbWVudHMgdmlldyBoYXMgbmV2ZXIgYmVlbiBvcGVuZWQsIHRoZSBjb25zdHJ1Y3RvciBmb3IgaXQgaGFzIG5vdCB5ZXQgcnVuIHNvIGl0IGhhc1xuXHQgKiBubyBsaXN0ZW5lcnMgZm9yIGNvbW1lbnQgdGhyZWFkcyBiZWluZyBzZXQgb3IgdXBkYXRlZC4gTGlzdGVuIGZvciB0aGUgdmlldyBvcGVuaW5nIGZvciB0aGVcblx0ICogZmlyc3QgdGltZSBhbmQgc2VuZCBpdCBjb21tZW50cyB0aGVuLlxuXHQgKi9cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdMaXN0ZW5lcnMoY29tbWVudHNQYW5lbEFscmVhZHlDb25zdHJ1Y3RlZDogYm9vbGVhbikge1xuXHRcdGlmICghY29tbWVudHNQYW5lbEFscmVhZHlDb25zdHJ1Y3RlZCkge1xuXHRcdFx0dGhpcy5yZWdpc3RlclZpZXdPcGVuZWRMaXN0ZW5lcigpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fb25DaGFuZ2VDb250YWluZXJMaXN0ZW5lci52YWx1ZSkge1xuXHRcdFx0dGhpcy5fb25DaGFuZ2VDb250YWluZXJMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUNvbnRhaW5lcihlID0+IHtcblx0XHRcdFx0aWYgKGUudmlld3MuZmluZCh2aWV3ID0+IHZpZXcuaWQgPT09IENPTU1FTlRTX1ZJRVdfSUQpKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb21tZW50cygpO1xuXHRcdFx0XHRcdHRoaXMucmVnaXN0ZXJWaWV3T3BlbmVkTGlzdGVuZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9vbkNoYW5nZUNvbnRhaW5lckxvY2F0aW9uTGlzdGVuZXIudmFsdWUpIHtcblx0XHRcdHRoaXMuX29uQ2hhbmdlQ29udGFpbmVyTG9jYXRpb25MaXN0ZW5lci52YWx1ZSA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUNvbnRhaW5lckxvY2F0aW9uKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tZW50c0NvbnRhaW5lciA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoQ09NTUVOVFNfVklFV19JRCk7XG5cdFx0XHRcdGlmIChlLnZpZXdDb250YWluZXIuaWQgPT09IGNvbW1lbnRzQ29udGFpbmVyPy5pZCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29tbWVudHMoKTtcblx0XHRcdFx0XHR0aGlzLnJlZ2lzdGVyVmlld09wZW5lZExpc3RlbmVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SGFuZGxlcihoYW5kbGU6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5faGFuZGxlcnMuaGFzKGhhbmRsZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBoYW5kbGVyJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9oYW5kbGVycy5nZXQoaGFuZGxlKSE7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksZUFBZSxpQkFBOEIseUJBQXlCO0FBQzNGLFNBQVMsV0FBMEI7QUFDbkMsU0FBaUIsYUFBYTtBQUM5QixZQUFZLGVBQWU7QUFFM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNkM7QUFDdEQsU0FBNkIsdUJBQXVCO0FBQ3BELFNBQVMscUJBQXFCO0FBQzlCLFNBQXdELGdCQUFnQixtQkFBa0U7QUFDMUksU0FBUyxrQkFBa0IsMEJBQTBCLDJCQUEyQjtBQUNo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OUQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSw2QkFBNkI7QUFDcEMsUUFBSSxDQUFDLEtBQUssa0JBQWtCLE9BQU87QUFDbEMsV0FBSyxrQkFBa0IsUUFBUSxLQUFLLGNBQWMsMEJBQTBCLE9BQUs7QUFDaEYsWUFBSSxFQUFFLE9BQU8sb0JBQW9CLEVBQUUsU0FBUztBQUMzQyxlQUFLLFlBQVk7QUFDakIsY0FBSSxLQUFLLG1CQUFtQjtBQUMzQixpQkFBSyxrQkFBa0IsUUFBUTtBQUFBLFVBQ2hDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1Esc0JBQXNCLGlDQUEwQztBQUN2RSxRQUFJLENBQUMsaUNBQWlDO0FBQ3JDLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFFQSxRQUFJLENBQUMsS0FBSywyQkFBMkIsT0FBTztBQUMzQyxXQUFLLDJCQUEyQixRQUFRLEtBQUssdUJBQXVCLHFCQUFxQixPQUFLO0FBQzdGLFlBQUksRUFBRSxNQUFNLEtBQUssVUFBUSxLQUFLLE9BQU8sZ0JBQWdCLEdBQUc7QUFDdkQsZUFBSyxZQUFZO0FBQ2pCLGVBQUssMkJBQTJCO0FBQUEsUUFDakM7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBRUEsUUFBSSxDQUFDLEtBQUssbUNBQW1DLE9BQU87QUFDbkQsV0FBSyxtQ0FBbUMsUUFBUSxLQUFLLHVCQUF1Qiw2QkFBNkIsT0FBSztBQUM3RyxjQUFNLG9CQUFvQixLQUFLLHVCQUF1Qix5QkFBeUIsZ0JBQWdCO0FBQy9GLFlBQUksRUFBRSxjQUFjLE9BQU8sbUJBQW1CLElBQUk7QUFDakQsZUFBSyxZQUFZO0FBQ2pCLGVBQUssMkJBQTJCO0FBQUEsUUFDakM7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsV0FBVyxRQUFnQjtBQUNsQyxRQUFJLENBQUMsS0FBSyxVQUFVLElBQUksTUFBTSxHQUFHO0FBQ2hDLFlBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLElBQ2xDO0FBQ0EsV0FBTyxLQUFLLFVBQVUsSUFBSSxNQUFNO0FBQUEsRUFDakM7QUFDRDtBQWhRYSxxQkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVksa0JBQWtCO0FBQUEsRUFnQmpEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBCVTsiLAogICJuYW1lcyI6IFsidGhyZWFkIiwgImNvbW1lbnQiXQp9Cg==
