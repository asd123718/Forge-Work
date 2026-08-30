import * as strings from "./strings.js";
var Severity = /* @__PURE__ */ ((Severity2) => {
  Severity2[Severity2["Ignore"] = 0] = "Ignore";
  Severity2[Severity2["Info"] = 1] = "Info";
  Severity2[Severity2["Warning"] = 2] = "Warning";
  Severity2[Severity2["Error"] = 3] = "Error";
  return Severity2;
})(Severity || {});
((Severity2) => {
  const _error = "error";
  const _warning = "warning";
  const _warn = "warn";
  const _info = "info";
  const _ignore = "ignore";
  function fromValue(value) {
    if (!value) {
      return 0 /* Ignore */;
    }
    if (strings.equalsIgnoreCase(_error, value)) {
      return 3 /* Error */;
    }
    if (strings.equalsIgnoreCase(_warning, value) || strings.equalsIgnoreCase(_warn, value)) {
      return 2 /* Warning */;
    }
    if (strings.equalsIgnoreCase(_info, value)) {
      return 1 /* Info */;
    }
    return 0 /* Ignore */;
  }
  Severity2.fromValue = fromValue;
  function toString(severity) {
    switch (severity) {
      case 3 /* Error */:
        return _error;
      case 2 /* Warning */:
        return _warning;
      case 1 /* Info */:
        return _info;
      default:
        return _ignore;
    }
  }
  Severity2.toString = toString;
})(Severity || (Severity = {}));
var severity_default = Severity;
export {
  severity_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHNldmVyaXR5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuL3N0cmluZ3MuanMnO1xuXG5lbnVtIFNldmVyaXR5IHtcblx0SWdub3JlID0gMCxcblx0SW5mbyA9IDEsXG5cdFdhcm5pbmcgPSAyLFxuXHRFcnJvciA9IDNcbn1cblxubmFtZXNwYWNlIFNldmVyaXR5IHtcblxuXHRjb25zdCBfZXJyb3IgPSAnZXJyb3InO1xuXHRjb25zdCBfd2FybmluZyA9ICd3YXJuaW5nJztcblx0Y29uc3QgX3dhcm4gPSAnd2Fybic7XG5cdGNvbnN0IF9pbmZvID0gJ2luZm8nO1xuXHRjb25zdCBfaWdub3JlID0gJ2lnbm9yZSc7XG5cblx0LyoqXG5cdCAqIFBhcnNlcyAnZXJyb3InLCAnd2FybmluZycsICd3YXJuJywgJ2luZm8nIGluIGNhbGwgY2FzaW5nc1xuXHQgKiBhbmQgZmFsbHMgYmFjayB0byBpZ25vcmUuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVZhbHVlKHZhbHVlOiBzdHJpbmcpOiBTZXZlcml0eSB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIFNldmVyaXR5Lklnbm9yZTtcblx0XHR9XG5cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKF9lcnJvciwgdmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gU2V2ZXJpdHkuRXJyb3I7XG5cdFx0fVxuXG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZShfd2FybmluZywgdmFsdWUpIHx8IHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZShfd2FybiwgdmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gU2V2ZXJpdHkuV2FybmluZztcblx0XHR9XG5cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKF9pbmZvLCB2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBTZXZlcml0eS5JbmZvO1xuXHRcdH1cblx0XHRyZXR1cm4gU2V2ZXJpdHkuSWdub3JlO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvU3RyaW5nKHNldmVyaXR5OiBTZXZlcml0eSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChzZXZlcml0eSkge1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5FcnJvcjogcmV0dXJuIF9lcnJvcjtcblx0XHRcdGNhc2UgU2V2ZXJpdHkuV2FybmluZzogcmV0dXJuIF93YXJuaW5nO1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5JbmZvOiByZXR1cm4gX2luZm87XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gX2lnbm9yZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgU2V2ZXJpdHk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLGFBQWE7QUFFekIsSUFBSyxXQUFMLGtCQUFLQSxjQUFMO0FBQ0MsRUFBQUEsb0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsb0JBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsb0JBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsb0JBQUEsV0FBUSxLQUFSO0FBSkksU0FBQUE7QUFBQSxHQUFBO0FBQUEsQ0FPTCxDQUFVQSxjQUFWO0FBRUMsUUFBTSxTQUFTO0FBQ2YsUUFBTSxXQUFXO0FBQ2pCLFFBQU0sUUFBUTtBQUNkLFFBQU0sUUFBUTtBQUNkLFFBQU0sVUFBVTtBQU1ULFdBQVMsVUFBVSxPQUF5QjtBQUNsRCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxRQUFRLGlCQUFpQixRQUFRLEtBQUssR0FBRztBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksUUFBUSxpQkFBaUIsVUFBVSxLQUFLLEtBQUssUUFBUSxpQkFBaUIsT0FBTyxLQUFLLEdBQUc7QUFDeEYsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFFBQVEsaUJBQWlCLE9BQU8sS0FBSyxHQUFHO0FBQzNDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFqQk8sRUFBQUEsVUFBUztBQW1CVCxXQUFTLFNBQVMsVUFBNEI7QUFDcEQsWUFBUSxVQUFVO0FBQUEsTUFDakIsS0FBSztBQUFnQixlQUFPO0FBQUEsTUFDNUIsS0FBSztBQUFrQixlQUFPO0FBQUEsTUFDOUIsS0FBSztBQUFlLGVBQU87QUFBQSxNQUMzQjtBQUFTLGVBQU87QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxVQUFTO0FBQUEsR0EvQlA7QUF5Q1YsSUFBTyxtQkFBUTsiLAogICJuYW1lcyI6IFsiU2V2ZXJpdHkiXQp9Cg==
