(function() {
  const { ipcRenderer, webFrame, contextBridge, webUtils } = require("electron");
  function validateIPC(channel) {
    if (!channel?.startsWith("vscode:")) {
      throw new Error(`Unsupported event IPC channel '${channel}'`);
    }
    return true;
  }
  function parseArgv(key) {
    for (const arg of process.argv) {
      if (arg.indexOf(`--${key}=`) === 0) {
        return arg.split("=")[1];
      }
    }
    return void 0;
  }
  let configuration = void 0;
  const resolveConfiguration = (async () => {
    const windowConfigIpcChannel = parseArgv("vscode-window-config");
    if (!windowConfigIpcChannel) {
      throw new Error("Preload: did not find expected vscode-window-config in renderer process arguments list.");
    }
    try {
      validateIPC(windowConfigIpcChannel);
      const resolvedConfiguration = configuration = await ipcRenderer.invoke(windowConfigIpcChannel);
      Object.assign(process.env, resolvedConfiguration.userEnv);
      webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);
      return resolvedConfiguration;
    } catch (error) {
      throw new Error(`Preload: unable to fetch vscode-window-config: ${error}`);
    }
  })();
  const resolveShellEnv = (async () => {
    const [userEnv, shellEnv] = await Promise.all([
      (async () => (await resolveConfiguration).userEnv)(),
      ipcRenderer.invoke("vscode:fetchShellEnv")
    ]);
    return { ...process.env, ...shellEnv, ...userEnv };
  })();
  const globals = {
    /**
     * A minimal set of methods exposed from Electron's `ipcRenderer`
     * to support communication to main process.
     */
    ipcRenderer: {
      send(channel, ...args) {
        if (validateIPC(channel)) {
          ipcRenderer.send(channel, ...args);
        }
      },
      invoke(channel, ...args) {
        validateIPC(channel);
        return ipcRenderer.invoke(channel, ...args);
      },
      on(channel, listener) {
        validateIPC(channel);
        ipcRenderer.on(channel, listener);
        return this;
      },
      once(channel, listener) {
        validateIPC(channel);
        ipcRenderer.once(channel, listener);
        return this;
      },
      removeListener(channel, listener) {
        validateIPC(channel);
        ipcRenderer.removeListener(channel, listener);
        return this;
      }
    },
    ipcMessagePort: {
      acquire(responseChannel, nonce) {
        if (validateIPC(responseChannel)) {
          const responseListener = (e, response) => {
            const responseNonce = typeof response === "string" ? response : response.nonce;
            if (nonce === responseNonce) {
              ipcRenderer.off(responseChannel, responseListener);
              window.postMessage(response, "*", e.ports);
            }
          };
          ipcRenderer.on(responseChannel, responseListener);
        }
      }
    },
    /**
     * Support for subset of methods of Electron's `webFrame` type.
     */
    webFrame: {
      setZoomLevel(level) {
        if (typeof level === "number") {
          webFrame.setZoomLevel(level);
        }
      }
    },
    /**
     * Support for subset of Electron's `webUtils` type.
     */
    webUtils: {
      getPathForFile(file) {
        return webUtils.getPathForFile(file);
      }
    },
    /**
     * Support for a subset of access to node.js global `process`.
     *
     * Note: when `sandbox` is enabled, the only properties available
     * are https://github.com/electron/electron/blob/master/docs/api/process.md#sandbox
     */
    process: {
      get platform() {
        return process.platform;
      },
      get arch() {
        return process.arch;
      },
      get env() {
        return { ...process.env };
      },
      get versions() {
        return process.versions;
      },
      get type() {
        return "renderer";
      },
      get execPath() {
        return process.execPath;
      },
      cwd() {
        return process.env["VSCODE_CWD"] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === "win32" ? "\\" : "/"));
      },
      shellEnv() {
        return resolveShellEnv;
      },
      getProcessMemoryInfo() {
        return process.getProcessMemoryInfo();
      },
      on(type, callback) {
        process.on(type, callback);
      }
    },
    /**
     * Some information about the context we are running in.
     */
    context: {
      /**
       * A configuration object made accessible from the main side
       * to configure the sandbox browser window.
       *
       * Note: intentionally not using a getter here because the
       * actual value will be set after `resolveConfiguration`
       * has finished.
       */
      configuration() {
        return configuration;
      },
      /**
       * Allows to await the resolution of the configuration object.
       */
      async resolveConfiguration() {
        return resolveConfiguration;
      }
    }
  };
  try {
    contextBridge.exposeInMainWorld("vscode", globals);
  } catch (error) {
    console.error(error);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcc2FuZGJveFxcZWxlY3Ryb24tYnJvd3NlclxccHJlbG9hZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qIGVzbGludC1kaXNhYmxlIG5vLXJlc3RyaWN0ZWQtZ2xvYmFscyAqL1xuXG4oZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHsgaXBjUmVuZGVyZXIsIHdlYkZyYW1lLCBjb250ZXh0QnJpZGdlLCB3ZWJVdGlscyB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcblxuXHR0eXBlIElTYW5kYm94Q29uZmlndXJhdGlvbiA9IGltcG9ydCgnLi4vY29tbW9uL3NhbmRib3hUeXBlcy5qcycpLklTYW5kYm94Q29uZmlndXJhdGlvbjtcblxuXHQvLyNyZWdpb24gVXRpbGl0aWVzXG5cblx0ZnVuY3Rpb24gdmFsaWRhdGVJUEMoY2hhbm5lbDogc3RyaW5nKTogdHJ1ZSB8IG5ldmVyIHtcblx0XHRpZiAoIWNoYW5uZWw/LnN0YXJ0c1dpdGgoJ3ZzY29kZTonKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBldmVudCBJUEMgY2hhbm5lbCAnJHtjaGFubmVsfSdgKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlQXJndihrZXk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBhcmcgb2YgcHJvY2Vzcy5hcmd2KSB7XG5cdFx0XHRpZiAoYXJnLmluZGV4T2YoYC0tJHtrZXl9PWApID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBhcmcuc3BsaXQoJz0nKVsxXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlc29sdmUgQ29uZmlndXJhdGlvblxuXG5cdGxldCBjb25maWd1cmF0aW9uOiBJU2FuZGJveENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3QgcmVzb2x2ZUNvbmZpZ3VyYXRpb246IFByb21pc2U8SVNhbmRib3hDb25maWd1cmF0aW9uPiA9IChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2luZG93Q29uZmlnSXBjQ2hhbm5lbCA9IHBhcnNlQXJndigndnNjb2RlLXdpbmRvdy1jb25maWcnKTtcblx0XHRpZiAoIXdpbmRvd0NvbmZpZ0lwY0NoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUHJlbG9hZDogZGlkIG5vdCBmaW5kIGV4cGVjdGVkIHZzY29kZS13aW5kb3ctY29uZmlnIGluIHJlbmRlcmVyIHByb2Nlc3MgYXJndW1lbnRzIGxpc3QuJyk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHZhbGlkYXRlSVBDKHdpbmRvd0NvbmZpZ0lwY0NoYW5uZWwpO1xuXG5cdFx0XHQvLyBSZXNvbHZlIGNvbmZpZ3VyYXRpb24gZnJvbSBlbGVjdHJvbi1tYWluXG5cdFx0XHRjb25zdCByZXNvbHZlZENvbmZpZ3VyYXRpb246IElTYW5kYm94Q29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb24gPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2Uod2luZG93Q29uZmlnSXBjQ2hhbm5lbCk7XG5cblx0XHRcdC8vIEFwcGx5IGB1c2VyRW52YCBkaXJlY3RseVxuXHRcdFx0T2JqZWN0LmFzc2lnbihwcm9jZXNzLmVudiwgcmVzb2x2ZWRDb25maWd1cmF0aW9uLnVzZXJFbnYpO1xuXG5cdFx0XHQvLyBBcHBseSB6b29tIGxldmVsIGVhcmx5IGJlZm9yZSBldmVuIGJ1aWxkaW5nIHRoZVxuXHRcdFx0Ly8gd2luZG93IERPTSBlbGVtZW50cyB0byBhdm9pZCBVSSBmbGlja2VyLiBXZSBhbHdheXNcblx0XHRcdC8vIGhhdmUgdG8gc2V0IHRoZSB6b29tIGxldmVsIGZyb20gd2l0aGluIHRoZSB3aW5kb3dcblx0XHRcdC8vIGJlY2F1c2UgQ2hyb21lIGhhcyBpdCdzIG93biB3YXkgb2YgcmVtZW1iZXJpbmcgem9vbVxuXHRcdFx0Ly8gc2V0dGluZ3MgcGVyIG9yaWdpbiAoaWYgdnNjb2RlLWZpbGU6Ly8gaXMgdXNlZCkgYW5kXG5cdFx0XHQvLyB3ZSB3YW50IHRvIGVuc3VyZSB0aGF0IHRoZSB1c2VyIGNvbmZpZ3VyYXRpb24gd2lucy5cblx0XHRcdHdlYkZyYW1lLnNldFpvb21MZXZlbChyZXNvbHZlZENvbmZpZ3VyYXRpb24uem9vbUxldmVsID8/IDApO1xuXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZWRDb25maWd1cmF0aW9uO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByZWxvYWQ6IHVuYWJsZSB0byBmZXRjaCB2c2NvZGUtd2luZG93LWNvbmZpZzogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH0pKCk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlc29sdmUgU2hlbGwgRW52aXJvbm1lbnRcblxuXHQvKipcblx0ICogSWYgVlNDb2RlIGlzIG5vdCBydW4gZnJvbSBhIHRlcm1pbmFsLCB3ZSBzaG91bGQgcmVzb2x2ZSBhZGRpdGlvbmFsXG5cdCAqIHNoZWxsIHNwZWNpZmljIGVudmlyb25tZW50IGZyb20gdGhlIE9TIHNoZWxsIHRvIGVuc3VyZSB3ZSBhcmUgc2VlaW5nXG5cdCAqIGFsbCBkZXZlbG9wbWVudCByZWxhdGVkIGVudmlyb25tZW50IHZhcmlhYmxlcy4gV2UgZG8gdGhpcyBmcm9tIHRoZVxuXHQgKiBtYWluIHByb2Nlc3MgYmVjYXVzZSBpdCBtYXkgaW52b2x2ZSBzcGF3bmluZyBhIHNoZWxsLlxuXHQgKi9cblx0Y29uc3QgcmVzb2x2ZVNoZWxsRW52OiBQcm9taXNlPHR5cGVvZiBwcm9jZXNzLmVudj4gPSAoYXN5bmMgKCkgPT4ge1xuXG5cdFx0Ly8gUmVzb2x2ZSBgdXNlckVudmAgZnJvbSBjb25maWd1cmF0aW9uIGFuZFxuXHRcdC8vIGBzaGVsbEVudmAgZnJvbSB0aGUgbWFpbiBzaWRlXG5cdFx0Y29uc3QgW3VzZXJFbnYsIHNoZWxsRW52XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdChhc3luYyAoKSA9PiAoYXdhaXQgcmVzb2x2ZUNvbmZpZ3VyYXRpb24pLnVzZXJFbnYpKCksXG5cdFx0XHRpcGNSZW5kZXJlci5pbnZva2UoJ3ZzY29kZTpmZXRjaFNoZWxsRW52Jylcblx0XHRdKTtcblxuXHRcdHJldHVybiB7IC4uLnByb2Nlc3MuZW52LCAuLi5zaGVsbEVudiwgLi4udXNlckVudiB9O1xuXHR9KSgpO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBHbG9iYWxzIERlZmluaXRpb25cblxuXHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXHQvLyAjIyMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgISEhIERPIE5PVCBVU0UgR0VUL1NFVCBQUk9QRVJUSUVTIEFOWVdIRVJFIEhFUkUgISEhICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgISEhICBVTkxFU1MgVEhFIEFDQ0VTUyBJUyBXSVRIT1VUIFNJREUgRUZGRUNUUyAgISEhICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgKGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMjU1MTYpICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMjI1xuXHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXG5cdGNvbnN0IGdsb2JhbHMgPSB7XG5cblx0XHQvKipcblx0XHQgKiBBIG1pbmltYWwgc2V0IG9mIG1ldGhvZHMgZXhwb3NlZCBmcm9tIEVsZWN0cm9uJ3MgYGlwY1JlbmRlcmVyYFxuXHRcdCAqIHRvIHN1cHBvcnQgY29tbXVuaWNhdGlvbiB0byBtYWluIHByb2Nlc3MuXG5cdFx0ICovXG5cblx0XHRpcGNSZW5kZXJlcjoge1xuXG5cdFx0XHRzZW5kKGNoYW5uZWw6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0XHRcdGlmICh2YWxpZGF0ZUlQQyhjaGFubmVsKSkge1xuXHRcdFx0XHRcdGlwY1JlbmRlcmVyLnNlbmQoY2hhbm5lbCwgLi4uYXJncyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdGludm9rZShjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdFx0XHR2YWxpZGF0ZUlQQyhjaGFubmVsKTtcblxuXHRcdFx0XHRyZXR1cm4gaXBjUmVuZGVyZXIuaW52b2tlKGNoYW5uZWwsIC4uLmFyZ3MpO1xuXHRcdFx0fSxcblxuXHRcdFx0b24oY2hhbm5lbDogc3RyaW5nLCBsaXN0ZW5lcjogKGV2ZW50OiBFbGVjdHJvbi5JcGNSZW5kZXJlckV2ZW50LCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpIHtcblx0XHRcdFx0dmFsaWRhdGVJUEMoY2hhbm5lbCk7XG5cblx0XHRcdFx0aXBjUmVuZGVyZXIub24oY2hhbm5lbCwgbGlzdGVuZXIpO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0fSxcblxuXHRcdFx0b25jZShjaGFubmVsOiBzdHJpbmcsIGxpc3RlbmVyOiAoZXZlbnQ6IEVsZWN0cm9uLklwY1JlbmRlcmVyRXZlbnQsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkge1xuXHRcdFx0XHR2YWxpZGF0ZUlQQyhjaGFubmVsKTtcblxuXHRcdFx0XHRpcGNSZW5kZXJlci5vbmNlKGNoYW5uZWwsIGxpc3RlbmVyKTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdH0sXG5cblx0XHRcdHJlbW92ZUxpc3RlbmVyKGNoYW5uZWw6IHN0cmluZywgbGlzdGVuZXI6IChldmVudDogRWxlY3Ryb24uSXBjUmVuZGVyZXJFdmVudCwgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKSB7XG5cdFx0XHRcdHZhbGlkYXRlSVBDKGNoYW5uZWwpO1xuXG5cdFx0XHRcdGlwY1JlbmRlcmVyLnJlbW92ZUxpc3RlbmVyKGNoYW5uZWwsIGxpc3RlbmVyKTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0aXBjTWVzc2FnZVBvcnQ6IHtcblxuXHRcdFx0YWNxdWlyZShyZXNwb25zZUNoYW5uZWw6IHN0cmluZywgbm9uY2U6IHN0cmluZykge1xuXHRcdFx0XHRpZiAodmFsaWRhdGVJUEMocmVzcG9uc2VDaGFubmVsKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlTGlzdGVuZXIgPSAoZTogRWxlY3Ryb24uSXBjUmVuZGVyZXJFdmVudCwgcmVzcG9uc2U6IHN0cmluZyB8IHsgbm9uY2U6IHN0cmluZzsgZXJyb3I/OiBzdHJpbmc7IGZhdGFsPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0XHRcdFx0XHQvLyB2YWxpZGF0ZSB0aGF0IHRoZSBub25jZSBmcm9tIHRoZSByZXNwb25zZSBpcyB0aGUgc2FtZVxuXHRcdFx0XHRcdFx0Ly8gYXMgd2hlbiByZXF1ZXN0ZWQuIGFuZCBpZiBzbywgdXNlIGBwb3N0TWVzc2FnZWAgdG9cblx0XHRcdFx0XHRcdC8vIHNlbmQgdGhlIGBNZXNzYWdlUG9ydGAgc2FmZWx5IG92ZXIsIGV2ZW4gd2hlbiBjb250ZXh0XG5cdFx0XHRcdFx0XHQvLyBpc29sYXRpb24gaXMgZW5hYmxlZFxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2VOb25jZSA9IHR5cGVvZiByZXNwb25zZSA9PT0gJ3N0cmluZycgPyByZXNwb25zZSA6IHJlc3BvbnNlLm5vbmNlO1xuXHRcdFx0XHRcdFx0aWYgKG5vbmNlID09PSByZXNwb25zZU5vbmNlKSB7XG5cdFx0XHRcdFx0XHRcdGlwY1JlbmRlcmVyLm9mZihyZXNwb25zZUNoYW5uZWwsIHJlc3BvbnNlTGlzdGVuZXIpO1xuXHRcdFx0XHRcdFx0XHR3aW5kb3cucG9zdE1lc3NhZ2UocmVzcG9uc2UsICcqJywgZS5wb3J0cyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdC8vIGhhbmRsZSByZXBseSBmcm9tIG1haW5cblx0XHRcdFx0XHRpcGNSZW5kZXJlci5vbihyZXNwb25zZUNoYW5uZWwsIHJlc3BvbnNlTGlzdGVuZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIFN1cHBvcnQgZm9yIHN1YnNldCBvZiBtZXRob2RzIG9mIEVsZWN0cm9uJ3MgYHdlYkZyYW1lYCB0eXBlLlxuXHRcdCAqL1xuXHRcdHdlYkZyYW1lOiB7XG5cblx0XHRcdHNldFpvb21MZXZlbChsZXZlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbGV2ZWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0d2ViRnJhbWUuc2V0Wm9vbUxldmVsKGxldmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBTdXBwb3J0IGZvciBzdWJzZXQgb2YgRWxlY3Ryb24ncyBgd2ViVXRpbHNgIHR5cGUuXG5cdFx0ICovXG5cdFx0d2ViVXRpbHM6IHtcblxuXHRcdFx0Z2V0UGF0aEZvckZpbGUoZmlsZTogRmlsZSk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiB3ZWJVdGlscy5nZXRQYXRoRm9yRmlsZShmaWxlKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogU3VwcG9ydCBmb3IgYSBzdWJzZXQgb2YgYWNjZXNzIHRvIG5vZGUuanMgZ2xvYmFsIGBwcm9jZXNzYC5cblx0XHQgKlxuXHRcdCAqIE5vdGU6IHdoZW4gYHNhbmRib3hgIGlzIGVuYWJsZWQsIHRoZSBvbmx5IHByb3BlcnRpZXMgYXZhaWxhYmxlXG5cdFx0ICogYXJlIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9ibG9iL21hc3Rlci9kb2NzL2FwaS9wcm9jZXNzLm1kI3NhbmRib3hcblx0XHQgKi9cblx0XHRwcm9jZXNzOiB7XG5cdFx0XHRnZXQgcGxhdGZvcm0oKSB7IHJldHVybiBwcm9jZXNzLnBsYXRmb3JtOyB9LFxuXHRcdFx0Z2V0IGFyY2goKSB7IHJldHVybiBwcm9jZXNzLmFyY2g7IH0sXG5cdFx0XHRnZXQgZW52KCkgeyByZXR1cm4geyAuLi5wcm9jZXNzLmVudiB9OyB9LFxuXHRcdFx0Z2V0IHZlcnNpb25zKCkgeyByZXR1cm4gcHJvY2Vzcy52ZXJzaW9uczsgfSxcblx0XHRcdGdldCB0eXBlKCkgeyByZXR1cm4gJ3JlbmRlcmVyJzsgfSxcblx0XHRcdGdldCBleGVjUGF0aCgpIHsgcmV0dXJuIHByb2Nlc3MuZXhlY1BhdGg7IH0sXG5cblx0XHRcdGN3ZCgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9DV0QnXSB8fCBwcm9jZXNzLmV4ZWNQYXRoLnN1YnN0cigwLCBwcm9jZXNzLmV4ZWNQYXRoLmxhc3RJbmRleE9mKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAnXFxcXCcgOiAnLycpKTtcblx0XHRcdH0sXG5cblx0XHRcdHNoZWxsRW52KCk6IFByb21pc2U8dHlwZW9mIHByb2Nlc3MuZW52PiB7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlU2hlbGxFbnY7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXRQcm9jZXNzTWVtb3J5SW5mbygpOiBQcm9taXNlPEVsZWN0cm9uLlByb2Nlc3NNZW1vcnlJbmZvPiB7XG5cdFx0XHRcdHJldHVybiBwcm9jZXNzLmdldFByb2Nlc3NNZW1vcnlJbmZvKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbih0eXBlOiBzdHJpbmcsIGNhbGxiYWNrOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0XHRcdHByb2Nlc3Mub24odHlwZSwgY2FsbGJhY2spO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBTb21lIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjb250ZXh0IHdlIGFyZSBydW5uaW5nIGluLlxuXHRcdCAqL1xuXHRcdGNvbnRleHQ6IHtcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBBIGNvbmZpZ3VyYXRpb24gb2JqZWN0IG1hZGUgYWNjZXNzaWJsZSBmcm9tIHRoZSBtYWluIHNpZGVcblx0XHRcdCAqIHRvIGNvbmZpZ3VyZSB0aGUgc2FuZGJveCBicm93c2VyIHdpbmRvdy5cblx0XHRcdCAqXG5cdFx0XHQgKiBOb3RlOiBpbnRlbnRpb25hbGx5IG5vdCB1c2luZyBhIGdldHRlciBoZXJlIGJlY2F1c2UgdGhlXG5cdFx0XHQgKiBhY3R1YWwgdmFsdWUgd2lsbCBiZSBzZXQgYWZ0ZXIgYHJlc29sdmVDb25maWd1cmF0aW9uYFxuXHRcdFx0ICogaGFzIGZpbmlzaGVkLlxuXHRcdFx0ICovXG5cdFx0XHRjb25maWd1cmF0aW9uKCk6IElTYW5kYm94Q29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uO1xuXHRcdFx0fSxcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBBbGxvd3MgdG8gYXdhaXQgdGhlIHJlc29sdXRpb24gb2YgdGhlIGNvbmZpZ3VyYXRpb24gb2JqZWN0LlxuXHRcdFx0ICovXG5cdFx0XHRhc3luYyByZXNvbHZlQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPElTYW5kYm94Q29uZmlndXJhdGlvbj4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZUNvbmZpZ3VyYXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdHRyeSB7XG5cdFx0Ly8gVXNlIGBjb250ZXh0QnJpZGdlYCBBUElzIHRvIGV4cG9zZSBnbG9iYWxzIHRvIFZTQ29kZVxuXHRcdGNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3ZzY29kZScsIGdsb2JhbHMpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHR9XG59KCkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkNBT0MsV0FBWTtBQUVaLFFBQU0sRUFBRSxhQUFhLFVBQVUsZUFBZSxTQUFTLElBQUksUUFBUSxVQUFVO0FBTTdFLFdBQVMsWUFBWSxTQUErQjtBQUNuRCxRQUFJLENBQUMsU0FBUyxXQUFXLFNBQVMsR0FBRztBQUNwQyxZQUFNLElBQUksTUFBTSxrQ0FBa0MsT0FBTyxHQUFHO0FBQUEsSUFDN0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsVUFBVSxLQUFpQztBQUNuRCxlQUFXLE9BQU8sUUFBUSxNQUFNO0FBQy9CLFVBQUksSUFBSSxRQUFRLEtBQUssR0FBRyxHQUFHLE1BQU0sR0FBRztBQUNuQyxlQUFPLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBTUEsTUFBSSxnQkFBbUQ7QUFFdkQsUUFBTSx3QkFBd0QsWUFBWTtBQUN6RSxVQUFNLHlCQUF5QixVQUFVLHNC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
