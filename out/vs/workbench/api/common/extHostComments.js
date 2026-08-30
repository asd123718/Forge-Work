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
import { asPromise } from "../../../base/common/async.js";
import { debounce } from "../../../base/common/decorators.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { URI } from "../../../base/common/uri.js";
import * as languages from "../../../editor/common/languages.js";
import { ExtensionIdentifierMap } from "../../../platform/extensions/common/extensions.js";
import * as extHostTypeConverter from "./extHostTypeConverters.js";
import * as types from "./extHostTypes.js";
import { MainContext } from "./extHost.protocol.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
function createExtHostComments(mainContext, commands, documents) {
  const proxy = mainContext.getProxy(MainContext.MainThreadComments);
  const _ExtHostCommentsImpl = class _ExtHostCommentsImpl {
    constructor() {
      this._commentControllers = /* @__PURE__ */ new Map();
      this._commentControllersByExtension = new ExtensionIdentifierMap();
      commands.registerArgumentProcessor({
        processArgument: (arg) => {
          if (arg && arg.$mid === MarshalledId.CommentController) {
            const commentController = this._commentControllers.get(arg.handle);
            if (!commentController) {
              return arg;
            }
            return commentController.value;
          } else if (arg && arg.$mid === MarshalledId.CommentThread) {
            const marshalledCommentThread = arg;
            const commentController = this._commentControllers.get(marshalledCommentThread.commentControlHandle);
            if (!commentController) {
              return marshalledCommentThread;
            }
            const commentThread = commentController.getCommentThread(marshalledCommentThread.commentThreadHandle);
            if (!commentThread) {
              return marshalledCommentThread;
            }
            return commentThread.value;
          } else if (arg && (arg.$mid === MarshalledId.CommentThreadReply || arg.$mid === MarshalledId.CommentThreadInstance)) {
            const commentController = this._commentControllers.get(arg.thread.commentControlHandle);
            if (!commentController) {
              return arg;
            }
            const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);
            if (!commentThread) {
              return arg;
            }
            if (arg.$mid === MarshalledId.CommentThreadInstance) {
              return commentThread.value;
            }
            return {
              thread: commentThread.value,
              text: arg.text
            };
          } else if (arg && arg.$mid === MarshalledId.CommentNode) {
            const commentController = this._commentControllers.get(arg.thread.commentControlHandle);
            if (!commentController) {
              return arg;
            }
            const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);
            if (!commentThread) {
              return arg;
            }
            const commentUniqueId = arg.commentUniqueId;
            const comment = commentThread.getCommentByUniqueId(commentUniqueId);
            if (!comment) {
              return arg;
            }
            return comment;
          } else if (arg && arg.$mid === MarshalledId.CommentThreadNode) {
            const commentController = this._commentControllers.get(arg.thread.commentControlHandle);
            if (!commentController) {
              return arg;
            }
            const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);
            if (!commentThread) {
              return arg;
            }
            const body = arg.text;
            const commentUniqueId = arg.commentUniqueId;
            const comment = commentThread.getCommentByUniqueId(commentUniqueId);
            if (!comment) {
              return arg;
            }
            if (typeof comment.body === "string") {
              comment.body = body;
            } else {
              comment.body = new types.MarkdownString(body);
            }
            return comment;
          }
          return arg;
        }
      });
    }
    createCommentController(extension, id, label) {
      const handle = _ExtHostCommentsImpl.handlePool++;
      const commentController = new ExtHostCommentController(extension, handle, id, label);
      this._commentControllers.set(commentController.handle, commentController);
      const commentControllers = this._commentControllersByExtension.get(extension.identifier) || [];
      commentControllers.push(commentController);
      this._commentControllersByExtension.set(extension.identifier, commentControllers);
      return commentController.value;
    }
    async $createCommentThreadTemplate(commentControllerHandle, uriComponents, range, editorId) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController) {
        return;
      }
      commentController.$createCommentThreadTemplate(uriComponents, range, editorId);
    }
    async $setActiveComment(controllerHandle, commentInfo) {
      const commentController = this._commentControllers.get(controllerHandle);
      if (!commentController) {
        return;
      }
      commentController.$setActiveComment(commentInfo ?? void 0);
    }
    async $updateCommentThreadTemplate(commentControllerHandle, threadHandle, range) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController) {
        return;
      }
      commentController.$updateCommentThreadTemplate(threadHandle, range);
    }
    $deleteCommentThread(commentControllerHandle, commentThreadHandle) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      commentController?.$deleteCommentThread(commentThreadHandle);
    }
    async $updateCommentThread(commentControllerHandle, commentThreadHandle, changes) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      commentController?.$updateCommentThread(commentThreadHandle, changes);
    }
    async $provideCommentingRanges(commentControllerHandle, uriComponents, token) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController || !commentController.commentingRangeProvider) {
        return Promise.resolve(void 0);
      }
      const document = await documents.ensureDocumentData(URI.revive(uriComponents));
      return asPromise(async () => {
        const rangesResult = await commentController.commentingRangeProvider?.provideCommentingRanges(document.document, token);
        let ranges;
        if (Array.isArray(rangesResult)) {
          ranges = {
            ranges: rangesResult,
            fileComments: false
          };
        } else if (rangesResult) {
          ranges = {
            ranges: rangesResult.ranges || [],
            fileComments: rangesResult.enableFileComments || false
          };
        } else {
          ranges = rangesResult ?? void 0;
        }
        return ranges;
      }).then((ranges) => {
        let convertedResult = void 0;
        if (ranges) {
          convertedResult = {
            ranges: ranges.ranges.map((x) => extHostTypeConverter.Range.from(x)),
            fileComments: ranges.fileComments
          };
        }
        return convertedResult;
      });
    }
    $toggleReaction(commentControllerHandle, threadHandle, uri, comment, reaction) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController || !commentController.reactionHandler) {
        return Promise.resolve(void 0);
      }
      return asPromise(() => {
        const commentThread = commentController.getCommentThread(threadHandle);
        if (commentThread) {
          const vscodeComment = commentThread.getCommentByUniqueId(comment.uniqueIdInThread);
          if (commentController !== void 0 && vscodeComment) {
            if (commentController.reactionHandler) {
              return commentController.reactionHandler(vscodeComment, convertFromReaction(reaction));
            }
          }
        }
        return Promise.resolve(void 0);
      });
    }
  };
  _ExtHostCommentsImpl.handlePool = 0;
  let ExtHostCommentsImpl = _ExtHostCommentsImpl;
  const _ExtHostCommentThread = class _ExtHostCommentThread {
    constructor(commentControllerId, _commentControllerHandle, _id, _uri, _range, _comments, extensionDescription, _isTemplate, editorId) {
      this._commentControllerHandle = _commentControllerHandle;
      this._id = _id;
      this._uri = _uri;
      this._range = _range;
      this._comments = _comments;
      this.extensionDescription = extensionDescription;
      this._isTemplate = _isTemplate;
      this.handle = _ExtHostCommentThread._handlePool++;
      this.commentHandle = 0;
      this.modifications = /* @__PURE__ */ Object.create(null);
      this._onDidUpdateCommentThread = new Emitter();
      this.onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;
      this._canReply = true;
      this._commentsMap = /* @__PURE__ */ new Map();
      this._acceptInputDisposables = new MutableDisposable();
      this._acceptInputDisposables.value = new DisposableStore();
      if (this._id === void 0) {
        this._id = `${commentControllerId}.${this.handle}`;
      }
      proxy.$createCommentThread(
        _commentControllerHandle,
        this.handle,
        this._id,
        this._uri,
        extHostTypeConverter.Range.from(this._range),
        this._comments.map((cmt) => convertToDTOComment(this, cmt, this._commentsMap, this.extensionDescription)),
        extensionDescription.identifier,
        this._isTemplate,
        editorId
      );
      this._localDisposables = [];
      this._isDiposed = false;
      this._localDisposables.push(this.onDidUpdateCommentThread(() => {
        this.eventuallyUpdateCommentThread();
      }));
      this._localDisposables.push({
        dispose: () => {
          proxy.$deleteCommentThread(
            _commentControllerHandle,
            this.handle
          );
        }
      });
      const that = this;
      this.value = {
        get uri() {
          return that.uri;
        },
        get range() {
          return that.range;
        },
        set range(value) {
          that.range = value;
        },
        get comments() {
          return that.comments;
        },
        set comments(value) {
          that.comments = value;
        },
        get collapsibleState() {
          return that.collapsibleState;
        },
        set collapsibleState(value) {
          that.collapsibleState = value;
        },
        get canReply() {
          return that.canReply;
        },
        set canReply(state) {
          that.canReply = state;
        },
        get contextValue() {
          return that.contextValue;
        },
        set contextValue(value) {
          that.contextValue = value;
        },
        get label() {
          return that.label;
        },
        set label(value) {
          that.label = value;
        },
        get state() {
          return that.state;
        },
        set state(value) {
          that.state = value;
        },
        reveal: (comment, options) => that.reveal(comment, options),
        hide: () => that.hide(),
        dispose: () => {
          that.dispose();
        }
      };
    }
    set threadId(id) {
      this._id = id;
    }
    get threadId() {
      return this._id;
    }
    get id() {
      return this._id;
    }
    get resource() {
      return this._uri;
    }
    get uri() {
      return this._uri;
    }
    set range(range) {
      if (range === void 0 !== (this._range === void 0) || (!range || !this._range || !range.isEqual(this._range))) {
        this._range = range;
        this.modifications.range = range;
        this._onDidUpdateCommentThread.fire();
      }
    }
    get range() {
      return this._range;
    }
    set canReply(state) {
      if (this._canReply !== state) {
        this._canReply = state;
        this.modifications.canReply = state;
        this._onDidUpdateCommentThread.fire();
      }
    }
    get canReply() {
      return this._canReply;
    }
    get label() {
      return this._label;
    }
    set label(label) {
      this._label = label;
      this.modifications.label = label;
      this._onDidUpdateCommentThread.fire();
    }
    get contextValue() {
      return this._contextValue;
    }
    set contextValue(context) {
      this._contextValue = context;
      this.modifications.contextValue = context;
      this._onDidUpdateCommentThread.fire();
    }
    get comments() {
      return this._comments;
    }
    set comments(newComments) {
      this._comments = newComments;
      this.modifications.comments = newComments;
      this._onDidUpdateCommentThread.fire();
    }
    get collapsibleState() {
      return this._collapseState;
    }
    set collapsibleState(newState) {
      if (this._collapseState === newState) {
        return;
      }
      this._collapseState = newState;
      this.modifications.collapsibleState = newState;
      this._onDidUpdateCommentThread.fire();
    }
    get state() {
      return this._state;
    }
    set state(newState) {
      this._state = newState;
      if (typeof newState === "object") {
        checkProposedApiEnabled(this.extensionDescription, "commentThreadApplicability");
        this.modifications.state = newState.resolved;
        this.modifications.applicability = newState.applicability;
      } else {
        this.modifications.state = newState;
      }
      this._onDidUpdateCommentThread.fire();
    }
    get isDisposed() {
      return this._isDiposed;
    }
    updateIsTemplate() {
      if (this._isTemplate) {
        this._isTemplate = false;
        this.modifications.isTemplate = false;
      }
    }
    eventuallyUpdateCommentThread() {
      if (this._isDiposed) {
        return;
      }
      this.updateIsTemplate();
      if (!this._acceptInputDisposables.value) {
        this._acceptInputDisposables.value = new DisposableStore();
      }
      const modified = (value) => Object.prototype.hasOwnProperty.call(this.modifications, value);
      const formattedModifications = {};
      if (modified("range")) {
        formattedModifications.range = extHostTypeConverter.Range.from(this._range);
      }
      if (modified("label")) {
        formattedModifications.label = this.label;
      }
      if (modified("contextValue")) {
        formattedModifications.contextValue = this.contextValue ?? null;
      }
      if (modified("comments")) {
        formattedModifications.comments = this._comments.map((cmt) => convertToDTOComment(this, cmt, this._commentsMap, this.extensionDescription));
      }
      if (modified("collapsibleState")) {
        formattedModifications.collapseState = convertToCollapsibleState(this._collapseState);
      }
      if (modified("canReply")) {
        formattedModifications.canReply = this.canReply;
      }
      if (modified("state")) {
        formattedModifications.state = convertToState(this._state);
      }
      if (modified("applicability")) {
        formattedModifications.applicability = convertToRelevance(this._state);
      }
      if (modified("isTemplate")) {
        formattedModifications.isTemplate = this._isTemplate;
      }
      this.modifications = {};
      proxy.$updateCommentThread(
        this._commentControllerHandle,
        this.handle,
        this._id,
        this._uri,
        formattedModifications
      );
    }
    getCommentByUniqueId(uniqueId) {
      for (const key of this._commentsMap) {
        const comment = key[0];
        const id = key[1];
        if (uniqueId === id) {
          return comment;
        }
      }
      return;
    }
    async reveal(commentOrOptions, options) {
      checkProposedApiEnabled(this.extensionDescription, "commentReveal");
      let comment;
      if (commentOrOptions && commentOrOptions.body !== void 0) {
        comment = commentOrOptions;
      } else {
        options = options ?? commentOrOptions;
      }
      let commentToReveal = comment ? this._commentsMap.get(comment) : void 0;
      commentToReveal ??= this._commentsMap.get(this._comments[0]);
      let preserveFocus = true;
      let focusReply = false;
      if (options?.focus === types.CommentThreadFocus.Reply) {
        focusReply = true;
        preserveFocus = false;
      } else if (options?.focus === types.CommentThreadFocus.Comment) {
        preserveFocus = false;
      }
      return proxy.$revealCommentThread(this._commentControllerHandle, this.handle, commentToReveal, { preserveFocus, focusReply });
    }
    async hide() {
      return proxy.$hideCommentThread(this._commentControllerHandle, this.handle);
    }
    dispose() {
      this._isDiposed = true;
      this._acceptInputDisposables.dispose();
      this._onDidUpdateCommentThread.dispose();
      this._localDisposables.forEach((disposable) => disposable.dispose());
    }
  };
  _ExtHostCommentThread._handlePool = 0;
  __decorateClass([
    debounce(100)
  ], _ExtHostCommentThread.prototype, "eventuallyUpdateCommentThread", 1);
  let ExtHostCommentThread = _ExtHostCommentThread;
  class ExtHostCommentController {
    constructor(_extension, _handle, _id, _label) {
      this._extension = _extension;
      this._handle = _handle;
      this._id = _id;
      this._label = _label;
      this._threads = /* @__PURE__ */ new Map();
      proxy.$registerCommentController(this.handle, _id, _label, this._extension.identifier.value);
      const that = this;
      this.value = Object.freeze({
        id: that.id,
        label: that.label,
        get options() {
          return that.options;
        },
        set options(options) {
          that.options = options;
        },
        get commentingRangeProvider() {
          return that.commentingRangeProvider;
        },
        set commentingRangeProvider(commentingRangeProvider) {
          that.commentingRangeProvider = commentingRangeProvider;
        },
        get reactionHandler() {
          return that.reactionHandler;
        },
        set reactionHandler(handler) {
          that.reactionHandler = handler;
        },
        // get activeComment(): vscode.Comment | undefined { return that.activeComment; },
        get activeCommentThread() {
          return that.activeCommentThread;
        },
        createCommentThread(uri, range, comments) {
          return that.createCommentThread(uri, range, comments).value;
        },
        dispose: () => {
          that.dispose();
        }
      });
      this._localDisposables = [];
      this._localDisposables.push({
        dispose: () => {
          proxy.$unregisterCommentController(this.handle);
        }
      });
    }
    get id() {
      return this._id;
    }
    get label() {
      return this._label;
    }
    get handle() {
      return this._handle;
    }
    get commentingRangeProvider() {
      return this._commentingRangeProvider;
    }
    set commentingRangeProvider(provider) {
      this._commentingRangeProvider = provider;
      if (provider?.resourceHints) {
        checkProposedApiEnabled(this._extension, "commentingRangeHint");
      }
      proxy.$updateCommentingRanges(this.handle, provider?.resourceHints);
    }
    get reactionHandler() {
      return this._reactionHandler;
    }
    set reactionHandler(handler) {
      this._reactionHandler = handler;
      proxy.$updateCommentControllerFeatures(this.handle, { reactionHandler: !!handler });
    }
    get options() {
      return this._options;
    }
    set options(options) {
      this._options = options;
      proxy.$updateCommentControllerFeatures(this.handle, { options: this._options });
    }
    get activeComment() {
      checkProposedApiEnabled(this._extension, "activeComment");
      return this._activeComment;
    }
    get activeCommentThread() {
      checkProposedApiEnabled(this._extension, "activeComment");
      return this._activeThread?.value;
    }
    createCommentThread(resource, range, comments) {
      const commentThread = new ExtHostCommentThread(this.id, this.handle, void 0, resource, range, comments, this._extension, false);
      this._threads.set(commentThread.handle, commentThread);
      return commentThread;
    }
    $setActiveComment(commentInfo) {
      if (!commentInfo) {
        this._activeComment = void 0;
        this._activeThread = void 0;
        return;
      }
      const thread = this._threads.get(commentInfo.commentThreadHandle);
      if (thread) {
        this._activeComment = commentInfo.uniqueIdInThread ? thread.getCommentByUniqueId(commentInfo.uniqueIdInThread) : void 0;
        this._activeThread = thread;
      }
    }
    $createCommentThreadTemplate(uriComponents, range, editorId) {
      const commentThread = new ExtHostCommentThread(this.id, this.handle, void 0, URI.revive(uriComponents), extHostTypeConverter.Range.to(range), [], this._extension, true, editorId);
      commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
      this._threads.set(commentThread.handle, commentThread);
      return commentThread;
    }
    $updateCommentThreadTemplate(threadHandle, range) {
      const thread = this._threads.get(threadHandle);
      if (thread) {
        thread.range = extHostTypeConverter.Range.to(range);
      }
    }
    $updateCommentThread(threadHandle, changes) {
      const thread = this._threads.get(threadHandle);
      if (!thread) {
        return;
      }
      const modified = (value) => Object.prototype.hasOwnProperty.call(changes, value);
      if (modified("collapseState")) {
        thread.collapsibleState = convertToCollapsibleState(changes.collapseState);
      }
    }
    $deleteCommentThread(threadHandle) {
      const thread = this._threads.get(threadHandle);
      thread?.dispose();
      this._threads.delete(threadHandle);
    }
    getCommentThread(handle) {
      return this._threads.get(handle);
    }
    dispose() {
      this._threads.forEach((value) => {
        value.dispose();
      });
      this._localDisposables.forEach((disposable) => disposable.dispose());
    }
  }
  function convertToDTOComment(thread, vscodeComment, commentsMap, extension) {
    let commentUniqueId = commentsMap.get(vscodeComment);
    if (!commentUniqueId) {
      commentUniqueId = ++thread.commentHandle;
      commentsMap.set(vscodeComment, commentUniqueId);
    }
    if (vscodeComment.state !== void 0) {
      checkProposedApiEnabled(extension, "commentsDraftState");
    }
    if (vscodeComment.reactions?.some((reaction) => reaction.reactors !== void 0)) {
      checkProposedApiEnabled(extension, "commentReactor");
    }
    return {
      mode: vscodeComment.mode,
      contextValue: vscodeComment.contextValue,
      uniqueIdInThread: commentUniqueId,
      body: typeof vscodeComment.body === "string" ? vscodeComment.body : extHostTypeConverter.MarkdownString.from(vscodeComment.body),
      userName: vscodeComment.author.name,
      userIconPath: vscodeComment.author.iconPath,
      label: vscodeComment.label,
      commentReactions: vscodeComment.reactions ? vscodeComment.reactions.map((reaction) => convertToReaction(reaction)) : void 0,
      state: vscodeComment.state,
      timestamp: vscodeComment.timestamp?.toJSON()
    };
  }
  function convertToReaction(reaction) {
    return {
      label: reaction.label,
      iconPath: reaction.iconPath ? extHostTypeConverter.pathOrURIToURI(reaction.iconPath) : void 0,
      count: reaction.count,
      hasReacted: reaction.authorHasReacted,
      reactors: reaction.reactors && reaction.reactors.length > 0 && typeof reaction.reactors[0] !== "string" ? reaction.reactors.map((reactor) => reactor.name) : reaction.reactors
    };
  }
  function convertFromReaction(reaction) {
    return {
      label: reaction.label || "",
      count: reaction.count || 0,
      iconPath: reaction.iconPath ? URI.revive(reaction.iconPath) : "",
      authorHasReacted: reaction.hasReacted || false,
      reactors: reaction.reactors?.map((reactor) => ({ name: reactor }))
    };
  }
  function convertToCollapsibleState(kind) {
    if (kind !== void 0) {
      switch (kind) {
        case types.CommentThreadCollapsibleState.Expanded:
          return languages.CommentThreadCollapsibleState.Expanded;
        case types.CommentThreadCollapsibleState.Collapsed:
          return languages.CommentThreadCollapsibleState.Collapsed;
      }
    }
    return languages.CommentThreadCollapsibleState.Collapsed;
  }
  function convertToState(kind) {
    let resolvedKind;
    if (typeof kind === "object") {
      resolvedKind = kind.resolved;
    } else {
      resolvedKind = kind;
    }
    if (resolvedKind !== void 0) {
      switch (resolvedKind) {
        case types.CommentThreadState.Unresolved:
          return languages.CommentThreadState.Unresolved;
        case types.CommentThreadState.Resolved:
          return languages.CommentThreadState.Resolved;
      }
    }
    return languages.CommentThreadState.Unresolved;
  }
  function convertToRelevance(kind) {
    let applicabilityKind = void 0;
    if (typeof kind === "object") {
      applicabilityKind = kind.applicability;
    }
    if (applicabilityKind !== void 0) {
      switch (applicabilityKind) {
        case types.CommentThreadApplicability.Current:
          return languages.CommentThreadApplicability.Current;
        case types.CommentThreadApplicability.Outdated:
          return languages.CommentThreadApplicability.Outdated;
      }
    }
    return languages.CommentThreadApplicability.Current;
  }
  return new ExtHostCommentsImpl();
}
export {
  createExtHostComments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q29tbWVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc1Byb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllck1hcCwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlQ29udmVydGVyIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWVudHNTaGFwZSwgSU1haW5Db250ZXh0LCBNYWluQ29udGV4dCwgQ29tbWVudFRocmVhZENoYW5nZXMsIENvbW1lbnRDaGFuZ2VzIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkQ29tbWVudFRocmVhZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb21tZW50cy5qcyc7XG5cbnR5cGUgUHJvdmlkZXJIYW5kbGUgPSBudW1iZXI7XG5cbmludGVyZmFjZSBFeHRIb3N0Q29tbWVudHMge1xuXHRjcmVhdGVDb21tZW50Q29udHJvbGxlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyk6IHZzY29kZS5Db21tZW50Q29udHJvbGxlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUV4dEhvc3RDb21tZW50cyhtYWluQ29udGV4dDogSU1haW5Db250ZXh0LCBjb21tYW5kczogRXh0SG9zdENvbW1hbmRzLCBkb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMpOiBFeHRIb3N0Q29tbWVudHNTaGFwZSAmIEV4dEhvc3RDb21tZW50cyB7XG5cdGNvbnN0IHByb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZENvbW1lbnRzKTtcblxuXHRjbGFzcyBFeHRIb3N0Q29tbWVudHNJbXBsIGltcGxlbWVudHMgRXh0SG9zdENvbW1lbnRzU2hhcGUsIEV4dEhvc3RDb21tZW50cyB7XG5cblx0XHRwcml2YXRlIHN0YXRpYyBoYW5kbGVQb29sID0gMDtcblxuXG5cdFx0cHJpdmF0ZSBfY29tbWVudENvbnRyb2xsZXJzOiBNYXA8UHJvdmlkZXJIYW5kbGUsIEV4dEhvc3RDb21tZW50Q29udHJvbGxlcj4gPSBuZXcgTWFwPFByb3ZpZGVySGFuZGxlLCBFeHRIb3N0Q29tbWVudENvbnRyb2xsZXI+KCk7XG5cblx0XHRwcml2YXRlIF9jb21tZW50Q29udHJvbGxlcnNCeUV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRIb3N0Q29tbWVudENvbnRyb2xsZXJbXT4gPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRIb3N0Q29tbWVudENvbnRyb2xsZXJbXT4oKTtcblxuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0KSB7XG5cdFx0XHRjb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiBhcmcgPT4ge1xuXHRcdFx0XHRcdGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Db21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGFyZy5oYW5kbGUpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiBjb21tZW50Q29udHJvbGxlci52YWx1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkNvbW1lbnRUaHJlYWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hcnNoYWxsZWRDb21tZW50VGhyZWFkOiBNYXJzaGFsbGVkQ29tbWVudFRocmVhZCA9IGFyZztcblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChtYXJzaGFsbGVkQ29tbWVudFRocmVhZC5jb21tZW50Q29udHJvbEhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG1hcnNoYWxsZWRDb21tZW50VGhyZWFkO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50VGhyZWFkID0gY29tbWVudENvbnRyb2xsZXIuZ2V0Q29tbWVudFRocmVhZChtYXJzaGFsbGVkQ29tbWVudFRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50VGhyZWFkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBtYXJzaGFsbGVkQ29tbWVudFRocmVhZDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1lbnRUaHJlYWQudmFsdWU7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChhcmcgJiYgKGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZFJlcGx5IHx8IGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZEluc3RhbmNlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGFyZy50aHJlYWQuY29tbWVudENvbnRyb2xIYW5kbGUpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSBjb21tZW50Q29udHJvbGxlci5nZXRDb21tZW50VGhyZWFkKGFyZy50aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudFRocmVhZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkSW5zdGFuY2UpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1lbnRUaHJlYWQudmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHRocmVhZDogY29tbWVudFRocmVhZC52YWx1ZSxcblx0XHRcdFx0XHRcdFx0dGV4dDogYXJnLnRleHRcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Db21tZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGFyZy50aHJlYWQuY29tbWVudENvbnRyb2xIYW5kbGUpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSBjb21tZW50Q29udHJvbGxlci5nZXRDb21tZW50VGhyZWFkKGFyZy50aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudFRocmVhZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50VW5pcXVlSWQgPSBhcmcuY29tbWVudFVuaXF1ZUlkO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50ID0gY29tbWVudFRocmVhZC5nZXRDb21tZW50QnlVbmlxdWVJZChjb21tZW50VW5pcXVlSWQpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1lbnQ7XG5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkNvbW1lbnRUaHJlYWROb2RlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoYXJnLnRocmVhZC5jb21tZW50Q29udHJvbEhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudFRocmVhZCA9IGNvbW1lbnRDb250cm9sbGVyLmdldENvbW1lbnRUaHJlYWQoYXJnLnRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50VGhyZWFkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGJvZHk6IHN0cmluZyA9IGFyZy50ZXh0O1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudFVuaXF1ZUlkID0gYXJnLmNvbW1lbnRVbmlxdWVJZDtcblxuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudCA9IGNvbW1lbnRUaHJlYWQuZ2V0Q29tbWVudEJ5VW5pcXVlSWQoY29tbWVudFVuaXF1ZUlkKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIElmIHRoZSBvbGQgY29tbWVudCBib2R5IHdhcyBhIG1hcmtkb3duIHN0cmluZywgdXNlIGEgbWFya2Rvd24gc3RyaW5nIGhlcmUgdG9vLlxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBjb21tZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQuYm9keSA9IGJvZHk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb21tZW50LmJvZHkgPSBuZXcgdHlwZXMuTWFya2Rvd25TdHJpbmcoYm9keSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gY29tbWVudDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjcmVhdGVDb21tZW50Q29udHJvbGxlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyk6IHZzY29kZS5Db21tZW50Q29udHJvbGxlciB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0Q29tbWVudHNJbXBsLmhhbmRsZVBvb2wrKztcblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gbmV3IEV4dEhvc3RDb21tZW50Q29udHJvbGxlcihleHRlbnNpb24sIGhhbmRsZSwgaWQsIGxhYmVsKTtcblx0XHRcdHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5zZXQoY29tbWVudENvbnRyb2xsZXIuaGFuZGxlLCBjb21tZW50Q29udHJvbGxlcik7XG5cblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVycyA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVyc0J5RXh0ZW5zaW9uLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgW107XG5cdFx0XHRjb21tZW50Q29udHJvbGxlcnMucHVzaChjb21tZW50Q29udHJvbGxlcik7XG5cdFx0XHR0aGlzLl9jb21tZW50Q29udHJvbGxlcnNCeUV4dGVuc2lvbi5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGNvbW1lbnRDb250cm9sbGVycyk7XG5cblx0XHRcdHJldHVybiBjb21tZW50Q29udHJvbGxlci52YWx1ZTtcblx0XHR9XG5cblx0XHRhc3luYyAkY3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKGNvbW1lbnRDb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIGVkaXRvcklkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoY29tbWVudENvbnRyb2xsZXJIYW5kbGUpO1xuXG5cdFx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29tbWVudENvbnRyb2xsZXIuJGNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh1cmlDb21wb25lbnRzLCByYW5nZSwgZWRpdG9ySWQpO1xuXHRcdH1cblxuXHRcdGFzeW5jICRzZXRBY3RpdmVDb21tZW50KGNvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgY29tbWVudEluZm86IHsgY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyOyB1bmlxdWVJZEluVGhyZWFkPzogbnVtYmVyIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChjb250cm9sbGVySGFuZGxlKTtcblxuXHRcdFx0aWYgKCFjb21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbW1lbnRDb250cm9sbGVyLiRzZXRBY3RpdmVDb21tZW50KGNvbW1lbnRJbmZvID8/IHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgJHVwZGF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZShjb21tZW50Q29udHJvbGxlckhhbmRsZTogbnVtYmVyLCB0aHJlYWRIYW5kbGU6IG51bWJlciwgcmFuZ2U6IElSYW5nZSkge1xuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGNvbW1lbnRDb250cm9sbGVySGFuZGxlKTtcblxuXHRcdFx0aWYgKCFjb21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbW1lbnRDb250cm9sbGVyLiR1cGRhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhyZWFkSGFuZGxlLCByYW5nZSk7XG5cdFx0fVxuXG5cdFx0JGRlbGV0ZUNvbW1lbnRUaHJlYWQoY29tbWVudENvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyKSB7XG5cdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoY29tbWVudENvbnRyb2xsZXJIYW5kbGUpO1xuXG5cdFx0XHRjb21tZW50Q29udHJvbGxlcj8uJGRlbGV0ZUNvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgJHVwZGF0ZUNvbW1lbnRUaHJlYWQoY29tbWVudENvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyLCBjaGFuZ2VzOiBDb21tZW50VGhyZWFkQ2hhbmdlcykge1xuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGNvbW1lbnRDb250cm9sbGVySGFuZGxlKTtcblxuXHRcdFx0Y29tbWVudENvbnRyb2xsZXI/LiR1cGRhdGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWRIYW5kbGUsIGNoYW5nZXMpO1xuXHRcdH1cblxuXHRcdGFzeW5jICRwcm92aWRlQ29tbWVudGluZ1Jhbmdlcyhjb21tZW50Q29udHJvbGxlckhhbmRsZTogbnVtYmVyLCB1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgcmFuZ2VzOiBJUmFuZ2VbXTsgZmlsZUNvbW1lbnRzOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChjb21tZW50Q29udHJvbGxlckhhbmRsZSk7XG5cblx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIgfHwgIWNvbW1lbnRDb250cm9sbGVyLmNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZG9jdW1lbnQgPSBhd2FpdCBkb2N1bWVudHMuZW5zdXJlRG9jdW1lbnREYXRhKFVSSS5yZXZpdmUodXJpQ29tcG9uZW50cykpO1xuXHRcdFx0cmV0dXJuIGFzUHJvbWlzZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJhbmdlc1Jlc3VsdCA9IGF3YWl0IGNvbW1lbnRDb250cm9sbGVyLmNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyPy5wcm92aWRlQ29tbWVudGluZ1Jhbmdlcyhkb2N1bWVudC5kb2N1bWVudCwgdG9rZW4pO1xuXHRcdFx0XHRsZXQgcmFuZ2VzOiB7IHJhbmdlczogdnNjb2RlLlJhbmdlW107IGZpbGVDb21tZW50czogYm9vbGVhbiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShyYW5nZXNSZXN1bHQpKSB7XG5cdFx0XHRcdFx0cmFuZ2VzID0ge1xuXHRcdFx0XHRcdFx0cmFuZ2VzOiByYW5nZXNSZXN1bHQsXG5cdFx0XHRcdFx0XHRmaWxlQ29tbWVudHM6IGZhbHNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIGlmIChyYW5nZXNSZXN1bHQpIHtcblx0XHRcdFx0XHRyYW5nZXMgPSB7XG5cdFx0XHRcdFx0XHRyYW5nZXM6IHJhbmdlc1Jlc3VsdC5yYW5nZXMgfHwgW10sXG5cdFx0XHRcdFx0XHRmaWxlQ29tbWVudHM6IHJhbmdlc1Jlc3VsdC5lbmFibGVGaWxlQ29tbWVudHMgfHwgZmFsc2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJhbmdlcyA9IHJhbmdlc1Jlc3VsdCA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJhbmdlcztcblx0XHRcdH0pLnRoZW4ocmFuZ2VzID0+IHtcblx0XHRcdFx0bGV0IGNvbnZlcnRlZFJlc3VsdDogeyByYW5nZXM6IElSYW5nZVtdOyBmaWxlQ29tbWVudHM6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHJhbmdlcykge1xuXHRcdFx0XHRcdGNvbnZlcnRlZFJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdHJhbmdlczogcmFuZ2VzLnJhbmdlcy5tYXAoeCA9PiBleHRIb3N0VHlwZUNvbnZlcnRlci5SYW5nZS5mcm9tKHgpKSxcblx0XHRcdFx0XHRcdGZpbGVDb21tZW50czogcmFuZ2VzLmZpbGVDb21tZW50c1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbnZlcnRlZFJlc3VsdDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdCR0b2dnbGVSZWFjdGlvbihjb21tZW50Q29udHJvbGxlckhhbmRsZTogbnVtYmVyLCB0aHJlYWRIYW5kbGU6IG51bWJlciwgdXJpOiBVcmlDb21wb25lbnRzLCBjb21tZW50OiBsYW5ndWFnZXMuQ29tbWVudCwgcmVhY3Rpb246IGxhbmd1YWdlcy5Db21tZW50UmVhY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChjb21tZW50Q29udHJvbGxlckhhbmRsZSk7XG5cblx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIgfHwgIWNvbW1lbnRDb250cm9sbGVyLnJlYWN0aW9uSGFuZGxlcikge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tZW50VGhyZWFkID0gY29tbWVudENvbnRyb2xsZXIuZ2V0Q29tbWVudFRocmVhZCh0aHJlYWRIYW5kbGUpO1xuXHRcdFx0XHRpZiAoY29tbWVudFRocmVhZCkge1xuXHRcdFx0XHRcdGNvbnN0IHZzY29kZUNvbW1lbnQgPSBjb21tZW50VGhyZWFkLmdldENvbW1lbnRCeVVuaXF1ZUlkKGNvbW1lbnQudW5pcXVlSWRJblRocmVhZCk7XG5cblx0XHRcdFx0XHRpZiAoY29tbWVudENvbnRyb2xsZXIgIT09IHVuZGVmaW5lZCAmJiB2c2NvZGVDb21tZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoY29tbWVudENvbnRyb2xsZXIucmVhY3Rpb25IYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjb21tZW50Q29udHJvbGxlci5yZWFjdGlvbkhhbmRsZXIodnNjb2RlQ29tbWVudCwgY29udmVydEZyb21SZWFjdGlvbihyZWFjdGlvbikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHR0eXBlIENvbW1lbnRUaHJlYWRNb2RpZmljYXRpb24gPSBQYXJ0aWFsPHtcblx0XHRyYW5nZTogdnNjb2RlLlJhbmdlO1xuXHRcdGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29tbWVudHM6IHZzY29kZS5Db21tZW50W107XG5cdFx0Y29sbGFwc2libGVTdGF0ZTogdnNjb2RlLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlO1xuXHRcdGNhblJlcGx5OiBib29sZWFuIHwgdnNjb2RlLkNvbW1lbnRBdXRob3JJbmZvcm1hdGlvbjtcblx0XHRzdGF0ZTogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZTtcblx0XHRpc1RlbXBsYXRlOiBib29sZWFuO1xuXHRcdGFwcGxpY2FiaWxpdHk6IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eTtcblx0fT47XG5cblx0Y2xhc3MgRXh0SG9zdENvbW1lbnRUaHJlYWQgaW1wbGVtZW50cyB2c2NvZGUuQ29tbWVudFRocmVhZDIge1xuXHRcdHByaXZhdGUgc3RhdGljIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXHRcdHJlYWRvbmx5IGhhbmRsZSA9IEV4dEhvc3RDb21tZW50VGhyZWFkLl9oYW5kbGVQb29sKys7XG5cdFx0cHVibGljIGNvbW1lbnRIYW5kbGU6IG51bWJlciA9IDA7XG5cblx0XHRwcml2YXRlIG1vZGlmaWNhdGlvbnM6IENvbW1lbnRUaHJlYWRNb2RpZmljYXRpb24gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0c2V0IHRocmVhZElkKGlkOiBzdHJpbmcpIHtcblx0XHRcdHRoaXMuX2lkID0gaWQ7XG5cdFx0fVxuXG5cdFx0Z2V0IHRocmVhZElkKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faWQhO1xuXHRcdH1cblxuXHRcdGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lkITtcblx0XHR9XG5cblx0XHRnZXQgcmVzb3VyY2UoKTogdnNjb2RlLlVyaSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdXJpO1xuXHRcdH1cblxuXHRcdGdldCB1cmkoKTogdnNjb2RlLlVyaSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdXJpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb21tZW50VGhyZWFkID0gdGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkLmV2ZW50O1xuXG5cdFx0c2V0IHJhbmdlKHJhbmdlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQpIHtcblx0XHRcdGlmICgoKHJhbmdlID09PSB1bmRlZmluZWQpICE9PSAodGhpcy5fcmFuZ2UgPT09IHVuZGVmaW5lZCkpIHx8ICghcmFuZ2UgfHwgIXRoaXMuX3JhbmdlIHx8ICFyYW5nZS5pc0VxdWFsKHRoaXMuX3JhbmdlKSkpIHtcblx0XHRcdFx0dGhpcy5fcmFuZ2UgPSByYW5nZTtcblx0XHRcdFx0dGhpcy5tb2RpZmljYXRpb25zLnJhbmdlID0gcmFuZ2U7XG5cdFx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Z2V0IHJhbmdlKCk6IHZzY29kZS5SYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmFuZ2U7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfY2FuUmVwbHk6IGJvb2xlYW4gfCB2c2NvZGUuQ29tbWVudEF1dGhvckluZm9ybWF0aW9uID0gdHJ1ZTtcblxuXHRcdHNldCBjYW5SZXBseShzdGF0ZTogYm9vbGVhbiB8IHZzY29kZS5Db21tZW50QXV0aG9ySW5mb3JtYXRpb24pIHtcblx0XHRcdGlmICh0aGlzLl9jYW5SZXBseSAhPT0gc3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fY2FuUmVwbHkgPSBzdGF0ZTtcblx0XHRcdFx0dGhpcy5tb2RpZmljYXRpb25zLmNhblJlcGx5ID0gc3RhdGU7XG5cdFx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGdldCBjYW5SZXBseSgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYW5SZXBseTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9sYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0Z2V0IGxhYmVsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdFx0fVxuXG5cdFx0c2V0IGxhYmVsKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2xhYmVsID0gbGFiZWw7XG5cdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMubGFiZWwgPSBsYWJlbDtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfY29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRnZXQgY29udGV4dFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29udGV4dFZhbHVlO1xuXHRcdH1cblxuXHRcdHNldCBjb250ZXh0VmFsdWUoY29udGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0VmFsdWUgPSBjb250ZXh0O1xuXHRcdFx0dGhpcy5tb2RpZmljYXRpb25zLmNvbnRleHRWYWx1ZSA9IGNvbnRleHQ7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdGdldCBjb21tZW50cygpOiB2c2NvZGUuQ29tbWVudFtdIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21tZW50cztcblx0XHR9XG5cblx0XHRzZXQgY29tbWVudHMobmV3Q29tbWVudHM6IHZzY29kZS5Db21tZW50W10pIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRzID0gbmV3Q29tbWVudHM7XG5cdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMuY29tbWVudHMgPSBuZXdDb21tZW50cztcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfY29sbGFwc2VTdGF0ZT86IHZzY29kZS5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZTtcblxuXHRcdGdldCBjb2xsYXBzaWJsZVN0YXRlKCk6IHZzY29kZS5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29sbGFwc2VTdGF0ZSE7XG5cdFx0fVxuXG5cdFx0c2V0IGNvbGxhcHNpYmxlU3RhdGUobmV3U3RhdGU6IHZzY29kZS5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSkge1xuXHRcdFx0aWYgKHRoaXMuX2NvbGxhcHNlU3RhdGUgPT09IG5ld1N0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbGxhcHNlU3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5jb2xsYXBzaWJsZVN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX3N0YXRlPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHsgcmVzb2x2ZWQ/OiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlOyBhcHBsaWNhYmlsaXR5PzogdnNjb2RlLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IH07XG5cblx0XHRnZXQgc3RhdGUoKTogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHsgcmVzb2x2ZWQ/OiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlOyBhcHBsaWNhYmlsaXR5PzogdnNjb2RlLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IH0gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlITtcblx0XHR9XG5cblx0XHRzZXQgc3RhdGUobmV3U3RhdGU6IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGUgfCB7IHJlc29sdmVkPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZTsgYXBwbGljYWJpbGl0eT86IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB9KSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0aWYgKHR5cGVvZiBuZXdTdGF0ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5leHRlbnNpb25EZXNjcmlwdGlvbiwgJ2NvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5Jyk7XG5cdFx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5zdGF0ZSA9IG5ld1N0YXRlLnJlc29sdmVkO1xuXHRcdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMuYXBwbGljYWJpbGl0eSA9IG5ld1N0YXRlLmFwcGxpY2FiaWxpdHk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMuc3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfbG9jYWxEaXNwb3NhYmxlczogdHlwZXMuRGlzcG9zYWJsZVtdO1xuXG5cdFx0cHJpdmF0ZSBfaXNEaXBvc2VkOiBib29sZWFuO1xuXG5cdFx0cHVibGljIGdldCBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lzRGlwb3NlZDtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9jb21tZW50c01hcDogTWFwPHZzY29kZS5Db21tZW50LCBudW1iZXI+ID0gbmV3IE1hcDx2c2NvZGUuQ29tbWVudCwgbnVtYmVyPigpO1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWNjZXB0SW5wdXREaXNwb3NhYmxlcyA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0XHRyZWFkb25seSB2YWx1ZTogdnNjb2RlLkNvbW1lbnRUaHJlYWQyO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRjb21tZW50Q29udHJvbGxlcklkOiBzdHJpbmcsXG5cdFx0XHRwcml2YXRlIF9jb21tZW50Q29udHJvbGxlckhhbmRsZTogbnVtYmVyLFxuXHRcdFx0cHJpdmF0ZSBfaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRcdHByaXZhdGUgX3VyaTogdnNjb2RlLlVyaSxcblx0XHRcdHByaXZhdGUgX3JhbmdlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQsXG5cdFx0XHRwcml2YXRlIF9jb21tZW50czogdnNjb2RlLkNvbW1lbnRbXSxcblx0XHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0cHJpdmF0ZSBfaXNUZW1wbGF0ZTogYm9vbGVhbixcblx0XHRcdGVkaXRvcklkPzogc3RyaW5nXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRpZiAodGhpcy5faWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9pZCA9IGAke2NvbW1lbnRDb250cm9sbGVySWR9LiR7dGhpcy5oYW5kbGV9YDtcblx0XHRcdH1cblxuXHRcdFx0cHJveHkuJGNyZWF0ZUNvbW1lbnRUaHJlYWQoXG5cdFx0XHRcdF9jb21tZW50Q29udHJvbGxlckhhbmRsZSxcblx0XHRcdFx0dGhpcy5oYW5kbGUsXG5cdFx0XHRcdHRoaXMuX2lkLFxuXHRcdFx0XHR0aGlzLl91cmksXG5cdFx0XHRcdGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLmZyb20odGhpcy5fcmFuZ2UpLFxuXHRcdFx0XHR0aGlzLl9jb21tZW50cy5tYXAoY210ID0+IGNvbnZlcnRUb0RUT0NvbW1lbnQodGhpcywgY210LCB0aGlzLl9jb21tZW50c01hcCwgdGhpcy5leHRlbnNpb25EZXNjcmlwdGlvbikpLFxuXHRcdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHR0aGlzLl9pc1RlbXBsYXRlLFxuXHRcdFx0XHRlZGl0b3JJZFxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlcyA9IFtdO1xuXHRcdFx0dGhpcy5faXNEaXBvc2VkID0gZmFsc2U7XG5cblx0XHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZXMucHVzaCh0aGlzLm9uRGlkVXBkYXRlQ29tbWVudFRocmVhZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZUNvbW1lbnRUaHJlYWQoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlcy5wdXNoKHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHByb3h5LiRkZWxldGVDb21tZW50VGhyZWFkKFxuXHRcdFx0XHRcdFx0X2NvbW1lbnRDb250cm9sbGVySGFuZGxlLFxuXHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHR0aGlzLnZhbHVlID0ge1xuXHRcdFx0XHRnZXQgdXJpKCkgeyByZXR1cm4gdGhhdC51cmk7IH0sXG5cdFx0XHRcdGdldCByYW5nZSgpIHsgcmV0dXJuIHRoYXQucmFuZ2U7IH0sXG5cdFx0XHRcdHNldCByYW5nZSh2YWx1ZTogdnNjb2RlLlJhbmdlIHwgdW5kZWZpbmVkKSB7IHRoYXQucmFuZ2UgPSB2YWx1ZTsgfSxcblx0XHRcdFx0Z2V0IGNvbW1lbnRzKCkgeyByZXR1cm4gdGhhdC5jb21tZW50czsgfSxcblx0XHRcdFx0c2V0IGNvbW1lbnRzKHZhbHVlOiB2c2NvZGUuQ29tbWVudFtdKSB7IHRoYXQuY29tbWVudHMgPSB2YWx1ZTsgfSxcblx0XHRcdFx0Z2V0IGNvbGxhcHNpYmxlU3RhdGUoKSB7IHJldHVybiB0aGF0LmNvbGxhcHNpYmxlU3RhdGU7IH0sXG5cdFx0XHRcdHNldCBjb2xsYXBzaWJsZVN0YXRlKHZhbHVlOiB2c2NvZGUuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUpIHsgdGhhdC5jb2xsYXBzaWJsZVN0YXRlID0gdmFsdWU7IH0sXG5cdFx0XHRcdGdldCBjYW5SZXBseSgpIHsgcmV0dXJuIHRoYXQuY2FuUmVwbHk7IH0sXG5cdFx0XHRcdHNldCBjYW5SZXBseShzdGF0ZTogYm9vbGVhbiB8IHZzY29kZS5Db21tZW50QXV0aG9ySW5mb3JtYXRpb24pIHsgdGhhdC5jYW5SZXBseSA9IHN0YXRlOyB9LFxuXHRcdFx0XHRnZXQgY29udGV4dFZhbHVlKCkgeyByZXR1cm4gdGhhdC5jb250ZXh0VmFsdWU7IH0sXG5cdFx0XHRcdHNldCBjb250ZXh0VmFsdWUodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkgeyB0aGF0LmNvbnRleHRWYWx1ZSA9IHZhbHVlOyB9LFxuXHRcdFx0XHRnZXQgbGFiZWwoKSB7IHJldHVybiB0aGF0LmxhYmVsOyB9LFxuXHRcdFx0XHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkgeyB0aGF0LmxhYmVsID0gdmFsdWU7IH0sXG5cdFx0XHRcdGdldCBzdGF0ZSgpOiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlIHwgeyByZXNvbHZlZD86IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGU7IGFwcGxpY2FiaWxpdHk/OiB2c2NvZGUuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGF0LnN0YXRlOyB9LFxuXHRcdFx0XHRzZXQgc3RhdGUodmFsdWU6IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGUgfCB7IHJlc29sdmVkPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZTsgYXBwbGljYWJpbGl0eT86IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB9KSB7IHRoYXQuc3RhdGUgPSB2YWx1ZTsgfSxcblx0XHRcdFx0cmV2ZWFsOiAoY29tbWVudD86IHZzY29kZS5Db21tZW50IHwgdnNjb2RlLkNvbW1lbnRUaHJlYWRSZXZlYWxPcHRpb25zLCBvcHRpb25zPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRSZXZlYWxPcHRpb25zKSA9PiB0aGF0LnJldmVhbChjb21tZW50LCBvcHRpb25zKSxcblx0XHRcdFx0aGlkZTogKCkgPT4gdGhhdC5oaWRlKCksXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR0aGF0LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRwcml2YXRlIHVwZGF0ZUlzVGVtcGxhdGUoKSB7XG5cdFx0XHRpZiAodGhpcy5faXNUZW1wbGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9pc1RlbXBsYXRlID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5pc1RlbXBsYXRlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0QGRlYm91bmNlKDEwMClcblx0XHRldmVudHVhbGx5VXBkYXRlQ29tbWVudFRocmVhZCgpOiB2b2lkIHtcblx0XHRcdGlmICh0aGlzLl9pc0RpcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVJc1RlbXBsYXRlKCk7XG5cblx0XHRcdGlmICghdGhpcy5fYWNjZXB0SW5wdXREaXNwb3NhYmxlcy52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RpZmllZCA9ICh2YWx1ZToga2V5b2YgQ29tbWVudFRocmVhZE1vZGlmaWNhdGlvbik6IGJvb2xlYW4gPT5cblx0XHRcdFx0T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMubW9kaWZpY2F0aW9ucywgdmFsdWUpO1xuXG5cdFx0XHRjb25zdCBmb3JtYXR0ZWRNb2RpZmljYXRpb25zOiBDb21tZW50VGhyZWFkQ2hhbmdlcyA9IHt9O1xuXHRcdFx0aWYgKG1vZGlmaWVkKCdyYW5nZScpKSB7XG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnMucmFuZ2UgPSBleHRIb3N0VHlwZUNvbnZlcnRlci5SYW5nZS5mcm9tKHRoaXMuX3JhbmdlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnbGFiZWwnKSkge1xuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zLmxhYmVsID0gdGhpcy5sYWJlbDtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnY29udGV4dFZhbHVlJykpIHtcblx0XHRcdFx0Lypcblx0XHRcdFx0ICogbnVsbCAtPiBjbGVhcmVkIGNvbnRleHRWYWx1ZVxuXHRcdFx0XHQgKiB1bmRlZmluZWQgLT4gbm8gY2hhbmdlXG5cdFx0XHRcdCAqL1xuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zLmNvbnRleHRWYWx1ZSA9IHRoaXMuY29udGV4dFZhbHVlID8/IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kaWZpZWQoJ2NvbW1lbnRzJykpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTW9kaWZpY2F0aW9ucy5jb21tZW50cyA9XG5cdFx0XHRcdFx0dGhpcy5fY29tbWVudHMubWFwKGNtdCA9PiBjb252ZXJ0VG9EVE9Db21tZW50KHRoaXMsIGNtdCwgdGhpcy5fY29tbWVudHNNYXAsIHRoaXMuZXh0ZW5zaW9uRGVzY3JpcHRpb24pKTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnY29sbGFwc2libGVTdGF0ZScpKSB7XG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnMuY29sbGFwc2VTdGF0ZSA9IGNvbnZlcnRUb0NvbGxhcHNpYmxlU3RhdGUodGhpcy5fY29sbGFwc2VTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kaWZpZWQoJ2NhblJlcGx5JykpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTW9kaWZpY2F0aW9ucy5jYW5SZXBseSA9IHRoaXMuY2FuUmVwbHk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kaWZpZWQoJ3N0YXRlJykpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTW9kaWZpY2F0aW9ucy5zdGF0ZSA9IGNvbnZlcnRUb1N0YXRlKHRoaXMuX3N0YXRlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnYXBwbGljYWJpbGl0eScpKSB7XG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnMuYXBwbGljYWJpbGl0eSA9IGNvbnZlcnRUb1JlbGV2YW5jZSh0aGlzLl9zdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kaWZpZWQoJ2lzVGVtcGxhdGUnKSkge1xuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zLmlzVGVtcGxhdGUgPSB0aGlzLl9pc1RlbXBsYXRlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5tb2RpZmljYXRpb25zID0ge307XG5cblx0XHRcdHByb3h5LiR1cGRhdGVDb21tZW50VGhyZWFkKFxuXHRcdFx0XHR0aGlzLl9jb21tZW50Q29udHJvbGxlckhhbmRsZSxcblx0XHRcdFx0dGhpcy5oYW5kbGUsXG5cdFx0XHRcdHRoaXMuX2lkISxcblx0XHRcdFx0dGhpcy5fdXJpLFxuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGdldENvbW1lbnRCeVVuaXF1ZUlkKHVuaXF1ZUlkOiBudW1iZXIpOiB2c2NvZGUuQ29tbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9jb21tZW50c01hcCkge1xuXHRcdFx0XHRjb25zdCBjb21tZW50ID0ga2V5WzBdO1xuXHRcdFx0XHRjb25zdCBpZCA9IGtleVsxXTtcblx0XHRcdFx0aWYgKHVuaXF1ZUlkID09PSBpZCkge1xuXHRcdFx0XHRcdHJldHVybiBjb21tZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhc3luYyByZXZlYWwoY29tbWVudE9yT3B0aW9ucz86IHZzY29kZS5Db21tZW50IHwgdnNjb2RlLkNvbW1lbnRUaHJlYWRSZXZlYWxPcHRpb25zLCBvcHRpb25zPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRSZXZlYWxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLmV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnY29tbWVudFJldmVhbCcpO1xuXHRcdFx0bGV0IGNvbW1lbnQ6IHZzY29kZS5Db21tZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNvbW1lbnRPck9wdGlvbnMgJiYgKGNvbW1lbnRPck9wdGlvbnMgYXMgdnNjb2RlLkNvbW1lbnQpLmJvZHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb21tZW50ID0gY29tbWVudE9yT3B0aW9ucyBhcyB2c2NvZGUuQ29tbWVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9wdGlvbnMgPSBvcHRpb25zID8/IGNvbW1lbnRPck9wdGlvbnMgYXMgdnNjb2RlLkNvbW1lbnRUaHJlYWRSZXZlYWxPcHRpb25zO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNvbW1lbnRUb1JldmVhbCA9IGNvbW1lbnQgPyB0aGlzLl9jb21tZW50c01hcC5nZXQoY29tbWVudCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb21tZW50VG9SZXZlYWwgPz89IHRoaXMuX2NvbW1lbnRzTWFwLmdldCh0aGlzLl9jb21tZW50c1swXSkhO1xuXHRcdFx0bGV0IHByZXNlcnZlRm9jdXM6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdFx0bGV0IGZvY3VzUmVwbHk6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdGlmIChvcHRpb25zPy5mb2N1cyA9PT0gdHlwZXMuQ29tbWVudFRocmVhZEZvY3VzLlJlcGx5KSB7XG5cdFx0XHRcdGZvY3VzUmVwbHkgPSB0cnVlO1xuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnM/LmZvY3VzID09PSB0eXBlcy5Db21tZW50VGhyZWFkRm9jdXMuQ29tbWVudCkge1xuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJveHkuJHJldmVhbENvbW1lbnRUaHJlYWQodGhpcy5fY29tbWVudENvbnRyb2xsZXJIYW5kbGUsIHRoaXMuaGFuZGxlLCBjb21tZW50VG9SZXZlYWwsIHsgcHJlc2VydmVGb2N1cywgZm9jdXNSZXBseSB9KTtcblx0XHR9XG5cblx0XHRhc3luYyBoaWRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0cmV0dXJuIHByb3h5LiRoaWRlQ29tbWVudFRocmVhZCh0aGlzLl9jb21tZW50Q29udHJvbGxlckhhbmRsZSwgdGhpcy5oYW5kbGUpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHR0aGlzLl9pc0RpcG9zZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fYWNjZXB0SW5wdXREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlcy5mb3JFYWNoKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHR5cGUgUmVhY3Rpb25IYW5kbGVyID0gKGNvbW1lbnQ6IHZzY29kZS5Db21tZW50LCByZWFjdGlvbjogdnNjb2RlLkNvbW1lbnRSZWFjdGlvbikgPT4gUHJvbWlzZTx2b2lkPjtcblxuXHRjbGFzcyBFeHRIb3N0Q29tbWVudENvbnRyb2xsZXIge1xuXHRcdGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHRcdH1cblxuXHRcdGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBnZXQgaGFuZGxlKCk6IG51bWJlciB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX3RocmVhZHM6IE1hcDxudW1iZXIsIEV4dEhvc3RDb21tZW50VGhyZWFkPiA9IG5ldyBNYXA8bnVtYmVyLCBFeHRIb3N0Q29tbWVudFRocmVhZD4oKTtcblxuXHRcdHByaXZhdGUgX2NvbW1lbnRpbmdSYW5nZVByb3ZpZGVyPzogdnNjb2RlLkNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyO1xuXHRcdGdldCBjb21tZW50aW5nUmFuZ2VQcm92aWRlcigpOiB2c2NvZGUuQ29tbWVudGluZ1JhbmdlUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRpbmdSYW5nZVByb3ZpZGVyO1xuXHRcdH1cblxuXHRcdHNldCBjb21tZW50aW5nUmFuZ2VQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdFx0aWYgKHByb3ZpZGVyPy5yZXNvdXJjZUhpbnRzKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ2NvbW1lbnRpbmdSYW5nZUhpbnQnKTtcblx0XHRcdH1cblx0XHRcdHByb3h5LiR1cGRhdGVDb21tZW50aW5nUmFuZ2VzKHRoaXMuaGFuZGxlLCBwcm92aWRlcj8ucmVzb3VyY2VIaW50cyk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfcmVhY3Rpb25IYW5kbGVyPzogUmVhY3Rpb25IYW5kbGVyO1xuXG5cdFx0Z2V0IHJlYWN0aW9uSGFuZGxlcigpOiBSZWFjdGlvbkhhbmRsZXIgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlYWN0aW9uSGFuZGxlcjtcblx0XHR9XG5cblx0XHRzZXQgcmVhY3Rpb25IYW5kbGVyKGhhbmRsZXI6IFJlYWN0aW9uSGFuZGxlciB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVhY3Rpb25IYW5kbGVyID0gaGFuZGxlcjtcblxuXHRcdFx0cHJveHkuJHVwZGF0ZUNvbW1lbnRDb250cm9sbGVyRmVhdHVyZXModGhpcy5oYW5kbGUsIHsgcmVhY3Rpb25IYW5kbGVyOiAhIWhhbmRsZXIgfSk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfb3B0aW9uczogbGFuZ3VhZ2VzLkNvbW1lbnRPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdFx0Z2V0IG9wdGlvbnMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucztcblx0XHR9XG5cblx0XHRzZXQgb3B0aW9ucyhvcHRpb25zOiBsYW5ndWFnZXMuQ29tbWVudE9wdGlvbnMgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMgPSBvcHRpb25zO1xuXG5cdFx0XHRwcm94eS4kdXBkYXRlQ29tbWVudENvbnRyb2xsZXJGZWF0dXJlcyh0aGlzLmhhbmRsZSwgeyBvcHRpb25zOiB0aGlzLl9vcHRpb25zIH0pO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2FjdGl2ZUNvbW1lbnQ6IHZzY29kZS5Db21tZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Z2V0IGFjdGl2ZUNvbW1lbnQoKTogdnNjb2RlLkNvbW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnYWN0aXZlQ29tbWVudCcpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUNvbW1lbnQ7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfYWN0aXZlVGhyZWFkOiBFeHRIb3N0Q29tbWVudFRocmVhZCB8IHVuZGVmaW5lZDtcblxuXHRcdGdldCBhY3RpdmVDb21tZW50VGhyZWFkKCk6IHZzY29kZS5Db21tZW50VGhyZWFkMiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdhY3RpdmVDb21tZW50Jyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlVGhyZWFkPy52YWx1ZTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9sb2NhbERpc3Bvc2FibGVzOiB0eXBlcy5EaXNwb3NhYmxlW107XG5cdFx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5Db21tZW50Q29udHJvbGxlcjtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cHJpdmF0ZSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHRwcml2YXRlIF9oYW5kbGU6IG51bWJlcixcblx0XHRcdHByaXZhdGUgX2lkOiBzdHJpbmcsXG5cdFx0XHRwcml2YXRlIF9sYWJlbDogc3RyaW5nXG5cdFx0KSB7XG5cdFx0XHRwcm94eS4kcmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcih0aGlzLmhhbmRsZSwgX2lkLCBfbGFiZWwsIHRoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblxuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHR0aGlzLnZhbHVlID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdGlkOiB0aGF0LmlkLFxuXHRcdFx0XHRsYWJlbDogdGhhdC5sYWJlbCxcblx0XHRcdFx0Z2V0IG9wdGlvbnMoKSB7IHJldHVybiB0aGF0Lm9wdGlvbnM7IH0sXG5cdFx0XHRcdHNldCBvcHRpb25zKG9wdGlvbnM6IHZzY29kZS5Db21tZW50T3B0aW9ucyB8IHVuZGVmaW5lZCkgeyB0aGF0Lm9wdGlvbnMgPSBvcHRpb25zOyB9LFxuXHRcdFx0XHRnZXQgY29tbWVudGluZ1JhbmdlUHJvdmlkZXIoKTogdnNjb2RlLkNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoYXQuY29tbWVudGluZ1JhbmdlUHJvdmlkZXI7IH0sXG5cdFx0XHRcdHNldCBjb21tZW50aW5nUmFuZ2VQcm92aWRlcihjb21tZW50aW5nUmFuZ2VQcm92aWRlcjogdnNjb2RlLkNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7IHRoYXQuY29tbWVudGluZ1JhbmdlUHJvdmlkZXIgPSBjb21tZW50aW5nUmFuZ2VQcm92aWRlcjsgfSxcblx0XHRcdFx0Z2V0IHJlYWN0aW9uSGFuZGxlcigpOiBSZWFjdGlvbkhhbmRsZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhhdC5yZWFjdGlvbkhhbmRsZXI7IH0sXG5cdFx0XHRcdHNldCByZWFjdGlvbkhhbmRsZXIoaGFuZGxlcjogUmVhY3Rpb25IYW5kbGVyIHwgdW5kZWZpbmVkKSB7IHRoYXQucmVhY3Rpb25IYW5kbGVyID0gaGFuZGxlcjsgfSxcblx0XHRcdFx0Ly8gZ2V0IGFjdGl2ZUNvbW1lbnQoKTogdnNjb2RlLkNvbW1lbnQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhhdC5hY3RpdmVDb21tZW50OyB9LFxuXHRcdFx0XHRnZXQgYWN0aXZlQ29tbWVudFRocmVhZCgpOiB2c2NvZGUuQ29tbWVudFRocmVhZCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGF0LmFjdGl2ZUNvbW1lbnRUaHJlYWQgYXMgdnNjb2RlLkNvbW1lbnRUaHJlYWQgfCB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdGNyZWF0ZUNvbW1lbnRUaHJlYWQodXJpOiB2c2NvZGUuVXJpLCByYW5nZTogdnNjb2RlLlJhbmdlIHwgdW5kZWZpbmVkLCBjb21tZW50czogdnNjb2RlLkNvbW1lbnRbXSk6IHZzY29kZS5Db21tZW50VGhyZWFkIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5jcmVhdGVDb21tZW50VGhyZWFkKHVyaSwgcmFuZ2UsIGNvbW1lbnRzKS52YWx1ZSBhcyB2c2NvZGUuQ29tbWVudFRocmVhZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB0aGF0LmRpc3Bvc2UoKTsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzID0gW107XG5cdFx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzLnB1c2goe1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0cHJveHkuJHVucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcih0aGlzLmhhbmRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNyZWF0ZUNvbW1lbnRUaHJlYWQocmVzb3VyY2U6IHZzY29kZS5VcmksIHJhbmdlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQsIGNvbW1lbnRzOiB2c2NvZGUuQ29tbWVudFtdKTogRXh0SG9zdENvbW1lbnRUaHJlYWQge1xuXHRcdFx0Y29uc3QgY29tbWVudFRocmVhZCA9IG5ldyBFeHRIb3N0Q29tbWVudFRocmVhZCh0aGlzLmlkLCB0aGlzLmhhbmRsZSwgdW5kZWZpbmVkLCByZXNvdXJjZSwgcmFuZ2UsIGNvbW1lbnRzLCB0aGlzLl9leHRlbnNpb24sIGZhbHNlKTtcblx0XHRcdHRoaXMuX3RocmVhZHMuc2V0KGNvbW1lbnRUaHJlYWQuaGFuZGxlLCBjb21tZW50VGhyZWFkKTtcblx0XHRcdHJldHVybiBjb21tZW50VGhyZWFkO1xuXHRcdH1cblxuXHRcdCRzZXRBY3RpdmVDb21tZW50KGNvbW1lbnRJbmZvOiB7IGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcjsgdW5pcXVlSWRJblRocmVhZD86IG51bWJlciB9IHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoIWNvbW1lbnRJbmZvKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUNvbW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRocmVhZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5fdGhyZWFkcy5nZXQoY29tbWVudEluZm8uY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0XHRpZiAodGhyZWFkKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUNvbW1lbnQgPSBjb21tZW50SW5mby51bmlxdWVJZEluVGhyZWFkID8gdGhyZWFkLmdldENvbW1lbnRCeVVuaXF1ZUlkKGNvbW1lbnRJbmZvLnVuaXF1ZUlkSW5UaHJlYWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVUaHJlYWQgPSB0aHJlYWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0JGNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBlZGl0b3JJZD86IHN0cmluZyk6IEV4dEhvc3RDb21tZW50VGhyZWFkIHtcblx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSBuZXcgRXh0SG9zdENvbW1lbnRUaHJlYWQodGhpcy5pZCwgdGhpcy5oYW5kbGUsIHVuZGVmaW5lZCwgVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUmFuZ2UudG8ocmFuZ2UpLCBbXSwgdGhpcy5fZXh0ZW5zaW9uLCB0cnVlLCBlZGl0b3JJZCk7XG5cdFx0XHRjb21tZW50VGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQ7XG5cdFx0XHR0aGlzLl90aHJlYWRzLnNldChjb21tZW50VGhyZWFkLmhhbmRsZSwgY29tbWVudFRocmVhZCk7XG5cdFx0XHRyZXR1cm4gY29tbWVudFRocmVhZDtcblx0XHR9XG5cblx0XHQkdXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHRocmVhZEhhbmRsZTogbnVtYmVyLCByYW5nZTogSVJhbmdlKTogdm9pZCB7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldCh0aHJlYWRIYW5kbGUpO1xuXHRcdFx0aWYgKHRocmVhZCkge1xuXHRcdFx0XHR0aHJlYWQucmFuZ2UgPSBleHRIb3N0VHlwZUNvbnZlcnRlci5SYW5nZS50byhyYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0JHVwZGF0ZUNvbW1lbnRUaHJlYWQodGhyZWFkSGFuZGxlOiBudW1iZXIsIGNoYW5nZXM6IENvbW1lbnRUaHJlYWRDaGFuZ2VzKTogdm9pZCB7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldCh0aHJlYWRIYW5kbGUpO1xuXHRcdFx0aWYgKCF0aHJlYWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RpZmllZCA9ICh2YWx1ZToga2V5b2YgQ29tbWVudFRocmVhZENoYW5nZXMpOiBib29sZWFuID0+XG5cdFx0XHRcdE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjaGFuZ2VzLCB2YWx1ZSk7XG5cblx0XHRcdGlmIChtb2RpZmllZCgnY29sbGFwc2VTdGF0ZScpKSB7XG5cdFx0XHRcdHRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID0gY29udmVydFRvQ29sbGFwc2libGVTdGF0ZShjaGFuZ2VzLmNvbGxhcHNlU3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdCRkZWxldGVDb21tZW50VGhyZWFkKHRocmVhZEhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldCh0aHJlYWRIYW5kbGUpO1xuXG5cdFx0XHR0aHJlYWQ/LmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy5fdGhyZWFkcy5kZWxldGUodGhyZWFkSGFuZGxlKTtcblx0XHR9XG5cblx0XHRnZXRDb21tZW50VGhyZWFkKGhhbmRsZTogbnVtYmVyKTogRXh0SG9zdENvbW1lbnRUaHJlYWQgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RocmVhZHMuZ2V0KGhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdHRoaXMuX3RocmVhZHMuZm9yRWFjaCh2YWx1ZSA9PiB7XG5cdFx0XHRcdHZhbHVlLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzLmZvckVhY2goZGlzcG9zYWJsZSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY29udmVydFRvRFRPQ29tbWVudCh0aHJlYWQ6IEV4dEhvc3RDb21tZW50VGhyZWFkLCB2c2NvZGVDb21tZW50OiB2c2NvZGUuQ29tbWVudCwgY29tbWVudHNNYXA6IE1hcDx2c2NvZGUuQ29tbWVudCwgbnVtYmVyPiwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBDb21tZW50Q2hhbmdlcyB7XG5cdFx0bGV0IGNvbW1lbnRVbmlxdWVJZCA9IGNvbW1lbnRzTWFwLmdldCh2c2NvZGVDb21tZW50KSE7XG5cdFx0aWYgKCFjb21tZW50VW5pcXVlSWQpIHtcblx0XHRcdGNvbW1lbnRVbmlxdWVJZCA9ICsrdGhyZWFkLmNvbW1lbnRIYW5kbGU7XG5cdFx0XHRjb21tZW50c01hcC5zZXQodnNjb2RlQ29tbWVudCwgY29tbWVudFVuaXF1ZUlkKTtcblx0XHR9XG5cblx0XHRpZiAodnNjb2RlQ29tbWVudC5zdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjb21tZW50c0RyYWZ0U3RhdGUnKTtcblx0XHR9XG5cblx0XHRpZiAodnNjb2RlQ29tbWVudC5yZWFjdGlvbnM/LnNvbWUocmVhY3Rpb24gPT4gcmVhY3Rpb24ucmVhY3RvcnMgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NvbW1lbnRSZWFjdG9yJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGU6IHZzY29kZUNvbW1lbnQubW9kZSxcblx0XHRcdGNvbnRleHRWYWx1ZTogdnNjb2RlQ29tbWVudC5jb250ZXh0VmFsdWUsXG5cdFx0XHR1bmlxdWVJZEluVGhyZWFkOiBjb21tZW50VW5pcXVlSWQsXG5cdFx0XHRib2R5OiAodHlwZW9mIHZzY29kZUNvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycpID8gdnNjb2RlQ29tbWVudC5ib2R5IDogZXh0SG9zdFR5cGVDb252ZXJ0ZXIuTWFya2Rvd25TdHJpbmcuZnJvbSh2c2NvZGVDb21tZW50LmJvZHkpLFxuXHRcdFx0dXNlck5hbWU6IHZzY29kZUNvbW1lbnQuYXV0aG9yLm5hbWUsXG5cdFx0XHR1c2VySWNvblBhdGg6IHZzY29kZUNvbW1lbnQuYXV0aG9yLmljb25QYXRoLFxuXHRcdFx0bGFiZWw6IHZzY29kZUNvbW1lbnQubGFiZWwsXG5cdFx0XHRjb21tZW50UmVhY3Rpb25zOiB2c2NvZGVDb21tZW50LnJlYWN0aW9ucyA/IHZzY29kZUNvbW1lbnQucmVhY3Rpb25zLm1hcChyZWFjdGlvbiA9PiBjb252ZXJ0VG9SZWFjdGlvbihyZWFjdGlvbikpIDogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IHZzY29kZUNvbW1lbnQuc3RhdGUsXG5cdFx0XHR0aW1lc3RhbXA6IHZzY29kZUNvbW1lbnQudGltZXN0YW1wPy50b0pTT04oKVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0VG9SZWFjdGlvbihyZWFjdGlvbjogdnNjb2RlLkNvbW1lbnRSZWFjdGlvbik6IGxhbmd1YWdlcy5Db21tZW50UmVhY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogcmVhY3Rpb24ubGFiZWwsXG5cdFx0XHRpY29uUGF0aDogcmVhY3Rpb24uaWNvblBhdGggPyBleHRIb3N0VHlwZUNvbnZlcnRlci5wYXRoT3JVUklUb1VSSShyZWFjdGlvbi5pY29uUGF0aCkgOiB1bmRlZmluZWQsXG5cdFx0XHRjb3VudDogcmVhY3Rpb24uY291bnQsXG5cdFx0XHRoYXNSZWFjdGVkOiByZWFjdGlvbi5hdXRob3JIYXNSZWFjdGVkLFxuXHRcdFx0cmVhY3RvcnM6ICgocmVhY3Rpb24ucmVhY3RvcnMgJiYgKHJlYWN0aW9uLnJlYWN0b3JzLmxlbmd0aCA+IDApICYmICh0eXBlb2YgcmVhY3Rpb24ucmVhY3RvcnNbMF0gIT09ICdzdHJpbmcnKSkgPyAocmVhY3Rpb24ucmVhY3RvcnMgYXMgbGFuZ3VhZ2VzLkNvbW1lbnRBdXRob3JJbmZvcm1hdGlvbltdKS5tYXAocmVhY3RvciA9PiByZWFjdG9yLm5hbWUpIDogcmVhY3Rpb24ucmVhY3RvcnMpIGFzIHN0cmluZ1tdXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRGcm9tUmVhY3Rpb24ocmVhY3Rpb246IGxhbmd1YWdlcy5Db21tZW50UmVhY3Rpb24pOiB2c2NvZGUuQ29tbWVudFJlYWN0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IHJlYWN0aW9uLmxhYmVsIHx8ICcnLFxuXHRcdFx0Y291bnQ6IHJlYWN0aW9uLmNvdW50IHx8IDAsXG5cdFx0XHRpY29uUGF0aDogcmVhY3Rpb24uaWNvblBhdGggPyBVUkkucmV2aXZlKHJlYWN0aW9uLmljb25QYXRoKSA6ICcnLFxuXHRcdFx0YXV0aG9ySGFzUmVhY3RlZDogcmVhY3Rpb24uaGFzUmVhY3RlZCB8fCBmYWxzZSxcblx0XHRcdHJlYWN0b3JzOiByZWFjdGlvbi5yZWFjdG9ycz8ubWFwKHJlYWN0b3IgPT4gKHsgbmFtZTogcmVhY3RvciB9KSlcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY29udmVydFRvQ29sbGFwc2libGVTdGF0ZShraW5kOiB2c2NvZGUuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUgfCB1bmRlZmluZWQpOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUge1xuXHRcdGlmIChraW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0XHRjYXNlIHR5cGVzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQ7XG5cdFx0XHRcdGNhc2UgdHlwZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRUb1N0YXRlKGtpbmQ6IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGUgfCB7IHJlc29sdmVkPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZTsgYXBwbGljYWJpbGl0eT86IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB9IHwgdW5kZWZpbmVkKTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZSB7XG5cdFx0bGV0IHJlc29sdmVkS2luZDogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGtpbmQgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXNvbHZlZEtpbmQgPSBraW5kLnJlc29sdmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvbHZlZEtpbmQgPSBraW5kO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvbHZlZEtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3dpdGNoIChyZXNvbHZlZEtpbmQpIHtcblx0XHRcdFx0Y2FzZSB0eXBlcy5Db21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZDpcblx0XHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkO1xuXHRcdFx0XHRjYXNlIHR5cGVzLkNvbW1lbnRUaHJlYWRTdGF0ZS5SZXNvbHZlZDpcblx0XHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZS5SZXNvbHZlZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxhbmd1YWdlcy5Db21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRUb1JlbGV2YW5jZShraW5kOiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlIHwgeyByZXNvbHZlZD86IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGU7IGFwcGxpY2FiaWxpdHk/OiB2c2NvZGUuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfSB8IHVuZGVmaW5lZCk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB7XG5cdFx0bGV0IGFwcGxpY2FiaWxpdHlLaW5kOiB2c2NvZGUuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBraW5kID09PSAnb2JqZWN0Jykge1xuXHRcdFx0YXBwbGljYWJpbGl0eUtpbmQgPSBraW5kLmFwcGxpY2FiaWxpdHk7XG5cdFx0fVxuXG5cdFx0aWYgKGFwcGxpY2FiaWxpdHlLaW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHN3aXRjaCAoYXBwbGljYWJpbGl0eUtpbmQpIHtcblx0XHRcdFx0Y2FzZSB0eXBlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eS5DdXJyZW50OlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkuQ3VycmVudDtcblx0XHRcdFx0Y2FzZSB0eXBlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eS5PdXRkYXRlZDpcblx0XHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5Lk91dGRhdGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5LkN1cnJlbnQ7XG5cdH1cblxuXHRyZXR1cm4gbmV3IEV4dEhvc3RDb21tZW50c0ltcGwoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBMEI7QUFFbkMsWUFBWSxlQUFlO0FBQzNCLFNBQVMsOEJBQXFEO0FBRTlELFlBQVksMEJBQTBCO0FBQ3RDLFlBQVksV0FBVztBQUV2QixTQUE2QyxtQkFBeUQ7QUFFdEcsU0FBUywrQkFBK0I7QUFTakMsU0FBUyxzQkFBc0IsYUFBMkIsVUFBMkIsV0FBcUU7QUFDaEssUUFBTSxRQUFRLFlBQVksU0FBUyxZQUFZLGtCQUFrQjtBQUVqRSxRQUFNLHVCQUFOLE1BQU0scUJBQXFFO0FBQUEsSUFVMUUsY0FDRTtBQU5GLFdBQVEsc0JBQXFFLG9CQUFJLElBQThDO0FBRS9ILFdBQVEsaUNBQXFGLElBQUksdUJBQW1EO0FBS25KLGVBQVMsMEJBQTBCO0FBQUEsUUFDbEMsaUJBQWlCLFNBQU87QUFDdkIsY0FBSSxPQUFPLElBQUksU0FBUyxhQUFhLG1CQUFtQjtBQUN2RCxrQkFBTSxvQkFBb0IsS0FBSyxvQkFBb0IsSUFBSSxJQUFJLE1BQU07QUFFakUsZ0JBQUksQ0FBQyxtQkFBbUI7QUFDdkIscUJBQU87QUFBQSxZQUNSO0FBRUEsbUJBQU8sa0JBQWtCO0FBQUEsVUFDMUIsV0FBVyxPQUFPLElBQUksU0FBUyxhQUFhLGVBQWU7QUFDMUQsa0JBQU0sMEJBQW1EO0FBQ3pELGtCQUFNLG9CQUFvQixLQUFLLG9CQUFvQixJQUFJLHdCQUF3QixvQkFBb0I7QUFFbkcsZ0JBQUksQ0FBQyxtQkFBbUI7QUFDdkIscUJBQU87QUFBQSxZQUNSO0FBRUEsa0JBQU0sZ0JBQWdCLGtCQUFrQixpQkFBaUIsd0JBQXdCLG1CQUFtQjtBQUVwRyxnQkFBSSxDQUFDLGVBQWU7QUFDbkIscUJBQU87QUFBQSxZQUNSO0FBRUEsbUJBQU8sY0FBYztBQUFBLFVBQ3RCLFdBQVcsUUFBUSxJQUFJLFNBQVMsYUFBYSxzQkFBc0IsSUFBSSxTQUFTLGFBQWEsd0JBQXdCO0FBQ3BILGtCQUFNLG9CQUFvQixLQUFLLG9CQUFvQixJQUFJLElBQUksT0FBTyxvQkFBb0I7QUFFdEYsZ0JBQUksQ0FBQyxtQkFBbUI7QUFDdkIscUJBQU87QUFBQSxZQUNSO0FBRUEsa0JBQU0sZ0JBQWdCLGtCQUFrQixpQkFBaUIsSUFBSSxPQUFPLG1CQUFtQjtBQUV2RixnQkFBSSxDQUFDLGVBQWU7QUFDbkIscUJBQU87QUFBQSxZQUNSO0FBRUEsZ0JBQUksSUFBSSxTQUFTLGFBQWEsdUJBQXVCO0FBQ3BELHFCQUFPLGNBQWM7QUFBQSxZQUN0QjtBQUVBLG1CQUFPO0FBQUEsY0FDTixRQUFRLGNBQWM7QUFBQSxjQUN0QixNQUFNLElBQUk7QUFBQSxZQUNYO0FBQUEsVUFDRCxXQUFXLE9BQU8sSUFBSSxTQUFTLGFBQWEsYUFBYTtBQUN4RCxrQkFBTSxvQkFBb0IsS0FBSyxvQkFBb0IsSUFBSSxJQUFJLE9BQU8sb0JBQW9CO0FBRXRGLGdCQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLHFCQUFPO0FBQUEsWUFDUjtBQUVBLGtCQUFNLGdCQUFnQixrQkFBa0IsaUJBQWlCLElBQUksT0FBTyxtQkFBbUI7QUFFdkYsZ0JBQUksQ0FBQyxlQUFlO0FBQ25CLHFCQUFPO0FBQUEsWUFDUjtBQUVBLGtCQUFNLGtCQUFrQixJQUFJO0FBRTVCLGtCQUFNLFVBQVUsY0FBYyxxQkFBcUIsZUFBZTtBQUVsRSxnQkFBSSxDQUFDLFNBQVM7QUFDYixxQkFBTztBQUFBLFlBQ1I7QUFFQSxtQkFBTztBQUFBLFVBRVIsV0FBVyxPQUFPLElBQUksU0FBUyxhQUFhLG1CQUFtQjtBQUM5RCxrQkFBTSxvQkFBb0IsS0FBSyxvQkFBb0IsSUFBSSxJQUFJLE9BQU8sb0JBQW9CO0FBRXRGLGdCQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLHFCQUFPO0FBQUEsWUFDUjtBQUVBLGtCQUFNLGdCQUFnQixrQkFBa0IsaUJBQWlCLElBQUksT0FBTyxtQkFBbUI7QUFFdkYsZ0JBQUksQ0FBQyxlQUFlO0FBQ25CLHFCQUFPO0FBQUEsWUFDUjtBQUVBLGtCQUFNLE9BQWUsSUFBSTtBQUN6QixrQkFBTSxrQkFBa0IsSUFBSTtBQUU1QixrQkFBTSxVQUFVLGNBQWMscUJBQXFCLGVBQWU7QUFFbEUsZ0JBQUksQ0FBQyxTQUFTO0FBQ2IscUJBQU87QUFBQSxZQUNSO0FBR0EsZ0JBQUksT0FBTyxRQUFRLFNBQVMsVUFBVTtBQUNyQyxzQkFBUSxPQUFPO0FBQUEsWUFDaEIsT0FBTztBQUNOLHNCQUFRLE9BQU8sSUFBSSxNQUFNLGVBQWUsSUFBSTtBQUFBLFlBQzdDO0FBQ0EsbUJBQU87QUFBQSxVQUNSO0FBRUEsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsd0JBQXdCLFdBQWtDLElBQVksT0FBeUM7QUFDOUcsWUFBTSxTQUFTLHFCQUFvQjtBQUNuQyxZQUFNLG9CQUFvQixJQUFJLHlCQUF5QixXQUFXLFFBQVEsSUFBSSxLQUFLO0FBQ25GLFdBQUssb0JBQW9CLElBQUksa0JBQWtCLFFBQVEsaUJBQWlCO0FBRXhFLFlBQU0scUJBQXFCLEtBQUssK0JBQStCLElBQUksVUFBVSxVQUFVLEtBQUssQ0FBQztBQUM3Rix5QkFBbUIsS0FBSyxpQkFBaUI7QUFDekMsV0FBSywrQkFBK0IsSUFBSSxVQUFVLFlBQVksa0JBQWtCO0FBRWhGLGFBQU8sa0JBQWtCO0FBQUEsSUFDMUI7QUFBQSxJQUVBLE1BQU0sNkJBQTZCLHlCQUFpQyxlQUE4QixPQUEyQixVQUFrQztBQUM5SixZQUFNLG9CQUFvQixLQUFLLG9CQUFvQixJQUFJLHVCQUF1QjtBQUU5RSxVQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsTUFDRDtBQUVBLHdCQUFrQiw2QkFBNkIsZUFBZSxPQUFPLFFBQVE7QUFBQSxJQUM5RTtBQUFBLElBRUEsTUFBTSxrQkFBa0Isa0JBQTBCLGFBQXdGO0FBQ3pJLFlBQU0sb0JBQW9CLEtBQUssb0JBQW9CLElBQUksZ0JBQWdCO0FBRXZFLFVBQUksQ0FBQyxtQkFBbUI7QUFDdkI7QUFBQSxNQUNEO0FBRUEsd0JBQWtCLGtCQUFrQixlQUFlLE1BQVM7QUFBQSxJQUM3RDtBQUFBLElBRUEsTUFBTSw2QkFBNkIseUJBQWlDLGNBQXNCLE9BQWU7QUFDeEcsWUFBTSxvQkFBb0IsS0FBSyxvQkFBb0IsSUFBSSx1QkFBdUI7QUFFOUUsVUFBSSxDQUFDLG1CQUFtQjtBQUN2QjtBQUFBLE1BQ0Q7QUFFQSx3QkFBa0IsNkJBQTZCLGNBQWMsS0FBSztBQUFBLElBQ25FO0FBQUEsSUFFQSxxQkFBcUIseUJBQWlDLHFCQUE2QjtBQUNsRixZQUFNLG9CQUFvQixLQUFLLG9CQUFvQixJQUFJLHVCQUF1QjtBQUU5RSx5QkFBbUIscUJBQXFCLG1CQUFtQjtBQUFBLElBQzVEO0FBQUEsSUFFQSxNQUFNLHFCQUFxQix5QkFBaUMscUJBQTZCLFNBQStCO0FBQ3ZILFlBQU0sb0JBQW9CLEtBQUssb0JBQW9CLElBQUksdUJBQXVCO0FBRTlFLHlCQUFtQixxQkFBcUIscUJBQXFCLE9BQU87QUFBQSxJQUNyRTtBQUFBLElBRUEsTUFBTSx5QkFBeUIseUJBQWlDLGVBQThCLE9BQTRGO0FBQ3pMLFlBQU0sb0JBQW9CLEtBQUssb0JBQW9CLElBQUksdUJBQXVCO0FBRTlFLFVBQUksQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IseUJBQXlCO0FBQ3JFLGVBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxNQUNqQztBQUVBLFlBQU0sV0FBVyxNQUFNLFVBQVUsbUJBQW1CLElBQUksT0FBTyxhQUFhLENBQUM7QUFDN0UsYUFBTyxVQUFVLFlBQVk7QUFDNUIsY0FBTSxlQUFlLE1BQU0sa0JBQWtCLHlCQUF5Qix3QkFBd0IsU0FBUyxVQUFVLEtBQUs7QUFDdEgsWUFBSTtBQUNKLFlBQUksTUFBTSxRQUFRLFlBQVksR0FBRztBQUNoQyxtQkFBUztBQUFBLFlBQ1IsUUFBUTtBQUFBLFlBQ1IsY0FBYztBQUFBLFVBQ2Y7QUFBQSxRQUNELFdBQVcsY0FBYztBQUN4QixtQkFBUztBQUFBLFlBQ1IsUUFBUSxhQUFhLFVBQVUsQ0FBQztBQUFBLFlBQ2hDLGNBQWMsYUFBYSxzQkFBc0I7QUFBQSxVQUNsRDtBQUFBLFFBQ0QsT0FBTztBQUNOLG1CQUFTLGdCQUFnQjtBQUFBLFFBQzFCO0FBQ0EsZUFBTztBQUFBLE1BQ1IsQ0FBQyxFQUFFLEtBQUssWUFBVTtBQUNqQixZQUFJLGtCQUEyRTtBQUMvRSxZQUFJLFFBQVE7QUFDWCw0QkFBa0I7QUFBQSxZQUNqQixRQUFRLE9BQU8sT0FBTyxJQUFJLE9BQUsscUJBQXFCLE1BQU0sS0FBSyxDQUFDLENBQUM7QUFBQSxZQUNqRSxjQUFjLE9BQU87QUFBQSxVQUN0QjtBQUFBLFFBQ0Q7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsZ0JBQWdCLHlCQUFpQyxjQUFzQixLQUFvQixTQUE0QixVQUFvRDtBQUMxSyxZQUFNLG9CQUFvQixLQUFLLG9CQUFvQixJQUFJLHVCQUF1QjtBQUU5RSxVQUFJLENBQUMscUJBQXFCLENBQUMsa0JBQWtCLGlCQUFpQjtBQUM3RCxlQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsTUFDakM7QUFFQSxhQUFPLFVBQVUsTUFBTTtBQUN0QixjQUFNLGdCQUFnQixrQkFBa0IsaUJBQWlCLFlBQVk7QUFDckUsWUFBSSxlQUFlO0FBQ2xCLGdCQUFNLGdCQUFnQixjQUFjLHFCQUFxQixRQUFRLGdCQUFnQjtBQUVqRixjQUFJLHNCQUFzQixVQUFhLGVBQWU7QUFDckQsZ0JBQUksa0JBQWtCLGlCQUFpQjtBQUN0QyxxQkFBTyxrQkFBa0IsZ0JBQWdCLGVBQWUsb0JBQW9CLFFBQVEsQ0FBQztBQUFBLFlBQ3RGO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxlQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBcE9DLEVBRksscUJBRVUsYUFBYTtBQUY3QixNQUFNLHNCQUFOO0FBbVBBLFFBQU0sd0JBQU4sTUFBTSxzQkFBc0Q7QUFBQSxJQXdJM0QsWUFDQyxxQkFDUSwwQkFDQSxLQUNBLE1BQ0EsUUFDQSxXQUNRLHNCQUNSLGFBQ1IsVUFDQztBQVJPO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDUTtBQUNSO0FBOUlULFdBQVMsU0FBUyxzQkFBcUI7QUFDdkMsV0FBTyxnQkFBd0I7QUFFL0IsV0FBUSxnQkFBMkMsdUJBQU8sT0FBTyxJQUFJO0FBc0JyRSxXQUFpQiw0QkFBNEIsSUFBSSxRQUFjO0FBQy9ELFdBQVMsMkJBQTJCLEtBQUssMEJBQTBCO0FBY25FLFdBQVEsWUFBdUQ7QUF3Ri9ELFdBQVEsZUFBNEMsb0JBQUksSUFBNEI7QUFFcEYsV0FBaUIsMEJBQTBCLElBQUksa0JBQW1DO0FBZWpGLFdBQUssd0JBQXdCLFFBQVEsSUFBSSxnQkFBZ0I7QUFFekQsVUFBSSxLQUFLLFFBQVEsUUFBVztBQUMzQixhQUFLLE1BQU0sR0FBRyxtQkFBbUIsSUFBSSxLQUFLLE1BQU07QUFBQSxNQUNqRDtBQUVBLFlBQU07QUFBQSxRQUNMO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxxQkFBcUIsTUFBTSxLQUFLLEtBQUssTUFBTTtBQUFBLFFBQzNDLEtBQUssVUFBVSxJQUFJLFNBQU8sb0JBQW9CLE1BQU0sS0FBSyxLQUFLLGNBQWMsS0FBSyxvQkFBb0IsQ0FBQztBQUFBLFFBQ3RHLHFCQUFxQjtBQUFBLFFBQ3JCLEtBQUs7QUFBQSxRQUNMO0FBQUEsTUFDRDtBQUVBLFdBQUssb0JBQW9CLENBQUM7QUFDMUIsV0FBSyxhQUFhO0FBRWxCLFdBQUssa0JBQWtCLEtBQUssS0FBSyx5QkFBeUIsTUFBTTtBQUMvRCxhQUFLLDhCQUE4QjtBQUFBLE1BQ3BDLENBQUMsQ0FBQztBQUVGLFdBQUssa0JBQWtCLEtBQUs7QUFBQSxRQUMzQixTQUFTLE1BQU07QUFDZCxnQkFBTTtBQUFBLFlBQ0w7QUFBQSxZQUNBLEtBQUs7QUFBQSxVQUNOO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sT0FBTztBQUNiLFdBQUssUUFBUTtBQUFBLFFBQ1osSUFBSSxNQUFNO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQUs7QUFBQSxRQUM3QixJQUFJLFFBQVE7QUFBRSxpQkFBTyxLQUFLO0FBQUEsUUFBTztBQUFBLFFBQ2pDLElBQUksTUFBTSxPQUFpQztBQUFFLGVBQUssUUFBUTtBQUFBLFFBQU87QUFBQSxRQUNqRSxJQUFJLFdBQVc7QUFBRSxpQkFBTyxLQUFLO0FBQUEsUUFBVTtBQUFBLFFBQ3ZDLElBQUksU0FBUyxPQUF5QjtBQUFFLGVBQUssV0FBVztBQUFBLFFBQU87QUFBQSxRQUMvRCxJQUFJLG1CQUFtQjtBQUFFLGlCQUFPLEtBQUs7QUFBQSxRQUFrQjtBQUFBLFFBQ3ZELElBQUksaUJBQWlCLE9BQTZDO0FBQUUsZUFBSyxtQkFBbUI7QUFBQSxRQUFPO0FBQUEsUUFDbkcsSUFBSSxXQUFXO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQVU7QUFBQSxRQUN2QyxJQUFJLFNBQVMsT0FBa0Q7QUFBRSxlQUFLLFdBQVc7QUFBQSxRQUFPO0FBQUEsUUFDeEYsSUFBSSxlQUFlO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQWM7QUFBQSxRQUMvQyxJQUFJLGFBQWEsT0FBMkI7QUFBRSxlQUFLLGVBQWU7QUFBQSxRQUFPO0FBQUEsUUFDekUsSUFBSSxRQUFRO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQU87QUFBQSxRQUNqQyxJQUFJLE1BQU0sT0FBMkI7QUFBRSxlQUFLLFFBQVE7QUFBQSxRQUFPO0FBQUEsUUFDM0QsSUFBSSxRQUE2STtBQUFFLGlCQUFPLEtBQUs7QUFBQSxRQUFPO0FBQUEsUUFDdEssSUFBSSxNQUFNLE9BQWdJO0FBQUUsZUFBSyxRQUFRO0FBQUEsUUFBTztBQUFBLFFBQ2hLLFFBQVEsQ0FBQyxTQUE4RCxZQUFnRCxLQUFLLE9BQU8sU0FBUyxPQUFPO0FBQUEsUUFDbkosTUFBTSxNQUFNLEtBQUssS0FBSztBQUFBLFFBQ3RCLFNBQVMsTUFBTTtBQUNkLGVBQUssUUFBUTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBck1BLElBQUksU0FBUyxJQUFZO0FBQ3hCLFdBQUssTUFBTTtBQUFBLElBQ1o7QUFBQSxJQUVBLElBQUksV0FBbUI7QUFDdEIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBRUEsSUFBSSxLQUFhO0FBQ2hCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLElBQUksV0FBdUI7QUFDMUIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBRUEsSUFBSSxNQUFrQjtBQUNyQixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFLQSxJQUFJLE1BQU0sT0FBaUM7QUFDMUMsVUFBTSxVQUFVLFlBQWdCLEtBQUssV0FBVyxZQUFnQixDQUFDLFNBQVMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxNQUFNLFFBQVEsS0FBSyxNQUFNLElBQUk7QUFDdkgsYUFBSyxTQUFTO0FBQ2QsYUFBSyxjQUFjLFFBQVE7QUFDM0IsYUFBSywwQkFBMEIsS0FBSztBQUFBLE1BQ3JDO0FBQUEsSUFDRDtBQUFBLElBRUEsSUFBSSxRQUFrQztBQUNyQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFJQSxJQUFJLFNBQVMsT0FBa0Q7QUFDOUQsVUFBSSxLQUFLLGNBQWMsT0FBTztBQUM3QixhQUFLLFlBQVk7QUFDakIsYUFBSyxjQUFjLFdBQVc7QUFDOUIsYUFBSywwQkFBMEIsS0FBSztBQUFBLE1BQ3JDO0FBQUEsSUFDRDtBQUFBLElBQ0EsSUFBSSxXQUFXO0FBQ2QsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBSUEsSUFBSSxRQUE0QjtBQUMvQixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFFQSxJQUFJLE1BQU0sT0FBMkI7QUFDcEMsV0FBSyxTQUFTO0FBQ2QsV0FBSyxjQUFjLFFBQVE7QUFDM0IsV0FBSywwQkFBMEIsS0FBSztBQUFBLElBQ3JDO0FBQUEsSUFJQSxJQUFJLGVBQW1DO0FBQ3RDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLElBQUksYUFBYSxTQUE2QjtBQUM3QyxXQUFLLGdCQUFnQjtBQUNyQixXQUFLLGNBQWMsZUFBZTtBQUNsQyxXQUFLLDBCQUEwQixLQUFLO0FBQUEsSUFDckM7QUFBQSxJQUVBLElBQUksV0FBNkI7QUFDaEMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBRUEsSUFBSSxTQUFTLGFBQStCO0FBQzNDLFdBQUssWUFBWTtBQUNqQixXQUFLLGNBQWMsV0FBVztBQUM5QixXQUFLLDBCQUEwQixLQUFLO0FBQUEsSUFDckM7QUFBQSxJQUlBLElBQUksbUJBQXlEO0FBQzVELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLElBQUksaUJBQWlCLFVBQWdEO0FBQ3BFLFVBQUksS0FBSyxtQkFBbUIsVUFBVTtBQUNyQztBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQjtBQUN0QixXQUFLLGNBQWMsbUJBQW1CO0FBQ3RDLFdBQUssMEJBQTBCLEtBQUs7QUFBQSxJQUNyQztBQUFBLElBSUEsSUFBSSxRQUE2STtBQUNoSixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFFQSxJQUFJLE1BQU0sVUFBbUk7QUFDNUksV0FBSyxTQUFTO0FBQ2QsVUFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQyxnQ0FBd0IsS0FBSyxzQkFBc0IsNEJBQTRCO0FBQy9FLGFBQUssY0FBYyxRQUFRLFNBQVM7QUFDcEMsYUFBSyxjQUFjLGdCQUFnQixTQUFTO0FBQUEsTUFDN0MsT0FBTztBQUNOLGFBQUssY0FBYyxRQUFRO0FBQUEsTUFDNUI7QUFDQSxXQUFLLDBCQUEwQixLQUFLO0FBQUEsSUFDckM7QUFBQSxJQU1BLElBQVcsYUFBc0I7QUFDaEMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBOEVRLG1CQUFtQjtBQUMxQixVQUFJLEtBQUssYUFBYTtBQUNyQixhQUFLLGNBQWM7QUFDbkIsYUFBSyxjQUFjLGFBQWE7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFBQSxJQUdBLGdDQUFzQztBQUNyQyxVQUFJLEtBQUssWUFBWTtBQUNwQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQjtBQUV0QixVQUFJLENBQUMsS0FBSyx3QkFBd0IsT0FBTztBQUN4QyxhQUFLLHdCQUF3QixRQUFRLElBQUksZ0JBQWdCO0FBQUEsTUFDMUQ7QUFFQSxZQUFNLFdBQVcsQ0FBQyxVQUNqQixPQUFPLFVBQVUsZUFBZSxLQUFLLEtBQUssZUFBZSxLQUFLO0FBRS9ELFlBQU0seUJBQStDLENBQUM7QUFDdEQsVUFBSSxTQUFTLE9BQU8sR0FBRztBQUN0QiwrQkFBdUIsUUFBUSxxQkFBcUIsTUFBTSxLQUFLLEtBQUssTUFBTTtBQUFBLE1BQzNFO0FBQ0EsVUFBSSxTQUFTLE9BQU8sR0FBRztBQUN0QiwrQkFBdUIsUUFBUSxLQUFLO0FBQUEsTUFDckM7QUFDQSxVQUFJLFNBQVMsY0FBYyxHQUFHO0FBSzdCLCtCQUF1QixlQUFlLEtBQUssZ0JBQWdCO0FBQUEsTUFDNUQ7QUFDQSxVQUFJLFNBQVMsVUFBVSxHQUFHO0FBQ3pCLCtCQUF1QixXQUN0QixLQUFLLFVBQVUsSUFBSSxTQUFPLG9CQUFvQixNQUFNLEtBQUssS0FBSyxjQUFjLEtBQUssb0JBQW9CLENBQUM7QUFBQSxNQUN4RztBQUNBLFVBQUksU0FBUyxrQkFBa0IsR0FBRztBQUNqQywrQkFBdUIsZ0JBQWdCLDBCQUEwQixLQUFLLGNBQWM7QUFBQSxNQUNyRjtBQUNBLFVBQUksU0FBUyxVQUFVLEdBQUc7QUFDekIsK0JBQXVCLFdBQVcsS0FBSztBQUFBLE1BQ3hDO0FBQ0EsVUFBSSxTQUFTLE9BQU8sR0FBRztBQUN0QiwrQkFBdUIsUUFBUSxlQUFlLEtBQUssTUFBTTtBQUFBLE1BQzFEO0FBQ0EsVUFBSSxTQUFTLGVBQWUsR0FBRztBQUM5QiwrQkFBdUIsZ0JBQWdCLG1CQUFtQixLQUFLLE1BQU07QUFBQSxNQUN0RTtBQUNBLFVBQUksU0FBUyxZQUFZLEdBQUc7QUFDM0IsK0JBQXVCLGFBQWEsS0FBSztBQUFBLE1BQzFDO0FBQ0EsV0FBSyxnQkFBZ0IsQ0FBQztBQUV0QixZQUFNO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFFQSxxQkFBcUIsVUFBOEM7QUFDbEUsaUJBQVcsT0FBTyxLQUFLLGNBQWM7QUFDcEMsY0FBTSxVQUFVLElBQUksQ0FBQztBQUNyQixjQUFNLEtBQUssSUFBSSxDQUFDO0FBQ2hCLFlBQUksYUFBYSxJQUFJO0FBQ3BCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQTtBQUFBLElBQ0Q7QUFBQSxJQUVBLE1BQU0sT0FBTyxrQkFBdUUsU0FBNEQ7QUFDL0ksOEJBQXdCLEtBQUssc0JBQXNCLGVBQWU7QUFDbEUsVUFBSTtBQUNKLFVBQUksb0JBQXFCLGlCQUFvQyxTQUFTLFFBQVc7QUFDaEYsa0JBQVU7QUFBQSxNQUNYLE9BQU87QUFDTixrQkFBVSxXQUFXO0FBQUEsTUFDdEI7QUFDQSxVQUFJLGtCQUFrQixVQUFVLEtBQUssYUFBYSxJQUFJLE9BQU8sSUFBSTtBQUNqRSwwQkFBb0IsS0FBSyxhQUFhLElBQUksS0FBSyxVQUFVLENBQUMsQ0FBQztBQUMzRCxVQUFJLGdCQUF5QjtBQUM3QixVQUFJLGFBQXNCO0FBQzFCLFVBQUksU0FBUyxVQUFVLE1BQU0sbUJBQW1CLE9BQU87QUFDdEQscUJBQWE7QUFDYix3QkFBZ0I7QUFBQSxNQUNqQixXQUFXLFNBQVMsVUFBVSxNQUFNLG1CQUFtQixTQUFTO0FBQy9ELHdCQUFnQjtBQUFBLE1BQ2pCO0FBQ0EsYUFBTyxNQUFNLHFCQUFxQixLQUFLLDBCQUEwQixLQUFLLFFBQVEsaUJBQWlCLEVBQUUsZUFBZSxXQUFXLENBQUM7QUFBQSxJQUM3SDtBQUFBLElBRUEsTUFBTSxPQUFzQjtBQUMzQixhQUFPLE1BQU0sbUJBQW1CLEtBQUssMEJBQTBCLEtBQUssTUFBTTtBQUFBLElBQzNFO0FBQUEsSUFFQSxVQUFVO0FBQ1QsV0FBSyxhQUFhO0FBQ2xCLFdBQUssd0JBQXdCLFFBQVE7QUFDckMsV0FBSywwQkFBMEIsUUFBUTtBQUN2QyxXQUFLLGtCQUFrQixRQUFRLGdCQUFjLFdBQVcsUUFBUSxDQUFDO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBelRDLEVBREssc0JBQ1UsY0FBc0I7QUFxTnJDO0FBQUEsSUFEQyxTQUFTLEdBQUc7QUFBQSxLQXJOUixzQkFzTkw7QUF0TkQsTUFBTSx1QkFBTjtBQUFBLEVBOFRBLE1BQU0seUJBQXlCO0FBQUEsSUFxRTlCLFlBQ1MsWUFDQSxTQUNBLEtBQ0EsUUFDUDtBQUpPO0FBQ0E7QUFDQTtBQUNBO0FBNURULFdBQVEsV0FBOEMsb0JBQUksSUFBa0M7QUE4RDNGLFlBQU0sMkJBQTJCLEtBQUssUUFBUSxLQUFLLFFBQVEsS0FBSyxXQUFXLFdBQVcsS0FBSztBQUUzRixZQUFNLE9BQU87QUFDYixXQUFLLFFBQVEsT0FBTyxPQUFPO0FBQUEsUUFDMUIsSUFBSSxLQUFLO0FBQUEsUUFDVCxPQUFPLEtBQUs7QUFBQSxRQUNaLElBQUksVUFBVTtBQUFFLGlCQUFPLEtBQUs7QUFBQSxRQUFTO0FBQUEsUUFDckMsSUFBSSxRQUFRLFNBQTRDO0FBQUUsZUFBSyxVQUFVO0FBQUEsUUFBUztBQUFBLFFBQ2xGLElBQUksMEJBQXNFO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQXlCO0FBQUEsUUFDakgsSUFBSSx3QkFBd0IseUJBQXFFO0FBQUUsZUFBSywwQkFBMEI7QUFBQSxRQUF5QjtBQUFBLFFBQzNKLElBQUksa0JBQStDO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQWlCO0FBQUEsUUFDbEYsSUFBSSxnQkFBZ0IsU0FBc0M7QUFBRSxlQUFLLGtCQUFrQjtBQUFBLFFBQVM7QUFBQTtBQUFBLFFBRTVGLElBQUksc0JBQXdEO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQXlEO0FBQUEsUUFDbkksb0JBQW9CLEtBQWlCLE9BQWlDLFVBQWtEO0FBQ3ZILGlCQUFPLEtBQUssb0JBQW9CLEtBQUssT0FBTyxRQUFRLEVBQUU7QUFBQSxRQUN2RDtBQUFBLFFBQ0EsU0FBUyxNQUFNO0FBQUUsZUFBSyxRQUFRO0FBQUEsUUFBRztBQUFBLE1BQ2xDLENBQUM7QUFFRCxXQUFLLG9CQUFvQixDQUFDO0FBQzFCLFdBQUssa0JBQWtCLEtBQUs7QUFBQSxRQUMzQixTQUFTLE1BQU07QUFDZCxnQkFBTSw2QkFBNkIsS0FBSyxNQUFNO0FBQUEsUUFDL0M7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsSUFwR0EsSUFBSSxLQUFhO0FBQ2hCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLElBQUksUUFBZ0I7QUFDbkIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBRUEsSUFBVyxTQUFpQjtBQUMzQixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFLQSxJQUFJLDBCQUFzRTtBQUN6RSxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFFQSxJQUFJLHdCQUF3QixVQUFzRDtBQUNqRixXQUFLLDJCQUEyQjtBQUNoQyxVQUFJLFVBQVUsZUFBZTtBQUM1QixnQ0FBd0IsS0FBSyxZQUFZLHFCQUFxQjtBQUFBLE1BQy9EO0FBQ0EsWUFBTSx3QkFBd0IsS0FBSyxRQUFRLFVBQVUsYUFBYTtBQUFBLElBQ25FO0FBQUEsSUFJQSxJQUFJLGtCQUErQztBQUNsRCxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFFQSxJQUFJLGdCQUFnQixTQUFzQztBQUN6RCxXQUFLLG1CQUFtQjtBQUV4QixZQUFNLGlDQUFpQyxLQUFLLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUFBLElBQ25GO0FBQUEsSUFJQSxJQUFJLFVBQVU7QUFDYixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsSUFFQSxJQUFJLFFBQVEsU0FBK0M7QUFDMUQsV0FBSyxXQUFXO0FBRWhCLFlBQU0saUNBQWlDLEtBQUssUUFBUSxFQUFFLFNBQVMsS0FBSyxTQUFTLENBQUM7QUFBQSxJQUMvRTtBQUFBLElBSUEsSUFBSSxnQkFBNEM7QUFDL0MsOEJBQXdCLEtBQUssWUFBWSxlQUFlO0FBQ3hELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUlBLElBQUksc0JBQXlEO0FBQzVELDhCQUF3QixLQUFLLFlBQVksZUFBZTtBQUN4RCxhQUFPLEtBQUssZUFBZTtBQUFBLElBQzVCO0FBQUEsSUF1Q0Esb0JBQW9CLFVBQXNCLE9BQWlDLFVBQWtEO0FBQzVILFlBQU0sZ0JBQWdCLElBQUkscUJBQXFCLEtBQUssSUFBSSxLQUFLLFFBQVEsUUFBVyxVQUFVLE9BQU8sVUFBVSxLQUFLLFlBQVksS0FBSztBQUNqSSxXQUFLLFNBQVMsSUFBSSxjQUFjLFFBQVEsYUFBYTtBQUNyRCxhQUFPO0FBQUEsSUFDUjtBQUFBLElBRUEsa0JBQWtCLGFBQXFGO0FBQ3RHLFVBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQUssaUJBQWlCO0FBQ3RCLGFBQUssZ0JBQWdCO0FBQ3JCO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxLQUFLLFNBQVMsSUFBSSxZQUFZLG1CQUFtQjtBQUNoRSxVQUFJLFFBQVE7QUFDWCxhQUFLLGlCQUFpQixZQUFZLG1CQUFtQixPQUFPLHFCQUFxQixZQUFZLGdCQUFnQixJQUFJO0FBQ2pILGFBQUssZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsSUFFQSw2QkFBNkIsZUFBOEIsT0FBMkIsVUFBeUM7QUFDOUgsWUFBTSxnQkFBZ0IsSUFBSSxxQkFBcUIsS0FBSyxJQUFJLEtBQUssUUFBUSxRQUFXLElBQUksT0FBTyxhQUFhLEdBQUcscUJBQXFCLE1BQU0sR0FBRyxLQUFLLEdBQUcsQ0FBQyxHQUFHLEtBQUssWUFBWSxNQUFNLFFBQVE7QUFDcEwsb0JBQWMsbUJBQW1CLFVBQVUsOEJBQThCO0FBQ3pFLFdBQUssU0FBUyxJQUFJLGNBQWMsUUFBUSxhQUFhO0FBQ3JELGFBQU87QUFBQSxJQUNSO0FBQUEsSUFFQSw2QkFBNkIsY0FBc0IsT0FBcUI7QUFDdkUsWUFBTSxTQUFTLEtBQUssU0FBUyxJQUFJLFlBQVk7QUFDN0MsVUFBSSxRQUFRO0FBQ1gsZUFBTyxRQUFRLHFCQUFxQixNQUFNLEdBQUcsS0FBSztBQUFBLE1BQ25EO0FBQUEsSUFDRDtBQUFBLElBRUEscUJBQXFCLGNBQXNCLFNBQXFDO0FBQy9FLFlBQU0sU0FBUyxLQUFLLFNBQVMsSUFBSSxZQUFZO0FBQzdDLFVBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxNQUNEO0FBRUEsWUFBTSxXQUFXLENBQUMsVUFDakIsT0FBTyxVQUFVLGVBQWUsS0FBSyxTQUFTLEtBQUs7QUFFcEQsVUFBSSxTQUFTLGVBQWUsR0FBRztBQUM5QixlQUFPLG1CQUFtQiwwQkFBMEIsUUFBUSxhQUFhO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBQUEsSUFFQSxxQkFBcUIsY0FBNEI7QUFDaEQsWUFBTSxTQUFTLEtBQUssU0FBUyxJQUFJLFlBQVk7QUFFN0MsY0FBUSxRQUFRO0FBRWhCLFdBQUssU0FBUyxPQUFPLFlBQVk7QUFBQSxJQUNsQztBQUFBLElBRUEsaUJBQWlCLFFBQWtEO0FBQ2xFLGFBQU8sS0FBSyxTQUFTLElBQUksTUFBTTtBQUFBLElBQ2hDO0FBQUEsSUFFQSxVQUFnQjtBQUNmLFdBQUssU0FBUyxRQUFRLFdBQVM7QUFDOUIsY0FBTSxRQUFRO0FBQUEsTUFDZixDQUFDO0FBRUQsV0FBSyxrQkFBa0IsUUFBUSxnQkFBYyxXQUFXLFFBQVEsQ0FBQztBQUFBLElBQ2xFO0FBQUEsRUFDRDtBQUVBLFdBQVMsb0JBQW9CLFFBQThCLGVBQStCLGFBQTBDLFdBQWtEO0FBQ3JMLFFBQUksa0JBQWtCLFlBQVksSUFBSSxhQUFhO0FBQ25ELFFBQUksQ0FBQyxpQkFBaUI7QUFDckIsd0JBQWtCLEVBQUUsT0FBTztBQUMzQixrQkFBWSxJQUFJLGVBQWUsZUFBZTtBQUFBLElBQy9DO0FBRUEsUUFBSSxjQUFjLFVBQVUsUUFBVztBQUN0Qyw4QkFBd0IsV0FBVyxvQkFBb0I7QUFBQSxJQUN4RDtBQUVBLFFBQUksY0FBYyxXQUFXLEtBQUssY0FBWSxTQUFTLGFBQWEsTUFBUyxHQUFHO0FBQy9FLDhCQUF3QixXQUFXLGdCQUFnQjtBQUFBLElBQ3BEO0FBRUEsV0FBTztBQUFBLE1BQ04sTUFBTSxjQUFjO0FBQUEsTUFDcEIsY0FBYyxjQUFjO0FBQUEsTUFDNUIsa0JBQWtCO0FBQUEsTUFDbEIsTUFBTyxPQUFPLGNBQWMsU0FBUyxXQUFZLGNBQWMsT0FBTyxxQkFBcUIsZUFBZSxLQUFLLGNBQWMsSUFBSTtBQUFBLE1BQ2pJLFVBQVUsY0FBYyxPQUFPO0FBQUEsTUFDL0IsY0FBYyxjQUFjLE9BQU87QUFBQSxNQUNuQyxPQUFPLGNBQWM7QUFBQSxNQUNyQixrQkFBa0IsY0FBYyxZQUFZLGNBQWMsVUFBVSxJQUFJLGNBQVksa0JBQWtCLFFBQVEsQ0FBQyxJQUFJO0FBQUEsTUFDbkgsT0FBTyxjQUFjO0FBQUEsTUFDckIsV0FBVyxjQUFjLFdBQVcsT0FBTztBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUVBLFdBQVMsa0JBQWtCLFVBQTZEO0FBQ3ZGLFdBQU87QUFBQSxNQUNOLE9BQU8sU0FBUztBQUFBLE1BQ2hCLFVBQVUsU0FBUyxXQUFXLHFCQUFxQixlQUFlLFNBQVMsUUFBUSxJQUFJO0FBQUEsTUFDdkYsT0FBTyxTQUFTO0FBQUEsTUFDaEIsWUFBWSxTQUFTO0FBQUEsTUFDckIsVUFBWSxTQUFTLFlBQWEsU0FBUyxTQUFTLFNBQVMsS0FBTyxPQUFPLFNBQVMsU0FBUyxDQUFDLE1BQU0sV0FBYyxTQUFTLFNBQWtELElBQUksYUFBVyxRQUFRLElBQUksSUFBSSxTQUFTO0FBQUEsSUFDdE47QUFBQSxFQUNEO0FBRUEsV0FBUyxvQkFBb0IsVUFBNkQ7QUFDekYsV0FBTztBQUFBLE1BQ04sT0FBTyxTQUFTLFNBQVM7QUFBQSxNQUN6QixPQUFPLFNBQVMsU0FBUztBQUFBLE1BQ3pCLFVBQVUsU0FBUyxXQUFXLElBQUksT0FBTyxTQUFTLFFBQVEsSUFBSTtBQUFBLE1BQzlELGtCQUFrQixTQUFTLGNBQWM7QUFBQSxNQUN6QyxVQUFVLFNBQVMsVUFBVSxJQUFJLGNBQVksRUFBRSxNQUFNLFFBQVEsRUFBRTtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUVBLFdBQVMsMEJBQTBCLE1BQWlHO0FBQ25JLFFBQUksU0FBUyxRQUFXO0FBQ3ZCLGNBQVEsTUFBTTtBQUFBLFFBQ2IsS0FBSyxNQUFNLDhCQUE4QjtBQUN4QyxpQkFBTyxVQUFVLDhCQUE4QjtBQUFBLFFBQ2hELEtBQUssTUFBTSw4QkFBOEI7QUFDeEMsaUJBQU8sVUFBVSw4QkFBOEI7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLFVBQVUsOEJBQThCO0FBQUEsRUFDaEQ7QUFFQSxXQUFTLGVBQWUsTUFBeUs7QUFDaE0sUUFBSTtBQUNKLFFBQUksT0FBTyxTQUFTLFVBQVU7QUFDN0IscUJBQWUsS0FBSztBQUFBLElBQ3JCLE9BQU87QUFDTixxQkFBZTtBQUFBLElBQ2hCO0FBRUEsUUFBSSxpQkFBaUIsUUFBVztBQUMvQixjQUFRLGNBQWM7QUFBQSxRQUNyQixLQUFLLE1BQU0sbUJBQW1CO0FBQzdCLGlCQUFPLFVBQVUsbUJBQW1CO0FBQUEsUUFDckMsS0FBSyxNQUFNLG1CQUFtQjtBQUM3QixpQkFBTyxVQUFVLG1CQUFtQjtBQUFBLE1BQ3RDO0FBQUEsSUFDRDtBQUNBLFdBQU8sVUFBVSxtQkFBbUI7QUFBQSxFQUNyQztBQUVBLFdBQVMsbUJBQW1CLE1BQWlMO0FBQzVNLFFBQUksb0JBQW1FO0FBQ3ZFLFFBQUksT0FBTyxTQUFTLFVBQVU7QUFDN0IsMEJBQW9CLEtBQUs7QUFBQSxJQUMxQjtBQUVBLFFBQUksc0JBQXNCLFFBQVc7QUFDcEMsY0FBUSxtQkFBbUI7QUFBQSxRQUMxQixLQUFLLE1BQU0sMkJBQTJCO0FBQ3JDLGlCQUFPLFVBQVUsMkJBQTJCO0FBQUEsUUFDN0MsS0FBSyxNQUFNLDJCQUEyQjtBQUNyQyxpQkFBTyxVQUFVLDJCQUEyQjtBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUNBLFdBQU8sVUFBVSwyQkFBMkI7QUFBQSxFQUM3QztBQUVBLFNBQU8sSUFBSSxvQkFBb0I7QUFDaEM7IiwKICAibmFtZXMiOiBbXQp9Cg==
