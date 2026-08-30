(function() {
  const { ipcRenderer, webFrame, contextBridge } = require("electron");
  function validateIPC(channel) {
    if (!channel?.startsWith("vscode:")) {
      throw new Error(`Unsupported event IPC channel '${channel}'`);
    }
    return true;
  }
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
    }
  };
  try {
    contextBridge.exposeInMainWorld("vscode", globals);
  } catch (error) {
    console.error(error);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcc2FuZGJveFxcZWxlY3Ryb24tYnJvd3NlclxccHJlbG9hZC1hdXgudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4oZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHsgaXBjUmVuZGVyZXIsIHdlYkZyYW1lLCBjb250ZXh0QnJpZGdlIH0gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuXG5cdGZ1bmN0aW9uIHZhbGlkYXRlSVBDKGNoYW5uZWw6IHN0cmluZyk6IHRydWUgfCBuZXZlciB7XG5cdFx0aWYgKCFjaGFubmVsPy5zdGFydHNXaXRoKCd2c2NvZGU6JykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgZXZlbnQgSVBDIGNoYW5uZWwgJyR7Y2hhbm5lbH0nYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBnbG9iYWxzID0ge1xuXG5cdFx0LyoqXG5cdFx0ICogQSBtaW5pbWFsIHNldCBvZiBtZXRob2RzIGV4cG9zZWQgZnJvbSBFbGVjdHJvbidzIGBpcGNSZW5kZXJlcmBcblx0XHQgKiB0byBzdXBwb3J0IGNvbW11bmljYXRpb24gdG8gbWFpbiBwcm9jZXNzLlxuXHRcdCAqL1xuXHRcdGlwY1JlbmRlcmVyOiB7XG5cblx0XHRcdHNlbmQoY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRcdFx0aWYgKHZhbGlkYXRlSVBDKGNoYW5uZWwpKSB7XG5cdFx0XHRcdFx0aXBjUmVuZGVyZXIuc2VuZChjaGFubmVsLCAuLi5hcmdzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0aW52b2tlKGNoYW5uZWw6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0XHRcdHZhbGlkYXRlSVBDKGNoYW5uZWwpO1xuXG5cdFx0XHRcdHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoY2hhbm5lbCwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIFN1cHBvcnQgZm9yIHN1YnNldCBvZiBtZXRob2RzIG9mIEVsZWN0cm9uJ3MgYHdlYkZyYW1lYCB0eXBlLlxuXHRcdCAqL1xuXHRcdHdlYkZyYW1lOiB7XG5cblx0XHRcdHNldFpvb21MZXZlbChsZXZlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbGV2ZWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0d2ViRnJhbWUuc2V0Wm9vbUxldmVsKGxldmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHR0cnkge1xuXHRcdGNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3ZzY29kZScsIGdsb2JhbHMpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHR9XG59KCkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkNBS0MsV0FBWTtBQUVaLFFBQU0sRUFBRSxhQUFhLFVBQVUsY0FBYyxJQUFJLFFBQVEsVUFBVTtBQUVuRSxXQUFTLFlBQVksU0FBK0I7QUFDbkQsUUFBSSxDQUFDLFNBQVMsV0FBVyxTQUFTLEdBQUc7QUFDcEMsWUFBTSxJQUFJLE1BQU0sa0NBQWtDLE9BQU8sR0FBRztBQUFBLElBQzdEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFVBQVU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBTWYsYUFBYTtBQUFBLE1BRVosS0FBSyxZQUFvQixNQUF1QjtBQUMvQyxZQUFJLFlBQVksT0FBTyxHQUFHO0FBQ3pCLHNCQUFZLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFBQSxNQUVBLE9BQU8sWUFBb0IsTUFBbUM7QUFDN0Qsb0JBQVksT0FBTztBQUVuQixlQUFPLFlBQVksT0FBTyxTQUFTLEdBQUcsSUFBSTtBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLElBS0EsVUFBVTtBQUFBLE1BRVQsYUFBYSxPQUFxQjtBQUNqQyxZQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLG1CQUFTLGFBQWEsS0FBSztBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsTUFBSTtBQUNILGtCQUFjLGtCQUFrQixVQUFVLE9BQU87QUFBQSxFQUNsRCxTQUFTLE9BQU87QUFDZixZQUFRLE1BQU0sS0FBSztBQUFBLEVBQ3BCO0FBQ0QsR0FBRTsiLAogICJuYW1lcyI6IFtdCn0K
