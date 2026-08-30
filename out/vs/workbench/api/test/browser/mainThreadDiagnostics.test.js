import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MarkerService } from "../../../../platform/markers/common/markerService.js";
import { MainThreadDiagnostics } from "../../browser/mainThreadDiagnostics.js";
import { ExtensionHostKind } from "../../../services/extensions/common/extensionHostKind.js";
import { mock } from "../../../test/common/workbenchTestServices.js";
suite("MainThreadDiagnostics", function() {
  let markerService;
  setup(function() {
    markerService = new MarkerService();
  });
  teardown(function() {
    markerService.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("clear markers on dispose", function() {
    const diag = new MainThreadDiagnostics(
      new class {
        constructor() {
          this.remoteAuthority = "";
          this.extensionHostKind = ExtensionHostKind.LocalProcess;
        }
        dispose() {
        }
        assertRegistered() {
        }
        set(v) {
          return null;
        }
        getProxy() {
          return {
            $acceptMarkersChange() {
            }
          };
        }
        drain() {
          return null;
        }
      }(),
      markerService,
      new class extends mock() {
        asCanonicalUri(uri) {
          return uri;
        }
      }()
    );
    diag.$changeMany("foo", [[URI.file("a"), [{
      code: "666",
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      message: "fffff",
      severity: 1,
      source: "me"
    }]]]);
    assert.strictEqual(markerService.read().length, 1);
    diag.dispose();
    assert.strictEqual(markerService.read().length, 0);
  });
  test("OnDidChangeDiagnostics triggers twice on same diagnostics #136434", function() {
    return runWithFakedTimers({}, async () => {
      const changedData = [];
      const diag = new MainThreadDiagnostics(
        new class {
          constructor() {
            this.remoteAuthority = "";
            this.extensionHostKind = ExtensionHostKind.LocalProcess;
          }
          dispose() {
          }
          assertRegistered() {
          }
          set(v) {
            return null;
          }
          getProxy() {
            return {
              $acceptMarkersChange(data) {
                changedData.push(data);
              }
            };
          }
          drain() {
            return null;
          }
        }(),
        markerService,
        new class extends mock() {
          asCanonicalUri(uri) {
            return uri;
          }
        }()
      );
      const markerDataStub = {
        code: "666",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        severity: 1,
        source: "me"
      };
      const target = URI.file("a");
      diag.$changeMany("foo", [[target, [{ ...markerDataStub, message: "same_owner" }]]]);
      markerService.changeOne("bar", target, [{ ...markerDataStub, message: "forgein_owner" }]);
      await timeout(0);
      assert.strictEqual(markerService.read().length, 2);
      assert.strictEqual(changedData.length, 1);
      assert.strictEqual(changedData[0].length, 1);
      assert.strictEqual(changedData[0][0][1][0].message, "forgein_owner");
      diag.dispose();
    });
  });
  test('onDidChangeDiagnostics different behavior when "extensionKind" ui running on remote workspace #136955', function() {
    return runWithFakedTimers({}, async () => {
      const markerData = {
        code: "666",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        severity: 1,
        source: "me",
        message: "message"
      };
      const target = URI.file("a");
      markerService.changeOne("bar", target, [markerData]);
      const changedData = [];
      const diag = new MainThreadDiagnostics(
        new class {
          constructor() {
            this.remoteAuthority = "";
            this.extensionHostKind = ExtensionHostKind.LocalProcess;
          }
          dispose() {
          }
          assertRegistered() {
          }
          set(v) {
            return null;
          }
          getProxy() {
            return {
              $acceptMarkersChange(data) {
                changedData.push(data);
              }
            };
          }
          drain() {
            return null;
          }
        }(),
        markerService,
        new class extends mock() {
          asCanonicalUri(uri) {
            return uri;
          }
        }()
      );
      diag.$clear("bar");
      await timeout(0);
      assert.strictEqual(markerService.read().length, 0);
      assert.strictEqual(changedData.length, 1);
      diag.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZERpYWdub3N0aWNzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREaWFnbm9zdGljcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZERpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEtpbmQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0S2luZC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuXG5zdWl0ZSgnTWFpblRocmVhZERpYWdub3N0aWNzJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBtYXJrZXJTZXJ2aWNlOiBNYXJrZXJTZXJ2aWNlO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRtYXJrZXJTZXJ2aWNlID0gbmV3IE1hcmtlclNlcnZpY2UoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdG1hcmtlclNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjbGVhciBtYXJrZXJzIG9uIGRpc3Bvc2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBkaWFnID0gbmV3IE1haW5UaHJlYWREaWFnbm9zdGljcyhcblx0XHRcdG5ldyBjbGFzcyBpbXBsZW1lbnRzIElFeHRIb3N0Q29udGV4dCB7XG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eSA9ICcnO1xuXHRcdFx0XHRleHRlbnNpb25Ib3N0S2luZCA9IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcztcblx0XHRcdFx0ZGlzcG9zZSgpIHsgfVxuXHRcdFx0XHRhc3NlcnRSZWdpc3RlcmVkKCkgeyB9XG5cdFx0XHRcdHNldCh2OiBhbnkpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdFx0XHRnZXRQcm94eSgpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQkYWNjZXB0TWFya2Vyc0NoYW5nZSgpIHsgfVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZHJhaW4oKTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdH0sXG5cdFx0XHRtYXJrZXJTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXNDYW5vbmljYWxVcmkodXJpOiBVUkkpIHsgcmV0dXJuIHVyaTsgfVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRkaWFnLiRjaGFuZ2VNYW55KCdmb28nLCBbW1VSSS5maWxlKCdhJyksIFt7XG5cdFx0XHRjb2RlOiAnNjY2Jyxcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRcdGVuZENvbHVtbjogMSxcblx0XHRcdG1lc3NhZ2U6ICdmZmZmZicsXG5cdFx0XHRzZXZlcml0eTogMSxcblx0XHRcdHNvdXJjZTogJ21lJ1xuXHRcdH1dXV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlclNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7XG5cdFx0ZGlhZy5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlclNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ09uRGlkQ2hhbmdlRGlhZ25vc3RpY3MgdHJpZ2dlcnMgdHdpY2Ugb24gc2FtZSBkaWFnbm9zdGljcyAjMTM2NDM0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkRGF0YTogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW11bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBkaWFnID0gbmV3IE1haW5UaHJlYWREaWFnbm9zdGljcyhcblx0XHRcdFx0bmV3IGNsYXNzIGltcGxlbWVudHMgSUV4dEhvc3RDb250ZXh0IHtcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHkgPSAnJztcblx0XHRcdFx0XHRleHRlbnNpb25Ib3N0S2luZCA9IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcztcblx0XHRcdFx0XHRkaXNwb3NlKCkgeyB9XG5cdFx0XHRcdFx0YXNzZXJ0UmVnaXN0ZXJlZCgpIHsgfVxuXHRcdFx0XHRcdHNldCh2OiBhbnkpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdFx0XHRcdGdldFByb3h5KCk6IGFueSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHQkYWNjZXB0TWFya2Vyc0NoYW5nZShkYXRhOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXSkge1xuXHRcdFx0XHRcdFx0XHRcdGNoYW5nZWREYXRhLnB1c2goZGF0YSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRyYWluKCk6IGFueSB7IHJldHVybiBudWxsOyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtlclNlcnZpY2UsXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXNDYW5vbmljYWxVcmkodXJpOiBVUkkpIHsgcmV0dXJuIHVyaTsgfVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBtYXJrZXJEYXRhU3R1YiA9IHtcblx0XHRcdFx0Y29kZTogJzY2NicsXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogMSxcblx0XHRcdFx0c2V2ZXJpdHk6IDEsXG5cdFx0XHRcdHNvdXJjZTogJ21lJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKCdhJyk7XG5cdFx0XHRkaWFnLiRjaGFuZ2VNYW55KCdmb28nLCBbW3RhcmdldCwgW3sgLi4ubWFya2VyRGF0YVN0dWIsIG1lc3NhZ2U6ICdzYW1lX293bmVyJyB9XV1dKTtcblx0XHRcdG1hcmtlclNlcnZpY2UuY2hhbmdlT25lKCdiYXInLCB0YXJnZXQsIFt7IC4uLm1hcmtlckRhdGFTdHViLCBtZXNzYWdlOiAnZm9yZ2Vpbl9vd25lcicgfV0pO1xuXG5cdFx0XHQvLyBhZGRlZCBvbmUgbWFya2VyIHZpYSB0aGUgQVBJIGFuZCBvbmUgdmlhIHRoZSBleHQgaG9zdC4gdGhlIGxhdHRlciBtdXN0IG5vdFxuXHRcdFx0Ly8gdHJpZ2dlciBhbiBldmVudCB0byB0aGUgZXh0ZW5zaW9uIGhvc3RcblxuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJTZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWREYXRhLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZERhdGFbMF0ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkRGF0YVswXVswXVsxXVswXS5tZXNzYWdlLCAnZm9yZ2Vpbl9vd25lcicpO1xuXG5cdFx0XHRkaWFnLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VEaWFnbm9zdGljcyBkaWZmZXJlbnQgYmVoYXZpb3Igd2hlbiBcImV4dGVuc2lvbktpbmRcIiB1aSBydW5uaW5nIG9uIHJlbW90ZSB3b3Jrc3BhY2UgIzEzNjk1NScsIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IG1hcmtlckRhdGE6IElNYXJrZXJEYXRhID0ge1xuXHRcdFx0XHRjb2RlOiAnNjY2Jyxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHRzZXZlcml0eTogMSxcblx0XHRcdFx0c291cmNlOiAnbWUnLFxuXHRcdFx0XHRtZXNzYWdlOiAnbWVzc2FnZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZSgnYScpO1xuXHRcdFx0bWFya2VyU2VydmljZS5jaGFuZ2VPbmUoJ2JhcicsIHRhcmdldCwgW21hcmtlckRhdGFdKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZERhdGE6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgZGlhZyA9IG5ldyBNYWluVGhyZWFkRGlhZ25vc3RpY3MoXG5cdFx0XHRcdG5ldyBjbGFzcyBpbXBsZW1lbnRzIElFeHRIb3N0Q29udGV4dCB7XG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5ID0gJyc7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdEtpbmQgPSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M7XG5cdFx0XHRcdFx0ZGlzcG9zZSgpIHsgfVxuXHRcdFx0XHRcdGFzc2VydFJlZ2lzdGVyZWQoKSB7IH1cblx0XHRcdFx0XHRzZXQodjogYW55KTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdFx0XHRnZXRQcm94eSgpOiBhbnkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0JGFjY2VwdE1hcmtlcnNDaGFuZ2UoZGF0YTogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW10pIHtcblx0XHRcdFx0XHRcdFx0XHRjaGFuZ2VkRGF0YS5wdXNoKGRhdGEpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkcmFpbigpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYXJrZXJTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIGFzQ2Fub25pY2FsVXJpKHVyaTogVVJJKSB7IHJldHVybiB1cmk7IH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0ZGlhZy4kY2xlYXIoJ2JhcicpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJTZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWREYXRhLmxlbmd0aCwgMSk7XG5cblx0XHRcdGRpYWcuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBRzlCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMs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TyxZQUFZLGNBQWMsS0FBSyxFQUFFLFFBQVEsQ0FBQztBQUNqRCxhQUFPLFlBQVksWUFBWSxRQUFRLENBQUM7QUFDeEMsYUFBTyxZQUFZLFlBQVksQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUMzQyxhQUFPLFlBQVksWUFBWSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBUyxlQUFlO0FBRW5FLFdBQUssUUFBUTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUdBQXlHLFdBQVk7QUFDekgsV0FBTyxtQkFBbUIsQ0FBQyxHQUFHLFlBQVk7QUFFekMsWUFBTSxhQUEwQjtBQUFBLFFBQy9CLE1BQU07QUFBQSxRQUNOLGlCQUFpQjtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLGVBQWU7QUFBQSxRQUNmLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxRQUNWLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNWO0FBQ0EsWUFBTSxTQUFTLElBQUksS0FBSyxHQUFHO0FBQzNCLG9CQUFjLFVBQVUsT0FBTyxRQUFRLENBQUMsVUFBVSxDQUFDO0FBRW5ELFlBQU0sY0FBa0QsQ0FBQztBQUV6RCxZQUFNLE9BQU8sSUFBSTtBQUFBLFFBQ2hCLElBQUksTUFBaUM7QUFBQSxVQUFqQztBQUNILG1DQUFrQjtBQUNsQixxQ0FBb0Isa0JBQWtCO0FBQUE7QUFBQSxVQUN0QyxVQUFVO0FBQUEsVUFBRTtBQUFBLFVBQ1osbUJBQW1CO0FBQUEsVUFBRTtBQUFBLFVBQ3JCLElBQUksR0FBYTtBQUFFLG1CQUFPO0FBQUEsVUFBTTtBQUFBLFVBQ2hDLFdBQWdCO0FBQ2YsbUJBQU87QUFBQSxjQUNOLHFCQUFxQixNQUF3QztBQUM1RCw0QkFBWSxLQUFLLElBQUk7QUFBQSxjQUN0QjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsVUFDQSxRQUFhO0FBQUUsbUJBQU87QUFBQSxVQUFNO0FBQUEsUUFDN0I7QUFBQSxRQUNBO0FBQUEsUUFDQSxJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLFVBQ3BDLGVBQWUsS0FBVTtBQUFFLG1CQUFPO0FBQUEsVUFBSztBQUFBLFFBQ2pEO0FBQUEsTUFDRDtBQUVBLFdBQUssT0FBTyxLQUFLO0FBQ2pCLFlBQU0sUUFBUSxDQUFDO0FBQ2YsYUFBTyxZQUFZLGNBQWMsS0FBSyxFQUFFLFFBQVEsQ0FBQztBQUNqRCxhQUFPLFlBQVksWUFBWSxRQUFRLENBQUM7QUFFeEMsV0FBSyxRQUFRO0FBQUEsSUFDZCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
