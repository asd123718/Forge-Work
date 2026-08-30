import { isCancellationError, isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from "../../../base/common/errors.js";
import BaseErrorTelemetry from "../common/errorTelemetry.js";
class ErrorTelemetry extends BaseErrorTelemetry {
  installErrorListeners() {
    setUnexpectedErrorHandler((err) => console.error(err));
    const unhandledPromises = [];
    process.on("unhandledRejection", (reason, promise) => {
      unhandledPromises.push(promise);
      setTimeout(() => {
        const idx = unhandledPromises.indexOf(promise);
        if (idx >= 0) {
          promise.catch((e) => {
            unhandledPromises.splice(idx, 1);
            if (!isCancellationError(e)) {
              console.warn(`rejected promise not handled within 1 second: ${e}`);
              if (e.stack) {
                console.warn(`stack trace: ${e.stack}`);
              }
              if (reason) {
                onUnexpectedError(reason);
              }
            }
          });
        }
      }, 1e3);
    });
    process.on("rejectionHandled", (promise) => {
      const idx = unhandledPromises.indexOf(promise);
      if (idx >= 0) {
        unhandledPromises.splice(idx, 1);
      }
    });
    process.on("uncaughtException", (err) => {
      if (isSigPipeError(err)) {
        return;
      }
      onUnexpectedError(err);
    });
  }
}
export {
  ErrorTelemetry as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVsZW1ldHJ5XFxub2RlXFxlcnJvclRlbGVtZXRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IsIGlzU2lnUGlwZUVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgQmFzZUVycm9yVGVsZW1ldHJ5IGZyb20gJy4uL2NvbW1vbi9lcnJvclRlbGVtZXRyeS5qcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVycm9yVGVsZW1ldHJ5IGV4dGVuZHMgQmFzZUVycm9yVGVsZW1ldHJ5IHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluc3RhbGxFcnJvckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGVyciA9PiBjb25zb2xlLmVycm9yKGVycikpO1xuXG5cdFx0Ly8gUHJpbnQgYSBjb25zb2xlIG1lc3NhZ2Ugd2hlbiByZWplY3Rpb24gaXNuJ3QgaGFuZGxlZCB3aXRoaW4gTiBzZWNvbmRzLiBGb3IgZGV0YWlsczpcblx0XHQvLyBzZWUgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19ldmVudF91bmhhbmRsZWRyZWplY3Rpb25cblx0XHQvLyBhbmQgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19ldmVudF9yZWplY3Rpb25oYW5kbGVkXG5cdFx0Y29uc3QgdW5oYW5kbGVkUHJvbWlzZXM6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXHRcdHByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIChyZWFzb246IHVua25vd24sIHByb21pc2U6IFByb21pc2U8dW5rbm93bj4pID0+IHtcblx0XHRcdHVuaGFuZGxlZFByb21pc2VzLnB1c2gocHJvbWlzZSk7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdW5oYW5kbGVkUHJvbWlzZXMuaW5kZXhPZihwcm9taXNlKTtcblx0XHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdFx0cHJvbWlzZS5jYXRjaChlID0+IHtcblx0XHRcdFx0XHRcdHVuaGFuZGxlZFByb21pc2VzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgcmVqZWN0ZWQgcHJvbWlzZSBub3QgaGFuZGxlZCB3aXRoaW4gMSBzZWNvbmQ6ICR7ZX1gKTtcblx0XHRcdFx0XHRcdFx0aWYgKGUuc3RhY2spIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oYHN0YWNrIHRyYWNlOiAke2Uuc3RhY2t9YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKHJlYXNvbikge1xuXHRcdFx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKHJlYXNvbik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMTAwMCk7XG5cdFx0fSk7XG5cblx0XHRwcm9jZXNzLm9uKCdyZWplY3Rpb25IYW5kbGVkJywgKHByb21pc2U6IFByb21pc2U8dW5rbm93bj4pID0+IHtcblx0XHRcdGNvbnN0IGlkeCA9IHVuaGFuZGxlZFByb21pc2VzLmluZGV4T2YocHJvbWlzZSk7XG5cdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0dW5oYW5kbGVkUHJvbWlzZXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBQcmludCBhIGNvbnNvbGUgbWVzc2FnZSB3aGVuIGFuIGV4Y2VwdGlvbiBpc24ndCBoYW5kbGVkLlxuXHRcdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycjogRXJyb3IgfCBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcblx0XHRcdGlmIChpc1NpZ1BpcGVFcnJvcihlcnIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxxQkFBcUIsZ0JBQWdCLG1CQUFtQixpQ0FBaUM7QUFDbEcsT0FBTyx3QkFBd0I7QUFFL0IsTUFBTyx1QkFBcUMsbUJBQW1CO0FBQUEsRUFDM0Msd0JBQThCO0FBQ2hELDhCQUEwQixTQUFPLFFBQVEsTUFBTSxHQUFHLENBQUM7QUFLbkQsVUFBTSxvQkFBd0MsQ0FBQztBQUMvQyxZQUFRLEdBQUcsc0JBQXNCLENBQUMsUUFBaUIsWUFBOEI7QUFDaEYsd0JBQWtCLEtBQUssT0FBTztBQUM5QixpQkFBVyxNQUFNO0FBQ2hCLGNBQU0sTUFBTSxrQkFBa0IsUUFBUSxPQUFPO0FBQzdDLFlBQUksT0FBTyxHQUFHO0FBQ2Isa0JBQVEsTUFBTSxPQUFLO0FBQ2xCLDhCQUFrQixPQUFPLEtBQUssQ0FBQztBQUMvQixnQkFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUc7QUFDNUIsc0JBQVEsS0FBSyxpREFBaUQsQ0FBQyxFQUFFO0FBQ2pFLGtCQUFJLEVBQUUsT0FBTztBQUNaLHdCQUFRLEtBQUssZ0JBQWdCLEVBQUUsS0FBSyxFQUFFO0FBQUEsY0FDdkM7QUFDQSxrQkFBSSxRQUFRO0FBQ1gsa0NBQWtCLE1BQU07QUFBQSxjQUN6QjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRCxHQUFHLEdBQUk7QUFBQSxJQUNSLENBQUM7QUFFRCxZQUFRLEdBQUcsb0JBQW9CLENBQUMsWUFBOEI7QUFDN0QsWUFBTSxNQUFNLGtCQUFrQixRQUFRLE9BQU87QUFDN0MsVUFBSSxPQUFPLEdBQUc7QUFDYiwwQkFBa0IsT0FBTyxLQUFLLENBQUM7QUFBQSxNQUNoQztBQUFBLElBQ0QsQ0FBQztBQUdELFlBQVEsR0FBRyxxQkFBcUIsQ0FBQyxRQUF1QztBQUN2RSxVQUFJLGVBQWUsR0FBRyxHQUFHO0FBQ3hCO0FBQUEsTUFDRDtBQUVBLHdCQUFrQixHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
