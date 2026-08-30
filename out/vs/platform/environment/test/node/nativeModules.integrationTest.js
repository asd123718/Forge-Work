import assert from "assert";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { flakySuite } from "../../../../base/test/common/testUtils.js";
function testErrorMessage(module) {
  return `Unable to load "${module}" dependency. It was probably not compiled for the right operating system architecture or had missing build tools.`;
}
flakySuite("Native Modules (all platforms)", () => {
  (isMacintosh ? test.skip : test)("kerberos", async () => {
    const { default: kerberos } = await import("kerberos");
    assert.ok(typeof kerberos.initializeClient === "function", testErrorMessage("kerberos"));
  });
  test("yauzl", async () => {
    const { default: yauzl } = await import("yauzl");
    assert.ok(typeof yauzl.ZipFile === "function", testErrorMessage("yauzl"));
  });
  test("yazl", async () => {
    const { default: yazl } = await import("yazl");
    assert.ok(typeof yazl.ZipFile === "function", testErrorMessage("yazl"));
  });
  test("chrome-remote-interface", async () => {
    const { default: cdp } = await import("chrome-remote-interface");
    assert.ok(typeof cdp === "function", testErrorMessage("chrome-remote-interface"));
  });
  test("native-is-elevated", async () => {
    const { default: isElevated } = await import("native-is-elevated");
    assert.ok(typeof isElevated === "function", testErrorMessage("native-is-elevated "));
    const result = isElevated();
    assert.ok(typeof result === "boolean", testErrorMessage("native-is-elevated"));
  });
  test("native-keymap", async () => {
    const keyMap = await import("native-keymap");
    assert.ok(typeof keyMap.onDidChangeKeyboardLayout === "function", testErrorMessage("native-keymap"));
    assert.ok(typeof keyMap.getCurrentKeyboardLayout === "function", testErrorMessage("native-keymap"));
    const result = keyMap.getCurrentKeyboardLayout();
    assert.ok(result, testErrorMessage("native-keymap"));
  });
  test("@vscode/native-watchdog", async () => {
    const watchDog = await import("@vscode/native-watchdog");
    assert.ok(typeof watchDog.start === "function", testErrorMessage("@vscode/native-watchdog"));
  });
  test("@vscode/sudo-prompt", async () => {
    const prompt = await import("@vscode/sudo-prompt");
    assert.ok(typeof prompt.exec === "function", testErrorMessage("@vscode/sudo-prompt"));
  });
  test("@vscode/policy-watcher", async () => {
    const watcher = await import("@vscode/policy-watcher");
    assert.ok(typeof watcher.createWatcher === "function", testErrorMessage("@vscode/policy-watcher"));
  });
  test("node-pty", async () => {
    const nodePty = await import("node-pty");
    assert.ok(typeof nodePty.spawn === "function", testErrorMessage("node-pty"));
  });
  test("@vscode/spdlog", async () => {
    const spdlog = await import("@vscode/spdlog");
    assert.ok(typeof spdlog.createRotatingLogger === "function", testErrorMessage("@vscode/spdlog"));
    assert.ok(typeof spdlog.version === "number", testErrorMessage("@vscode/spdlog"));
  });
  test("@parcel/watcher", async () => {
    const parcelWatcher = await import("@parcel/watcher");
    assert.ok(typeof parcelWatcher.subscribe === "function", testErrorMessage("@parcel/watcher"));
  });
  test("@vscode/deviceid", async () => {
    const deviceIdPackage = await import("@vscode/deviceid");
    assert.ok(typeof deviceIdPackage.getDeviceId === "function", testErrorMessage("@vscode/deviceid"));
  });
  test("@vscode/ripgrep-universal", async () => {
    const ripgrep = await import("@vscode/ripgrep-universal");
    assert.ok(typeof ripgrep.rgPath === "string", testErrorMessage("@vscode/ripgrep-universal"));
  });
  test("vscode-regexpp", async () => {
    const regexpp = await import("vscode-regexpp");
    assert.ok(typeof regexpp.RegExpParser === "function", testErrorMessage("vscode-regexpp"));
  });
  test("@vscode/sqlite3", async () => {
    const { default: sqlite3 } = await import("@vscode/sqlite3");
    assert.ok(typeof sqlite3.Database === "function", testErrorMessage("@vscode/sqlite3"));
  });
  test("http-proxy-agent", async () => {
    const { default: mod } = await import("http-proxy-agent");
    assert.ok(typeof mod.HttpProxyAgent === "function", testErrorMessage("http-proxy-agent"));
  });
  test("https-proxy-agent", async () => {
    const { default: mod } = await import("https-proxy-agent");
    assert.ok(typeof mod.HttpsProxyAgent === "function", testErrorMessage("https-proxy-agent"));
  });
  test("@vscode/proxy-agent", async () => {
    const proxyAgent = await import("@vscode/proxy-agent");
    const windowsCerts = await proxyAgent.loadSystemCertificates({
      loadSystemCertificatesFromNode: () => void 0,
      log: {
        trace: () => {
        },
        debug: () => {
        },
        info: () => {
        },
        warn: () => {
        },
        error: () => {
        }
      }
    });
    assert.ok(windowsCerts.length > 0, testErrorMessage("@vscode/proxy-agent"));
  });
  test("@vscode/os-proxy-resolver", async () => {
    const proxyResolver = await import("@vscode/os-proxy-resolver");
    const proxies = await proxyResolver.resolveProxy("https://example.com/");
    const config = await proxyResolver.readProxyConfig();
    assert.deepStrictEqual({
      resolveProxy: proxies.length > 0,
      readProxyConfig: typeof config.autoDetect === "boolean"
    }, {
      resolveProxy: true,
      readProxyConfig: true
    }, testErrorMessage("@vscode/os-proxy-resolver"));
  });
});
(!isWindows ? suite.skip : suite)("Native Modules (Windows)", () => {
  test("@vscode/windows-mutex", async () => {
    const mutex = await import("@vscode/windows-mutex");
    assert.ok(mutex && typeof mutex.isActive === "function", testErrorMessage("@vscode/windows-mutex"));
    assert.ok(typeof mutex.isActive === "function", testErrorMessage("@vscode/windows-mutex"));
    assert.ok(typeof mutex.Mutex === "function", testErrorMessage("@vscode/windows-mutex"));
  });
  test("windows-foreground-love", async () => {
    const foregroundLove = await import("windows-foreground-love");
    assert.ok(typeof foregroundLove.allowSetForegroundWindow === "function", testErrorMessage("windows-foreground-love"));
    const result = foregroundLove.allowSetForegroundWindow(process.pid);
    assert.ok(typeof result === "boolean", testErrorMessage("windows-foreground-love"));
  });
  test("@vscode/windows-process-tree", async () => {
    const processTree = await import("@vscode/windows-process-tree");
    assert.ok(typeof processTree.getProcessTree === "function", testErrorMessage("@vscode/windows-process-tree"));
    return new Promise((resolve, reject) => {
      processTree.getProcessTree(process.pid, (tree) => {
        if (tree) {
          resolve();
        } else {
          reject(new Error(testErrorMessage("@vscode/windows-process-tree")));
        }
      });
    });
  });
  test("@vscode/windows-registry", async () => {
    const windowsRegistry = await import("@vscode/windows-registry");
    assert.ok(typeof windowsRegistry.GetStringRegKey === "function", testErrorMessage("@vscode/windows-registry"));
    const result = windowsRegistry.GetStringRegKey("HKEY_LOCAL_MACHINE", "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "EditionID");
    assert.ok(typeof result === "string" || typeof result === "undefined", testErrorMessage("@vscode/windows-registry"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZW52aXJvbm1lbnRcXHRlc3RcXG5vZGVcXG5hdGl2ZU1vZHVsZXMuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGZsYWt5U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3Rlc3RVdGlscy5qcyc7XG5cbmZ1bmN0aW9uIHRlc3RFcnJvck1lc3NhZ2UobW9kdWxlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYFVuYWJsZSB0byBsb2FkIFwiJHttb2R1bGV9XCIgZGVwZW5kZW5jeS4gSXQgd2FzIHByb2JhYmx5IG5vdCBjb21waWxlZCBmb3IgdGhlIHJpZ2h0IG9wZXJhdGluZyBzeXN0ZW0gYXJjaGl0ZWN0dXJlIG9yIGhhZCBtaXNzaW5nIGJ1aWxkIHRvb2xzLmA7XG59XG5cbmZsYWt5U3VpdGUoJ05hdGl2ZSBNb2R1bGVzIChhbGwgcGxhdGZvcm1zKScsICgpID0+IHtcblxuXHQoaXNNYWNpbnRvc2ggPyB0ZXN0LnNraXAgOiB0ZXN0KSgna2VyYmVyb3MnLCBhc3luYyAoKSA9PiB7IC8vIFNvbWVob3cgZmFpbHMgb24gbWFjT1MgQVJNP1xuXHRcdGNvbnN0IHsgZGVmYXVsdDoga2VyYmVyb3MgfSA9IGF3YWl0IGltcG9ydCgna2VyYmVyb3MnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGtlcmJlcm9zLmluaXRpYWxpemVDbGllbnQgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ2tlcmJlcm9zJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd5YXV6bCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IHlhdXpsIH0gPSBhd2FpdCBpbXBvcnQoJ3lhdXpsJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiB5YXV6bC5aaXBGaWxlID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCd5YXV6bCcpKTtcblx0fSk7XG5cblx0dGVzdCgneWF6bCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IHlhemwgfSA9IGF3YWl0IGltcG9ydCgneWF6bCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgeWF6bC5aaXBGaWxlID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCd5YXpsJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaHJvbWUtcmVtb3RlLWludGVyZmFjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IGNkcCB9ID0gYXdhaXQgaW1wb3J0KCdjaHJvbWUtcmVtb3RlLWludGVyZmFjZScpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgY2RwID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdjaHJvbWUtcmVtb3RlLWludGVyZmFjZScpKTtcblx0fSk7XG5cblx0dGVzdCgnbmF0aXZlLWlzLWVsZXZhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVmYXVsdDogaXNFbGV2YXRlZCB9ID0gYXdhaXQgaW1wb3J0KCduYXRpdmUtaXMtZWxldmF0ZWQnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGlzRWxldmF0ZWQgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ25hdGl2ZS1pcy1lbGV2YXRlZCAnKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBpc0VsZXZhdGVkKCk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiByZXN1bHQgPT09ICdib29sZWFuJywgdGVzdEVycm9yTWVzc2FnZSgnbmF0aXZlLWlzLWVsZXZhdGVkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXRpdmUta2V5bWFwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGtleU1hcCA9IGF3YWl0IGltcG9ydCgnbmF0aXZlLWtleW1hcCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Yga2V5TWFwLm9uRGlkQ2hhbmdlS2V5Ym9hcmRMYXlvdXQgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ25hdGl2ZS1rZXltYXAnKSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBrZXlNYXAuZ2V0Q3VycmVudEtleWJvYXJkTGF5b3V0ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCduYXRpdmUta2V5bWFwJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0ga2V5TWFwLmdldEN1cnJlbnRLZXlib2FyZExheW91dCgpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsIHRlc3RFcnJvck1lc3NhZ2UoJ25hdGl2ZS1rZXltYXAnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0B2c2NvZGUvbmF0aXZlLXdhdGNoZG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdhdGNoRG9nID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL25hdGl2ZS13YXRjaGRvZycpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygd2F0Y2hEb2cuc3RhcnQgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvbmF0aXZlLXdhdGNoZG9nJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL3N1ZG8tcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb21wdCA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9zdWRvLXByb21wdCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgcHJvbXB0LmV4ZWMgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvc3Vkby1wcm9tcHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0B2c2NvZGUvcG9saWN5LXdhdGNoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2F0Y2hlciA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9wb2xpY3ktd2F0Y2hlcicpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygd2F0Y2hlci5jcmVhdGVXYXRjaGVyID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3BvbGljeS13YXRjaGVyJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdub2RlLXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBub2RlUHR5ID0gYXdhaXQgaW1wb3J0KCdub2RlLXB0eScpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygbm9kZVB0eS5zcGF3biA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnbm9kZS1wdHknKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0B2c2NvZGUvc3BkbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNwZGxvZyA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9zcGRsb2cnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNwZGxvZy5jcmVhdGVSb3RhdGluZ0xvZ2dlciA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS9zcGRsb2cnKSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzcGRsb2cudmVyc2lvbiA9PT0gJ251bWJlcicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvc3BkbG9nJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAcGFyY2VsL3dhdGNoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyY2VsV2F0Y2hlciA9IGF3YWl0IGltcG9ydCgnQHBhcmNlbC93YXRjaGVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBwYXJjZWxXYXRjaGVyLnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHBhcmNlbC93YXRjaGVyJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL2RldmljZWlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRldmljZUlkUGFja2FnZSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9kZXZpY2VpZCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgZGV2aWNlSWRQYWNrYWdlLmdldERldmljZUlkID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL2RldmljZWlkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL3JpcGdyZXAtdW5pdmVyc2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJpcGdyZXAgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvcmlwZ3JlcC11bml2ZXJzYWwnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHJpcGdyZXAucmdQYXRoID09PSAnc3RyaW5nJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS9yaXBncmVwLXVuaXZlcnNhbCcpKTtcblx0fSk7XG5cblx0dGVzdCgndnNjb2RlLXJlZ2V4cHAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnZXhwcCA9IGF3YWl0IGltcG9ydCgndnNjb2RlLXJlZ2V4cHAnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHJlZ2V4cHAuUmVnRXhwUGFyc2VyID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCd2c2NvZGUtcmVnZXhwcCcpKTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS9zcWxpdGUzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVmYXVsdDogc3FsaXRlMyB9ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3NxbGl0ZTMnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNxbGl0ZTMuRGF0YWJhc2UgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvc3FsaXRlMycpKTtcblx0fSk7XG5cblx0dGVzdCgnaHR0cC1wcm94eS1hZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IG1vZCB9ID0gYXdhaXQgaW1wb3J0KCdodHRwLXByb3h5LWFnZW50Jyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBtb2QuSHR0cFByb3h5QWdlbnQgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ2h0dHAtcHJveHktYWdlbnQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2h0dHBzLXByb3h5LWFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVmYXVsdDogbW9kIH0gPSBhd2FpdCBpbXBvcnQoJ2h0dHBzLXByb3h5LWFnZW50Jyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBtb2QuSHR0cHNQcm94eUFnZW50ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdodHRwcy1wcm94eS1hZ2VudCcpKTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS9wcm94eS1hZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm94eUFnZW50ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3Byb3h5LWFnZW50Jyk7XG5cdFx0Ly8gVGhpcyBjYWxsIHdpbGwgbG9hZCBgQHZzY29kZS9wcm94eS1hZ2VudGAgd2hpY2ggaXMgYSBuYXRpdmUgbW9kdWxlIHRoYXQgd2Ugd2FudCB0byB0ZXN0IG9uIFdpbmRvd3Ncblx0XHRjb25zdCB3aW5kb3dzQ2VydHMgPSBhd2FpdCBwcm94eUFnZW50LmxvYWRTeXN0ZW1DZXJ0aWZpY2F0ZXMoe1xuXHRcdFx0bG9hZFN5c3RlbUNlcnRpZmljYXRlc0Zyb21Ob2RlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRsb2c6IHtcblx0XHRcdFx0dHJhY2U6ICgpID0+IHsgfSxcblx0XHRcdFx0ZGVidWc6ICgpID0+IHsgfSxcblx0XHRcdFx0aW5mbzogKCkgPT4geyB9LFxuXHRcdFx0XHR3YXJuOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGVycm9yOiAoKSA9PiB7IH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQub2sod2luZG93c0NlcnRzLmxlbmd0aCA+IDAsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvcHJveHktYWdlbnQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0B2c2NvZGUvb3MtcHJveHktcmVzb2x2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJveHlSZXNvbHZlciA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9vcy1wcm94eS1yZXNvbHZlcicpO1xuXHRcdGNvbnN0IHByb3hpZXMgPSBhd2FpdCBwcm94eVJlc29sdmVyLnJlc29sdmVQcm94eSgnaHR0cHM6Ly9leGFtcGxlLmNvbS8nKTtcblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBwcm94eVJlc29sdmVyLnJlYWRQcm94eUNvbmZpZygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x2ZVByb3h5OiBwcm94aWVzLmxlbmd0aCA+IDAsXG5cdFx0XHRyZWFkUHJveHlDb25maWc6IHR5cGVvZiBjb25maWcuYXV0b0RldGVjdCA9PT0gJ2Jvb2xlYW4nLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdmVQcm94eTogdHJ1ZSxcblx0XHRcdHJlYWRQcm94eUNvbmZpZzogdHJ1ZSxcblx0XHR9LCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL29zLXByb3h5LXJlc29sdmVyJykpO1xuXHR9KTtcbn0pO1xuXG4oIWlzV2luZG93cyA/IHN1aXRlLnNraXAgOiBzdWl0ZSkoJ05hdGl2ZSBNb2R1bGVzIChXaW5kb3dzKScsICgpID0+IHtcblxuXHR0ZXN0KCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbXV0ZXggPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1tdXRleCcpO1xuXHRcdGFzc2VydC5vayhtdXRleCAmJiB0eXBlb2YgbXV0ZXguaXNBY3RpdmUgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvd2luZG93cy1tdXRleCcpKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIG11dGV4LmlzQWN0aXZlID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnKSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBtdXRleC5NdXRleCA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS93aW5kb3dzLW11dGV4JykpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aW5kb3dzLWZvcmVncm91bmQtbG92ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb3JlZ3JvdW5kTG92ZSA9IGF3YWl0IGltcG9ydCgnd2luZG93cy1mb3JlZ3JvdW5kLWxvdmUnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGZvcmVncm91bmRMb3ZlLmFsbG93U2V0Rm9yZWdyb3VuZFdpbmRvdyA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnd2luZG93cy1mb3JlZ3JvdW5kLWxvdmUnKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBmb3JlZ3JvdW5kTG92ZS5hbGxvd1NldEZvcmVncm91bmRXaW5kb3cocHJvY2Vzcy5waWQpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicsIHRlc3RFcnJvck1lc3NhZ2UoJ3dpbmRvd3MtZm9yZWdyb3VuZC1sb3ZlJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL3dpbmRvd3MtcHJvY2Vzcy10cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb2Nlc3NUcmVlID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtcHJvY2Vzcy10cmVlJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBwcm9jZXNzVHJlZS5nZXRQcm9jZXNzVHJlZSA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZScpKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRwcm9jZXNzVHJlZS5nZXRQcm9jZXNzVHJlZShwcm9jZXNzLnBpZCwgdHJlZSA9PiB7XG5cdFx0XHRcdGlmICh0cmVlKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IodGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZScpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL3dpbmRvd3MtcmVnaXN0cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2luZG93c1JlZ2lzdHJ5ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtcmVnaXN0cnknKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHdpbmRvd3NSZWdpc3RyeS5HZXRTdHJpbmdSZWdLZXkgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvd2luZG93cy1yZWdpc3RyeScpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHdpbmRvd3NSZWdpc3RyeS5HZXRTdHJpbmdSZWdLZXkoJ0hLRVlfTE9DQUxfTUFDSElORScsICdTT0ZUV0FSRVxcXFxNaWNyb3NvZnRcXFxcV2luZG93cyBOVFxcXFxDdXJyZW50VmVyc2lvbicsICdFZGl0aW9uSUQnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ3VuZGVmaW5lZCcsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvd2luZG93cy1yZWdpc3RyeScpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWEsaUJBQWlCO0FBQ3ZDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsaUJBQWlCLFFBQXdCO0FBQ2pELFNBQU8sbUJBQW1CLE1BQU07QUFDakM7QUFFQSxXQUFXLGtDQUFrQyxNQUFNO0FBRWxELEdBQUMsY0FBYyxLQUFLLE9BQU8sTUFBTSxZQUFZLFlBQVk7QUFDeEQsVUFBTSxFQUFFLFNBQVMsU0FBUyxJQUFJLE1BQU0sT0FBTyxVQUFVO0FBQ3JELFdBQU8sR0FBRyxPQUFPLFNBQVMscUJBQXFCLFlBQVksaUJBQWlCLFVBQVUsQ0FBQztBQUFBLEVBQ3hGLENBQUM7QUFFRCxPQUFLLFNBQVMsWUFBWTtBQUN6QixVQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksTUFBTSxPQUFPLE9BQU87QUFDL0MsV0FBTyxHQUFHLE9BQU8sTUFBTSxZQUFZLFlBQVksaUJBQWlCLE9BQU8sQ0FBQztBQUFBLEVBQ3pFLENBQUM7QUFFRCxPQUFLLFFBQVEsWUFBWTtBQUN4QixVQUFNLEVBQUUsU0FBUyxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU07QUFDN0MsV0FBTyxHQUFHLE9BQU8sS0FBSyxZQUFZLFlBQVksaUJBQWlCLE1BQU0sQ0FBQztBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLDJCQUEyQixZQUFZO0FBQzNDLFVBQU0sRUFBRSxTQUFTLElBQUksSUFBSSxNQUFNLE9BQU8seUJBQXlCO0FBQy9ELFdBQU8sR0FBRyxPQUFPLFFBQVEsWUFBWSxpQkFBaUIseUJBQXlCLENBQUM7QUFBQSxFQUNqRixDQUFDO0FBRUQsT0FBSyxzQkFBc0IsWUFBWTtBQUN0QyxVQUFNLEVBQUUsU0FBUyxXQUFX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O0FBQ0YsQ0FBQztBQUFBLENBRUEsQ0FBQyxZQUFZLE1BQU0sT0FBTyxPQUFPLDRCQUE0QixNQUFNO0FBRW5FLE9BQUsseUJBQXlCLFlBQVk7QUFDekMsVUFBTSxRQUFRLE1BQU0sT0FBTyx1QkFBdUI7QUFDbEQsV0FBTyxHQUFHLFNBQVMsT0FBTyxNQUFNLGFBQWEsWUFBWSxpQkFBaUIsdUJBQXVCLENBQUM7QUFDbEcsV0FBTyxHQUFHLE9BQU8sTUFBTSxhQUFhLFlBQVksaUJBQWlCLHVCQUF1QixDQUFDO0FBQ3pGLFdBQU8sR0FBRyxPQUFPLE1BQU0sVUFBVSxZQUFZLGlCQUFpQix1QkFBdUIsQ0FBQztBQUFBLEVBQ3ZGLENBQUM7QUFFRCxPQUFLLDJCQUEyQixZQUFZO0FBQzNDLFVBQU0saUJBQWlCLE1BQU0sT0FBTyx5QkFBeUI7QUFDN0QsV0FBTyxHQUFHLE9BQU8sZUFBZSw2QkFBNkIsWUFBWSxpQkFBaUIseUJBQXlCLENBQUM7QUFFcEgsVUFBTSxTQUFTLGVBQWUseUJBQXlCLFFBQVEsR0FBRztBQUNsRSxXQUFPLEdBQUcsT0FBTyxXQUFXLFdBQVcsaUJBQWlCLHlCQUF5QixDQUFDO0FBQUEsRUFDbkYsQ0FBQztBQUVELE9BQUssZ0NBQWdDLFlBQVk7QUFDaEQsVUFBTSxjQUFjLE1BQU0sT0FBTyw4QkFBOEI7QUFDL0QsV0FBTyxHQUFHLE9BQU8sWUFBWSxtQkFBbUIsWUFBWSxpQkFBaUIsOEJBQThCLENBQUM7QUFFNUcsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsa0JBQVksZUFBZSxRQUFRLEtBQUssVUFBUTtBQUMvQyxZQUFJLE1BQU07QUFDVCxrQkFBUTtBQUFBLFFBQ1QsT0FBTztBQUNOLGlCQUFPLElBQUksTUFBTSxpQkFBaUIsOEJBQThCLENBQUMsQ0FBQztBQUFBLFFBQ25FO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0QkFBNEIsWUFBWTtBQUM1QyxVQUFNLGtCQUFrQixNQUFNLE9BQU8sMEJBQTBCO0FBQy9ELFdBQU8sR0FBRyxPQUFPLGdCQUFnQixvQkFBb0IsWUFBWSxpQkFBaUIsMEJBQTBCLENBQUM7QUFFN0csVUFBTSxTQUFTLGdCQUFnQixnQkFBZ0Isc0JBQXNCLG1EQUFtRCxXQUFXO0FBQ25JLFdBQU8sR0FBRyxPQUFPLFdBQVcsWUFBWSxPQUFPLFdBQVcsYUFBYSxpQkFBaUIsMEJBQTBCLENBQUM7QUFBQSxFQUNwSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
