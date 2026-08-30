import assert from "assert";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TestNotificationService } from "../../../../../../platform/notification/test/common/testNotificationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { MIC_CAPTURE_CHUNK_SIZE, MicCaptureService } from "../../../browser/voiceClient/micCaptureService.js";
suite("MicCaptureService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("buffers 32 ms voice chunks at 16 kHz", () => {
    assert.deepStrictEqual({
      samples: MIC_CAPTURE_CHUNK_SIZE,
      durationMs: MIC_CAPTURE_CHUNK_SIZE / 16
    }, {
      samples: 512,
      durationMs: 32
    });
  });
  test("propagates capture setup failures after cleaning up acquired resources", async () => {
    const setupError = new Error("audio source setup failed");
    let trackStopCalls = 0;
    const track = new class extends mock() {
      stop() {
        trackStopCalls++;
      }
    }();
    const stream = new class extends mock() {
      getTracks() {
        return [track];
      }
      getAudioTracks() {
        return [];
      }
    }();
    const targetWindow = Object.create(mainWindow);
    Object.defineProperties(targetWindow, {
      navigator: {
        value: {
          mediaDevices: {
            getUserMedia: async () => stream
          }
        }
      },
      AudioContext: {
        value: class {
          close() {
            return Promise.resolve();
          }
          createMediaStreamSource() {
            throw setupError;
          }
        }
      }
    });
    const service = store.add(new class extends MicCaptureService {
      getMediaCaptureWindow(targetWindow2) {
        return targetWindow2;
      }
    }(
      store.add(new TestStorageService()),
      new TestNotificationService(),
      new NullLogService()
    ));
    service.prepare(targetWindow);
    await assert.rejects(() => service.pttDown("turn-1"), (error) => error === setupError);
    assert.deepStrictEqual({
      isCapturing: service.isCapturing,
      trackStopCalls
    }, {
      isCapturing: false,
      trackStopCalls: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFxtaWNDYXB0dXJlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE1JQ19DQVBUVVJFX0NIVU5LX1NJWkUsIE1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5cbnN1aXRlKCdNaWNDYXB0dXJlU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdidWZmZXJzIDMyIG1zIHZvaWNlIGNodW5rcyBhdCAxNiBrSHonLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYW1wbGVzOiBNSUNfQ0FQVFVSRV9DSFVOS19TSVpFLFxuXHRcdFx0ZHVyYXRpb25NczogTUlDX0NBUFRVUkVfQ0hVTktfU0laRSAvIDE2LFxuXHRcdH0sIHtcblx0XHRcdHNhbXBsZXM6IDUxMixcblx0XHRcdGR1cmF0aW9uTXM6IDMyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9wYWdhdGVzIGNhcHR1cmUgc2V0dXAgZmFpbHVyZXMgYWZ0ZXIgY2xlYW5pbmcgdXAgYWNxdWlyZWQgcmVzb3VyY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNldHVwRXJyb3IgPSBuZXcgRXJyb3IoJ2F1ZGlvIHNvdXJjZSBzZXR1cCBmYWlsZWQnKTtcblx0XHRsZXQgdHJhY2tTdG9wQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IHRyYWNrID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNZWRpYVN0cmVhbVRyYWNrPigpIHtcblx0XHRcdG92ZXJyaWRlIHN0b3AoKTogdm9pZCB7IHRyYWNrU3RvcENhbGxzKys7IH1cblx0XHR9KCk7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNZWRpYVN0cmVhbT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRUcmFja3MoKTogTWVkaWFTdHJlYW1UcmFja1tdIHsgcmV0dXJuIFt0cmFja107IH1cblx0XHRcdG92ZXJyaWRlIGdldEF1ZGlvVHJhY2tzKCk6IE1lZGlhU3RyZWFtVHJhY2tbXSB7IHJldHVybiBbXTsgfVxuXHRcdH0oKTtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBPYmplY3QuY3JlYXRlKG1haW5XaW5kb3cpIGFzIFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHRhcmdldFdpbmRvdywge1xuXHRcdFx0bmF2aWdhdG9yOiB7XG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0bWVkaWFEZXZpY2VzOiB7XG5cdFx0XHRcdFx0XHRnZXRVc2VyTWVkaWE6IGFzeW5jICgpID0+IHN0cmVhbSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdEF1ZGlvQ29udGV4dDoge1xuXHRcdFx0XHR2YWx1ZTogY2xhc3Mge1xuXHRcdFx0XHRcdGNsb3NlKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0XHRcdFx0XHRjcmVhdGVNZWRpYVN0cmVhbVNvdXJjZSgpOiBuZXZlciB7IHRocm93IHNldHVwRXJyb3I7IH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBNaWNDYXB0dXJlU2VydmljZSB7XG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0TWVkaWFDYXB0dXJlV2luZG93KHRhcmdldFdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyB7XG5cdFx0XHRcdHJldHVybiB0YXJnZXRXaW5kb3c7XG5cdFx0XHR9XG5cdFx0fShcblx0XHRcdHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRzZXJ2aWNlLnByZXBhcmUodGFyZ2V0V2luZG93KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UucHR0RG93bigndHVybi0xJyksIGVycm9yID0+IGVycm9yID09PSBzZXR1cEVycm9yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzQ2FwdHVyaW5nOiBzZXJ2aWNlLmlzQ2FwdHVyaW5nLFxuXHRcdFx0dHJhY2tTdG9wQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0aXNDYXB0dXJpbmc6IGZhbHNlLFxuXHRcdFx0dHJhY2tTdG9wQ2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCLHlCQUF5QjtBQUUxRCxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVM7QUFBQSxNQUNULFlBQVkseUJBQXlCO0FBQUEsSUFDdEMsR0FBRztBQUFBLE1BQ0YsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEVBQTBFLFlBQVk7QUFDMUYsVUFBTSxhQUFhLElBQUksTUFBTSwyQkFBMkI7QUFDeEQsUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxRQUFRLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsTUFDL0MsT0FBYTtBQUFFO0FBQUEsTUFBa0I7QUFBQSxJQUMzQyxFQUFFO0FBQ0YsVUFBTSxTQUFTLElBQUksY0FBYyxLQUFrQixFQUFFO0FBQUEsTUFDM0MsWUFBZ0M7QUFBRSxlQUFPLENBQUMsS0FBSztBQUFBLE1BQUc7QUFBQSxNQUNsRCxpQkFBcUM7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHO0FBQUEsSUFDNUQsRUFBRTtBQUNGLFVBQU0sZUFBZSxPQUFPLE9BQU8sVUFBVTtBQUM3QyxXQUFPLGlCQUFpQixjQUFjO0FBQUEsTUFDckMsV0FBVztBQUFBLFFBQ1YsT0FBTztBQUFBLFVBQ04sY0FBYztBQUFBLFlBQ2IsY0FBYyxZQUFZO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsY0FBYztBQUFBLFFBQ2IsT0FBTyxNQUFNO0FBQUEsVUFDWixRQUF1QjtBQUFFLG1CQUFPLFFBQVEsUUFBUTtBQUFBLFVBQUc7QUFBQSxVQUNuRCwwQkFBaUM7QUFBRSxrQkFBTTtBQUFBLFVBQVk7QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFVBQVUsTUFBTSxJQUFJLElBQUksY0FBYyxrQkFBa0I7QUFBQSxNQUMxQyxzQkFBc0JBLGVBQXNFO0FBQzlHLGVBQU9BO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxNQUNDLE1BQU0sSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBQUEsTUFDbEMsSUFBSSx3QkFBd0I7QUFBQSxNQUM1QixJQUFJLGVBQWU7QUFBQSxJQUNwQixDQUFDO0FBQ0QsWUFBUSxRQUFRLFlBQVk7QUFFNUIsVUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLFFBQVEsUUFBUSxHQUFHLFdBQVMsVUFBVSxVQUFVO0FBQ25GLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsYUFBYSxRQUFRO0FBQUEsTUFDckI7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLGFBQWE7QUFBQSxNQUNiLGdCQUFnQjtBQUFBLElBQ2pCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJ0YXJnZXRXaW5kb3ciXQp9Cg==
