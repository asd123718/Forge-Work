import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { emptyProgressRunner } from "../../../../platform/progress/common/progress.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
class EditorProgressIndicator extends Disposable {
  constructor(progressBar, group) {
    super();
    this.progressBar = progressBar;
    this.group = group;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_ACTIVE || e.kind === GroupModelChangeKind.EDITOR_CLOSE && this.group.isEmpty) {
        this.progressBar.stop().hide();
      }
    }));
  }
  show(infiniteOrTotal, delay) {
    if (this.group.isEmpty) {
      return emptyProgressRunner;
    }
    if (infiniteOrTotal === true) {
      return this.doShow(true, delay);
    }
    return this.doShow(infiniteOrTotal, delay);
  }
  doShow(infiniteOrTotal, delay) {
    if (typeof infiniteOrTotal === "boolean") {
      this.progressBar.infinite().show(delay);
    } else {
      this.progressBar.total(infiniteOrTotal).show(delay);
    }
    return {
      total: (total) => {
        this.progressBar.total(total);
      },
      worked: (worked) => {
        if (this.progressBar.hasTotal()) {
          this.progressBar.worked(worked);
        } else {
          this.progressBar.infinite().show();
        }
      },
      done: () => {
        this.progressBar.stop().hide();
      }
    };
  }
  async showWhile(promise, delay) {
    if (this.group.isEmpty) {
      try {
        await promise;
      } catch (error) {
      }
    }
    return this.doShowWhile(promise, delay);
  }
  async doShowWhile(promise, delay) {
    try {
      this.progressBar.infinite().show(delay);
      await promise;
    } catch (error) {
    } finally {
      this.progressBar.stop().hide();
    }
  }
}
var ProgressIndicatorState;
((ProgressIndicatorState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["None"] = 0] = "None";
    Type2[Type2["Done"] = 1] = "Done";
    Type2[Type2["Infinite"] = 2] = "Infinite";
    Type2[Type2["While"] = 3] = "While";
    Type2[Type2["Work"] = 4] = "Work";
  })(Type = ProgressIndicatorState2.Type || (ProgressIndicatorState2.Type = {}));
  ProgressIndicatorState2.None = { type: 0 /* None */ };
  ProgressIndicatorState2.Done = { type: 1 /* Done */ };
  ProgressIndicatorState2.Infinite = { type: 2 /* Infinite */ };
  class While {
    constructor(whilePromise, whileStart, whileDelay) {
      this.whilePromise = whilePromise;
      this.whileStart = whileStart;
      this.whileDelay = whileDelay;
      this.type = 3 /* While */;
    }
  }
  ProgressIndicatorState2.While = While;
  class Work {
    constructor(total, worked) {
      this.total = total;
      this.worked = worked;
      this.type = 4 /* Work */;
    }
  }
  ProgressIndicatorState2.Work = Work;
})(ProgressIndicatorState || (ProgressIndicatorState = {}));
class ScopedProgressIndicator extends Disposable {
  constructor(progressBar, scope) {
    super();
    this.progressBar = progressBar;
    this.scope = scope;
    this.progressState = ProgressIndicatorState.None;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.scope.onDidChangeActive(() => {
      if (this.scope.isActive) {
        this.onDidScopeActivate();
      } else {
        this.onDidScopeDeactivate();
      }
    }));
  }
  onDidScopeActivate() {
    if (this.progressState.type === ProgressIndicatorState.Done.type) {
      return;
    }
    if (this.progressState.type === 3 /* While */) {
      let delay;
      if (this.progressState.whileDelay > 0) {
        const remainingDelay = this.progressState.whileDelay - (Date.now() - this.progressState.whileStart);
        if (remainingDelay > 0) {
          delay = remainingDelay;
        }
      }
      this.doShowWhile(delay);
    } else if (this.progressState.type === 2 /* Infinite */) {
      this.progressBar.infinite().show();
    } else if (this.progressState.type === 4 /* Work */) {
      if (this.progressState.total) {
        this.progressBar.total(this.progressState.total).show();
      }
      if (this.progressState.worked) {
        this.progressBar.worked(this.progressState.worked).show();
      }
    }
  }
  onDidScopeDeactivate() {
    this.progressBar.stop().hide();
  }
  show(infiniteOrTotal, delay) {
    if (typeof infiniteOrTotal === "boolean") {
      this.progressState = ProgressIndicatorState.Infinite;
    } else {
      this.progressState = new ProgressIndicatorState.Work(infiniteOrTotal, void 0);
    }
    if (this.scope.isActive) {
      if (this.progressState.type === 2 /* Infinite */) {
        this.progressBar.infinite().show(delay);
      } else if (this.progressState.type === 4 /* Work */ && typeof this.progressState.total === "number") {
        this.progressBar.total(this.progressState.total).show(delay);
      }
    }
    return {
      total: (total) => {
        this.progressState = new ProgressIndicatorState.Work(
          total,
          this.progressState.type === 4 /* Work */ ? this.progressState.worked : void 0
        );
        if (this.scope.isActive) {
          this.progressBar.total(total);
        }
      },
      worked: (worked) => {
        if (!this.scope.isActive || this.progressBar.hasTotal()) {
          this.progressState = new ProgressIndicatorState.Work(
            this.progressState.type === 4 /* Work */ ? this.progressState.total : void 0,
            this.progressState.type === 4 /* Work */ && typeof this.progressState.worked === "number" ? this.progressState.worked + worked : worked
          );
          if (this.scope.isActive) {
            this.progressBar.worked(worked);
          }
        } else {
          this.progressState = ProgressIndicatorState.Infinite;
          this.progressBar.infinite().show();
        }
      },
      done: () => {
        this.progressState = ProgressIndicatorState.Done;
        if (this.scope.isActive) {
          this.progressBar.stop().hide();
        }
      }
    };
  }
  async showWhile(promise, delay) {
    if (this.progressState.type === 3 /* While */) {
      promise = Promise.allSettled([promise, this.progressState.whilePromise]);
    }
    this.progressState = new ProgressIndicatorState.While(promise, delay || 0, Date.now());
    try {
      this.doShowWhile(delay);
      await promise;
    } catch (error) {
    } finally {
      if (this.progressState.type !== 3 /* While */ || this.progressState.whilePromise === promise) {
        this.progressState = ProgressIndicatorState.None;
        if (this.scope.isActive) {
          this.progressBar.stop().hide();
        }
      }
    }
  }
  doShowWhile(delay) {
    if (this.scope.isActive) {
      this.progressBar.infinite().show(delay);
    }
  }
}
class AbstractProgressScope extends Disposable {
  constructor(scopeId, _isActive) {
    super();
    this.scopeId = scopeId;
    this._isActive = _isActive;
    this._onDidChangeActive = this._register(new Emitter());
    this.onDidChangeActive = this._onDidChangeActive.event;
  }
  get isActive() {
    return this._isActive;
  }
  onScopeOpened(scopeId) {
    if (scopeId === this.scopeId) {
      if (!this._isActive) {
        this._isActive = true;
        this._onDidChangeActive.fire();
      }
    }
  }
  onScopeClosed(scopeId) {
    if (scopeId === this.scopeId) {
      if (this._isActive) {
        this._isActive = false;
        this._onDidChangeActive.fire();
      }
    }
  }
}
export {
  AbstractProgressScope,
  EditorProgressIndicator,
  ScopedProgressIndicator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcm9ncmVzc1xcYnJvd3NlclxccHJvZ3Jlc3NJbmRpY2F0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzUnVubmVyLCBJUHJvZ3Jlc3NJbmRpY2F0b3IsIGVtcHR5UHJvZ3Jlc3NSdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwVmlldyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBHcm91cE1vZGVsQ2hhbmdlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuXG5leHBvcnQgY2xhc3MgRWRpdG9yUHJvZ3Jlc3NJbmRpY2F0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb2dyZXNzSW5kaWNhdG9yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzQmFyOiBQcm9ncmVzc0Jhcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCkge1xuXG5cdFx0Ly8gU3RvcCBhbnkgcnVubmluZyBwcm9ncmVzcyB3aGVuIHRoZSBhY3RpdmUgZWRpdG9yIGNoYW5nZXMgb3Jcblx0XHQvLyB0aGUgZ3JvdXAgYmVjb21lcyBlbXB0eS5cblx0XHQvLyBJbiBjb250cmFzdCB0byB0aGUgY29tcG9zaXRlIHByb2dyZXNzIGluZGljYXRvciwgd2UgZG8gbm90XG5cdFx0Ly8gdHJhY2sgYWN0aXZlIGVkaXRvciBwcm9ncmVzcyBhbmQgcmVwbGF5IGl0IGxhdGVyICh5ZXQpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChcblx0XHRcdFx0ZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQUNUSVZFIHx8XG5cdFx0XHRcdChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRSAmJiB0aGlzLmdyb3VwLmlzRW1wdHkpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHNob3coaW5maW5pdGU6IHRydWUsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyO1xuXHRzaG93KHRvdGFsOiBudW1iZXIsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyO1xuXHRzaG93KGluZmluaXRlT3JUb3RhbDogdHJ1ZSB8IG51bWJlciwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXIge1xuXG5cdFx0Ly8gTm8gZWRpdG9yIG9wZW46IGlnbm9yZSBhbnkgcHJvZ3Jlc3MgcmVwb3J0aW5nXG5cdFx0aWYgKHRoaXMuZ3JvdXAuaXNFbXB0eSkge1xuXHRcdFx0cmV0dXJuIGVtcHR5UHJvZ3Jlc3NSdW5uZXI7XG5cdFx0fVxuXG5cdFx0aWYgKGluZmluaXRlT3JUb3RhbCA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9TaG93KHRydWUsIGRlbGF5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb1Nob3coaW5maW5pdGVPclRvdGFsLCBkZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2hvdyhpbmZpbml0ZTogdHJ1ZSwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXI7XG5cdHByaXZhdGUgZG9TaG93KHRvdGFsOiBudW1iZXIsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyO1xuXHRwcml2YXRlIGRvU2hvdyhpbmZpbml0ZU9yVG90YWw6IHRydWUgfCBudW1iZXIsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyIHtcblx0XHRpZiAodHlwZW9mIGluZmluaXRlT3JUb3RhbCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdyhkZWxheSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIudG90YWwoaW5maW5pdGVPclRvdGFsKS5zaG93KGRlbGF5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dG90YWw6ICh0b3RhbDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIudG90YWwodG90YWwpO1xuXHRcdFx0fSxcblxuXHRcdFx0d29ya2VkOiAod29ya2VkOiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMucHJvZ3Jlc3NCYXIuaGFzVG90YWwoKSkge1xuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIud29ya2VkKHdvcmtlZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0ZG9uZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLnN0b3AoKS5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHNob3dXaGlsZShwcm9taXNlOiBQcm9taXNlPHVua25vd24+LCBkZWxheT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gTm8gZWRpdG9yIG9wZW46IGlnbm9yZSBhbnkgcHJvZ3Jlc3MgcmVwb3J0aW5nXG5cdFx0aWYgKHRoaXMuZ3JvdXAuaXNFbXB0eSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvU2hvd1doaWxlKHByb21pc2UsIGRlbGF5KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TaG93V2hpbGUocHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiwgZGVsYXk/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coZGVsYXkpO1xuXG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXHRcdH1cblx0fVxufVxuXG5uYW1lc3BhY2UgUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZSB7XG5cblx0ZXhwb3J0IGNvbnN0IGVudW0gVHlwZSB7XG5cdFx0Tm9uZSxcblx0XHREb25lLFxuXHRcdEluZmluaXRlLFxuXHRcdFdoaWxlLFxuXHRcdFdvcmtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBOb25lID0geyB0eXBlOiBUeXBlLk5vbmUgfSBhcyBjb25zdDtcblx0ZXhwb3J0IGNvbnN0IERvbmUgPSB7IHR5cGU6IFR5cGUuRG9uZSB9IGFzIGNvbnN0O1xuXHRleHBvcnQgY29uc3QgSW5maW5pdGUgPSB7IHR5cGU6IFR5cGUuSW5maW5pdGUgfSBhcyBjb25zdDtcblxuXHRleHBvcnQgY2xhc3MgV2hpbGUge1xuXG5cdFx0cmVhZG9ubHkgdHlwZSA9IFR5cGUuV2hpbGU7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHJlYWRvbmx5IHdoaWxlUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPixcblx0XHRcdHJlYWRvbmx5IHdoaWxlU3RhcnQ6IG51bWJlcixcblx0XHRcdHJlYWRvbmx5IHdoaWxlRGVsYXk6IG51bWJlcixcblx0XHQpIHsgfVxuXHR9XG5cblx0ZXhwb3J0IGNsYXNzIFdvcmsge1xuXG5cdFx0cmVhZG9ubHkgdHlwZSA9IFR5cGUuV29yaztcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cmVhZG9ubHkgdG90YWw6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRcdHJlYWRvbmx5IHdvcmtlZDogbnVtYmVyIHwgdW5kZWZpbmVkXG5cdFx0KSB7IH1cblx0fVxuXG5cdGV4cG9ydCB0eXBlIFN0YXRlID1cblx0XHR0eXBlb2YgTm9uZVxuXHRcdHwgdHlwZW9mIERvbmVcblx0XHR8IHR5cGVvZiBJbmZpbml0ZVxuXHRcdHwgV2hpbGVcblx0XHR8IFdvcms7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2dyZXNzU2NvcGUge1xuXG5cdC8qKlxuXHQgKiBGaXJlZCB3aGVuZXZlciBgaXNBY3RpdmVgIHZhbHVlIGNoYW5nZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgcHJvZ3Jlc3Mgc2hvdWxkIGJlIGFjdGl2ZSBvciBub3QuXG5cdCAqL1xuXHRyZWFkb25seSBpc0FjdGl2ZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFNjb3BlZFByb2dyZXNzSW5kaWNhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcm9ncmVzc0luZGljYXRvciB7XG5cblx0cHJpdmF0ZSBwcm9ncmVzc1N0YXRlOiBQcm9ncmVzc0luZGljYXRvclN0YXRlLlN0YXRlID0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NCYXI6IFByb2dyZXNzQmFyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2NvcGU6IElQcm9ncmVzc1Njb3BlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRyZWdpc3Rlckxpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNjb3BlLm9uRGlkQ2hhbmdlQWN0aXZlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnNjb3BlLmlzQWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMub25EaWRTY29wZUFjdGl2YXRlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm9uRGlkU2NvcGVEZWFjdGl2YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNjb3BlQWN0aXZhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgcHJvZ3Jlc3Mgc3RhdGUgaW5kaWNhdGVzIHRoYXQgcHJvZ3Jlc3MgaXMgZG9uZVxuXHRcdGlmICh0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5Eb25lLnR5cGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXBsYXkgSW5maW5pdGUgUHJvZ3Jlc3MgZnJvbSBQcm9taXNlXG5cdFx0aWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS50eXBlID09PSBQcm9ncmVzc0luZGljYXRvclN0YXRlLlR5cGUuV2hpbGUpIHtcblx0XHRcdGxldCBkZWxheTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS53aGlsZURlbGF5ID4gMCkge1xuXHRcdFx0XHRjb25zdCByZW1haW5pbmdEZWxheSA9IHRoaXMucHJvZ3Jlc3NTdGF0ZS53aGlsZURlbGF5IC0gKERhdGUubm93KCkgLSB0aGlzLnByb2dyZXNzU3RhdGUud2hpbGVTdGFydCk7XG5cdFx0XHRcdGlmIChyZW1haW5pbmdEZWxheSA+IDApIHtcblx0XHRcdFx0XHRkZWxheSA9IHJlbWFpbmluZ0RlbGF5O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZG9TaG93V2hpbGUoZGVsYXkpO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxheSBJbmZpbml0ZSBQcm9ncmVzc1xuXHRcdGVsc2UgaWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS50eXBlID09PSBQcm9ncmVzc0luZGljYXRvclN0YXRlLlR5cGUuSW5maW5pdGUpIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGF5IEZpbml0ZSBQcm9ncmVzcyAoVG90YWwgJiBXb3JrZWQpXG5cdFx0ZWxzZSBpZiAodGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgPT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuVHlwZS5Xb3JrKSB7XG5cdFx0XHRpZiAodGhpcy5wcm9ncmVzc1N0YXRlLnRvdGFsKSB7XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIudG90YWwodGhpcy5wcm9ncmVzc1N0YXRlLnRvdGFsKS5zaG93KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnByb2dyZXNzU3RhdGUud29ya2VkKSB7XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIud29ya2VkKHRoaXMucHJvZ3Jlc3NTdGF0ZS53b3JrZWQpLnNob3coKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkU2NvcGVEZWFjdGl2YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMucHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblx0fVxuXG5cdHNob3coaW5maW5pdGU6IHRydWUsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyO1xuXHRzaG93KHRvdGFsOiBudW1iZXIsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyO1xuXHRzaG93KGluZmluaXRlT3JUb3RhbDogdHJ1ZSB8IG51bWJlciwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXIge1xuXG5cdFx0Ly8gU29ydCBvdXQgQXJndW1lbnRzXG5cdFx0aWYgKHR5cGVvZiBpbmZpbml0ZU9yVG90YWwgPT09ICdib29sZWFuJykge1xuXHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlID0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5JbmZpbml0ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlID0gbmV3IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuV29yayhpbmZpbml0ZU9yVG90YWwsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aXZlOiBTaG93IFByb2dyZXNzXG5cdFx0aWYgKHRoaXMuc2NvcGUuaXNBY3RpdmUpIHtcblxuXHRcdFx0Ly8gSW5maW5pdGU6IFN0YXJ0IFByb2dyZXNzYmFyIGFuZCBTaG93IGFmdGVyIERlbGF5XG5cdFx0XHRpZiAodGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgPT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuVHlwZS5JbmZpbml0ZSkge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdyhkZWxheSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbml0ZTogU3RhcnQgUHJvZ3Jlc3NiYXIgYW5kIFNob3cgYWZ0ZXIgRGVsYXlcblx0XHRcdGVsc2UgaWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS50eXBlID09PSBQcm9ncmVzc0luZGljYXRvclN0YXRlLlR5cGUuV29yayAmJiB0eXBlb2YgdGhpcy5wcm9ncmVzc1N0YXRlLnRvdGFsID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLnRvdGFsKHRoaXMucHJvZ3Jlc3NTdGF0ZS50b3RhbCkuc2hvdyhkZWxheSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvdGFsOiAodG90YWw6IG51bWJlcikgPT4ge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUgPSBuZXcgUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5Xb3JrKFxuXHRcdFx0XHRcdHRvdGFsLFxuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NTdGF0ZS50eXBlID09PSBQcm9ncmVzc0luZGljYXRvclN0YXRlLlR5cGUuV29yayA/IHRoaXMucHJvZ3Jlc3NTdGF0ZS53b3JrZWQgOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNjb3BlLmlzQWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci50b3RhbCh0b3RhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdHdvcmtlZDogKHdvcmtlZDogbnVtYmVyKSA9PiB7XG5cblx0XHRcdFx0Ly8gVmVyaWZ5IGZpcnN0IHRoYXQgd2UgYXJlIGVpdGhlciBub3QgYWN0aXZlIG9yIHRoZSBwcm9ncmVzc2JhciBoYXMgYSB0b3RhbCBzZXRcblx0XHRcdFx0aWYgKCF0aGlzLnNjb3BlLmlzQWN0aXZlIHx8IHRoaXMucHJvZ3Jlc3NCYXIuaGFzVG90YWwoKSkge1xuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NTdGF0ZSA9IG5ldyBQcm9ncmVzc0luZGljYXRvclN0YXRlLldvcmsoXG5cdFx0XHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldvcmsgPyB0aGlzLnByb2dyZXNzU3RhdGUudG90YWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldvcmsgJiYgdHlwZW9mIHRoaXMucHJvZ3Jlc3NTdGF0ZS53b3JrZWQgPT09ICdudW1iZXInID8gdGhpcy5wcm9ncmVzc1N0YXRlLndvcmtlZCArIHdvcmtlZCA6IHdvcmtlZCk7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5zY29wZS5pc0FjdGl2ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci53b3JrZWQod29ya2VkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2UgdGhlIHByb2dyZXNzIGJhciBkb2VzIG5vdCBzdXBwb3J0IHdvcmtlZCgpLCB3ZSBmYWxsYmFjayB0byBpbmZpbml0ZSgpIHByb2dyZXNzXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NTdGF0ZSA9IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuSW5maW5pdGU7XG5cdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0ZG9uZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUgPSBQcm9ncmVzc0luZGljYXRvclN0YXRlLkRvbmU7XG5cblx0XHRcdFx0aWYgKHRoaXMuc2NvcGUuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLnN0b3AoKS5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgc2hvd1doaWxlKHByb21pc2U6IFByb21pc2U8dW5rbm93bj4sIGRlbGF5PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBKb2luIHdpdGggZXhpc3RpbmcgcnVubmluZyBwcm9taXNlIHRvIGVuc3VyZSBwcm9ncmVzcyBpcyBhY2N1cmF0ZVxuXHRcdGlmICh0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldoaWxlKSB7XG5cdFx0XHRwcm9taXNlID0gUHJvbWlzZS5hbGxTZXR0bGVkKFtwcm9taXNlLCB0aGlzLnByb2dyZXNzU3RhdGUud2hpbGVQcm9taXNlXSk7XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCBQcm9taXNlIGluIFN0YXRlXG5cdFx0dGhpcy5wcm9ncmVzc1N0YXRlID0gbmV3IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuV2hpbGUocHJvbWlzZSwgZGVsYXkgfHwgMCwgRGF0ZS5ub3coKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5kb1Nob3dXaGlsZShkZWxheSk7XG5cblx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH0gZmluYWxseSB7XG5cblx0XHRcdC8vIElmIHRoaXMgaXMgbm90IHRoZSBsYXN0IHByb21pc2UgaW4gdGhlIGxpc3Qgb2Ygam9pbmVkIHByb21pc2VzLCBza2lwIHRoaXNcblx0XHRcdGlmICh0aGlzLnByb2dyZXNzU3RhdGUudHlwZSAhPT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldoaWxlIHx8IHRoaXMucHJvZ3Jlc3NTdGF0ZS53aGlsZVByb21pc2UgPT09IHByb21pc2UpIHtcblxuXHRcdFx0XHQvLyBUaGUgd2hpbGUgcHJvbWlzZSBpcyBlaXRoZXIgbnVsbCBvciBlcXVhbCB0aGUgcHJvbWlzZSB3ZSBsYXN0IGhvb2tlZCBvblxuXHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUgPSBQcm9ncmVzc0luZGljYXRvclN0YXRlLk5vbmU7XG5cblx0XHRcdFx0aWYgKHRoaXMuc2NvcGUuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLnN0b3AoKS5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvU2hvd1doaWxlKGRlbGF5PzogbnVtYmVyKTogdm9pZCB7XG5cblx0XHQvLyBTaG93IFByb2dyZXNzIHdoZW4gYWN0aXZlXG5cdFx0aWYgKHRoaXMuc2NvcGUuaXNBY3RpdmUpIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KGRlbGF5KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0UHJvZ3Jlc3NTY29wZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvZ3Jlc3NTY29wZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmUgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZS5ldmVudDtcblxuXHRnZXQgaXNBY3RpdmUoKSB7IHJldHVybiB0aGlzLl9pc0FjdGl2ZTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2NvcGVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2lzQWN0aXZlOiBib29sZWFuXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25TY29wZU9wZW5lZChzY29wZUlkOiBzdHJpbmcpIHtcblx0XHRpZiAoc2NvcGVJZCA9PT0gdGhpcy5zY29wZUlkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX2lzQWN0aXZlID0gdHJ1ZTtcblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uU2NvcGVDbG9zZWQoc2NvcGVJZDogc3RyaW5nKSB7XG5cdFx0aWYgKHNjb3BlSWQgPT09IHRoaXMuc2NvcGVJZCkge1xuXHRcdFx0aWYgKHRoaXMuX2lzQWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX2lzQWN0aXZlID0gZmFsc2U7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUUzQixTQUE4QywyQkFBMkI7QUFFekUsU0FBUyw0QkFBNEI7QUFFOUIsTUFBTSxnQ0FBZ0MsV0FBeUM7QUFBQSxFQUVyRixZQUNrQixhQUNBLE9BQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFJakIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsb0JBQW9CO0FBTTNCLFNBQUssVUFBVSxLQUFLLE1BQU0saUJBQWlCLE9BQUs7QUFDL0MsVUFDQyxFQUFFLFNBQVMscUJBQXFCLGlCQUMvQixFQUFFLFNBQVMscUJBQXFCLGdCQUFnQixLQUFLLE1BQU0sU0FDM0Q7QUFDRCxhQUFLLFlBQVksS0FBSyxFQUFFLEtBQUs7QUFBQSxNQUM5QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBSUEsS0FBSyxpQkFBZ0MsT0FBaUM7QUFHckUsUUFBSSxLQUFLLE1BQU0sU0FBUztBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksb0JBQW9CLE1BQU07QUFDN0IsYUFBTyxLQUFLLE9BQU8sTUFBTSxLQUFLO0FBQUEsSUFDL0I7QUFFQSxXQUFPLEtBQUssT0FBTyxpQkFBaUIsS0FBSztBQUFBLEVBQzFDO0FBQUEsRUFJUSxPQUFPLGlCQUFnQyxPQUFpQztBQUMvRSxRQUFJLE9BQU8sb0JBQW9C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
