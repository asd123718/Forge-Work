import { parse } from "../../../../base/common/console.js";
function logRemoteEntry(logService, entry, label = null) {
  const args = parse(entry).args;
  let firstArg = args.shift();
  if (typeof firstArg !== "string") {
    return;
  }
  if (!entry.severity) {
    entry.severity = "info";
  }
  if (label) {
    if (!/^\[/.test(label)) {
      label = `[${label}]`;
    }
    if (!/ $/.test(label)) {
      label = `${label} `;
    }
    firstArg = label + firstArg;
  }
  switch (entry.severity) {
    case "log":
    case "info":
      logService.info(firstArg, ...args);
      break;
    case "warn":
      logService.warn(firstArg, ...args);
      break;
    case "error":
      logService.error(firstArg, ...args);
      break;
  }
}
function logRemoteEntryIfError(logService, entry, label) {
  const args = parse(entry).args;
  const firstArg = args.shift();
  if (typeof firstArg !== "string" || entry.severity !== "error") {
    return;
  }
  if (!/^\[/.test(label)) {
    label = `[${label}]`;
  }
  if (!/ $/.test(label)) {
    label = `${label} `;
  }
  logService.error(label + firstArg, ...args);
}
export {
  logRemoteEntry,
  logRemoteEntryIfError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXHJlbW90ZUNvbnNvbGVVdGlsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVJlbW90ZUNvbnNvbGVMb2csIHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29uc29sZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ1JlbW90ZUVudHJ5KGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBlbnRyeTogSVJlbW90ZUNvbnNvbGVMb2csIGxhYmVsOiBzdHJpbmcgfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRjb25zdCBhcmdzID0gcGFyc2UoZW50cnkpLmFyZ3M7XG5cdGxldCBmaXJzdEFyZyA9IGFyZ3Muc2hpZnQoKTtcblx0aWYgKHR5cGVvZiBmaXJzdEFyZyAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIWVudHJ5LnNldmVyaXR5KSB7XG5cdFx0ZW50cnkuc2V2ZXJpdHkgPSAnaW5mbyc7XG5cdH1cblxuXHRpZiAobGFiZWwpIHtcblx0XHRpZiAoIS9eXFxbLy50ZXN0KGxhYmVsKSkge1xuXHRcdFx0bGFiZWwgPSBgWyR7bGFiZWx9XWA7XG5cdFx0fVxuXHRcdGlmICghLyAkLy50ZXN0KGxhYmVsKSkge1xuXHRcdFx0bGFiZWwgPSBgJHtsYWJlbH0gYDtcblx0XHR9XG5cdFx0Zmlyc3RBcmcgPSBsYWJlbCArIGZpcnN0QXJnO1xuXHR9XG5cblx0c3dpdGNoIChlbnRyeS5zZXZlcml0eSkge1xuXHRcdGNhc2UgJ2xvZyc6XG5cdFx0Y2FzZSAnaW5mbyc6XG5cdFx0XHRsb2dTZXJ2aWNlLmluZm8oZmlyc3RBcmcsIC4uLmFyZ3MpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRsb2dTZXJ2aWNlLndhcm4oZmlyc3RBcmcsIC4uLmFyZ3MpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0bG9nU2VydmljZS5lcnJvcihmaXJzdEFyZywgLi4uYXJncyk7XG5cdFx0XHRicmVhaztcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nUmVtb3RlRW50cnlJZkVycm9yKGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBlbnRyeTogSVJlbW90ZUNvbnNvbGVMb2csIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgYXJncyA9IHBhcnNlKGVudHJ5KS5hcmdzO1xuXHRjb25zdCBmaXJzdEFyZyA9IGFyZ3Muc2hpZnQoKTtcblx0aWYgKHR5cGVvZiBmaXJzdEFyZyAhPT0gJ3N0cmluZycgfHwgZW50cnkuc2V2ZXJpdHkgIT09ICdlcnJvcicpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIS9eXFxbLy50ZXN0KGxhYmVsKSkge1xuXHRcdGxhYmVsID0gYFske2xhYmVsfV1gO1xuXHR9XG5cdGlmICghLyAkLy50ZXN0KGxhYmVsKSkge1xuXHRcdGxhYmVsID0gYCR7bGFiZWx9IGA7XG5cdH1cblxuXHRsb2dTZXJ2aWNlLmVycm9yKGxhYmVsICsgZmlyc3RBcmcsIC4uLmFyZ3MpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBNEIsYUFBYTtBQUdsQyxTQUFTLGVBQWUsWUFBeUIsT0FBMEIsUUFBdUIsTUFBWTtBQUNwSCxRQUFNLE9BQU8sTUFBTSxLQUFLLEVBQUU7QUFDMUIsTUFBSSxXQUFXLEtBQUssTUFBTTtBQUMxQixNQUFJLE9BQU8sYUFBYSxVQUFVO0FBQ2pDO0FBQUEsRUFDRDtBQUVBLE1BQUksQ0FBQyxNQUFNLFVBQVU7QUFDcEIsVUFBTSxXQUFXO0FBQUEsRUFDbEI7QUFFQSxNQUFJLE9BQU87QUFDVixRQUFJLENBQUMsTUFBTSxLQUFLLEtBQUssR0FBRztBQUN2QixjQUFRLElBQUksS0FBSztBQUFBLElBQ2xCO0FBQ0EsUUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEdBQUc7QUFDdEIsY0FBUSxHQUFHLEtBQUs7QUFBQSxJQUNqQjtBQUNBLGVBQVcsUUFBUTtBQUFBLEVBQ3BCO0FBRUEsVUFBUSxNQUFNLFVBQVU7QUFBQSxJQUN2QixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osaUJBQVcsS0FBSyxVQUFVLEdBQUcsSUFBSTtBQUNqQztBQUFBLElBQ0QsS0FBSztBQUNKLGlCQUFXLEtBQUssVUFBVSxHQUFHLElBQUk7QUFDakM7QUFBQSxJQUNELEtBQUs7QUFDSixpQkFBVyxNQUFNLFVBQVUsR0FBRyxJQUFJO0FBQ2xDO0FBQUEsRUFDRjtBQUNEO0FBRU8sU0FBUyxzQkFBc0IsWUFBeUIsT0FBMEIsT0FBcUI7QUFDN0csUUFBTSxPQUFPLE1BQU0sS0FBSyxFQUFFO0FBQzFCLFFBQU0sV0FBVyxLQUFLLE1BQU07QUFDNUIsTUFBSSxPQUFPLGFBQWEsWUFBWSxNQUFNLGFBQWEsU0FBUztBQUMvRDtBQUFBLEVBQ0Q7QUFFQSxNQUFJLENBQUMsTUFBTSxLQUFLLEtBQUssR0FBRztBQUN2QixZQUFRLElBQUksS0FBSztBQUFBLEVBQ2xCO0FBQ0EsTUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEdBQUc7QUFDdEIsWUFBUSxHQUFHLEtBQUs7QUFBQSxFQUNqQjtBQUVBLGFBQVcsTUFBTSxRQUFRLFVBQVUsR0FBRyxJQUFJO0FBQzNDOyIsCiAgIm5hbWVzIjogW10KfQo=
