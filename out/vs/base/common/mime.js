import { extname } from "./path.js";
const Mimes = Object.freeze({
  text: "text/plain",
  binary: "application/octet-stream",
  unknown: "application/unknown",
  markdown: "text/markdown",
  latex: "text/latex",
  uriList: "text/uri-list",
  html: "text/html"
});
const mapExtToTextMimes = {
  ".css": "text/css",
  ".csv": "text/csv",
  ".htm": "text/html",
  ".html": "text/html",
  ".ics": "text/calendar",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".txt": "text/plain",
  ".xml": "text/xml"
};
const mapExtToMediaMimes = {
  ".aac": "audio/x-aac",
  ".avi": "video/x-msvideo",
  ".bmp": "image/bmp",
  ".flv": "video/x-flv",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpe": ["image/jpg", "image/jpeg"],
  ".jpeg": ["image/jpg", "image/jpeg"],
  ".jpg": ["image/jpg", "image/jpeg"],
  ".m1v": "video/mpeg",
  ".m2a": "audio/mpeg",
  ".m2v": "video/mpeg",
  ".m3a": "audio/mpeg",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".mk3d": "video/x-matroska",
  ".mks": "video/x-matroska",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".movie": "video/x-sgi-movie",
  ".mp2": "audio/mpeg",
  ".mp2a": "audio/mpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mp4a": "audio/mp4",
  ".mp4v": "video/mp4",
  ".mpe": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".mpg4": "video/mp4",
  ".mpga": "audio/mpeg",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".ogv": "video/ogg",
  ".png": "image/png",
  ".psd": "image/vnd.adobe.photoshop",
  ".qt": "video/quicktime",
  ".spx": "audio/ogg",
  ".svg": "image/svg+xml",
  ".tga": "image/x-tga",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".wav": "audio/x-wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".wma": "audio/x-ms-wma",
  ".wmv": "video/x-ms-wmv",
  ".woff": "application/font-woff"
};
function getMediaOrTextMime(path) {
  const ext = extname(path);
  const textMime = mapExtToTextMimes[ext.toLowerCase()];
  if (textMime !== void 0) {
    return textMime;
  } else {
    return getMediaMime(path);
  }
}
function getMediaMime(path) {
  const ext = extname(path);
  const mimeType = mapExtToMediaMimes[ext.toLowerCase()];
  return Array.isArray(mimeType) ? mimeType[0] : mimeType;
}
function getExtensionForMimeType(mimeType) {
  for (const mapping of [mapExtToTextMimes, mapExtToMediaMimes]) {
    for (const extension in mapping) {
      const value = mapping[extension];
      if (Array.isArray(value) ? value.includes(mimeType) : value === mimeType) {
        return extension;
      }
    }
  }
  return void 0;
}
const _simplePattern = /^(.+)\/(.+?)(;.+)?$/;
function normalizeMimeType(mimeType, strict) {
  const match = _simplePattern.exec(mimeType);
  if (!match) {
    return strict ? void 0 : mimeType;
  }
  return `${match[1].toLowerCase()}/${match[2].toLowerCase()}${match[3] ?? ""}`;
}
function isTextStreamMime(mimeType) {
  return ["application/vnd.code.notebook.stdout", "application/vnd.code.notebook.stderr"].includes(mimeType);
}
export {
  Mimes,
  getExtensionForMimeType,
  getMediaMime,
  getMediaOrTextMime,
  isTextStreamMime,
  normalizeMimeType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG1pbWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAnLi9wYXRoLmpzJztcblxuZXhwb3J0IGNvbnN0IE1pbWVzID0gT2JqZWN0LmZyZWV6ZSh7XG5cdHRleHQ6ICd0ZXh0L3BsYWluJyxcblx0YmluYXJ5OiAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyxcblx0dW5rbm93bjogJ2FwcGxpY2F0aW9uL3Vua25vd24nLFxuXHRtYXJrZG93bjogJ3RleHQvbWFya2Rvd24nLFxuXHRsYXRleDogJ3RleHQvbGF0ZXgnLFxuXHR1cmlMaXN0OiAndGV4dC91cmktbGlzdCcsXG5cdGh0bWw6ICd0ZXh0L2h0bWwnLFxufSk7XG5cbmludGVyZmFjZSBNYXBFeHRUb01lZGlhTWltZXMge1xuXHRbaW5kZXg6IHN0cmluZ106IHN0cmluZyB8IHN0cmluZ1tdO1xufVxuXG5jb25zdCBtYXBFeHRUb1RleHRNaW1lczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0Jy5jc3MnOiAndGV4dC9jc3MnLFxuXHQnLmNzdic6ICd0ZXh0L2NzdicsXG5cdCcuaHRtJzogJ3RleHQvaHRtbCcsXG5cdCcuaHRtbCc6ICd0ZXh0L2h0bWwnLFxuXHQnLmljcyc6ICd0ZXh0L2NhbGVuZGFyJyxcblx0Jy5qcyc6ICd0ZXh0L2phdmFzY3JpcHQnLFxuXHQnLm1qcyc6ICd0ZXh0L2phdmFzY3JpcHQnLFxuXHQnLnR4dCc6ICd0ZXh0L3BsYWluJyxcblx0Jy54bWwnOiAndGV4dC94bWwnXG59O1xuXG4vLyBLbm93biBtZWRpYSBtaW1lcyB0aGF0IHdlIGNhbiBoYW5kbGVcbmNvbnN0IG1hcEV4dFRvTWVkaWFNaW1lczogTWFwRXh0VG9NZWRpYU1pbWVzID0ge1xuXHQnLmFhYyc6ICdhdWRpby94LWFhYycsXG5cdCcuYXZpJzogJ3ZpZGVvL3gtbXN2aWRlbycsXG5cdCcuYm1wJzogJ2ltYWdlL2JtcCcsXG5cdCcuZmx2JzogJ3ZpZGVvL3gtZmx2Jyxcblx0Jy5naWYnOiAnaW1hZ2UvZ2lmJyxcblx0Jy5pY28nOiAnaW1hZ2UveC1pY29uJyxcblx0Jy5qcGUnOiBbJ2ltYWdlL2pwZycsICdpbWFnZS9qcGVnJ10sXG5cdCcuanBlZyc6IFsnaW1hZ2UvanBnJywgJ2ltYWdlL2pwZWcnXSxcblx0Jy5qcGcnOiBbJ2ltYWdlL2pwZycsICdpbWFnZS9qcGVnJ10sXG5cdCcubTF2JzogJ3ZpZGVvL21wZWcnLFxuXHQnLm0yYSc6ICdhdWRpby9tcGVnJyxcblx0Jy5tMnYnOiAndmlkZW8vbXBlZycsXG5cdCcubTNhJzogJ2F1ZGlvL21wZWcnLFxuXHQnLm1pZCc6ICdhdWRpby9taWRpJyxcblx0Jy5taWRpJzogJ2F1ZGlvL21pZGknLFxuXHQnLm1rM2QnOiAndmlkZW8veC1tYXRyb3NrYScsXG5cdCcubWtzJzogJ3ZpZGVvL3gtbWF0cm9za2EnLFxuXHQnLm1rdic6ICd2aWRlby94LW1hdHJvc2thJyxcblx0Jy5tb3YnOiAndmlkZW8vcXVpY2t0aW1lJyxcblx0Jy5tb3ZpZSc6ICd2aWRlby94LXNnaS1tb3ZpZScsXG5cdCcubXAyJzogJ2F1ZGlvL21wZWcnLFxuXHQnLm1wMmEnOiAnYXVkaW8vbXBlZycsXG5cdCcubXAzJzogJ2F1ZGlvL21wZWcnLFxuXHQnLm1wNCc6ICd2aWRlby9tcDQnLFxuXHQnLm1wNGEnOiAnYXVkaW8vbXA0Jyxcblx0Jy5tcDR2JzogJ3ZpZGVvL21wNCcsXG5cdCcubXBlJzogJ3ZpZGVvL21wZWcnLFxuXHQnLm1wZWcnOiAndmlkZW8vbXBlZycsXG5cdCcubXBnJzogJ3ZpZGVvL21wZWcnLFxuXHQnLm1wZzQnOiAndmlkZW8vbXA0Jyxcblx0Jy5tcGdhJzogJ2F1ZGlvL21wZWcnLFxuXHQnLm9nYSc6ICdhdWRpby9vZ2cnLFxuXHQnLm9nZyc6ICdhdWRpby9vZ2cnLFxuXHQnLm9wdXMnOiAnYXVkaW8vb3B1cycsXG5cdCcub2d2JzogJ3ZpZGVvL29nZycsXG5cdCcucG5nJzogJ2ltYWdlL3BuZycsXG5cdCcucHNkJzogJ2ltYWdlL3ZuZC5hZG9iZS5waG90b3Nob3AnLFxuXHQnLnF0JzogJ3ZpZGVvL3F1aWNrdGltZScsXG5cdCcuc3B4JzogJ2F1ZGlvL29nZycsXG5cdCcuc3ZnJzogJ2ltYWdlL3N2Zyt4bWwnLFxuXHQnLnRnYSc6ICdpbWFnZS94LXRnYScsXG5cdCcudGlmJzogJ2ltYWdlL3RpZmYnLFxuXHQnLnRpZmYnOiAnaW1hZ2UvdGlmZicsXG5cdCcud2F2JzogJ2F1ZGlvL3gtd2F2Jyxcblx0Jy53ZWJtJzogJ3ZpZGVvL3dlYm0nLFxuXHQnLndlYnAnOiAnaW1hZ2Uvd2VicCcsXG5cdCcud21hJzogJ2F1ZGlvL3gtbXMtd21hJyxcblx0Jy53bXYnOiAndmlkZW8veC1tcy13bXYnLFxuXHQnLndvZmYnOiAnYXBwbGljYXRpb24vZm9udC13b2ZmJyxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNZWRpYU9yVGV4dE1pbWUocGF0aDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZXh0ID0gZXh0bmFtZShwYXRoKTtcblx0Y29uc3QgdGV4dE1pbWUgPSBtYXBFeHRUb1RleHRNaW1lc1tleHQudG9Mb3dlckNhc2UoKV07XG5cdGlmICh0ZXh0TWltZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRleHRNaW1lO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBnZXRNZWRpYU1pbWUocGF0aCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1lZGlhTWltZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBleHQgPSBleHRuYW1lKHBhdGgpO1xuXHRjb25zdCBtaW1lVHlwZSA9IG1hcEV4dFRvTWVkaWFNaW1lc1tleHQudG9Mb3dlckNhc2UoKV07XG5cdHJldHVybiBBcnJheS5pc0FycmF5KG1pbWVUeXBlKSA/IG1pbWVUeXBlWzBdIDogbWltZVR5cGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShtaW1lVHlwZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCBtYXBwaW5nIG9mIFttYXBFeHRUb1RleHRNaW1lcywgbWFwRXh0VG9NZWRpYU1pbWVzXSkge1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIGluIG1hcHBpbmcpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFwcGluZ1tleHRlbnNpb25dO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWUuaW5jbHVkZXMobWltZVR5cGUpIDogdmFsdWUgPT09IG1pbWVUeXBlKSB7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuY29uc3QgX3NpbXBsZVBhdHRlcm4gPSAvXiguKylcXC8oLis/KSg7LispPyQvO1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplTWltZVR5cGUobWltZVR5cGU6IHN0cmluZyk6IHN0cmluZztcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVNaW1lVHlwZShtaW1lVHlwZTogc3RyaW5nLCBzdHJpY3Q6IHRydWUpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplTWltZVR5cGUobWltZVR5cGU6IHN0cmluZywgc3RyaWN0PzogdHJ1ZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cblx0Y29uc3QgbWF0Y2ggPSBfc2ltcGxlUGF0dGVybi5leGVjKG1pbWVUeXBlKTtcblx0aWYgKCFtYXRjaCkge1xuXHRcdHJldHVybiBzdHJpY3Rcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IG1pbWVUeXBlO1xuXHR9XG5cdC8vIGh0dHBzOi8vZGF0YXRyYWNrZXIuaWV0Zi5vcmcvZG9jL2h0bWwvcmZjMjA0NSNzZWN0aW9uLTUuMVxuXHQvLyBtZWRpYSBhbmQgc3VidHlwZSBtdXN0IEFMV0FZUyBiZSBsb3dlcmNhc2UsIHBhcmFtZXRlciBub3Rcblx0cmV0dXJuIGAke21hdGNoWzFdLnRvTG93ZXJDYXNlKCl9LyR7bWF0Y2hbMl0udG9Mb3dlckNhc2UoKX0ke21hdGNoWzNdID8/ICcnfWA7XG59XG5cbi8qKlxuICogV2hldGhlciB0aGUgcHJvdmlkZWQgbWltZSB0eXBlIGlzIGEgdGV4dCBzdHJlYW0gbGlrZSBgc3Rkb3V0YCwgYHN0ZGVycmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1RleHRTdHJlYW1NaW1lKG1pbWVUeXBlOiBzdHJpbmcpIHtcblx0cmV0dXJuIFsnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZGVyciddLmluY2x1ZGVzKG1pbWVUeXBlKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUVqQixNQUFNLFFBQVEsT0FBTyxPQUFPO0FBQUEsRUFDbEMsTUFBTTtBQUFBLEVBQ04sUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLEVBQ1YsT0FBTztBQUFBLEVB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
