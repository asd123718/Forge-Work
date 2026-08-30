import { getMediaMime } from "../../../../base/common/mime.js";
import { URI } from "../../../../base/common/uri.js";
import { McpServerTransportType } from "./mcpTypes.js";
const mcpAllowableContentTypes = [
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif"
];
var IconTheme = /* @__PURE__ */ ((IconTheme2) => {
  IconTheme2[IconTheme2["Light"] = 0] = "Light";
  IconTheme2[IconTheme2["Dark"] = 1] = "Dark";
  IconTheme2[IconTheme2["Any"] = 2] = "Any";
  return IconTheme2;
})(IconTheme || {});
function validateIcon(icon, launch, logger) {
  const mimeType = icon.mimeType?.toLowerCase() || getMediaMime(icon.src);
  if (!mimeType || !mcpAllowableContentTypes.includes(mimeType)) {
    logger.debug(`Ignoring icon with unsupported mime type: ${icon.src} (${mimeType}), allowed: ${mcpAllowableContentTypes.join(", ")}`);
    return;
  }
  const uri = URI.parse(icon.src);
  if (uri.scheme === "data") {
    return uri;
  }
  if (uri.scheme === "https" || uri.scheme === "http") {
    if (launch.type !== McpServerTransportType.HTTP) {
      logger.debug(`Ignoring icon with HTTP/HTTPS URL: ${icon.src} as the MCP server is not launched with HTTP transport.`);
      return;
    }
    const expectedAuthority = launch.uri.authority.toLowerCase();
    if (uri.authority.toLowerCase() !== expectedAuthority) {
      logger.debug(`Ignoring icon with untrusted authority: ${icon.src}, expected authority: ${expectedAuthority}`);
      return;
    }
    return uri;
  }
  if (uri.scheme === "file") {
    if (launch.type !== McpServerTransportType.Stdio) {
      logger.debug(`Ignoring icon with file URL: ${icon.src} as the MCP server is not launched as a local process.`);
      return;
    }
    return uri;
  }
  logger.debug(`Ignoring icon with unsupported scheme: ${icon.src}. Allowed: data:, http:, https:, file:`);
  return;
}
function parseAndValidateMcpIcon(icons, launch, logger) {
  const result = [];
  for (const icon of icons.icons || []) {
    const uri = validateIcon(icon, launch, logger);
    if (!uri) {
      continue;
    }
    const sizesArr = typeof icon.sizes === "string" ? icon.sizes.split(" ") : Array.isArray(icon.sizes) ? icon.sizes : [];
    result.push({
      src: uri,
      theme: icon.theme === "light" ? 0 /* Light */ : icon.theme === "dark" ? 1 /* Dark */ : 2 /* Any */,
      sizes: sizesArr.map((size) => {
        const [widthStr, heightStr] = size.toLowerCase().split("x");
        return { width: Number(widthStr) || 0, height: Number(heightStr) || 0 };
      }).sort((a, b) => a.width - b.width)
    });
  }
  result.sort((a, b) => a.sizes[0]?.width - b.sizes[0]?.width);
  return result;
}
class McpIcons {
  constructor(_icons) {
    this._icons = _icons;
  }
  static fromStored(icons) {
    return McpIcons.fromParsed(icons?.map((i) => ({ src: URI.revive(i.src), theme: i.theme, sizes: i.sizes })));
  }
  static fromParsed(icons) {
    return new McpIcons(icons || []);
  }
  getUrl(size) {
    const dark = this.getSizeWithTheme(size, 1 /* Dark */);
    if (dark?.theme === 2 /* Any */) {
      return { dark: dark.src };
    }
    const light = this.getSizeWithTheme(size, 0 /* Light */);
    if (!light && !dark) {
      return void 0;
    }
    return { dark: (dark || light).src, light: light?.src };
  }
  getSizeWithTheme(size, theme) {
    let bestOfAnySize;
    for (const icon of this._icons) {
      if (icon.theme === theme || icon.theme === 2 /* Any */ || icon.theme === void 0) {
        bestOfAnySize = icon;
        const matchingSize = icon.sizes.find((s) => s.width >= size);
        if (matchingSize) {
          return { ...icon, sizes: [matchingSize] };
        }
      }
    }
    return bestOfAnySize;
  }
}
export {
  McpIcons,
  parseAndValidateMcpIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BJY29ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldE1lZGlhTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBEdG8gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgSU1jcEljb25zLCBNY3BTZXJ2ZXJMYXVuY2gsIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG5jb25zdCBtY3BBbGxvd2FibGVDb250ZW50VHlwZXM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHQnaW1hZ2Uvd2VicCcsXG5cdCdpbWFnZS9wbmcnLFxuXHQnaW1hZ2UvanBlZycsXG5cdCdpbWFnZS9qcGcnLFxuXHQnaW1hZ2UvZ2lmJ1xuXTtcblxuY29uc3QgZW51bSBJY29uVGhlbWUge1xuXHRMaWdodCxcblx0RGFyayxcblx0QW55LFxufVxuXG5pbnRlcmZhY2UgSUljb24ge1xuXHQvKiogVVJJIHRoZSBpbWFnZSBjYW4gYmUgbG9hZGVkIGZyb20gKi9cblx0c3JjOiBVUkk7XG5cdC8qKiBUaGVtZSBmb3IgdGhpcyBpY29uLiAqL1xuXHR0aGVtZTogSWNvblRoZW1lO1xuXHQvKiogU2l6ZXMgb2YgdGhlIGljb24gaW4gYXNjZW5kaW5nIG9yZGVyLiAqL1xuXHRzaXplczogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XG59XG5cbmV4cG9ydCB0eXBlIFBhcnNlZE1jcEljb25zID0gSUljb25bXTtcbmV4cG9ydCB0eXBlIFN0b3JlZE1jcEljb25zID0gRHRvPElJY29uPltdO1xuXG5cbmZ1bmN0aW9uIHZhbGlkYXRlSWNvbihpY29uOiBNQ1AuSWNvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIGxvZ2dlcjogSUxvZ2dlcik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1pbWVUeXBlID0gaWNvbi5taW1lVHlwZT8udG9Mb3dlckNhc2UoKSB8fCBnZXRNZWRpYU1pbWUoaWNvbi5zcmMpO1xuXHRpZiAoIW1pbWVUeXBlIHx8ICFtY3BBbGxvd2FibGVDb250ZW50VHlwZXMuaW5jbHVkZXMobWltZVR5cGUpKSB7XG5cdFx0bG9nZ2VyLmRlYnVnKGBJZ25vcmluZyBpY29uIHdpdGggdW5zdXBwb3J0ZWQgbWltZSB0eXBlOiAke2ljb24uc3JjfSAoJHttaW1lVHlwZX0pLCBhbGxvd2VkOiAke21jcEFsbG93YWJsZUNvbnRlbnRUeXBlcy5qb2luKCcsICcpfWApO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShpY29uLnNyYyk7XG5cdGlmICh1cmkuc2NoZW1lID09PSAnZGF0YScpIHtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0aWYgKHVyaS5zY2hlbWUgPT09ICdodHRwcycgfHwgdXJpLnNjaGVtZSA9PT0gJ2h0dHAnKSB7XG5cdFx0aWYgKGxhdW5jaC50eXBlICE9PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFApIHtcblx0XHRcdGxvZ2dlci5kZWJ1ZyhgSWdub3JpbmcgaWNvbiB3aXRoIEhUVFAvSFRUUFMgVVJMOiAke2ljb24uc3JjfSBhcyB0aGUgTUNQIHNlcnZlciBpcyBub3QgbGF1bmNoZWQgd2l0aCBIVFRQIHRyYW5zcG9ydC5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHBlY3RlZEF1dGhvcml0eSA9IGxhdW5jaC51cmkuYXV0aG9yaXR5LnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKHVyaS5hdXRob3JpdHkudG9Mb3dlckNhc2UoKSAhPT0gZXhwZWN0ZWRBdXRob3JpdHkpIHtcblx0XHRcdGxvZ2dlci5kZWJ1ZyhgSWdub3JpbmcgaWNvbiB3aXRoIHVudHJ1c3RlZCBhdXRob3JpdHk6ICR7aWNvbi5zcmN9LCBleHBlY3RlZCBhdXRob3JpdHk6ICR7ZXhwZWN0ZWRBdXRob3JpdHl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdGlmICh1cmkuc2NoZW1lID09PSAnZmlsZScpIHtcblx0XHRpZiAobGF1bmNoLnR5cGUgIT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8pIHtcblx0XHRcdGxvZ2dlci5kZWJ1ZyhgSWdub3JpbmcgaWNvbiB3aXRoIGZpbGUgVVJMOiAke2ljb24uc3JjfSBhcyB0aGUgTUNQIHNlcnZlciBpcyBub3QgbGF1bmNoZWQgYXMgYSBsb2NhbCBwcm9jZXNzLmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRsb2dnZXIuZGVidWcoYElnbm9yaW5nIGljb24gd2l0aCB1bnN1cHBvcnRlZCBzY2hlbWU6ICR7aWNvbi5zcmN9LiBBbGxvd2VkOiBkYXRhOiwgaHR0cDosIGh0dHBzOiwgZmlsZTpgKTtcblx0cmV0dXJuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBbmRWYWxpZGF0ZU1jcEljb24oaWNvbnM6IE1DUC5JY29ucywgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIGxvZ2dlcjogSUxvZ2dlcik6IFBhcnNlZE1jcEljb25zIHtcblx0Y29uc3QgcmVzdWx0OiBQYXJzZWRNY3BJY29ucyA9IFtdO1xuXHRmb3IgKGNvbnN0IGljb24gb2YgaWNvbnMuaWNvbnMgfHwgW10pIHtcblx0XHRjb25zdCB1cmkgPSB2YWxpZGF0ZUljb24oaWNvbiwgbGF1bmNoLCBsb2dnZXIpO1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayBmb3Igc2l6ZXMgYXMgc3RyaW5nIGZvciBiYWNrLWNvbXBhdCB3aXRoIGVhcmx5IDIwMjUtMTEtMjUgZHJhZnRzXG5cdFx0Y29uc3Qgc2l6ZXNBcnIgPSB0eXBlb2YgaWNvbi5zaXplcyA9PT0gJ3N0cmluZycgPyAoaWNvbi5zaXplcyBhcyBzdHJpbmcpLnNwbGl0KCcgJykgOiBBcnJheS5pc0FycmF5KGljb24uc2l6ZXMpID8gaWNvbi5zaXplcyA6IFtdO1xuXHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdHNyYzogdXJpLFxuXHRcdFx0dGhlbWU6IGljb24udGhlbWUgPT09ICdsaWdodCcgPyBJY29uVGhlbWUuTGlnaHQgOiBpY29uLnRoZW1lID09PSAnZGFyaycgPyBJY29uVGhlbWUuRGFyayA6IEljb25UaGVtZS5BbnksXG5cdFx0XHRzaXplczogc2l6ZXNBcnIubWFwKHNpemUgPT4ge1xuXHRcdFx0XHRjb25zdCBbd2lkdGhTdHIsIGhlaWdodFN0cl0gPSBzaXplLnRvTG93ZXJDYXNlKCkuc3BsaXQoJ3gnKTtcblx0XHRcdFx0cmV0dXJuIHsgd2lkdGg6IE51bWJlcih3aWR0aFN0cikgfHwgMCwgaGVpZ2h0OiBOdW1iZXIoaGVpZ2h0U3RyKSB8fCAwIH07XG5cdFx0XHR9KS5zb3J0KChhLCBiKSA9PiBhLndpZHRoIC0gYi53aWR0aClcblx0XHR9KTtcblx0fVxuXG5cdHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhLnNpemVzWzBdPy53aWR0aCAtIGIuc2l6ZXNbMF0/LndpZHRoKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY2xhc3MgTWNwSWNvbnMgaW1wbGVtZW50cyBJTWNwSWNvbnMge1xuXHRwdWJsaWMgc3RhdGljIGZyb21TdG9yZWQoaWNvbnM6IFN0b3JlZE1jcEljb25zIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIE1jcEljb25zLmZyb21QYXJzZWQoaWNvbnM/Lm1hcChpID0+ICh7IHNyYzogVVJJLnJldml2ZShpLnNyYyksIHRoZW1lOiBpLnRoZW1lLCBzaXplczogaS5zaXplcyB9KSkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tUGFyc2VkKGljb25zOiBQYXJzZWRNY3BJY29ucyB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBuZXcgTWNwSWNvbnMoaWNvbnMgfHwgW10pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2ljb25zOiBJSWNvbltdKSB7IH1cblxuXHRnZXRVcmwoc2l6ZTogbnVtYmVyKTogeyBkYXJrOiBVUkk7IGxpZ2h0PzogVVJJIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhcmsgPSB0aGlzLmdldFNpemVXaXRoVGhlbWUoc2l6ZSwgSWNvblRoZW1lLkRhcmspO1xuXHRcdGlmIChkYXJrPy50aGVtZSA9PT0gSWNvblRoZW1lLkFueSkge1xuXHRcdFx0cmV0dXJuIHsgZGFyazogZGFyay5zcmMgfTtcblx0XHR9XG5cblx0XHRjb25zdCBsaWdodCA9IHRoaXMuZ2V0U2l6ZVdpdGhUaGVtZShzaXplLCBJY29uVGhlbWUuTGlnaHQpO1xuXHRcdGlmICghbGlnaHQgJiYgIWRhcmspIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZGFyazogKGRhcmsgfHwgbGlnaHQpIS5zcmMsIGxpZ2h0OiBsaWdodD8uc3JjIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFNpemVXaXRoVGhlbWUoc2l6ZTogbnVtYmVyLCB0aGVtZTogSWNvblRoZW1lKTogSUljb24gfCB1bmRlZmluZWQge1xuXHRcdGxldCBiZXN0T2ZBbnlTaXplOiBJSWNvbiB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgaWNvbiBvZiB0aGlzLl9pY29ucykge1xuXHRcdFx0aWYgKGljb24udGhlbWUgPT09IHRoZW1lIHx8IGljb24udGhlbWUgPT09IEljb25UaGVtZS5BbnkgfHwgaWNvbi50aGVtZSA9PT0gdW5kZWZpbmVkKSB7IC8vIHVuZGVmaW5lZCBjaGVjayBmb3IgYmFjayBjb21wYXRcblx0XHRcdFx0YmVzdE9mQW55U2l6ZSA9IGljb247XG5cblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdTaXplID0gaWNvbi5zaXplcy5maW5kKHMgPT4gcy53aWR0aCA+PSBzaXplKTtcblx0XHRcdFx0aWYgKG1hdGNoaW5nU2l6ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmljb24sIHNpemVzOiBbbWF0Y2hpbmdTaXplXSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBiZXN0T2ZBbnlTaXplO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFHcEIsU0FBcUMsOEJBQThCO0FBR25FLE1BQU0sMkJBQThDO0FBQUEsRUFDbkQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFQSxJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDQyxFQUFBQSxz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
