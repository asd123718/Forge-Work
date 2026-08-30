var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters } from "../../../../../base/common/strings.js";
import { URI } from "../../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { matchesScheme } from "../../../../../base/common/network.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { TerminalBuiltinLinkType } from "./links.js";
import { convertLinkRangeToBuffer, getXtermLineContent } from "./terminalLinkHelpers.js";
import { TERMINAL_CONFIG_SECTION } from "../../../terminal/common/terminal.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxLineLength"] = 2e3] = "MaxLineLength";
  return Constants2;
})(Constants || {});
let TerminalWordLinkDetector = class extends Disposable {
  constructor(xterm, _configurationService, _productService) {
    super();
    this.xterm = xterm;
    this._configurationService = _configurationService;
    this._productService = _productService;
    // Word links typically search the workspace so it makes sense that their maximum link length is
    // quite small.
    this.maxLinkLength = 100;
    this._refreshSeparatorCodes();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.WordSeparators)) {
        this._refreshSeparatorCodes();
      }
    }));
  }
  detect(lines, startLine, endLine) {
    const links = [];
    const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
    if (text === "" || text.length > 2e3 /* MaxLineLength */) {
      return [];
    }
    const words = this._parseWords(text);
    for (const word of words) {
      if (word.text === "") {
        continue;
      }
      if (word.text.length > 0 && word.text.charAt(word.text.length - 1) === ":") {
        word.text = word.text.slice(0, -1);
        word.endIndex--;
      }
      const bufferRange = convertLinkRangeToBuffer(
        lines,
        this.xterm.cols,
        {
          startColumn: word.startIndex + 1,
          startLineNumber: 1,
          endColumn: word.endIndex + 1,
          endLineNumber: 1
        },
        startLine
      );
      if (matchesScheme(word.text, this._productService.urlProtocol)) {
        const uri = URI.parse(word.text);
        if (uri) {
          links.push({
            text: word.text,
            uri,
            bufferRange,
            type: TerminalBuiltinLinkType.Url
          });
        }
        continue;
      }
      links.push({
        text: word.text,
        bufferRange,
        type: TerminalBuiltinLinkType.Search,
        contextLine: text
      });
    }
    return links;
  }
  _parseWords(text) {
    const words = [];
    const splitWords = text.split(this._separatorRegex);
    let runningIndex = 0;
    for (let i = 0; i < splitWords.length; i++) {
      words.push({
        text: splitWords[i],
        startIndex: runningIndex,
        endIndex: runningIndex + splitWords[i].length
      });
      runningIndex += splitWords[i].length + 1;
    }
    return words;
  }
  _refreshSeparatorCodes() {
    const separators = this._configurationService.getValue(TERMINAL_CONFIG_SECTION).wordSeparators;
    let powerlineSymbols = "";
    for (let i = 57520; i <= 57535; i++) {
      powerlineSymbols += String.fromCharCode(i);
    }
    this._separatorRegex = new RegExp(`[${escapeRegExpCharacters(separators)}${powerlineSymbols}]`, "g");
  }
};
TerminalWordLinkDetector.id = "word";
TerminalWordLinkDetector = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IProductService)
], TerminalWordLinkDetector);
export {
  TerminalWordLinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsV29yZExpbmtEZXRlY3Rvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2ltcGxlTGluaywgSVRlcm1pbmFsTGlua0RldGVjdG9yLCBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSB9IGZyb20gJy4vbGlua3MuanMnO1xuaW1wb3J0IHsgY29udmVydExpbmtSYW5nZVRvQnVmZmVyLCBnZXRYdGVybUxpbmVDb250ZW50IH0gZnJvbSAnLi90ZXJtaW5hbExpbmtIZWxwZXJzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb24sIFRFUk1JTkFMX0NPTkZJR19TRUNUSU9OIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB0eXBlIHsgSUJ1ZmZlckxpbmUsIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHQvKipcblx0ICogVGhlIG1heCBsaW5lIGxlbmd0aCB0byB0cnkgZXh0cmFjdCB3b3JkIGxpbmtzIGZyb20uXG5cdCAqL1xuXHRNYXhMaW5lTGVuZ3RoID0gMjAwMFxufVxuXG5pbnRlcmZhY2UgV29yZCB7XG5cdHN0YXJ0SW5kZXg6IG51bWJlcjtcblx0ZW5kSW5kZXg6IG51bWJlcjtcblx0dGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxXb3JkTGlua0RldGVjdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbExpbmtEZXRlY3RvciB7XG5cdHN0YXRpYyBpZCA9ICd3b3JkJztcblxuXHQvLyBXb3JkIGxpbmtzIHR5cGljYWxseSBzZWFyY2ggdGhlIHdvcmtzcGFjZSBzbyBpdCBtYWtlcyBzZW5zZSB0aGF0IHRoZWlyIG1heGltdW0gbGluayBsZW5ndGggaXNcblx0Ly8gcXVpdGUgc21hbGwuXG5cdHJlYWRvbmx5IG1heExpbmtMZW5ndGggPSAxMDA7XG5cblx0cHJpdmF0ZSBfc2VwYXJhdG9yUmVnZXghOiBSZWdFeHA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgeHRlcm06IFRlcm1pbmFsLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWZyZXNoU2VwYXJhdG9yQ29kZXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5Xb3JkU2VwYXJhdG9ycykpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFNlcGFyYXRvckNvZGVzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGV0ZWN0KGxpbmVzOiBJQnVmZmVyTGluZVtdLCBzdGFydExpbmU6IG51bWJlciwgZW5kTGluZTogbnVtYmVyKTogSVRlcm1pbmFsU2ltcGxlTGlua1tdIHtcblx0XHRjb25zdCBsaW5rczogSVRlcm1pbmFsU2ltcGxlTGlua1tdID0gW107XG5cblx0XHQvLyBHZXQgdGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHdyYXBwZWQgbGluZVxuXHRcdGNvbnN0IHRleHQgPSBnZXRYdGVybUxpbmVDb250ZW50KHRoaXMueHRlcm0uYnVmZmVyLmFjdGl2ZSwgc3RhcnRMaW5lLCBlbmRMaW5lLCB0aGlzLnh0ZXJtLmNvbHMpO1xuXHRcdGlmICh0ZXh0ID09PSAnJyB8fCB0ZXh0Lmxlbmd0aCA+IENvbnN0YW50cy5NYXhMaW5lTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gUGFyc2Ugb3V0IGFsbCB3b3JkcyBmcm9tIHRoZSB3cmFwcGVkIGxpbmVcblx0XHRjb25zdCB3b3JkczogV29yZFtdID0gdGhpcy5fcGFyc2VXb3Jkcyh0ZXh0KTtcblxuXHRcdC8vIE1hcCB0aGUgd29yZHMgdG8gSVRlcm1pbmFsTGluayBvYmplY3RzXG5cdFx0Zm9yIChjb25zdCB3b3JkIG9mIHdvcmRzKSB7XG5cdFx0XHRpZiAod29yZC50ZXh0ID09PSAnJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh3b3JkLnRleHQubGVuZ3RoID4gMCAmJiB3b3JkLnRleHQuY2hhckF0KHdvcmQudGV4dC5sZW5ndGggLSAxKSA9PT0gJzonKSB7XG5cdFx0XHRcdHdvcmQudGV4dCA9IHdvcmQudGV4dC5zbGljZSgwLCAtMSk7XG5cdFx0XHRcdHdvcmQuZW5kSW5kZXgtLTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ1ZmZlclJhbmdlID0gY29udmVydExpbmtSYW5nZVRvQnVmZmVyKFxuXHRcdFx0XHRsaW5lcyxcblx0XHRcdFx0dGhpcy54dGVybS5jb2xzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHdvcmQuc3RhcnRJbmRleCArIDEsXG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogd29yZC5lbmRJbmRleCArIDEsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGFydExpbmVcblx0XHRcdCk7XG5cblx0XHRcdC8vIFN1cHBvcnQgdGhpcyBwcm9kdWN0J3MgVVJMIHByb3RvY29sXG5cdFx0XHRpZiAobWF0Y2hlc1NjaGVtZSh3b3JkLnRleHQsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sKSkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2Uod29yZC50ZXh0KTtcblx0XHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHRcdGxpbmtzLnB1c2goe1xuXHRcdFx0XHRcdFx0dGV4dDogd29yZC50ZXh0LFxuXHRcdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdFx0YnVmZmVyUmFuZ2UsXG5cdFx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Vcmxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VhcmNoIGxpbmtzXG5cdFx0XHRsaW5rcy5wdXNoKHtcblx0XHRcdFx0dGV4dDogd29yZC50ZXh0LFxuXHRcdFx0XHRidWZmZXJSYW5nZSxcblx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoLFxuXHRcdFx0XHRjb250ZXh0TGluZTogdGV4dFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmtzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VXb3Jkcyh0ZXh0OiBzdHJpbmcpOiBXb3JkW10ge1xuXHRcdGNvbnN0IHdvcmRzOiBXb3JkW10gPSBbXTtcblx0XHRjb25zdCBzcGxpdFdvcmRzID0gdGV4dC5zcGxpdCh0aGlzLl9zZXBhcmF0b3JSZWdleCk7XG5cdFx0bGV0IHJ1bm5pbmdJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzcGxpdFdvcmRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR3b3Jkcy5wdXNoKHtcblx0XHRcdFx0dGV4dDogc3BsaXRXb3Jkc1tpXSxcblx0XHRcdFx0c3RhcnRJbmRleDogcnVubmluZ0luZGV4LFxuXHRcdFx0XHRlbmRJbmRleDogcnVubmluZ0luZGV4ICsgc3BsaXRXb3Jkc1tpXS5sZW5ndGhcblx0XHRcdH0pO1xuXHRcdFx0cnVubmluZ0luZGV4ICs9IHNwbGl0V29yZHNbaV0ubGVuZ3RoICsgMTtcblx0XHR9XG5cdFx0cmV0dXJuIHdvcmRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaFNlcGFyYXRvckNvZGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlcGFyYXRvcnMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxDb25maWd1cmF0aW9uPihURVJNSU5BTF9DT05GSUdfU0VDVElPTikud29yZFNlcGFyYXRvcnM7XG5cdFx0bGV0IHBvd2VybGluZVN5bWJvbHMgPSAnJztcblx0XHRmb3IgKGxldCBpID0gMHhlMGIwOyBpIDw9IDB4ZTBiZjsgaSsrKSB7XG5cdFx0XHRwb3dlcmxpbmVTeW1ib2xzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoaSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NlcGFyYXRvclJlZ2V4ID0gbmV3IFJlZ0V4cChgWyR7ZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhzZXBhcmF0b3JzKX0ke3Bvd2VybGluZVN5bWJvbHN9XWAsICdnJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXFELCtCQUErQjtBQUNwRixTQUFTLDBCQUEwQiwyQkFBMkI7QUFDOUQsU0FBaUMsK0JBQStCO0FBR2hFLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUlDLEVBQUFBLHNCQUFBLG1CQUFnQixPQUFoQjtBQUpVLFNBQUFBO0FBQUEsR0FBQTtBQWFKLElBQU0sMkJBQU4sY0FBdUMsV0FBNEM7QUFBQSxFQVN6RixZQUNVLE9BQytCLHVCQUNOLGlCQUNqQztBQUNELFVBQU07QUFK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
