import assert from "assert";
import { tmpdir } from "os";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { isRecentFolder, restoreRecentlyOpened, toStoreData } from "../../common/workspaces.js";
suite("History Storage", () => {
  function toWorkspace(uri) {
    return {
      id: "1234",
      configPath: uri
    };
  }
  function assertEqualURI(u1, u2, message) {
    assert.strictEqual(u1 && u1.toString(), u2 && u2.toString(), message);
  }
  function assertEqualWorkspace(w1, w2, message) {
    if (!w1 || !w2) {
      assert.strictEqual(w1, w2, message);
      return;
    }
    assert.strictEqual(w1.id, w2.id, message);
    assertEqualURI(w1.configPath, w2.configPath, message);
  }
  function assertEqualRecentlyOpened(actual, expected, message) {
    assert.strictEqual(actual.files.length, expected.files.length, message);
    for (let i = 0; i < actual.files.length; i++) {
      assertEqualURI(actual.files[i].fileUri, expected.files[i].fileUri, message);
      assert.strictEqual(actual.files[i].label, expected.files[i].label);
      assert.strictEqual(actual.files[i].remoteAuthority, expected.files[i].remoteAuthority);
    }
    assert.strictEqual(actual.workspaces.length, expected.workspaces.length, message);
    for (let i = 0; i < actual.workspaces.length; i++) {
      const expectedRecent = expected.workspaces[i];
      const actualRecent = actual.workspaces[i];
      if (isRecentFolder(actualRecent)) {
        assertEqualURI(actualRecent.folderUri, expectedRecent.folderUri, message);
      } else {
        assertEqualWorkspace(actualRecent.workspace, expectedRecent.workspace, message);
      }
      assert.strictEqual(actualRecent.label, expectedRecent.label);
      assert.strictEqual(actualRecent.remoteAuthority, actualRecent.remoteAuthority);
    }
  }
  function assertRestoring(state, message) {
    const stored = toStoreData(state);
    const restored = restoreRecentlyOpened(stored, new NullLogService());
    assertEqualRecentlyOpened(state, restored, message);
  }
  const testWSPath = URI.file(join(tmpdir(), "windowStateTest", "test.code-workspace"));
  const testFileURI = URI.file(join(tmpdir(), "windowStateTest", "testFile.txt"));
  const testFolderURI = URI.file(join(tmpdir(), "windowStateTest", "testFolder"));
  const testRemoteFolderURI = URI.parse("foo://bar/c/e");
  const testRemoteFileURI = URI.parse("foo://bar/c/d.txt");
  const testRemoteWSURI = URI.parse("foo://bar/c/test.code-workspace");
  test("storing and restoring", () => {
    let ro;
    ro = {
      files: [],
      workspaces: []
    };
    assertRestoring(ro, "empty");
    ro = {
      files: [{ fileUri: testFileURI }],
      workspaces: []
    };
    assertRestoring(ro, "file");
    ro = {
      files: [],
      workspaces: [{ folderUri: testFolderURI }]
    };
    assertRestoring(ro, "folder");
    ro = {
      files: [],
      workspaces: [{ workspace: toWorkspace(testWSPath) }, { folderUri: testFolderURI }]
    };
    assertRestoring(ro, "workspaces and folders");
    ro = {
      files: [{ fileUri: testRemoteFileURI }],
      workspaces: [{ workspace: toWorkspace(testRemoteWSURI) }, { folderUri: testRemoteFolderURI }]
    };
    assertRestoring(ro, "remote workspaces and folders");
    ro = {
      files: [{ label: "abc", fileUri: testFileURI }],
      workspaces: [{ label: "def", workspace: toWorkspace(testWSPath) }, { folderUri: testRemoteFolderURI }]
    };
    assertRestoring(ro, "labels");
    ro = {
      files: [{ label: "abc", remoteAuthority: "test", fileUri: testRemoteFileURI }],
      workspaces: [{ label: "def", remoteAuthority: "test", workspace: toWorkspace(testWSPath) }, { folderUri: testRemoteFolderURI, remoteAuthority: "test" }]
    };
    assertRestoring(ro, "authority");
  });
  test("open 1_55", () => {
    const v1_55 = `{
			"entries": [
				{
					"folderUri": "foo://bar/23/43",
					"remoteAuthority": "test+test"
				},
				{
					"workspace": {
						"id": "53b714b46ef1a2d4346568b4f591028c",
						"configPath": "file:///home/user/workspaces/testing/custom.code-workspace"
					}
				},
				{
					"folderUri": "file:///home/user/workspaces/testing/folding",
					"label": "abc"
				},
				{
					"fileUri": "file:///home/user/.config/code-oss-dev/storage.json",
					"label": "def"
				}
			]
		}`;
    const windowsState = restoreRecentlyOpened(JSON.parse(v1_55), new NullLogService());
    const expected = {
      files: [{ label: "def", fileUri: URI.parse("file:///home/user/.config/code-oss-dev/storage.json") }],
      workspaces: [
        { folderUri: URI.parse("foo://bar/23/43"), remoteAuthority: "test+test" },
        { workspace: { id: "53b714b46ef1a2d4346568b4f591028c", configPath: URI.parse("file:///home/user/workspaces/testing/custom.code-workspace") } },
        { label: "abc", folderUri: URI.parse("file:///home/user/workspaces/testing/folding") }
      ]
    };
    assertEqualRecentlyOpened(windowsState, expected, "v1_33");
  });
  test("toStoreData drops label if it matches path", () => {
    const actual = toStoreData({
      workspaces: [],
      files: [{
        fileUri: URI.parse("file:///foo/bar/test.txt"),
        label: "/foo/bar/test.txt",
        remoteAuthority: void 0
      }]
    });
    assert.deepStrictEqual(actual, {
      entries: [{
        fileUri: "file:///foo/bar/test.txt",
        label: void 0,
        remoteAuthority: void 0
      }]
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd29ya3NwYWNlc1xcdGVzdFxcbm9kZVxcd29ya3NwYWNlc0hpc3RvcnlTdG9yYWdlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVJlY2VudEZvbGRlciwgSVJlY2VudGx5T3BlbmVkLCBJUmVjZW50V29ya3NwYWNlLCBpc1JlY2VudEZvbGRlciwgcmVzdG9yZVJlY2VudGx5T3BlbmVkLCB0b1N0b3JlRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcblxuc3VpdGUoJ0hpc3RvcnkgU3RvcmFnZScsICgpID0+IHtcblxuXHRmdW5jdGlvbiB0b1dvcmtzcGFjZSh1cmk6IFVSSSk6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6ICcxMjM0Jyxcblx0XHRcdGNvbmZpZ1BhdGg6IHVyaVxuXHRcdH07XG5cdH1cblx0ZnVuY3Rpb24gYXNzZXJ0RXF1YWxVUkkodTE6IFVSSSB8IHVuZGVmaW5lZCwgdTI6IFVSSSB8IHVuZGVmaW5lZCwgbWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1MSAmJiB1MS50b1N0cmluZygpLCB1MiAmJiB1Mi50b1N0cmluZygpLCBtZXNzYWdlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEVxdWFsV29ya3NwYWNlKHcxOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgdzI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBtZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF3MSB8fCAhdzIpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3MSwgdzIsIG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodzEuaWQsIHcyLmlkLCBtZXNzYWdlKTtcblx0XHRhc3NlcnRFcXVhbFVSSSh3MS5jb25maWdQYXRoLCB3Mi5jb25maWdQYXRoLCBtZXNzYWdlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEVxdWFsUmVjZW50bHlPcGVuZWQoYWN0dWFsOiBJUmVjZW50bHlPcGVuZWQsIGV4cGVjdGVkOiBJUmVjZW50bHlPcGVuZWQsIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmZpbGVzLmxlbmd0aCwgZXhwZWN0ZWQuZmlsZXMubGVuZ3RoLCBtZXNzYWdlKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdHVhbC5maWxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0RXF1YWxVUkkoYWN0dWFsLmZpbGVzW2ldLmZpbGVVcmksIGV4cGVjdGVkLmZpbGVzW2ldLmZpbGVVcmksIG1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5maWxlc1tpXS5sYWJlbCwgZXhwZWN0ZWQuZmlsZXNbaV0ubGFiZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5maWxlc1tpXS5yZW1vdGVBdXRob3JpdHksIGV4cGVjdGVkLmZpbGVzW2ldLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlcy5sZW5ndGgsIGV4cGVjdGVkLndvcmtzcGFjZXMubGVuZ3RoLCBtZXNzYWdlKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdHVhbC53b3Jrc3BhY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBleHBlY3RlZFJlY2VudCA9IGV4cGVjdGVkLndvcmtzcGFjZXNbaV07XG5cdFx0XHRjb25zdCBhY3R1YWxSZWNlbnQgPSBhY3R1YWwud29ya3NwYWNlc1tpXTtcblx0XHRcdGlmIChpc1JlY2VudEZvbGRlcihhY3R1YWxSZWNlbnQpKSB7XG5cdFx0XHRcdGFzc2VydEVxdWFsVVJJKGFjdHVhbFJlY2VudC5mb2xkZXJVcmksICg8SVJlY2VudEZvbGRlcj5leHBlY3RlZFJlY2VudCkuZm9sZGVyVXJpLCBtZXNzYWdlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydEVxdWFsV29ya3NwYWNlKGFjdHVhbFJlY2VudC53b3Jrc3BhY2UsICg8SVJlY2VudFdvcmtzcGFjZT5leHBlY3RlZFJlY2VudCkud29ya3NwYWNlLCBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxSZWNlbnQubGFiZWwsIGV4cGVjdGVkUmVjZW50LmxhYmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxSZWNlbnQucmVtb3RlQXV0aG9yaXR5LCBhY3R1YWxSZWNlbnQucmVtb3RlQXV0aG9yaXR5KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRSZXN0b3Jpbmcoc3RhdGU6IElSZWNlbnRseU9wZW5lZCwgbWVzc2FnZT86IHN0cmluZykge1xuXHRcdGNvbnN0IHN0b3JlZCA9IHRvU3RvcmVEYXRhKHN0YXRlKTtcblx0XHRjb25zdCByZXN0b3JlZCA9IHJlc3RvcmVSZWNlbnRseU9wZW5lZChzdG9yZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnRFcXVhbFJlY2VudGx5T3BlbmVkKHN0YXRlLCByZXN0b3JlZCwgbWVzc2FnZSk7XG5cdH1cblxuXHRjb25zdCB0ZXN0V1NQYXRoID0gVVJJLmZpbGUoam9pbih0bXBkaXIoKSwgJ3dpbmRvd1N0YXRlVGVzdCcsICd0ZXN0LmNvZGUtd29ya3NwYWNlJykpO1xuXHRjb25zdCB0ZXN0RmlsZVVSSSA9IFVSSS5maWxlKGpvaW4odG1wZGlyKCksICd3aW5kb3dTdGF0ZVRlc3QnLCAndGVzdEZpbGUudHh0JykpO1xuXHRjb25zdCB0ZXN0Rm9sZGVyVVJJID0gVVJJLmZpbGUoam9pbih0bXBkaXIoKSwgJ3dpbmRvd1N0YXRlVGVzdCcsICd0ZXN0Rm9sZGVyJykpO1xuXG5cdGNvbnN0IHRlc3RSZW1vdGVGb2xkZXJVUkkgPSBVUkkucGFyc2UoJ2ZvbzovL2Jhci9jL2UnKTtcblx0Y29uc3QgdGVzdFJlbW90ZUZpbGVVUkkgPSBVUkkucGFyc2UoJ2ZvbzovL2Jhci9jL2QudHh0Jyk7XG5cdGNvbnN0IHRlc3RSZW1vdGVXU1VSSSA9IFVSSS5wYXJzZSgnZm9vOi8vYmFyL2MvdGVzdC5jb2RlLXdvcmtzcGFjZScpO1xuXG5cdHRlc3QoJ3N0b3JpbmcgYW5kIHJlc3RvcmluZycsICgpID0+IHtcblx0XHRsZXQgcm86IElSZWNlbnRseU9wZW5lZDtcblx0XHRybyA9IHtcblx0XHRcdGZpbGVzOiBbXSxcblx0XHRcdHdvcmtzcGFjZXM6IFtdXG5cdFx0fTtcblx0XHRhc3NlcnRSZXN0b3Jpbmcocm8sICdlbXB0eScpO1xuXHRcdHJvID0ge1xuXHRcdFx0ZmlsZXM6IFt7IGZpbGVVcmk6IHRlc3RGaWxlVVJJIH1dLFxuXHRcdFx0d29ya3NwYWNlczogW11cblx0XHR9O1xuXHRcdGFzc2VydFJlc3RvcmluZyhybywgJ2ZpbGUnKTtcblx0XHRybyA9IHtcblx0XHRcdGZpbGVzOiBbXSxcblx0XHRcdHdvcmtzcGFjZXM6IFt7IGZvbGRlclVyaTogdGVzdEZvbGRlclVSSSB9XVxuXHRcdH07XG5cdFx0YXNzZXJ0UmVzdG9yaW5nKHJvLCAnZm9sZGVyJyk7XG5cdFx0cm8gPSB7XG5cdFx0XHRmaWxlczogW10sXG5cdFx0XHR3b3Jrc3BhY2VzOiBbeyB3b3Jrc3BhY2U6IHRvV29ya3NwYWNlKHRlc3RXU1BhdGgpIH0sIHsgZm9sZGVyVXJpOiB0ZXN0Rm9sZGVyVVJJIH1dXG5cdFx0fTtcblx0XHRhc3NlcnRSZXN0b3Jpbmcocm8sICd3b3Jrc3BhY2VzIGFuZCBmb2xkZXJzJyk7XG5cblx0XHRybyA9IHtcblx0XHRcdGZpbGVzOiBbeyBmaWxlVXJpOiB0ZXN0UmVtb3RlRmlsZVVSSSB9XSxcblx0XHRcdHdvcmtzcGFjZXM6IFt7IHdvcmtzcGFjZTogdG9Xb3Jrc3BhY2UodGVzdFJlbW90ZVdTVVJJKSB9LCB7IGZvbGRlclVyaTogdGVzdFJlbW90ZUZvbGRlclVSSSB9XVxuXHRcdH07XG5cdFx0YXNzZXJ0UmVzdG9yaW5nKHJvLCAncmVtb3RlIHdvcmtzcGFjZXMgYW5kIGZvbGRlcnMnKTtcblx0XHRybyA9IHtcblx0XHRcdGZpbGVzOiBbeyBsYWJlbDogJ2FiYycsIGZpbGVVcmk6IHRlc3RGaWxlVVJJIH1dLFxuXHRcdFx0d29ya3NwYWNlczogW3sgbGFiZWw6ICdkZWYnLCB3b3Jrc3BhY2U6IHRvV29ya3NwYWNlKHRlc3RXU1BhdGgpIH0sIHsgZm9sZGVyVXJpOiB0ZXN0UmVtb3RlRm9sZGVyVVJJIH1dXG5cdFx0fTtcblx0XHRhc3NlcnRSZXN0b3Jpbmcocm8sICdsYWJlbHMnKTtcblx0XHRybyA9IHtcblx0XHRcdGZpbGVzOiBbeyBsYWJlbDogJ2FiYycsIHJlbW90ZUF1dGhvcml0eTogJ3Rlc3QnLCBmaWxlVXJpOiB0ZXN0UmVtb3RlRmlsZVVSSSB9XSxcblx0XHRcdHdvcmtzcGFjZXM6IFt7IGxhYmVsOiAnZGVmJywgcmVtb3RlQXV0aG9yaXR5OiAndGVzdCcsIHdvcmtzcGFjZTogdG9Xb3Jrc3BhY2UodGVzdFdTUGF0aCkgfSwgeyBmb2xkZXJVcmk6IHRlc3RSZW1vdGVGb2xkZXJVUkksIHJlbW90ZUF1dGhvcml0eTogJ3Rlc3QnIH1dXG5cdFx0fTtcblx0XHRhc3NlcnRSZXN0b3Jpbmcocm8sICdhdXRob3JpdHknKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbiAxXzU1JywgKCkgPT4ge1xuXHRcdGNvbnN0IHYxXzU1ID0gYHtcblx0XHRcdFwiZW50cmllc1wiOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRcImZvbGRlclVyaVwiOiBcImZvbzovL2Jhci8yMy80M1wiLFxuXHRcdFx0XHRcdFwicmVtb3RlQXV0aG9yaXR5XCI6IFwidGVzdCt0ZXN0XCJcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFwid29ya3NwYWNlXCI6IHtcblx0XHRcdFx0XHRcdFwiaWRcIjogXCI1M2I3MTRiNDZlZjFhMmQ0MzQ2NTY4YjRmNTkxMDI4Y1wiLFxuXHRcdFx0XHRcdFx0XCJjb25maWdQYXRoXCI6IFwiZmlsZTovLy9ob21lL3VzZXIvd29ya3NwYWNlcy90ZXN0aW5nL2N1c3RvbS5jb2RlLXdvcmtzcGFjZVwiXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0XCJmb2xkZXJVcmlcIjogXCJmaWxlOi8vL2hvbWUvdXNlci93b3Jrc3BhY2VzL3Rlc3RpbmcvZm9sZGluZ1wiLFxuXHRcdFx0XHRcdFwibGFiZWxcIjogXCJhYmNcIlxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0XCJmaWxlVXJpXCI6IFwiZmlsZTovLy9ob21lL3VzZXIvLmNvbmZpZy9jb2RlLW9zcy1kZXYvc3RvcmFnZS5qc29uXCIsXG5cdFx0XHRcdFx0XCJsYWJlbFwiOiBcImRlZlwiXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9YDtcblxuXHRcdGNvbnN0IHdpbmRvd3NTdGF0ZSA9IHJlc3RvcmVSZWNlbnRseU9wZW5lZChKU09OLnBhcnNlKHYxXzU1KSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGV4cGVjdGVkOiBJUmVjZW50bHlPcGVuZWQgPSB7XG5cdFx0XHRmaWxlczogW3sgbGFiZWw6ICdkZWYnLCBmaWxlVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyLy5jb25maWcvY29kZS1vc3MtZGV2L3N0b3JhZ2UuanNvbicpIH1dLFxuXHRcdFx0d29ya3NwYWNlczogW1xuXHRcdFx0XHR7IGZvbGRlclVyaTogVVJJLnBhcnNlKCdmb286Ly9iYXIvMjMvNDMnKSwgcmVtb3RlQXV0aG9yaXR5OiAndGVzdCt0ZXN0JyB9LFxuXHRcdFx0XHR7IHdvcmtzcGFjZTogeyBpZDogJzUzYjcxNGI0NmVmMWEyZDQzNDY1NjhiNGY1OTEwMjhjJywgY29uZmlnUGF0aDogVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci93b3Jrc3BhY2VzL3Rlc3RpbmcvY3VzdG9tLmNvZGUtd29ya3NwYWNlJykgfSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnYWJjJywgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3dvcmtzcGFjZXMvdGVzdGluZy9mb2xkaW5nJykgfVxuXHRcdFx0XVxuXHRcdH07XG5cblx0XHRhc3NlcnRFcXVhbFJlY2VudGx5T3BlbmVkKHdpbmRvd3NTdGF0ZSwgZXhwZWN0ZWQsICd2MV8zMycpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1N0b3JlRGF0YSBkcm9wcyBsYWJlbCBpZiBpdCBtYXRjaGVzIHBhdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdG9TdG9yZURhdGEoe1xuXHRcdFx0d29ya3NwYWNlczogW10sXG5cdFx0XHRmaWxlczogW3tcblx0XHRcdFx0ZmlsZVVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2Zvby9iYXIvdGVzdC50eHQnKSxcblx0XHRcdFx0bGFiZWw6ICcvZm9vL2Jhci90ZXN0LnR4dCcsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHRlbnRyaWVzOiBbe1xuXHRcdFx0XHRmaWxlVXJpOiAnZmlsZTovLy9mb28vYmFyL3Rlc3QudHh0Jyxcblx0XHRcdFx0bGFiZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWRcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBMkQsZ0JBQWdCLHVCQUF1QixtQkFBbUI7QUFFckgsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QixXQUFTLFlBQVksS0FBZ0M7QUFDcEQsV0FBTztBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osWUFBWTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQ0Es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
