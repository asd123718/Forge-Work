import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DidEnterWorkspaceEvent } from "../../browser/abstractWorkspaceEditingService.js";
import { UNKNOWN_EMPTY_WINDOW_WORKSPACE } from "../../../../../platform/workspace/common/workspace.js";
suite("WorkspaceEditingService", () => {
  suite("DidEnterWorkspaceEvent", () => {
    test("event captures old workspace and new workspace URI", () => {
      const oldWorkspace = { id: "old-folder", uri: URI.file("/old/folder") };
      const newWorkspace = { id: "new-workspace", configPath: URI.file("/test/workspace.code-workspace") };
      const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);
      assert.strictEqual(event.oldWorkspace, oldWorkspace);
      assert.strictEqual(event.newWorkspace, newWorkspace);
    });
    test("join collects promises", async () => {
      const newWorkspace = { id: "new-workspace", configPath: URI.file("/test/workspace.code-workspace") };
      const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);
      let executed1 = false;
      let executed2 = false;
      event.join(
        (async () => {
          executed1 = true;
        })()
      );
      event.join(
        (async () => {
          executed2 = true;
        })()
      );
      await event.wait();
      assert.strictEqual(executed1, true, "First promise should have executed");
      assert.strictEqual(executed2, true, "Second promise should have executed");
    });
    test("wait resolves when all promises complete", async () => {
      const newWorkspace = { id: "new-workspace", configPath: URI.file("/test/workspace.code-workspace") };
      const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);
      let resolve1;
      let resolve2;
      const promise1 = new Promise((r) => {
        resolve1 = r;
      });
      const promise2 = new Promise((r) => {
        resolve2 = r;
      });
      event.join(promise1);
      event.join(promise2);
      let waitCompleted = false;
      const waitPromise = event.wait().then(() => {
        waitCompleted = true;
      });
      await Promise.resolve();
      assert.strictEqual(waitCompleted, false);
      resolve1();
      await Promise.resolve();
      assert.strictEqual(waitCompleted, false);
      resolve2();
      await waitPromise;
      assert.strictEqual(waitCompleted, true);
    });
    test("wait resolves immediately when no promises are joined", async () => {
      const newWorkspace = { id: "new-workspace", configPath: URI.file("/test/workspace.code-workspace") };
      const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);
      await event.wait();
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3Jrc3BhY2VzXFx0ZXN0XFxicm93c2VyXFx3b3Jrc3BhY2VFZGl0aW5nU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlkRW50ZXJXb3Jrc3BhY2VFdmVudCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWJzdHJhY3RXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVTktOT1dOX0VNUFRZX1dJTkRPV19XT1JLU1BBQ0UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbnN1aXRlKCdXb3Jrc3BhY2VFZGl0aW5nU2VydmljZScsICgpID0+IHtcblxuXHRzdWl0ZSgnRGlkRW50ZXJXb3Jrc3BhY2VFdmVudCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2V2ZW50IGNhcHR1cmVzIG9sZCB3b3Jrc3BhY2UgYW5kIG5ldyB3b3Jrc3BhY2UgVVJJJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb2xkV29ya3NwYWNlID0geyBpZDogJ29sZC1mb2xkZXInLCB1cmk6IFVSSS5maWxlKCcvb2xkL2ZvbGRlcicpIH07XG5cdFx0XHRjb25zdCBuZXdXb3Jrc3BhY2UgPSB7IGlkOiAnbmV3LXdvcmtzcGFjZScsIGNvbmZpZ1BhdGg6IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UuY29kZS13b3Jrc3BhY2UnKSB9O1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgRGlkRW50ZXJXb3Jrc3BhY2VFdmVudChvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5vbGRXb3Jrc3BhY2UsIG9sZFdvcmtzcGFjZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQubmV3V29ya3NwYWNlLCBuZXdXb3Jrc3BhY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnam9pbiBjb2xsZWN0cyBwcm9taXNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1dvcmtzcGFjZSA9IHsgaWQ6ICduZXctd29ya3NwYWNlJywgY29uZmlnUGF0aDogVVJJLmZpbGUoJy90ZXN0L3dvcmtzcGFjZS5jb2RlLXdvcmtzcGFjZScpIH07XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBEaWRFbnRlcldvcmtzcGFjZUV2ZW50KFVOS05PV05fRU1QVFlfV0lORE9XX1dPUktTUEFDRSwgbmV3V29ya3NwYWNlKTtcblxuXHRcdFx0bGV0IGV4ZWN1dGVkMSA9IGZhbHNlO1xuXHRcdFx0bGV0IGV4ZWN1dGVkMiA9IGZhbHNlO1xuXG5cdFx0XHRldmVudC5qb2luKFxuXHRcdFx0XHQoYXN5bmMgKCkgPT4geyBleGVjdXRlZDEgPSB0cnVlOyB9KSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0ZXZlbnQuam9pbihcblx0XHRcdFx0KGFzeW5jICgpID0+IHsgZXhlY3V0ZWQyID0gdHJ1ZTsgfSkoKSxcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGV2ZW50LndhaXQoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVkMSwgdHJ1ZSwgJ0ZpcnN0IHByb21pc2Ugc2hvdWxkIGhhdmUgZXhlY3V0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZDIsIHRydWUsICdTZWNvbmQgcHJvbWlzZSBzaG91bGQgaGF2ZSBleGVjdXRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2FpdCByZXNvbHZlcyB3aGVuIGFsbCBwcm9taXNlcyBjb21wbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1dvcmtzcGFjZSA9IHsgaWQ6ICduZXctd29ya3NwYWNlJywgY29uZmlnUGF0aDogVVJJLmZpbGUoJy90ZXN0L3dvcmtzcGFjZS5jb2RlLXdvcmtzcGFjZScpIH07XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBEaWRFbnRlcldvcmtzcGFjZUV2ZW50KFVOS05PV05fRU1QVFlfV0lORE9XX1dPUktTUEFDRSwgbmV3V29ya3NwYWNlKTtcblxuXHRcdFx0bGV0IHJlc29sdmUxOiAoKSA9PiB2b2lkO1xuXHRcdFx0bGV0IHJlc29sdmUyOiAoKSA9PiB2b2lkO1xuXHRcdFx0Y29uc3QgcHJvbWlzZTEgPSBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHsgcmVzb2x2ZTEgPSByOyB9KTtcblx0XHRcdGNvbnN0IHByb21pc2UyID0gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7IHJlc29sdmUyID0gcjsgfSk7XG5cblx0XHRcdGV2ZW50LmpvaW4ocHJvbWlzZTEpO1xuXHRcdFx0ZXZlbnQuam9pbihwcm9taXNlMik7XG5cblx0XHRcdGxldCB3YWl0Q29tcGxldGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCB3YWl0UHJvbWlzZSA9IGV2ZW50LndhaXQoKS50aGVuKCgpID0+IHsgd2FpdENvbXBsZXRlZCA9IHRydWU7IH0pO1xuXG5cdFx0XHQvLyBTaG91bGQgbm90IGJlIGNvbXBsZXRlZCB5ZXRcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhaXRDb21wbGV0ZWQsIGZhbHNlKTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBmaXJzdCBwcm9taXNlXG5cdFx0XHRyZXNvbHZlMSEoKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhaXRDb21wbGV0ZWQsIGZhbHNlKTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBzZWNvbmQgcHJvbWlzZVxuXHRcdFx0cmVzb2x2ZTIhKCk7XG5cdFx0XHRhd2FpdCB3YWl0UHJvbWlzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YWl0Q29tcGxldGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dhaXQgcmVzb2x2ZXMgaW1tZWRpYXRlbHkgd2hlbiBubyBwcm9taXNlcyBhcmUgam9pbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3V29ya3NwYWNlID0geyBpZDogJ25ldy13b3Jrc3BhY2UnLCBjb25maWdQYXRoOiBVUkkuZmlsZSgnL3Rlc3Qvd29ya3NwYWNlLmNvZGUtd29ya3NwYWNlJykgfTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IERpZEVudGVyV29ya3NwYWNlRXZlbnQoVU5LTk9XTl9FTVBUWV9XSU5ET1dfV09SS1NQQUNFLCBuZXdXb3Jrc3BhY2UpO1xuXG5cdFx0XHRhd2FpdCBldmVudC53YWl0KCk7XG5cdFx0XHQvLyBTaG91bGQgY29tcGxldGUgd2l0aG91dCBlcnJvclxuXHRcdH0pO1xuXHR9KTtcblxuXHRlbnN1cmVO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
