import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AutomationIsolationModel, normalizeAutomationBranchNames } from "../../common/isolationGroupModel.js";
const FOLDER_A = URI.file("/workspace/a");
const FOLDER_B = URI.file("/workspace/b");
function createState(overrides) {
  return {
    isQuickChat: false,
    folderUri: FOLDER_A,
    isolationMode: "workspace",
    branch: void 0,
    ...overrides
  };
}
suite("AutomationIsolationModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Folder mode treats a saved branch as legacy derived state", () => {
    const state = createState({ branch: "stale-head" });
    const model = new AutomationIsolationModel(state);
    model.setHeadBranch("main");
    assert.deepStrictEqual({
      displayBranch: model.displayBranch,
      persistedBranch: model.persistedBranch,
      stateBranch: state.branch
    }, {
      displayBranch: "main",
      persistedBranch: void 0,
      stateBranch: void 0
    });
  });
  test("provider-default isolation displays Folder without selecting it explicitly", () => {
    const state = createState({ isolationMode: void 0 });
    const model = new AutomationIsolationModel(state);
    assert.deepStrictEqual({
      displayMode: model.isolationMode,
      persistedMode: state.isolationMode
    }, {
      displayMode: "workspace",
      persistedMode: void 0
    });
  });
  test("preserves an edited Worktree branch when HEAD changes or disappears", () => {
    const state = createState({ isolationMode: "worktree", branch: "feature/saved" });
    const model = new AutomationIsolationModel(state);
    model.setSupportsWorktreeConfiguration(true);
    model.setHeadBranch("main");
    model.setHeadBranch(void 0);
    assert.deepStrictEqual({
      displayBranch: model.displayBranch,
      persistedBranch: model.persistedBranch,
      selectedBranch: model.selectedBranch
    }, {
      displayBranch: "feature/saved",
      persistedBranch: "feature/saved",
      selectedBranch: "feature/saved"
    });
  });
  test("does not use generated worktree HEAD as an implicit branch", () => {
    const state = createState({ isolationMode: "worktree" });
    const model = new AutomationIsolationModel(state);
    model.setSupportsWorktreeConfiguration(true);
    model.setHeadBranch("copilot-worktree-2026-07-14");
    assert.deepStrictEqual({
      headBranch: model.headBranch,
      displayBranch: model.displayBranch,
      persistedBranch: model.persistedBranch
    }, {
      headBranch: void 0,
      displayBranch: void 0,
      persistedBranch: void 0
    });
  });
  test("rejects generated worktree branches from persisted and explicit selection state", () => {
    const state = createState({ isolationMode: "worktree", branch: "copilot-worktree-restored" });
    const model = new AutomationIsolationModel(state);
    model.setSupportsWorktreeConfiguration(true);
    model.setHeadBranch("main");
    const restored = {
      selectedBranch: model.selectedBranch,
      persistedBranch: model.persistedBranch,
      stateBranch: state.branch
    };
    model.selectBranch("feature/selected");
    model.selectBranch("copilot-worktree-explicit");
    assert.deepStrictEqual({
      restored,
      explicit: {
        selectedBranch: model.selectedBranch,
        persistedBranch: model.persistedBranch,
        stateBranch: state.branch
      }
    }, {
      restored: {
        selectedBranch: void 0,
        persistedBranch: "main",
        stateBranch: void 0
      },
      explicit: {
        selectedBranch: "feature/selected",
        persistedBranch: "feature/selected",
        stateBranch: "feature/selected"
      }
    });
  });
  test("keeps explicit branch intent across temporary isolation-mode toggles", () => {
    const state = createState({ isolationMode: "worktree", branch: "feature/saved" });
    const model = new AutomationIsolationModel(state);
    model.setSupportsWorktreeConfiguration(true);
    model.setHeadBranch("main");
    assert.strictEqual(model.selectIsolationMode("workspace"), true);
    assert.strictEqual(model.persistedBranch, void 0);
    assert.strictEqual(model.selectIsolationMode("worktree"), true);
    assert.deepStrictEqual({
      displayBranch: model.displayBranch,
      persistedBranch: model.persistedBranch
    }, {
      displayBranch: "feature/saved",
      persistedBranch: "feature/saved"
    });
  });
  test("clears explicit branch intent when the folder changes", () => {
    const state = createState({ isolationMode: "worktree", branch: "feature/a" });
    const model = new AutomationIsolationModel(state);
    model.setSupportsWorktreeConfiguration(true);
    model.setWorkspace(FOLDER_B);
    model.setHeadBranch("develop");
    assert.deepStrictEqual({
      folder: model.folderUri?.toString(),
      selectedBranch: model.selectedBranch,
      persistedBranch: model.persistedBranch
    }, {
      folder: FOLDER_B.toString(),
      selectedBranch: void 0,
      persistedBranch: "develop"
    });
  });
  test("blocks unsupported Worktree selection without changing the mode", () => {
    const state = createState();
    const model = new AutomationIsolationModel(state);
    assert.deepStrictEqual({
      selected: model.selectIsolationMode("worktree"),
      mode: model.isolationMode,
      pickerAvailable: model.branchPickerAvailable
    }, {
      selected: false,
      mode: "workspace",
      pickerAvailable: false
    });
  });
  test("workspace-less mode clears repository state and returns to Folder mode explicitly", () => {
    const state = createState({ isolationMode: "worktree", branch: "feature/saved" });
    const model = new AutomationIsolationModel(state);
    model.setSupportsWorktreeConfiguration(true);
    model.setHeadBranch("main");
    model.setQuickChat(true);
    const quickChatState = {
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      isolationMode: state.isolationMode,
      branch: model.persistedBranch
    };
    model.setQuickChat(false, FOLDER_B);
    assert.deepStrictEqual({
      quickChatState,
      workspaceState: {
        isQuickChat: model.isQuickChat,
        folderUri: model.folderUri?.toString(),
        isolationMode: model.isolationMode,
        branch: model.persistedBranch
      }
    }, {
      quickChatState: {
        isQuickChat: true,
        folderUri: void 0,
        isolationMode: void 0,
        branch: void 0
      },
      workspaceState: {
        isQuickChat: false,
        folderUri: FOLDER_B.toString(),
        isolationMode: "workspace",
        branch: void 0
      }
    });
  });
  test("ignores hidden workspace updates while workspace-less mode is active", () => {
    const state = createState({ isQuickChat: true, folderUri: void 0 });
    const model = new AutomationIsolationModel(state);
    const accepted = model.setWorkspace(FOLDER_B);
    assert.deepStrictEqual({
      accepted,
      state: {
        isQuickChat: state.isQuickChat,
        folderUri: state.folderUri
      },
      observables: {
        isQuickChat: model.isQuickChatObs.get(),
        folderUri: model.folderUriObs.get()
      }
    }, {
      accepted: false,
      state: {
        isQuickChat: true,
        folderUri: void 0
      },
      observables: {
        isQuickChat: true,
        folderUri: void 0
      }
    });
  });
  test("normalizes local branch names", () => {
    assert.deepStrictEqual(normalizeAutomationBranchNames([
      "feature/z",
      "main",
      void 0,
      "main",
      "copilot-worktree-2026-07-13",
      "feature/a"
    ]), ["feature/a", "feature/z", "main"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGNvbW1vblxcaXNvbGF0aW9uR3JvdXBNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsLCBJQXV0b21hdGlvbklzb2xhdGlvbkZvcm1TdGF0ZSwgbm9ybWFsaXplQXV0b21hdGlvbkJyYW5jaE5hbWVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lzb2xhdGlvbkdyb3VwTW9kZWwuanMnO1xuXG5jb25zdCBGT0xERVJfQSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2EnKTtcbmNvbnN0IEZPTERFUl9CID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYicpO1xuXG5mdW5jdGlvbiBjcmVhdGVTdGF0ZShvdmVycmlkZXM/OiBQYXJ0aWFsPElBdXRvbWF0aW9uSXNvbGF0aW9uRm9ybVN0YXRlPik6IElBdXRvbWF0aW9uSXNvbGF0aW9uRm9ybVN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0Zm9sZGVyVXJpOiBGT0xERVJfQSxcblx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyxcblx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbnN1aXRlKCdBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0ZvbGRlciBtb2RlIHRyZWF0cyBhIHNhdmVkIGJyYW5jaCBhcyBsZWdhY3kgZGVyaXZlZCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZVN0YXRlKHsgYnJhbmNoOiAnc3RhbGUtaGVhZCcgfSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsKHN0YXRlKTtcblx0XHRtb2RlbC5zZXRIZWFkQnJhbmNoKCdtYWluJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3BsYXlCcmFuY2g6IG1vZGVsLmRpc3BsYXlCcmFuY2gsXG5cdFx0XHRwZXJzaXN0ZWRCcmFuY2g6IG1vZGVsLnBlcnNpc3RlZEJyYW5jaCxcblx0XHRcdHN0YXRlQnJhbmNoOiBzdGF0ZS5icmFuY2gsXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGxheUJyYW5jaDogJ21haW4nLFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZUJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlci1kZWZhdWx0IGlzb2xhdGlvbiBkaXNwbGF5cyBGb2xkZXIgd2l0aG91dCBzZWxlY3RpbmcgaXQgZXhwbGljaXRseScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZVN0YXRlKHsgaXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkIH0pO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbChzdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3BsYXlNb2RlOiBtb2RlbC5pc29sYXRpb25Nb2RlLFxuXHRcdFx0cGVyc2lzdGVkTW9kZTogc3RhdGUuaXNvbGF0aW9uTW9kZSxcblx0XHR9LCB7XG5cdFx0XHRkaXNwbGF5TW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRwZXJzaXN0ZWRNb2RlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhbiBlZGl0ZWQgV29ya3RyZWUgYnJhbmNoIHdoZW4gSEVBRCBjaGFuZ2VzIG9yIGRpc2FwcGVhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVTdGF0ZSh7IGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsIGJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnIH0pO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbChzdGF0ZSk7XG5cdFx0bW9kZWwuc2V0U3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24odHJ1ZSk7XG5cdFx0bW9kZWwuc2V0SGVhZEJyYW5jaCgnbWFpbicpO1xuXHRcdG1vZGVsLnNldEhlYWRCcmFuY2godW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGxheUJyYW5jaDogbW9kZWwuZGlzcGxheUJyYW5jaCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0c2VsZWN0ZWRCcmFuY2g6IG1vZGVsLnNlbGVjdGVkQnJhbmNoLFxuXHRcdH0sIHtcblx0XHRcdGRpc3BsYXlCcmFuY2g6ICdmZWF0dXJlL3NhdmVkJyxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnLFxuXHRcdFx0c2VsZWN0ZWRCcmFuY2g6ICdmZWF0dXJlL3NhdmVkJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdXNlIGdlbmVyYXRlZCB3b3JrdHJlZSBIRUFEIGFzIGFuIGltcGxpY2l0IGJyYW5jaCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZVN0YXRlKHsgaXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyB9KTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRcdG1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKHRydWUpO1xuXHRcdG1vZGVsLnNldEhlYWRCcmFuY2goJ2NvcGlsb3Qtd29ya3RyZWUtMjAyNi0wNy0xNCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoZWFkQnJhbmNoOiBtb2RlbC5oZWFkQnJhbmNoLFxuXHRcdFx0ZGlzcGxheUJyYW5jaDogbW9kZWwuZGlzcGxheUJyYW5jaCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdH0sIHtcblx0XHRcdGhlYWRCcmFuY2g6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3BsYXlCcmFuY2g6IHVuZGVmaW5lZCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGdlbmVyYXRlZCB3b3JrdHJlZSBicmFuY2hlcyBmcm9tIHBlcnNpc3RlZCBhbmQgZXhwbGljaXQgc2VsZWN0aW9uIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlU3RhdGUoeyBpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnLCBicmFuY2g6ICdjb3BpbG90LXdvcmt0cmVlLXJlc3RvcmVkJyB9KTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRcdG1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKHRydWUpO1xuXHRcdG1vZGVsLnNldEhlYWRCcmFuY2goJ21haW4nKTtcblx0XHRjb25zdCByZXN0b3JlZCA9IHtcblx0XHRcdHNlbGVjdGVkQnJhbmNoOiBtb2RlbC5zZWxlY3RlZEJyYW5jaCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0c3RhdGVCcmFuY2g6IHN0YXRlLmJyYW5jaCxcblx0XHR9O1xuXHRcdG1vZGVsLnNlbGVjdEJyYW5jaCgnZmVhdHVyZS9zZWxlY3RlZCcpO1xuXHRcdG1vZGVsLnNlbGVjdEJyYW5jaCgnY29waWxvdC13b3JrdHJlZS1leHBsaWNpdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN0b3JlZCxcblx0XHRcdGV4cGxpY2l0OiB7XG5cdFx0XHRcdHNlbGVjdGVkQnJhbmNoOiBtb2RlbC5zZWxlY3RlZEJyYW5jaCxcblx0XHRcdFx0cGVyc2lzdGVkQnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0XHRcdHN0YXRlQnJhbmNoOiBzdGF0ZS5icmFuY2gsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdHJlc3RvcmVkOiB7XG5cdFx0XHRcdHNlbGVjdGVkQnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcnNpc3RlZEJyYW5jaDogJ21haW4nLFxuXHRcdFx0XHRzdGF0ZUJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdGV4cGxpY2l0OiB7XG5cdFx0XHRcdHNlbGVjdGVkQnJhbmNoOiAnZmVhdHVyZS9zZWxlY3RlZCcsXG5cdFx0XHRcdHBlcnNpc3RlZEJyYW5jaDogJ2ZlYXR1cmUvc2VsZWN0ZWQnLFxuXHRcdFx0XHRzdGF0ZUJyYW5jaDogJ2ZlYXR1cmUvc2VsZWN0ZWQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZXhwbGljaXQgYnJhbmNoIGludGVudCBhY3Jvc3MgdGVtcG9yYXJ5IGlzb2xhdGlvbi1tb2RlIHRvZ2dsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVTdGF0ZSh7IGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsIGJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnIH0pO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbChzdGF0ZSk7XG5cdFx0bW9kZWwuc2V0U3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24odHJ1ZSk7XG5cdFx0bW9kZWwuc2V0SGVhZEJyYW5jaCgnbWFpbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNlbGVjdElzb2xhdGlvbk1vZGUoJ3dvcmtzcGFjZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwucGVyc2lzdGVkQnJhbmNoLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zZWxlY3RJc29sYXRpb25Nb2RlKCd3b3JrdHJlZScpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGxheUJyYW5jaDogbW9kZWwuZGlzcGxheUJyYW5jaCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdH0sIHtcblx0XHRcdGRpc3BsYXlCcmFuY2g6ICdmZWF0dXJlL3NhdmVkJyxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgZXhwbGljaXQgYnJhbmNoIGludGVudCB3aGVuIHRoZSBmb2xkZXIgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZVN0YXRlKHsgaXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9hJyB9KTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRcdG1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKHRydWUpO1xuXG5cdFx0bW9kZWwuc2V0V29ya3NwYWNlKEZPTERFUl9CKTtcblx0XHRtb2RlbC5zZXRIZWFkQnJhbmNoKCdkZXZlbG9wJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZvbGRlcjogbW9kZWwuZm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0c2VsZWN0ZWRCcmFuY2g6IG1vZGVsLnNlbGVjdGVkQnJhbmNoLFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0fSwge1xuXHRcdFx0Zm9sZGVyOiBGT0xERVJfQi50b1N0cmluZygpLFxuXHRcdFx0c2VsZWN0ZWRCcmFuY2g6IHVuZGVmaW5lZCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogJ2RldmVsb3AnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdibG9ja3MgdW5zdXBwb3J0ZWQgV29ya3RyZWUgc2VsZWN0aW9uIHdpdGhvdXQgY2hhbmdpbmcgdGhlIG1vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVTdGF0ZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbChzdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlbGVjdGVkOiBtb2RlbC5zZWxlY3RJc29sYXRpb25Nb2RlKCd3b3JrdHJlZScpLFxuXHRcdFx0bW9kZTogbW9kZWwuaXNvbGF0aW9uTW9kZSxcblx0XHRcdHBpY2tlckF2YWlsYWJsZTogbW9kZWwuYnJhbmNoUGlja2VyQXZhaWxhYmxlLFxuXHRcdH0sIHtcblx0XHRcdHNlbGVjdGVkOiBmYWxzZSxcblx0XHRcdG1vZGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0cGlja2VyQXZhaWxhYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlLWxlc3MgbW9kZSBjbGVhcnMgcmVwb3NpdG9yeSBzdGF0ZSBhbmQgcmV0dXJucyB0byBGb2xkZXIgbW9kZSBleHBsaWNpdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlU3RhdGUoeyBpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3NhdmVkJyB9KTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRcdG1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKHRydWUpO1xuXHRcdG1vZGVsLnNldEhlYWRCcmFuY2goJ21haW4nKTtcblxuXHRcdG1vZGVsLnNldFF1aWNrQ2hhdCh0cnVlKTtcblx0XHRjb25zdCBxdWlja0NoYXRTdGF0ZSA9IHtcblx0XHRcdGlzUXVpY2tDaGF0OiBtb2RlbC5pc1F1aWNrQ2hhdCxcblx0XHRcdGZvbGRlclVyaTogbW9kZWwuZm9sZGVyVXJpLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogc3RhdGUuaXNvbGF0aW9uTW9kZSxcblx0XHRcdGJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdH07XG5cdFx0bW9kZWwuc2V0UXVpY2tDaGF0KGZhbHNlLCBGT0xERVJfQik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHF1aWNrQ2hhdFN0YXRlLFxuXHRcdFx0d29ya3NwYWNlU3RhdGU6IHtcblx0XHRcdFx0aXNRdWlja0NoYXQ6IG1vZGVsLmlzUXVpY2tDaGF0LFxuXHRcdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHRcdFx0aXNvbGF0aW9uTW9kZTogbW9kZWwuaXNvbGF0aW9uTW9kZSxcblx0XHRcdFx0YnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdHF1aWNrQ2hhdFN0YXRlOiB7XG5cdFx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR3b3Jrc3BhY2VTdGF0ZToge1xuXHRcdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRcdGZvbGRlclVyaTogRk9MREVSX0IudG9TdHJpbmcoKSxcblx0XHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBoaWRkZW4gd29ya3NwYWNlIHVwZGF0ZXMgd2hpbGUgd29ya3NwYWNlLWxlc3MgbW9kZSBpcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVTdGF0ZSh7IGlzUXVpY2tDaGF0OiB0cnVlLCBmb2xkZXJVcmk6IHVuZGVmaW5lZCB9KTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXG5cdFx0Y29uc3QgYWNjZXB0ZWQgPSBtb2RlbC5zZXRXb3Jrc3BhY2UoRk9MREVSX0IpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY2NlcHRlZCxcblx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdGlzUXVpY2tDaGF0OiBzdGF0ZS5pc1F1aWNrQ2hhdCxcblx0XHRcdFx0Zm9sZGVyVXJpOiBzdGF0ZS5mb2xkZXJVcmksXG5cdFx0XHR9LFxuXHRcdFx0b2JzZXJ2YWJsZXM6IHtcblx0XHRcdFx0aXNRdWlja0NoYXQ6IG1vZGVsLmlzUXVpY2tDaGF0T2JzLmdldCgpLFxuXHRcdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaU9icy5nZXQoKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0YWNjZXB0ZWQ6IGZhbHNlLFxuXHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdG9ic2VydmFibGVzOiB7XG5cdFx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgbG9jYWwgYnJhbmNoIG5hbWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplQXV0b21hdGlvbkJyYW5jaE5hbWVzKFtcblx0XHRcdCdmZWF0dXJlL3onLFxuXHRcdFx0J21haW4nLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J21haW4nLFxuXHRcdFx0J2NvcGlsb3Qtd29ya3RyZWUtMjAyNi0wNy0xMycsXG5cdFx0XHQnZmVhdHVyZS9hJyxcblx0XHRdKSwgWydmZWF0dXJlL2EnLCAnZmVhdHVyZS96JywgJ21haW4nXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQXlELHNDQUFzQztBQUV4RyxNQUFNLFdBQVcsSUFBSSxLQUFLLGNBQWM7QUFDeEMsTUFBTSxXQUFXLElBQUksS0FBSyxjQUFjO0FBRXhDLFNBQVMsWUFBWSxXQUFtRjtBQUN2RyxTQUFPO0FBQUEsSUFDTixhQUFhO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxlQUFlO0FB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
