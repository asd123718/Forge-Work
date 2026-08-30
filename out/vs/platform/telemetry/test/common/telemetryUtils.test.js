import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { cleanRemoteAuthority } from "../../common/telemetryUtils.js";
suite("TelemetryUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("cleanRemoteAuthority", () => {
    test('returns "none" when remoteAuthority is undefined', () => {
      const config = {
        remoteExtensionTips: { "ssh-remote": {} },
        virtualWorkspaceExtensionTips: { "codespaces": {} }
      };
      const result = cleanRemoteAuthority(void 0, config);
      assert.strictEqual(result, "none");
    });
    test("returns remoteName when it exists in remoteExtensionTips", () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {},
          "dev-container": {},
          "wsl": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "ssh-remote");
      assert.strictEqual(cleanRemoteAuthority("dev-container", config), "dev-container");
      assert.strictEqual(cleanRemoteAuthority("wsl", config), "wsl");
    });
    test("returns remoteName when it exists in virtualWorkspaceExtensionTips", () => {
      const config = {
        remoteExtensionTips: {},
        virtualWorkspaceExtensionTips: {
          "codespaces": {},
          "tunnel": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("codespaces", config), "codespaces");
      assert.strictEqual(cleanRemoteAuthority("tunnel", config), "tunnel");
    });
    test('returns "other" when remoteName is not in either config', () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {},
          "dev-container": {}
        },
        virtualWorkspaceExtensionTips: {
          "codespaces": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("unknown-remote", config), "other");
      assert.strictEqual(cleanRemoteAuthority("custom-remote", config), "other");
    });
    test('returns "other" when config is empty', () => {
      const config = {
        remoteExtensionTips: {},
        virtualWorkspaceExtensionTips: {}
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
    });
    test("handles config with undefined remoteExtensionTips", () => {
      const config = {
        virtualWorkspaceExtensionTips: {
          "codespaces": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("codespaces", config), "codespaces");
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
    });
    test("handles config with undefined virtualWorkspaceExtensionTips", () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "ssh-remote");
      assert.strictEqual(cleanRemoteAuthority("codespaces", config), "other");
    });
    test("handles empty config object", () => {
      const config = {};
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
      assert.strictEqual(cleanRemoteAuthority(void 0, config), "none");
    });
    test("handles remoteAuthority with additional path segments", () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote+server1.example.com", config), "ssh-remote");
    });
    test("handles undefined config object", () => {
      const config = void 0;
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
      assert.strictEqual(cleanRemoteAuthority(void 0, config), "none");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVsZW1ldHJ5XFx0ZXN0XFxjb21tb25cXHRlbGVtZXRyeVV0aWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNsZWFuUmVtb3RlQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcblxuc3VpdGUoJ1RlbGVtZXRyeVV0aWxzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjbGVhblJlbW90ZUF1dGhvcml0eScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgXCJub25lXCIgd2hlbiByZW1vdGVBdXRob3JpdHkgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0ge1xuXHRcdFx0XHRyZW1vdGVFeHRlbnNpb25UaXBzOiB7ICdzc2gtcmVtb3RlJzoge30gfSxcblx0XHRcdFx0dmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHM6IHsgJ2NvZGVzcGFjZXMnOiB7fSB9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjbGVhblJlbW90ZUF1dGhvcml0eSh1bmRlZmluZWQsIGNvbmZpZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnbm9uZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZW1vdGVOYW1lIHdoZW4gaXQgZXhpc3RzIGluIHJlbW90ZUV4dGVuc2lvblRpcHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnc3NoLXJlbW90ZSc6IHt9LFxuXHRcdFx0XHRcdCdkZXYtY29udGFpbmVyJzoge30sXG5cdFx0XHRcdFx0J3dzbCc6IHt9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnc3NoLXJlbW90ZScsIGNvbmZpZyksICdzc2gtcmVtb3RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ2Rldi1jb250YWluZXInLCBjb25maWcpLCAnZGV2LWNvbnRhaW5lcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCd3c2wnLCBjb25maWcpLCAnd3NsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHJlbW90ZU5hbWUgd2hlbiBpdCBleGlzdHMgaW4gdmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvblRpcHM6IHt9LFxuXHRcdFx0XHR2aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwczoge1xuXHRcdFx0XHRcdCdjb2Rlc3BhY2VzJzoge30sXG5cdFx0XHRcdFx0J3R1bm5lbCc6IHt9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnY29kZXNwYWNlcycsIGNvbmZpZyksICdjb2Rlc3BhY2VzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ3R1bm5lbCcsIGNvbmZpZyksICd0dW5uZWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgXCJvdGhlclwiIHdoZW4gcmVtb3RlTmFtZSBpcyBub3QgaW4gZWl0aGVyIGNvbmZpZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHtcblx0XHRcdFx0cmVtb3RlRXh0ZW5zaW9uVGlwczoge1xuXHRcdFx0XHRcdCdzc2gtcmVtb3RlJzoge30sXG5cdFx0XHRcdFx0J2Rldi1jb250YWluZXInOiB7fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwczoge1xuXHRcdFx0XHRcdCdjb2Rlc3BhY2VzJzoge31cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCd1bmtub3duLXJlbW90ZScsIGNvbmZpZyksICdvdGhlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdjdXN0b20tcmVtb3RlJywgY29uZmlnKSwgJ290aGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFwib3RoZXJcIiB3aGVuIGNvbmZpZyBpcyBlbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHtcblx0XHRcdFx0cmVtb3RlRXh0ZW5zaW9uVGlwczoge30sXG5cdFx0XHRcdHZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzOiB7fVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdzc2gtcmVtb3RlJywgY29uZmlnKSwgJ290aGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbmZpZyB3aXRoIHVuZGVmaW5lZCByZW1vdGVFeHRlbnNpb25UaXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0ge1xuXHRcdFx0XHR2aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwczoge1xuXHRcdFx0XHRcdCdjb2Rlc3BhY2VzJzoge31cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdjb2Rlc3BhY2VzJywgY29uZmlnKSwgJ2NvZGVzcGFjZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnc3NoLXJlbW90ZScsIGNvbmZpZyksICdvdGhlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb25maWcgd2l0aCB1bmRlZmluZWQgdmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnc3NoLXJlbW90ZSc6IHt9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnc3NoLXJlbW90ZScsIGNvbmZpZyksICdzc2gtcmVtb3RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ2NvZGVzcGFjZXMnLCBjb25maWcpLCAnb3RoZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgY29uZmlnIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHt9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ3NzaC1yZW1vdGUnLCBjb25maWcpLCAnb3RoZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSh1bmRlZmluZWQsIGNvbmZpZyksICdub25lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHJlbW90ZUF1dGhvcml0eSB3aXRoIGFkZGl0aW9uYWwgcGF0aCBzZWdtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHtcblx0XHRcdFx0cmVtb3RlRXh0ZW5zaW9uVGlwczoge1xuXHRcdFx0XHRcdCdzc2gtcmVtb3RlJzoge31cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gZ2V0UmVtb3RlTmFtZSBzaG91bGQgZXh0cmFjdCBqdXN0IHRoZSBhdXRob3JpdHkgbmFtZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdzc2gtcmVtb3RlK3NlcnZlcjEuZXhhbXBsZS5jb20nLCBjb25maWcpLCAnc3NoLXJlbW90ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB1bmRlZmluZWQgY29uZmlnIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHVuZGVmaW5lZCE7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnc3NoLXJlbW90ZScsIGNvbmZpZyksICdvdGhlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KHVuZGVmaW5lZCwgY29uZmlnKSwgJ25vbmUnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLGtCQUFrQixNQUFNO0FBRTdCLDBDQUF3QztBQUV4QyxRQUFNLHdCQUF3QixNQUFNO0FBRW5DLFNBQUssb0RBQW9ELE1BQU07QUFDOUQsWUFBTSxTQUFTO0FBQUEsUUFDZCxxQkFBcUIsRUFBRSxjQUFjLENBQUMsRUFBRTtBQUFBLFFBQ3hDLCtCQUErQixFQUFFLGNBQWMsQ0FBQyxFQUFFO0FBQUEsTUFDbkQ7QUFFQSxZQUFNLFNBQVMscUJBQXFCLFFBQVcsTUFBTTtBQUNyRCxhQUFPLFlBQVksUUFBUSxNQUFNO0FBQUEsSUFDbEMsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsWUFBTSxTQUFTO0FBQUEsUUFDZCxxQkFBcUI7QUFBQSxVQUNwQixjQUFjLENBQUM7QUFBQSxVQUNmLGlCQUFpQixDQUFDO0FBQUEsVUFDbEIsT0FBTyxDQUFDO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFlBQVkscUJBQXFCLGNBQWMsTUFBTSxHQUFHLFlBQVk7QUFDM0UsYUFBTyxZQUFZLHFCQUFxQixpQkFBaUIsTUFBTSxHQUFHLGVBQWU7QUFDakYsYUFBTyxZQUFZLHFCQUFxQixPQUFPLE1BQU0sR0FBRyxLQUFLO0FBQUEsSUFDOUQsQ0FBQztBQUVELFNBQUssc0VBQXNFLE1BQU07QUFDaEYsWUFBTSxTQUFTO0FBQUEsUUFDZCxxQkFBcUIsQ0FBQztBQUFBLFFBQ3RCLCtCQUErQjtBQUFBLFVBQzlCLGNBQWMsQ0FBQztBQUFBLFVBQ2YsVUFBVSxDQUFDO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFlBQVkscUJBQXFCLGNBQWMsTUFBTSxHQUFHLFlBQVk7QUFDM0UsYUFBTyxZQUFZLHFCQUFxQixVQUFVLE1BQU0sR0FBRyxRQUFRO0FBQUEsSUFDcEUsQ0FBQztBQUVELFNBQUssMkRBQTJELE1BQU07QUFDckUsWUFBTSxTQUFTO0FBQUEsUUFDZCxxQkFBcUI7QUFBQSxVQUNwQixjQUFjLENBQUM7QUFBQSxVQUNmLGlCQUFpQixDQUFDO0FBQUEsUUFDbkI7QUFBQSxRQUNBLCtCQUErQjtBQUFBLFVBQzlCLGNBQWMsQ0FBQztBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUVBLGFBQU8sWUFBWSxxQkFBcUIsa0JBQWtCLE1BQU0sR0FBRyxPQUFPO0FBQzFFLGFBQU8sWUFBWSxxQkFBcUIsaUJBQWlCLE1BQU0sR0FBRyxPQUFPO0FBQUEsSUFDMUUsQ0FBQztBQUVELFNBQUssd0NBQXdDLE1BQU07QUFDbEQsWUFBTSxTQUFTO0FBQUEsUUFDZCxxQkFBcUIsQ0FBQztBQUFBLFFBQ3RCLCtCQUErQixDQUFDO0FBQUEsTUFDakM7QUFFQSxhQUFPLFlBQVkscUJBQXFCLGNBQWMsTUFBTSxHQUFHLE9BQU87QUFBQSxJQUN2RSxDQUFDO0FBRUQsU0FBSyxxREFBcUQsTUFBTTtBQUMvRCxZQUFNLFNBQVM7QUFBQSxRQUNkLCtCQUErQjtBQUFBLFVBQzlCLGNBQWMsQ0FBQztBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUVBLGFBQU8sWUFBWSxxQkFBcUIsY0FBYyxNQUFNLEdBQUcsWUFBWTtBQUMzRSxhQUFPLFlBQVkscUJBQXFCLGNBQWMsTUFBTSxHQUFHLE9BQU87QUFBQSxJQUN2RSxDQUFDO0FBRUQsU0FBSywrREFBK0QsTUFBTTtBQUN6RSxZQUFNLFNBQVM7QUFBQSxRQUNkLHFCQUFxQjtBQUFBLFVBQ3BCLGNBQWMsQ0FBQztBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUVBLGFBQU8sWUFBWSxxQkFBcUIsY0FBYyxNQUFNLEdBQUcsWUFBWTtBQUMzRSxhQUFPLFlBQVkscUJBQXFCLGNBQWMsTUFBTSxHQUFHLE9BQU87QUFBQSxJQUN2RSxDQUFDO0FBRUQsU0FBSywrQkFBK0IsTUFBTTtBQUN6QyxZQUFNLFNBQVMsQ0FBQztBQUVoQixhQUFPLFlBQVkscUJBQXFCLGNBQWMsTUFBTSxHQUFHLE9BQU87QUFDdEUsYUFBTyxZQUFZLHFCQUFxQixRQUFXLE1BQU0sR0FBRyxNQUFNO0FBQUEsSUFDbkUsQ0FBQztBQUVELFNBQUsseURBQXlELE1BQU07QUFDbkUsWUFBTSxTQUFTO0FBQUEsUUFDZCxxQkFBcUI7QUFBQSxVQUNwQixjQUFjLENBQUM7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFHQSxhQUFPLFlBQVkscUJBQXFCLGtDQUFrQyxNQUFNLEdBQUcsWUFBWTtBQUFBLElBQ2hHLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFlBQU0sU0FBUztBQUVmLGFBQU8sWUFBWSxxQkFBcUIsY0FBYyxNQUFNLEdBQUcsT0FBTztBQUN0RSxhQUFPLFlBQVkscUJBQXFCLFFBQVcsTUFBTSxHQUFHLE1BQU07QUFBQSxJQUNuRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
