import { ColorThemeData } from "../../common/colorThemeData.js";
import assert from "assert";
import { TokenStyle, getTokenClassificationRegistry } from "../../../../../platform/theme/common/tokenClassificationRegistry.js";
import { Color } from "../../../../../base/common/color.js";
import { isString } from "../../../../../base/common/types.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { DiskFileSystemProvider } from "../../../../../platform/files/node/diskFileSystemProvider.js";
import { FileAccess, Schemas } from "../../../../../base/common/network.js";
import { ExtensionResourceLoaderService } from "../../../../../platform/extensionResourceLoader/common/extensionResourceLoaderService.js";
import { mock, TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ExtensionGalleryManifestService } from "../../../../../platform/extensionManagement/common/extensionGalleryManifestService.js";
const undefinedStyle = { bold: void 0, underline: void 0, italic: void 0 };
const unsetStyle = { bold: false, underline: false, italic: false };
function ts(foreground, styleFlags) {
  const foregroundColor = isString(foreground) ? Color.fromHex(foreground) : void 0;
  return new TokenStyle(foregroundColor, styleFlags?.bold, styleFlags?.underline, styleFlags?.strikethrough, styleFlags?.italic);
}
function tokenStyleAsString(ts2) {
  if (!ts2) {
    return "tokenstyle-undefined";
  }
  let str = ts2.foreground ? ts2.foreground.toString() : "no-foreground";
  if (ts2.bold !== void 0) {
    str += ts2.bold ? "+B" : "-B";
  }
  if (ts2.underline !== void 0) {
    str += ts2.underline ? "+U" : "-U";
  }
  if (ts2.italic !== void 0) {
    str += ts2.italic ? "+I" : "-I";
  }
  return str;
}
function assertTokenStyle(actual, expected, message) {
  assert.strictEqual(tokenStyleAsString(actual), tokenStyleAsString(expected), message);
}
function assertTokenStyleMetaData(colorIndex, actual, expected, message = "") {
  if (expected === void 0 || expected === null || actual === void 0) {
    assert.strictEqual(actual, expected, message);
    return;
  }
  assert.strictEqual(actual.bold, expected.bold, "bold " + message);
  assert.strictEqual(actual.italic, expected.italic, "italic " + message);
  assert.strictEqual(actual.underline, expected.underline, "underline " + message);
  const actualForegroundIndex = actual.foreground;
  if (actualForegroundIndex && expected.foreground) {
    assert.strictEqual(colorIndex[actualForegroundIndex], Color.Format.CSS.formatHexA(expected.foreground, true).toUpperCase(), "foreground " + message);
  } else {
    assert.strictEqual(actualForegroundIndex, expected.foreground || 0, "foreground " + message);
  }
}
function assertTokenStyles(themeData, expected, language = "typescript") {
  const colorIndex = themeData.tokenColorMap;
  for (const qualifiedClassifier in expected) {
    const [type, ...modifiers] = qualifiedClassifier.split(".");
    const expectedTokenStyle = expected[qualifiedClassifier];
    const tokenStyleMetaData = themeData.getTokenStyleMetadata(type, modifiers, language);
    assertTokenStyleMetaData(colorIndex, tokenStyleMetaData, expectedTokenStyle, qualifiedClassifier);
  }
}
suite("Themes - TokenStyleResolving", () => {
  const fileService = new FileService(new NullLogService());
  const requestService = new (mock())();
  const storageService = new (mock())();
  const environmentService = new (mock())();
  const configurationService = new (mock())();
  const extensionResourceLoaderService = new ExtensionResourceLoaderService(fileService, storageService, TestProductService, environmentService, configurationService, new ExtensionGalleryManifestService(TestProductService), requestService, new NullLogService());
  const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
  fileService.registerProvider(Schemas.file, diskFileSystemProvider);
  teardown(() => {
    diskFileSystemProvider.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("color defaults", async () => {
    const themeData = ColorThemeData.createUnloadedTheme("foo");
    themeData.location = FileAccess.asFileUri("vs/workbench/services/themes/test/node/color-theme.json");
    await themeData.ensureLoaded(extensionResourceLoaderService);
    assert.strictEqual(themeData.isLoaded, true);
    assertTokenStyles(themeData, {
      "comment": ts("#000000", undefinedStyle),
      "variable": ts("#111111", unsetStyle),
      "type": ts("#333333", { bold: false, underline: true, italic: false }),
      "function": ts("#333333", unsetStyle),
      "string": ts("#444444", undefinedStyle),
      "number": ts("#555555", undefinedStyle),
      "keyword": ts("#666666", undefinedStyle)
    });
  });
  test("resolveScopes", async () => {
    const themeData = ColorThemeData.createLoadedEmptyTheme("test", "test");
    const customTokenColors = {
      textMateRules: [
        {
          scope: "variable",
          settings: {
            fontStyle: "",
            foreground: "#F8F8F2"
          }
        },
        {
          scope: "keyword.operator",
          settings: {
            fontStyle: "italic bold underline",
            foreground: "#F92672"
          }
        },
        {
          scope: "storage",
          settings: {
            fontStyle: "italic",
            foreground: "#F92672"
          }
        },
        {
          scope: ["storage.type", "meta.structure.dictionary.json string.quoted.double.json"],
          settings: {
            foreground: "#66D9EF"
          }
        },
        {
          scope: "entity.name.type, entity.name.class, entity.name.namespace, entity.name.scope-resolution",
          settings: {
            fontStyle: "underline",
            foreground: "#A6E22E"
          }
        }
      ]
    };
    themeData.setCustomTokenColors(customTokenColors);
    let tokenStyle;
    const defaultTokenStyle = void 0;
    tokenStyle = themeData.resolveScopes([["variable"]]);
    assertTokenStyle(tokenStyle, ts("#F8F8F2", unsetStyle), "variable");
    tokenStyle = themeData.resolveScopes([["keyword.operator"]]);
    assertTokenStyle(tokenStyle, ts("#F92672", { italic: true, bold: true, underline: true }), "keyword");
    tokenStyle = themeData.resolveScopes([["keyword"]]);
    assertTokenStyle(tokenStyle, defaultTokenStyle, "keyword");
    tokenStyle = themeData.resolveScopes([["keyword.operator"]]);
    assertTokenStyle(tokenStyle, ts("#F92672", { italic: true, bold: true, underline: true }), "keyword.operator");
    tokenStyle = themeData.resolveScopes([["keyword.operators"]]);
    assertTokenStyle(tokenStyle, defaultTokenStyle, "keyword.operators");
    tokenStyle = themeData.resolveScopes([["storage"]]);
    assertTokenStyle(tokenStyle, ts("#F92672", { italic: true, bold: false, underline: false }), "storage");
    tokenStyle = themeData.resolveScopes([["storage.type"]]);
    assertTokenStyle(tokenStyle, ts("#66D9EF", { italic: true, bold: false, underline: false }), "storage.type");
    tokenStyle = themeData.resolveScopes([["entity.name.class"]]);
    assertTokenStyle(tokenStyle, ts("#A6E22E", { italic: false, bold: false, underline: true }), "entity.name.class");
    tokenStyle = themeData.resolveScopes([["meta.structure.dictionary.json", "string.quoted.double.json"]]);
    assertTokenStyle(tokenStyle, ts("#66D9EF", void 0), "json property");
    tokenStyle = themeData.resolveScopes([["source.json", "meta.structure.dictionary.json", "string.quoted.double.json"]]);
    assertTokenStyle(tokenStyle, ts("#66D9EF", void 0), "json property");
    tokenStyle = themeData.resolveScopes([["keyword"], ["storage.type"], ["entity.name.class"]]);
    assertTokenStyle(tokenStyle, ts("#66D9EF", { italic: true, bold: false, underline: false }), "storage.type");
  });
  test("resolveScopes - match most specific", async () => {
    const themeData = ColorThemeData.createLoadedEmptyTheme("test", "test");
    const customTokenColors = {
      textMateRules: [
        {
          scope: "entity.name.type",
          settings: {
            fontStyle: "underline",
            foreground: "#A6E22E"
          }
        },
        {
          scope: "entity.name.type.class",
          settings: {
            foreground: "#FF00FF"
          }
        },
        {
          scope: "entity.name",
          settings: {
            foreground: "#FFFFFF"
          }
        }
      ]
    };
    themeData.setCustomTokenColors(customTokenColors);
    const tokenStyle = themeData.resolveScopes([["entity.name.type.class"]]);
    assertTokenStyle(tokenStyle, ts("#FF00FF", { italic: false, bold: false, underline: true }), "entity.name.type.class");
  });
  test("rule matching", async () => {
    const themeData = ColorThemeData.createLoadedEmptyTheme("test", "test");
    themeData.setCustomColors({ "editor.foreground": "#000000" });
    themeData.setCustomSemanticTokenColors({
      enabled: true,
      rules: {
        "type": "#ff0000",
        "class": { foreground: "#0000ff", italic: true },
        "*.static": { bold: true },
        "*.declaration": { italic: true },
        "*.async.static": { italic: true, underline: true },
        "*.async": { foreground: "#000fff", underline: true }
      }
    });
    assertTokenStyles(themeData, {
      "type": ts("#ff0000", undefinedStyle),
      "type.static": ts("#ff0000", { bold: true }),
      "type.static.declaration": ts("#ff0000", { bold: true, italic: true }),
      "class": ts("#0000ff", { italic: true }),
      "class.static.declaration": ts("#0000ff", { bold: true, italic: true }),
      "class.declaration": ts("#0000ff", { italic: true }),
      "class.declaration.async": ts("#000fff", { underline: true, italic: true }),
      "class.declaration.async.static": ts("#000fff", { italic: true, underline: true, bold: true })
    });
  });
  test("super type", async () => {
    const registry = getTokenClassificationRegistry();
    registry.registerTokenType("myTestInterface", "A type just for testing", "interface");
    registry.registerTokenType("myTestSubInterface", "A type just for testing", "myTestInterface");
    try {
      const themeData = ColorThemeData.createLoadedEmptyTheme("test", "test");
      themeData.setCustomColors({ "editor.foreground": "#000000" });
      themeData.setCustomSemanticTokenColors({
        enabled: true,
        rules: {
          "interface": "#ff0000",
          "myTestInterface": { italic: true },
          "interface.static": { bold: true }
        }
      });
      assertTokenStyles(themeData, { "myTestSubInterface": ts("#ff0000", { italic: true }) });
      assertTokenStyles(themeData, { "myTestSubInterface.static": ts("#ff0000", { italic: true, bold: true }) });
      themeData.setCustomSemanticTokenColors({
        enabled: true,
        rules: {
          "interface": "#ff0000",
          "myTestInterface": { foreground: "#ff00ff", italic: true }
        }
      });
      assertTokenStyles(themeData, { "myTestSubInterface": ts("#ff00ff", { italic: true }) });
    } finally {
      registry.deregisterTokenType("myTestInterface");
      registry.deregisterTokenType("myTestSubInterface");
    }
  });
  test("language", async () => {
    try {
      const themeData = ColorThemeData.createLoadedEmptyTheme("test", "test");
      themeData.setCustomColors({ "editor.foreground": "#000000" });
      themeData.setCustomSemanticTokenColors({
        enabled: true,
        rules: {
          "interface": "#fff000",
          "interface:java": "#ff0000",
          "interface.static": { bold: true },
          "interface.static:typescript": { italic: true }
        }
      });
      assertTokenStyles(themeData, { "interface": ts("#ff0000", void 0) }, "java");
      assertTokenStyles(themeData, { "interface": ts("#fff000", void 0) }, "typescript");
      assertTokenStyles(themeData, { "interface.static": ts("#ff0000", { bold: true }) }, "java");
      assertTokenStyles(themeData, { "interface.static": ts("#fff000", { bold: true, italic: true }) }, "typescript");
    } finally {
    }
  });
  test("language - scope resolving", async () => {
    const registry = getTokenClassificationRegistry();
    const numberOfDefaultRules = registry.getTokenStylingDefaultRules().length;
    registry.registerTokenStyleDefault(registry.parseTokenSelector("type", "typescript1"), { scopesToProbe: [["entity.name.type.ts1"]] });
    registry.registerTokenStyleDefault(registry.parseTokenSelector("type:javascript1"), { scopesToProbe: [["entity.name.type.js1"]] });
    try {
      const themeData = ColorThemeData.createLoadedEmptyTheme("test", "test");
      themeData.setCustomColors({ "editor.foreground": "#000000" });
      themeData.setCustomTokenColors({
        textMateRules: [
          {
            scope: "entity.name.type",
            settings: { foreground: "#aa0000" }
          },
          {
            scope: "entity.name.type.ts1",
            settings: { foreground: "#bb0000" }
          }
        ]
      });
      assertTokenStyles(themeData, { "type": ts("#aa0000", void 0) }, "javascript1");
      assertTokenStyles(themeData, { "type": ts("#bb0000", void 0) }, "typescript1");
    } finally {
      registry.deregisterTokenStyleDefault(registry.parseTokenSelector("type", "typescript1"));
      registry.deregisterTokenStyleDefault(registry.parseTokenSelector("type:javascript1"));
      assert.strictEqual(registry.getTokenStylingDefaultRules().length, numberOfDefaultRules);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXHRlc3RcXG5vZGVcXHRva2VuU3R5bGVSZXNvbHZpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvbG9yVGhlbWVEYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbG9yVGhlbWVEYXRhLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRva2VuU3R5bGUsIGdldFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUb2tlblN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtb2NrLCBUZXN0UHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmpzJztcblxuY29uc3QgdW5kZWZpbmVkU3R5bGUgPSB7IGJvbGQ6IHVuZGVmaW5lZCwgdW5kZXJsaW5lOiB1bmRlZmluZWQsIGl0YWxpYzogdW5kZWZpbmVkIH07XG5jb25zdCB1bnNldFN0eWxlID0geyBib2xkOiBmYWxzZSwgdW5kZXJsaW5lOiBmYWxzZSwgaXRhbGljOiBmYWxzZSB9O1xuXG5mdW5jdGlvbiB0cyhmb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQsIHN0eWxlRmxhZ3M6IHsgYm9sZD86IGJvb2xlYW47IHVuZGVybGluZT86IGJvb2xlYW47IHN0cmlrZXRocm91Z2g/OiBib29sZWFuOyBpdGFsaWM/OiBib29sZWFuIH0gfCB1bmRlZmluZWQpOiBUb2tlblN0eWxlIHtcblx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gaXNTdHJpbmcoZm9yZWdyb3VuZCkgPyBDb2xvci5mcm9tSGV4KGZvcmVncm91bmQpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4gbmV3IFRva2VuU3R5bGUoZm9yZWdyb3VuZENvbG9yLCBzdHlsZUZsYWdzPy5ib2xkLCBzdHlsZUZsYWdzPy51bmRlcmxpbmUsIHN0eWxlRmxhZ3M/LnN0cmlrZXRocm91Z2gsIHN0eWxlRmxhZ3M/Lml0YWxpYyk7XG59XG5cbmZ1bmN0aW9uIHRva2VuU3R5bGVBc1N0cmluZyh0czogVG9rZW5TdHlsZSB8IHVuZGVmaW5lZCB8IG51bGwpIHtcblx0aWYgKCF0cykge1xuXHRcdHJldHVybiAndG9rZW5zdHlsZS11bmRlZmluZWQnO1xuXHR9XG5cdGxldCBzdHIgPSB0cy5mb3JlZ3JvdW5kID8gdHMuZm9yZWdyb3VuZC50b1N0cmluZygpIDogJ25vLWZvcmVncm91bmQnO1xuXHRpZiAodHMuYm9sZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0c3RyICs9IHRzLmJvbGQgPyAnK0InIDogJy1CJztcblx0fVxuXHRpZiAodHMudW5kZXJsaW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRzdHIgKz0gdHMudW5kZXJsaW5lID8gJytVJyA6ICctVSc7XG5cdH1cblx0aWYgKHRzLml0YWxpYyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0c3RyICs9IHRzLml0YWxpYyA/ICcrSScgOiAnLUknO1xuXHR9XG5cdHJldHVybiBzdHI7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFRva2VuU3R5bGUoYWN0dWFsOiBUb2tlblN0eWxlIHwgdW5kZWZpbmVkIHwgbnVsbCwgZXhwZWN0ZWQ6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQgfCBudWxsLCBtZXNzYWdlPzogc3RyaW5nKSB7XG5cdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlblN0eWxlQXNTdHJpbmcoYWN0dWFsKSwgdG9rZW5TdHlsZUFzU3RyaW5nKGV4cGVjdGVkKSwgbWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFRva2VuU3R5bGVNZXRhRGF0YShjb2xvckluZGV4OiBzdHJpbmdbXSwgYWN0dWFsOiBJVG9rZW5TdHlsZSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWQ6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQgfCBudWxsLCBtZXNzYWdlID0gJycpIHtcblx0aWYgKGV4cGVjdGVkID09PSB1bmRlZmluZWQgfHwgZXhwZWN0ZWQgPT09IG51bGwgfHwgYWN0dWFsID09PSB1bmRlZmluZWQpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuYm9sZCwgZXhwZWN0ZWQuYm9sZCwgJ2JvbGQgJyArIG1lc3NhZ2UpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLml0YWxpYywgZXhwZWN0ZWQuaXRhbGljLCAnaXRhbGljICcgKyBtZXNzYWdlKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC51bmRlcmxpbmUsIGV4cGVjdGVkLnVuZGVybGluZSwgJ3VuZGVybGluZSAnICsgbWVzc2FnZSk7XG5cblx0Y29uc3QgYWN0dWFsRm9yZWdyb3VuZEluZGV4ID0gYWN0dWFsLmZvcmVncm91bmQ7XG5cdGlmIChhY3R1YWxGb3JlZ3JvdW5kSW5kZXggJiYgZXhwZWN0ZWQuZm9yZWdyb3VuZCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvckluZGV4W2FjdHVhbEZvcmVncm91bmRJbmRleF0sIENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShleHBlY3RlZC5mb3JlZ3JvdW5kLCB0cnVlKS50b1VwcGVyQ2FzZSgpLCAnZm9yZWdyb3VuZCAnICsgbWVzc2FnZSk7XG5cdH0gZWxzZSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbEZvcmVncm91bmRJbmRleCwgZXhwZWN0ZWQuZm9yZWdyb3VuZCB8fCAwLCAnZm9yZWdyb3VuZCAnICsgbWVzc2FnZSk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBhc3NlcnRUb2tlblN0eWxlcyh0aGVtZURhdGE6IENvbG9yVGhlbWVEYXRhLCBleHBlY3RlZDogeyBbcXVhbGlmaWVkQ2xhc3NpZmllcjogc3RyaW5nXTogVG9rZW5TdHlsZSB9LCBsYW5ndWFnZSA9ICd0eXBlc2NyaXB0Jykge1xuXHRjb25zdCBjb2xvckluZGV4ID0gdGhlbWVEYXRhLnRva2VuQ29sb3JNYXA7XG5cblx0Zm9yIChjb25zdCBxdWFsaWZpZWRDbGFzc2lmaWVyIGluIGV4cGVjdGVkKSB7XG5cdFx0Y29uc3QgW3R5cGUsIC4uLm1vZGlmaWVyc10gPSBxdWFsaWZpZWRDbGFzc2lmaWVyLnNwbGl0KCcuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZFRva2VuU3R5bGUgPSBleHBlY3RlZFtxdWFsaWZpZWRDbGFzc2lmaWVyXTtcblxuXHRcdGNvbnN0IHRva2VuU3R5bGVNZXRhRGF0YSA9IHRoZW1lRGF0YS5nZXRUb2tlblN0eWxlTWV0YWRhdGEodHlwZSwgbW9kaWZpZXJzLCBsYW5ndWFnZSk7XG5cdFx0YXNzZXJ0VG9rZW5TdHlsZU1ldGFEYXRhKGNvbG9ySW5kZXgsIHRva2VuU3R5bGVNZXRhRGF0YSwgZXhwZWN0ZWRUb2tlblN0eWxlLCBxdWFsaWZpZWRDbGFzc2lmaWVyKTtcblx0fVxufVxuXG5zdWl0ZSgnVGhlbWVzIC0gVG9rZW5TdHlsZVJlc29sdmluZycsICgpID0+IHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRjb25zdCByZXF1ZXN0U2VydmljZSA9IG5ldyAobW9jazxJUmVxdWVzdFNlcnZpY2U+KCkpKCk7XG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gbmV3IChtb2NrPElTdG9yYWdlU2VydmljZT4oKSkoKTtcblx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IChtb2NrPElFbnZpcm9ubWVudFNlcnZpY2U+KCkpKCk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IChtb2NrPElDb25maWd1cmF0aW9uU2VydmljZT4oKSkoKTtcblxuXHRjb25zdCBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgPSBuZXcgRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKGZpbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZShUZXN0UHJvZHVjdFNlcnZpY2UpLCByZXF1ZXN0U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbG9yIGRlZmF1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRoZW1lRGF0YSA9IENvbG9yVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWUoJ2ZvbycpO1xuXHRcdHRoZW1lRGF0YS5sb2NhdGlvbiA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL3Rlc3Qvbm9kZS9jb2xvci10aGVtZS5qc29uJyk7XG5cdFx0YXdhaXQgdGhlbWVEYXRhLmVuc3VyZUxvYWRlZChleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoZW1lRGF0YS5pc0xvYWRlZCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnRUb2tlblN0eWxlcyh0aGVtZURhdGEsIHtcblx0XHRcdCdjb21tZW50JzogdHMoJyMwMDAwMDAnLCB1bmRlZmluZWRTdHlsZSksXG5cdFx0XHQndmFyaWFibGUnOiB0cygnIzExMTExMScsIHVuc2V0U3R5bGUpLFxuXHRcdFx0J3R5cGUnOiB0cygnIzMzMzMzMycsIHsgYm9sZDogZmFsc2UsIHVuZGVybGluZTogdHJ1ZSwgaXRhbGljOiBmYWxzZSB9KSxcblx0XHRcdCdmdW5jdGlvbic6IHRzKCcjMzMzMzMzJywgdW5zZXRTdHlsZSksXG5cdFx0XHQnc3RyaW5nJzogdHMoJyM0NDQ0NDQnLCB1bmRlZmluZWRTdHlsZSksXG5cdFx0XHQnbnVtYmVyJzogdHMoJyM1NTU1NTUnLCB1bmRlZmluZWRTdHlsZSksXG5cdFx0XHQna2V5d29yZCc6IHRzKCcjNjY2NjY2JywgdW5kZWZpbmVkU3R5bGUpXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVTY29wZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGhlbWVEYXRhID0gQ29sb3JUaGVtZURhdGEuY3JlYXRlTG9hZGVkRW1wdHlUaGVtZSgndGVzdCcsICd0ZXN0Jyk7XG5cblx0XHRjb25zdCBjdXN0b21Ub2tlbkNvbG9yczogSVRva2VuQ29sb3JDdXN0b21pemF0aW9ucyA9IHtcblx0XHRcdHRleHRNYXRlUnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNjb3BlOiAndmFyaWFibGUnLFxuXHRcdFx0XHRcdHNldHRpbmdzOiB7XG5cdFx0XHRcdFx0XHRmb250U3R5bGU6ICcnLFxuXHRcdFx0XHRcdFx0Zm9yZWdyb3VuZDogJyNGOEY4RjInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2NvcGU6ICdrZXl3b3JkLm9wZXJhdG9yJyxcblx0XHRcdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0Zm9udFN0eWxlOiAnaXRhbGljIGJvbGQgdW5kZXJsaW5lJyxcblx0XHRcdFx0XHRcdGZvcmVncm91bmQ6ICcjRjkyNjcyJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNjb3BlOiAnc3RvcmFnZScsXG5cdFx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdGZvbnRTdHlsZTogJ2l0YWxpYycsXG5cdFx0XHRcdFx0XHRmb3JlZ3JvdW5kOiAnI0Y5MjY3Midcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzY29wZTogWydzdG9yYWdlLnR5cGUnLCAnbWV0YS5zdHJ1Y3R1cmUuZGljdGlvbmFyeS5qc29uIHN0cmluZy5xdW90ZWQuZG91YmxlLmpzb24nXSxcblx0XHRcdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0Zm9yZWdyb3VuZDogJyM2NkQ5RUYnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2NvcGU6ICdlbnRpdHkubmFtZS50eXBlLCBlbnRpdHkubmFtZS5jbGFzcywgZW50aXR5Lm5hbWUubmFtZXNwYWNlLCBlbnRpdHkubmFtZS5zY29wZS1yZXNvbHV0aW9uJyxcblx0XHRcdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0Zm9udFN0eWxlOiAndW5kZXJsaW5lJyxcblx0XHRcdFx0XHRcdGZvcmVncm91bmQ6ICcjQTZFMjJFJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9O1xuXG5cdFx0dGhlbWVEYXRhLnNldEN1c3RvbVRva2VuQ29sb3JzKGN1c3RvbVRva2VuQ29sb3JzKTtcblxuXHRcdGxldCB0b2tlblN0eWxlO1xuXHRcdGNvbnN0IGRlZmF1bHRUb2tlblN0eWxlID0gdW5kZWZpbmVkO1xuXG5cdFx0dG9rZW5TdHlsZSA9IHRoZW1lRGF0YS5yZXNvbHZlU2NvcGVzKFtbJ3ZhcmlhYmxlJ11dKTtcblx0XHRhc3NlcnRUb2tlblN0eWxlKHRva2VuU3R5bGUsIHRzKCcjRjhGOEYyJywgdW5zZXRTdHlsZSksICd2YXJpYWJsZScpO1xuXG5cdFx0dG9rZW5TdHlsZSA9IHRoZW1lRGF0YS5yZXNvbHZlU2NvcGVzKFtbJ2tleXdvcmQub3BlcmF0b3InXV0pO1xuXHRcdGFzc2VydFRva2VuU3R5bGUodG9rZW5TdHlsZSwgdHMoJyNGOTI2NzInLCB7IGl0YWxpYzogdHJ1ZSwgYm9sZDogdHJ1ZSwgdW5kZXJsaW5lOiB0cnVlIH0pLCAna2V5d29yZCcpO1xuXG5cdFx0dG9rZW5TdHlsZSA9IHRoZW1lRGF0YS5yZXNvbHZlU2NvcGVzKFtbJ2tleXdvcmQnXV0pO1xuXHRcdGFzc2VydFRva2VuU3R5bGUodG9rZW5TdHlsZSwgZGVmYXVsdFRva2VuU3R5bGUsICdrZXl3b3JkJyk7XG5cblx0XHR0b2tlblN0eWxlID0gdGhlbWVEYXRhLnJlc29sdmVTY29wZXMoW1sna2V5d29yZC5vcGVyYXRvciddXSk7XG5cdFx0YXNzZXJ0VG9rZW5TdHlsZSh0b2tlblN0eWxlLCB0cygnI0Y5MjY3MicsIHsgaXRhbGljOiB0cnVlLCBib2xkOiB0cnVlLCB1bmRlcmxpbmU6IHRydWUgfSksICdrZXl3b3JkLm9wZXJhdG9yJyk7XG5cblx0XHR0b2tlblN0eWxlID0gdGhlbWVEYXRhLnJlc29sdmVTY29wZXMoW1sna2V5d29yZC5vcGVyYXRvcnMnXV0pO1xuXHRcdGFzc2VydFRva2VuU3R5bGUodG9rZW5TdHlsZSwgZGVmYXVsdFRva2VuU3R5bGUsICdrZXl3b3JkLm9wZXJhdG9ycycpO1xuXG5cdFx0dG9rZW5TdHlsZSA9IHRoZW1lRGF0YS5yZXNvbHZlU2NvcGVzKFtbJ3N0b3JhZ2UnXV0pO1xuXHRcdGFzc2VydFRva2VuU3R5bGUodG9rZW5TdHlsZSwgdHMoJyNGOTI2NzInLCB7IGl0YWxpYzogdHJ1ZSwgYm9sZDogZmFsc2UsIHVuZGVybGluZTogZmFsc2UgfSksICdzdG9yYWdlJyk7XG5cblx0XHR0b2tlblN0eWxlID0gdGhlbWVEYXRhLnJlc29sdmVTY29wZXMoW1snc3RvcmFnZS50eXBlJ11dKTtcblx0XHRhc3NlcnRUb2tlblN0eWxlKHRva2VuU3R5bGUsIHRzKCcjNjZEOUVGJywgeyBpdGFsaWM6IHRydWUsIGJvbGQ6IGZhbHNlLCB1bmRlcmxpbmU6IGZhbHNlIH0pLCAnc3RvcmFnZS50eXBlJyk7XG5cblx0XHR0b2tlblN0eWxlID0gdGhlbWVEYXRhLnJlc29sdmVTY29wZXMoW1snZW50aXR5Lm5hbWUuY2xhc3MnXV0pO1xuXHRcdGFzc2VydFRva2VuU3R5bGUodG9rZW5TdHlsZSwgdHMoJyNBNkUyMkUnLCB7IGl0YWxpYzogZmFsc2UsIGJvbGQ6IGZhbHNlLCB1bmRlcmxpbmU6IHRydWUgfSksICdlbnRpdHkubmFtZS5jbGFzcycpO1xuXG5cdFx0dG9rZW5TdHlsZSA9IHRoZW1lRGF0YS5yZXNvbHZlU2NvcGVzKFtbJ21ldGEuc3RydWN0dXJlLmRpY3Rpb25hcnkuanNvbicsICdzdHJpbmcucXVvdGVkLmRvdWJsZS5qc29uJ11dKTtcblx0XHRhc3NlcnRUb2tlblN0eWxlKHRva2VuU3R5bGUsIHRzKCcjNjZEOUVGJywgdW5kZWZpbmVkKSwgJ2pzb24gcHJvcGVydHknKTtcblxuXHRcdHRva2VuU3R5bGUgPSB0aGVtZURhdGEucmVzb2x2ZVNjb3BlcyhbWydzb3VyY2UuanNvbicsICdtZXRhLnN0cnVjdHVyZS5kaWN0aW9uYXJ5Lmpzb24nLCAnc3RyaW5nLnF1b3RlZC5kb3VibGUuanNvbiddXSk7XG5cdFx0YXNzZXJ0VG9rZW5TdHlsZSh0b2tlblN0eWxlLCB0cygnIzY2RDlFRicsIHVuZGVmaW5lZCksICdqc29uIHByb3BlcnR5Jyk7XG5cblx0XHR0b2tlblN0eWxlID0gdGhlbWVEYXRhLnJlc29sdmVTY29wZXMoW1sna2V5d29yZCddLCBbJ3N0b3JhZ2UudHlwZSddLCBbJ2VudGl0eS5uYW1lLmNsYXNzJ11dKTtcblx0XHRhc3NlcnRUb2tlblN0eWxlKHRva2VuU3R5bGUsIHRzKCcjNjZEOUVGJywgeyBpdGFsaWM6IHRydWUsIGJvbGQ6IGZhbHNlLCB1bmRlcmxpbmU6IGZhbHNlIH0pLCAnc3RvcmFnZS50eXBlJyk7XG5cblx0fSk7XG5cblxuXHR0ZXN0KCdyZXNvbHZlU2NvcGVzIC0gbWF0Y2ggbW9zdCBzcGVjaWZpYycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aGVtZURhdGEgPSBDb2xvclRoZW1lRGF0YS5jcmVhdGVMb2FkZWRFbXB0eVRoZW1lKCd0ZXN0JywgJ3Rlc3QnKTtcblxuXHRcdGNvbnN0IGN1c3RvbVRva2VuQ29sb3JzOiBJVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zID0ge1xuXHRcdFx0dGV4dE1hdGVSdWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2NvcGU6ICdlbnRpdHkubmFtZS50eXBlJyxcblx0XHRcdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0Zm9udFN0eWxlOiAndW5kZXJsaW5lJyxcblx0XHRcdFx0XHRcdGZvcmVncm91bmQ6ICcjQTZFMjJFJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNjb3BlOiAnZW50aXR5Lm5hbWUudHlwZS5jbGFzcycsXG5cdFx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdGZvcmVncm91bmQ6ICcjRkYwMEZGJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNjb3BlOiAnZW50aXR5Lm5hbWUnLFxuXHRcdFx0XHRcdHNldHRpbmdzOiB7XG5cdFx0XHRcdFx0XHRmb3JlZ3JvdW5kOiAnI0ZGRkZGRidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fTtcblxuXHRcdHRoZW1lRGF0YS5zZXRDdXN0b21Ub2tlbkNvbG9ycyhjdXN0b21Ub2tlbkNvbG9ycyk7XG5cblx0XHRjb25zdCB0b2tlblN0eWxlID0gdGhlbWVEYXRhLnJlc29sdmVTY29wZXMoW1snZW50aXR5Lm5hbWUudHlwZS5jbGFzcyddXSk7XG5cdFx0YXNzZXJ0VG9rZW5TdHlsZSh0b2tlblN0eWxlLCB0cygnI0ZGMDBGRicsIHsgaXRhbGljOiBmYWxzZSwgYm9sZDogZmFsc2UsIHVuZGVybGluZTogdHJ1ZSB9KSwgJ2VudGl0eS5uYW1lLnR5cGUuY2xhc3MnKTtcblxuXHR9KTtcblxuXG5cdHRlc3QoJ3J1bGUgbWF0Y2hpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGhlbWVEYXRhID0gQ29sb3JUaGVtZURhdGEuY3JlYXRlTG9hZGVkRW1wdHlUaGVtZSgndGVzdCcsICd0ZXN0Jyk7XG5cdFx0dGhlbWVEYXRhLnNldEN1c3RvbUNvbG9ycyh7ICdlZGl0b3IuZm9yZWdyb3VuZCc6ICcjMDAwMDAwJyB9KTtcblx0XHR0aGVtZURhdGEuc2V0Q3VzdG9tU2VtYW50aWNUb2tlbkNvbG9ycyh7XG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0cnVsZXM6IHtcblx0XHRcdFx0J3R5cGUnOiAnI2ZmMDAwMCcsXG5cdFx0XHRcdCdjbGFzcyc6IHsgZm9yZWdyb3VuZDogJyMwMDAwZmYnLCBpdGFsaWM6IHRydWUgfSxcblx0XHRcdFx0Jyouc3RhdGljJzogeyBib2xkOiB0cnVlIH0sXG5cdFx0XHRcdCcqLmRlY2xhcmF0aW9uJzogeyBpdGFsaWM6IHRydWUgfSxcblx0XHRcdFx0JyouYXN5bmMuc3RhdGljJzogeyBpdGFsaWM6IHRydWUsIHVuZGVybGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnKi5hc3luYyc6IHsgZm9yZWdyb3VuZDogJyMwMDBmZmYnLCB1bmRlcmxpbmU6IHRydWUgfVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0VG9rZW5TdHlsZXModGhlbWVEYXRhLCB7XG5cdFx0XHQndHlwZSc6IHRzKCcjZmYwMDAwJywgdW5kZWZpbmVkU3R5bGUpLFxuXHRcdFx0J3R5cGUuc3RhdGljJzogdHMoJyNmZjAwMDAnLCB7IGJvbGQ6IHRydWUgfSksXG5cdFx0XHQndHlwZS5zdGF0aWMuZGVjbGFyYXRpb24nOiB0cygnI2ZmMDAwMCcsIHsgYm9sZDogdHJ1ZSwgaXRhbGljOiB0cnVlIH0pLFxuXHRcdFx0J2NsYXNzJzogdHMoJyMwMDAwZmYnLCB7IGl0YWxpYzogdHJ1ZSB9KSxcblx0XHRcdCdjbGFzcy5zdGF0aWMuZGVjbGFyYXRpb24nOiB0cygnIzAwMDBmZicsIHsgYm9sZDogdHJ1ZSwgaXRhbGljOiB0cnVlLCB9KSxcblx0XHRcdCdjbGFzcy5kZWNsYXJhdGlvbic6IHRzKCcjMDAwMGZmJywgeyBpdGFsaWM6IHRydWUgfSksXG5cdFx0XHQnY2xhc3MuZGVjbGFyYXRpb24uYXN5bmMnOiB0cygnIzAwMGZmZicsIHsgdW5kZXJsaW5lOiB0cnVlLCBpdGFsaWM6IHRydWUgfSksXG5cdFx0XHQnY2xhc3MuZGVjbGFyYXRpb24uYXN5bmMuc3RhdGljJzogdHMoJyMwMDBmZmYnLCB7IGl0YWxpYzogdHJ1ZSwgdW5kZXJsaW5lOiB0cnVlLCBib2xkOiB0cnVlIH0pLFxuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ3N1cGVyIHR5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBnZXRUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkoKTtcblxuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5UeXBlKCdteVRlc3RJbnRlcmZhY2UnLCAnQSB0eXBlIGp1c3QgZm9yIHRlc3RpbmcnLCAnaW50ZXJmYWNlJyk7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlblR5cGUoJ215VGVzdFN1YkludGVyZmFjZScsICdBIHR5cGUganVzdCBmb3IgdGVzdGluZycsICdteVRlc3RJbnRlcmZhY2UnKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0aGVtZURhdGEgPSBDb2xvclRoZW1lRGF0YS5jcmVhdGVMb2FkZWRFbXB0eVRoZW1lKCd0ZXN0JywgJ3Rlc3QnKTtcblx0XHRcdHRoZW1lRGF0YS5zZXRDdXN0b21Db2xvcnMoeyAnZWRpdG9yLmZvcmVncm91bmQnOiAnIzAwMDAwMCcgfSk7XG5cdFx0XHR0aGVtZURhdGEuc2V0Q3VzdG9tU2VtYW50aWNUb2tlbkNvbG9ycyh7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bGVzOiB7XG5cdFx0XHRcdFx0J2ludGVyZmFjZSc6ICcjZmYwMDAwJyxcblx0XHRcdFx0XHQnbXlUZXN0SW50ZXJmYWNlJzogeyBpdGFsaWM6IHRydWUgfSxcblx0XHRcdFx0XHQnaW50ZXJmYWNlLnN0YXRpYyc6IHsgYm9sZDogdHJ1ZSB9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRUb2tlblN0eWxlcyh0aGVtZURhdGEsIHsgJ215VGVzdFN1YkludGVyZmFjZSc6IHRzKCcjZmYwMDAwJywgeyBpdGFsaWM6IHRydWUgfSkgfSk7XG5cdFx0XHRhc3NlcnRUb2tlblN0eWxlcyh0aGVtZURhdGEsIHsgJ215VGVzdFN1YkludGVyZmFjZS5zdGF0aWMnOiB0cygnI2ZmMDAwMCcsIHsgaXRhbGljOiB0cnVlLCBib2xkOiB0cnVlIH0pIH0pO1xuXG5cdFx0XHR0aGVtZURhdGEuc2V0Q3VzdG9tU2VtYW50aWNUb2tlbkNvbG9ycyh7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bGVzOiB7XG5cdFx0XHRcdFx0J2ludGVyZmFjZSc6ICcjZmYwMDAwJyxcblx0XHRcdFx0XHQnbXlUZXN0SW50ZXJmYWNlJzogeyBmb3JlZ3JvdW5kOiAnI2ZmMDBmZicsIGl0YWxpYzogdHJ1ZSB9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0VG9rZW5TdHlsZXModGhlbWVEYXRhLCB7ICdteVRlc3RTdWJJbnRlcmZhY2UnOiB0cygnI2ZmMDBmZicsIHsgaXRhbGljOiB0cnVlIH0pIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWdpc3RyeS5kZXJlZ2lzdGVyVG9rZW5UeXBlKCdteVRlc3RJbnRlcmZhY2UnKTtcblx0XHRcdHJlZ2lzdHJ5LmRlcmVnaXN0ZXJUb2tlblR5cGUoJ215VGVzdFN1YkludGVyZmFjZScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbGFuZ3VhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRoZW1lRGF0YSA9IENvbG9yVGhlbWVEYXRhLmNyZWF0ZUxvYWRlZEVtcHR5VGhlbWUoJ3Rlc3QnLCAndGVzdCcpO1xuXHRcdFx0dGhlbWVEYXRhLnNldEN1c3RvbUNvbG9ycyh7ICdlZGl0b3IuZm9yZWdyb3VuZCc6ICcjMDAwMDAwJyB9KTtcblx0XHRcdHRoZW1lRGF0YS5zZXRDdXN0b21TZW1hbnRpY1Rva2VuQ29sb3JzKHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVsZXM6IHtcblx0XHRcdFx0XHQnaW50ZXJmYWNlJzogJyNmZmYwMDAnLFxuXHRcdFx0XHRcdCdpbnRlcmZhY2U6amF2YSc6ICcjZmYwMDAwJyxcblx0XHRcdFx0XHQnaW50ZXJmYWNlLnN0YXRpYyc6IHsgYm9sZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdCdpbnRlcmZhY2Uuc3RhdGljOnR5cGVzY3JpcHQnOiB7IGl0YWxpYzogdHJ1ZSB9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRUb2tlblN0eWxlcyh0aGVtZURhdGEsIHsgJ2ludGVyZmFjZSc6IHRzKCcjZmYwMDAwJywgdW5kZWZpbmVkKSB9LCAnamF2YScpO1xuXHRcdFx0YXNzZXJ0VG9rZW5TdHlsZXModGhlbWVEYXRhLCB7ICdpbnRlcmZhY2UnOiB0cygnI2ZmZjAwMCcsIHVuZGVmaW5lZCkgfSwgJ3R5cGVzY3JpcHQnKTtcblx0XHRcdGFzc2VydFRva2VuU3R5bGVzKHRoZW1lRGF0YSwgeyAnaW50ZXJmYWNlLnN0YXRpYyc6IHRzKCcjZmYwMDAwJywgeyBib2xkOiB0cnVlIH0pIH0sICdqYXZhJyk7XG5cdFx0XHRhc3NlcnRUb2tlblN0eWxlcyh0aGVtZURhdGEsIHsgJ2ludGVyZmFjZS5zdGF0aWMnOiB0cygnI2ZmZjAwMCcsIHsgYm9sZDogdHJ1ZSwgaXRhbGljOiB0cnVlIH0pIH0sICd0eXBlc2NyaXB0Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2xhbmd1YWdlIC0gc2NvcGUgcmVzb2x2aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gZ2V0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KCk7XG5cblx0XHRjb25zdCBudW1iZXJPZkRlZmF1bHRSdWxlcyA9IHJlZ2lzdHJ5LmdldFRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcygpLmxlbmd0aDtcblxuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQocmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKCd0eXBlJywgJ3R5cGVzY3JpcHQxJyksIHsgc2NvcGVzVG9Qcm9iZTogW1snZW50aXR5Lm5hbWUudHlwZS50czEnXV0gfSk7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChyZWdpc3RyeS5wYXJzZVRva2VuU2VsZWN0b3IoJ3R5cGU6amF2YXNjcmlwdDEnKSwgeyBzY29wZXNUb1Byb2JlOiBbWydlbnRpdHkubmFtZS50eXBlLmpzMSddXSB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0aGVtZURhdGEgPSBDb2xvclRoZW1lRGF0YS5jcmVhdGVMb2FkZWRFbXB0eVRoZW1lKCd0ZXN0JywgJ3Rlc3QnKTtcblx0XHRcdHRoZW1lRGF0YS5zZXRDdXN0b21Db2xvcnMoeyAnZWRpdG9yLmZvcmVncm91bmQnOiAnIzAwMDAwMCcgfSk7XG5cdFx0XHR0aGVtZURhdGEuc2V0Q3VzdG9tVG9rZW5Db2xvcnMoe1xuXHRcdFx0XHR0ZXh0TWF0ZVJ1bGVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2NvcGU6ICdlbnRpdHkubmFtZS50eXBlJyxcblx0XHRcdFx0XHRcdHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjYWEwMDAwJyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzY29wZTogJ2VudGl0eS5uYW1lLnR5cGUudHMxJyxcblx0XHRcdFx0XHRcdHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjYmIwMDAwJyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0VG9rZW5TdHlsZXModGhlbWVEYXRhLCB7ICd0eXBlJzogdHMoJyNhYTAwMDAnLCB1bmRlZmluZWQpIH0sICdqYXZhc2NyaXB0MScpO1xuXHRcdFx0YXNzZXJ0VG9rZW5TdHlsZXModGhlbWVEYXRhLCB7ICd0eXBlJzogdHMoJyNiYjAwMDAnLCB1bmRlZmluZWQpIH0sICd0eXBlc2NyaXB0MScpO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZ2lzdHJ5LmRlcmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChyZWdpc3RyeS5wYXJzZVRva2VuU2VsZWN0b3IoJ3R5cGUnLCAndHlwZXNjcmlwdDEnKSk7XG5cdFx0XHRyZWdpc3RyeS5kZXJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQocmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKCd0eXBlOmphdmFzY3JpcHQxJykpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0VG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzKCkubGVuZ3RoLCBudW1iZXJPZkRlZmF1bHRSdWxlcyk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxZQUFZO0FBRW5CLFNBQVMsWUFBWSxzQ0FBc0M7QUFDM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsWUFBWSxlQUFlO0FBQ3BDLFNBQVMsc0NBQXNDO0FBRS9DLFNBQVMsTUFBTSwwQkFBMEI7QUFLekMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1Q0FBdUM7QUFFaEQsTUFBTSxpQkFBaUIsRUFBRSxNQUFNLFFBQVcsV0FBVyxRQUFXLFFBQVEsT0FBVTtBQUNsRixNQUFNLGFBQWEsRUFBRSxNQUFNLE9BQU8sV0FBVyxPQUFPLFFBQVEsTUFBTTtBQUVsRSxTQUFTLEdBQUcsWUFBZ0MsWUFBd0g7QUFDbkssUUFBTSxrQkFBa0IsU0FBUyxVQUFVLElBQUksTUFBTSxRQUFRLFVBQVUsSUFBSTtBQUMzRSxTQUFPLElBQUksV0FBVyxpQkFBaUIsWUFBWSxNQUFNLFlBQVksV0FBVyxZQUFZLGVBQWUsWUFBWSxNQUFNO0FBQzlIO0FBRUEsU0FBUyxtQkFBbUJBLEtBQW1DO0FBQzlELE1BQUksQ0FBQ0EsS0FBSTtBQUNSLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxNQUFNQSxJQUFHLGFBQWFBLElBQUcsV0FBVyxTQUFTLElBQUk7QUFDckQsTUFBSUEsSUFBRyxTQUFTLFFBQVc7QUFDMUIsV0FBT0EsSUFBRyxPQUFPLE9BQU87QUFBQSxFQUN6QjtBQUNBLE1BQUlBLElBQUcsY0FBYyxRQUFXO0FBQy9CLFdBQU9BLElBQUcsWUFBWSxPQUFPO0FBQUEsRUFDOUI7QUFDQSxNQUFJQSxJQUFHLFdBQVcsUUFBVztBQUM1QixXQUFPQSxJQUFHLFNBQVMsT0FBTztBQUFBLEVBQzNCO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxpQkFBaUIsUUFBdUMsVUFBeUMsU0FBa0I7QUFDM0gsU0FBTyxZQUFZLG1CQUFtQixNQUFNLEdBQUcsbUJBQW1CLFFBQVEsR0FBRyxPQUFPO0FBQ3JGO0FBRUEsU0FBUyx5QkFBeUIsWUFBc0IsUUFBaUMsVUFBeUMsVUFBVSxJQUFJO0FBQy9JLE1BQUksYUFBYSxVQUFhLGFBQWEsUUFBUSxXQUFXLFFBQVc7QUFDeEUsV0FBTyxZQUFZLFFBQVEsVUFBVSxPQUFPO0FBQzVDO0FBQUEsRUFDRDtBQUNBLFNBQU8sWUFBWSxPQUFPLE1BQU0sU0FBUyxNQUFNLFVBQVUsT0FBTztBQUNoRSxTQUFPLFlBQVksT0FBTyxRQUFRLFNBQVMsUUFBUSxZQUFZLE9BQU87QUFDdEUsU0FBTyxZQUFZLE9BQU8sV0FBVyxTQUFTLFdBQVcsZUFBZSxPQUFPO0FBRS9FLFFBQU0sd0JBQXdCLE9BQU87QUFDckMsTUFBSSx5QkFBeUIsU0FBUyxZQUFZO0FBQ2pELFdBQU8sWUFBWSxXQUFXLHFCQUFxQixHQUFHLE1BQU0sT0FBTyxJQUFJLFdBQVcsU0FBUyxZQUFZLElBQUksRUFBRSxZQUFZLEdBQUcsZ0JBQWdCLE9BQU87QUFBQSxFQUNwSixPQUFPO0FBQ04sV0FBTyxZQUFZLHVCQUF1QixTQUFTLGNBQWMsR0FBRyxnQkFBZ0IsT0FBTztBQUFBLEVBQzVGO0FBQ0Q7QUFHQSxTQUFTLGtCQUFrQixXQUEyQixVQUF5RCxXQUFXLGNBQWM7QUFDdkksUUFBTSxhQUFhLFVBQVU7QUFFN0IsYUFBVyx1QkFBdUIsVUFBVTtBQUMzQyxVQUFNLENBQUMsTUFBTSxHQUFHLFNBQVMsSUFBSSxvQkFBb0IsTUFBTSxHQUFHO0FBRTFELFVBQU0scUJBQXFCLFNBQVMsbUJBQW1CO0FBRXZELFVBQU0scUJBQXFCLFVBQVUsc0JBQXNCLE1BQU0sV0FBVyxRQUFRO0FBQ3BGLDZCQUF5QixZQUFZLG9CQUFvQixvQkFBb0IsbUJBQW1CO0FBQUEsRUFDakc7QUFDRDtBQUVBLE1BQU0sZ0NBQWdDLE1BQU07QUFDM0MsUUFBTSxjQUFjLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQztBQUN4RCxRQUFNLGlCQUFpQixLQUFLLEtBQXNCLEdBQUc7QUFDckQsUUFBTSxpQkFBaUIsS0FBSyxLQUFzQixHQUFHO0FBQ3JELFFBQU0scUJBQXFCLEtBQUssS0FBMEIsR0FBRztBQUM3RCxRQUFNLHVCQUF1QixLQUFLLEtBQTRCLEdBQUc7QUFFakUsUUFBTSxpQ0FBaUMsSUFBSSwrQkFBK0IsYUFBYSxnQkFBZ0Isb0JBQW9CLG9CQUFvQixzQkFBc0IsSUFBSSxnQ0FBZ0Msa0JBQWtCLEdBQUcsZ0JBQWdCLElBQUksZUFBZSxDQUFDO0FBRWxRLFFBQU0seUJBQXlCLElBQUksdUJBQXVCLElBQUksZUFBZSxDQUFDO0FBQzlFLGNBQVksaUJBQWlCLFFBQVEsTUFBTSxzQkFBc0I7QUFFakUsV0FBUyxNQUFNO0FBQ2QsMkJBQXVCLFFBQVE7QUFBQSxFQUNoQyxDQUFDO0FBRUQsMENBQXdDO0FBRXhDLE9BQUssa0JBQWtCLFlBQVk7QUFDbEMsVUFBTSxZQUFZLGVBQWUsb0JBQW9CLEtBQUs7QUFDMUQsY0FBVSxXQUFXLFdBQVcsVUFBVSx5REFBeUQ7QUFDbkcsVUFBTSxVQUFVLGFBQWEsOEJBQThCO0FBRTNELFdBQU8sWUFBWSxVQUFVLFVBQVUsSUFBSTtBQUUzQyxzQkFBa0IsV0FBVztBQUFBLE1BQzVCLFdBQVcsR0FBRyxXQUFXLGNBQWM7QUFBQSxNQUN2QyxZQUFZLEdBQUcsV0FBVyxVQUFVO0FBQUEsTUFDcEMsUUFBUSxHQUFHLFdBQVcsRUFBRSxNQUFNLE9BQU8sV0FBVyxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDckUsWUFBWSxHQUFHLFdBQVcsVUFBVTtBQUFBLE1BQ3BDLFVBQVUsR0FBRyxXQUFXLGNBQWM7QUFBQSxNQUN0QyxVQUFVLEdBQUcsV0FBVyxjQUFjO0FBQUEsTUFDdEMsV0FBVyxHQUFHLFdBQVcsY0FBYztBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlCQUFpQixZQUFZO0FBQ2pDLFVBQU0sWUFBWSxlQUFlLHVCQUF1QixRQUFRLE1BQU07QUFFdEUsVUFBTSxvQkFBK0M7QUFBQSxNQUNwRCxlQUFlO0FBQUEsUUFDZDtBQUFBLFVBQ0MsT0FBTztBQUFBLFVBQ1AsVUFBVTtBQUFBLFlBQ1QsV0FBVztBQUFBLFlBQ1gsWUFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsT0FBTztBQUFBLFVBQ1AsVUFBVTtBQUFBLFlBQ1QsV0FBVztBQUFBLFlBQ1gsWUFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsT0FBTztBQUFBLFVBQ1AsVUFBVTtBQUFBLFlBQ1QsV0FBVztBQUFBLFlBQ1gsWUFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsT0FBTyxDQUFDLGdCQUFnQiwwREFBMEQ7QUFBQSxVQUNsRixVQUFVO0FBQUEsWUFDVCxZQUFZO0FBQUEsVUFDYjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxPQUFPO0FBQUEsVUFDUCxVQUFVO0FBQUEsWUFDVCxXQUFXO0FBQUEsWUFDWCxZQUFZO0FBQUEsVUFDYjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGNBQVUscUJBQXFCLGlCQUFpQjtBQUVoRCxRQUFJO0FBQ0osVUFBTSxvQkFBb0I7QUFFMUIsaUJBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNuRCxxQkFBaUIsWUFBWSxHQUFHLFdBQVcsVUFBVSxHQUFHLFVBQVU7QUFFbEUsaUJBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQzNELHFCQUFpQixZQUFZLEdBQUcsV0FBVyxFQUFFLFFBQVEsTUFBTSxNQUFNLE1BQU0sV0FBVyxLQUFLLENBQUMsR0FBRyxTQUFTO0FBRXBHLGlCQUFhLFVBQVUsY0FBYyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDbEQscUJBQWlCLFlBQVksbUJBQW1CLFNBQVM7QUFFekQsaUJBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQzNELHFCQUFpQixZQUFZLEdBQUcsV0FBVyxFQUFFLFFBQVEsTUFBTSxNQUFNLE1BQU0sV0FBVyxLQUFLLENBQUMsR0FBRyxrQkFBa0I7QUFFN0csaUJBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQzVELHFCQUFpQixZQUFZLG1CQUFtQixtQkFBbUI7QUFFbkUsaUJBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNsRCxxQkFBaUIsWUFBWSxHQUFHLFdBQVcsRUFBRSxRQUFRLE1BQU0sTUFBTSxPQUFPLFdBQVcsTUFBTSxDQUFDLEdBQUcsU0FBUztBQUV0RyxpQkFBYSxVQUFVLGNBQWMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQ3ZELHFCQUFpQixZQUFZLEdBQUcsV0FBVyxFQUFFLFFBQVEsTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNLENBQUMsR0FBRyxjQUFjO0FBRTNHLGlCQUFhLFVBQVUsY0FBYyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUM1RCxxQkFBaUIsWUFBWSxHQUFHLFdBQVcsRUFBRSxRQUFRLE9BQU8sTUFBTSxPQUFPLFdBQVcsS0FBSyxDQUFDLEdBQUcsbUJBQW1CO0FBRWhILGlCQUFhLFVBQVUsY0FBYyxDQUFDLENBQUMsa0NBQWtDLDJCQUEyQixDQUFDLENBQUM7QUFDdEcscUJBQWlCLFlBQVksR0FBRyxXQUFXLE1BQVMsR0FBRyxlQUFlO0FBRXRFLGlCQUFhLFVBQVUsY0FBYyxDQUFDLENBQUMsZUFBZSxrQ0FBa0MsMkJBQTJCLENBQUMsQ0FBQztBQUNySCxxQkFBaUIsWUFBWSxHQUFHLFdBQVcsTUFBUyxHQUFHLGVBQWU7QUFFdEUsaUJBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQzNGLHFCQUFpQixZQUFZLEdBQUcsV0FBVyxFQUFFLFFBQVEsTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNLENBQUMsR0FBRyxjQUFjO0FBQUEsRUFFNUcsQ0FBQztBQUdELE9BQUssdUNBQXVDLFlBQVk7QUFDdkQsVUFBTSxZQUFZLGVBQWUsdUJBQXVCLFFBQVEsTUFBTTtBQUV0RSxVQUFNLG9CQUErQztBQUFBLE1BQ3BELGVBQWU7QUFBQSxRQUNkO0FBQUEsVUFDQyxPQUFPO0FBQUEsVUFDUCxVQUFVO0FBQUEsWUFDVCxXQUFXO0FBQUEsWUFDWCxZQUFZO0FBQUEsVUFDYjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxPQUFPO0FBQUEsVUFDUCxVQUFVO0FBQUEsWUFDVCxZQUFZO0FBQUEsVUFDYjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxPQUFPO0FBQUEsVUFDUCxVQUFVO0FBQUEsWUFDVCxZQUFZO0FBQUEsVUFDYjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGNBQVUscUJBQXFCLGlCQUFpQjtBQUVoRCxVQUFNLGFBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3ZFLHFCQUFpQixZQUFZLEdBQUcsV0FBVyxFQUFFLFFBQVEsT0FBTyxNQUFNLE9BQU8sV0FBVyxLQUFLLENBQUMsR0FBRyx3QkFBd0I7QUFBQSxFQUV0SCxDQUFDO0FBR0QsT0FBSyxpQkFBaUIsWUFBWTtBQUNqQyxVQUFNLFlBQVksZUFBZSx1QkFBdUIsUUFBUSxNQUFNO0FBQ3RFLGNBQVUsZ0JBQWdCLEVBQUUscUJBQXFCLFVBQVUsQ0FBQztBQUM1RCxjQUFVLDZCQUE2QjtBQUFBLE1BQ3RDLFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLFNBQVMsRUFBRSxZQUFZLFdBQVcsUUFBUSxLQUFLO0FBQUEsUUFDL0MsWUFBWSxFQUFFLE1BQU0sS0FBSztBQUFBLFFBQ3pCLGlCQUFpQixFQUFFLFFBQVEsS0FBSztBQUFBLFFBQ2hDLGtCQUFrQixFQUFFLFFBQVEsTUFBTSxXQUFXLEtBQUs7QUFBQSxRQUNsRCxXQUFXLEVBQUUsWUFBWSxXQUFXLFdBQVcsS0FBSztBQUFBLE1BQ3JEO0FBQUEsSUFDRCxDQUFDO0FBRUQsc0JBQWtCLFdBQVc7QUFBQSxNQUM1QixRQUFRLEdBQUcsV0FBVyxjQUFjO0FBQUEsTUFDcEMsZUFBZSxHQUFHLFdBQVcsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzNDLDJCQUEyQixHQUFHLFdBQVcsRUFBRSxNQUFNLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFBQSxNQUNyRSxTQUFTLEdBQUcsV0FBVyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsTUFDdkMsNEJBQTRCLEdBQUcsV0FBVyxFQUFFLE1BQU0sTUFBTSxRQUFRLEtBQU0sQ0FBQztBQUFBLE1BQ3ZFLHFCQUFxQixHQUFHLFdBQVcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLE1BQ25ELDJCQUEyQixHQUFHLFdBQVcsRUFBRSxXQUFXLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFBQSxNQUMxRSxrQ0FBa0MsR0FBRyxXQUFXLEVBQUUsUUFBUSxNQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUssQ0FBQztBQUFBLElBQzlGLENBQUM7QUFBQSxFQUVGLENBQUM7QUFFRCxPQUFLLGNBQWMsWUFBWTtBQUM5QixVQUFNLFdBQVcsK0JBQStCO0FBRWhELGFBQVMsa0JBQWtCLG1CQUFtQiwyQkFBMkIsV0FBVztBQUNwRixhQUFTLGtCQUFrQixzQkFBc0IsMkJBQTJCLGlCQUFpQjtBQUU3RixRQUFJO0FBQ0gsWUFBTSxZQUFZLGVBQWUsdUJBQXVCLFFBQVEsTUFBTTtBQUN0RSxnQkFBVSxnQkFBZ0IsRUFBRSxxQkFBcUIsVUFBVSxDQUFDO0FBQzVELGdCQUFVLDZCQUE2QjtBQUFBLFFBQ3RDLFNBQVM7QUFBQSxRQUNULE9BQU87QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLG1CQUFtQixFQUFFLFFBQVEsS0FBSztBQUFBLFVBQ2xDLG9CQUFvQixFQUFFLE1BQU0sS0FBSztBQUFBLFFBQ2xDO0FBQUEsTUFDRCxDQUFDO0FBRUQsd0JBQWtCLFdBQVcsRUFBRSxzQkFBc0IsR0FBRyxXQUFXLEVBQUUsUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ3RGLHdCQUFrQixXQUFXLEVBQUUsNkJBQTZCLEdBQUcsV0FBVyxFQUFFLFFBQVEsTUFBTSxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFFekcsZ0JBQVUsNkJBQTZCO0FBQUEsUUFDdEMsU0FBUztBQUFBLFFBQ1QsT0FBTztBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsbUJBQW1CLEVBQUUsWUFBWSxXQUFXLFFBQVEsS0FBSztBQUFBLFFBQzFEO0FBQUEsTUFDRCxDQUFDO0FBQ0Qsd0JBQWtCLFdBQVcsRUFBRSxzQkFBc0IsR0FBRyxXQUFXLEVBQUUsUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDdkYsVUFBRTtBQUNELGVBQVMsb0JBQW9CLGlCQUFpQjtBQUM5QyxlQUFTLG9CQUFvQixvQkFBb0I7QUFBQSxJQUNsRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssWUFBWSxZQUFZO0FBQzVCLFFBQUk7QUFDSCxZQUFNLFlBQVksZUFBZSx1QkFBdUIsUUFBUSxNQUFNO0FBQ3RFLGdCQUFVLGdCQUFnQixFQUFFLHFCQUFxQixVQUFVLENBQUM7QUFDNUQsZ0JBQVUsNkJBQTZCO0FBQUEsUUFDdEMsU0FBUztBQUFBLFFBQ1QsT0FBTztBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2Isa0JBQWtCO0FBQUEsVUFDbEIsb0JBQW9CLEVBQUUsTUFBTSxLQUFLO0FBQUEsVUFDakMsK0JBQStCLEVBQUUsUUFBUSxLQUFLO0FBQUEsUUFDL0M7QUFBQSxNQUNELENBQUM7QUFFRCx3QkFBa0IsV0FBVyxFQUFFLGFBQWEsR0FBRyxXQUFXLE1BQVMsRUFBRSxHQUFHLE1BQU07QUFDOUUsd0JBQWtCLFdBQVcsRUFBRSxhQUFhLEdBQUcsV0FBVyxNQUFTLEVBQUUsR0FBRyxZQUFZO0FBQ3BGLHdCQUFrQixXQUFXLEVBQUUsb0JBQW9CLEdBQUcsV0FBVyxFQUFFLE1BQU0sS0FBSyxDQUFDLEVBQUUsR0FBRyxNQUFNO0FBQzFGLHdCQUFrQixXQUFXLEVBQUUsb0JBQW9CLEdBQUcsV0FBVyxFQUFFLE1BQU0sTUFBTSxRQUFRLEtBQUssQ0FBQyxFQUFFLEdBQUcsWUFBWTtBQUFBLElBQy9HLFVBQUU7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxVQUFNLFdBQVcsK0JBQStCO0FBRWhELFVBQU0sdUJBQXVCLFNBQVMsNEJBQTRCLEVBQUU7QUFFcEUsYUFBUywwQkFBMEIsU0FBUyxtQkFBbUIsUUFBUSxhQUFhLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7QUFDcEksYUFBUywwQkFBMEIsU0FBUyxtQkFBbUIsa0JBQWtCLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7QUFFakksUUFBSTtBQUNILFlBQU0sWUFBWSxlQUFlLHVCQUF1QixRQUFRLE1BQU07QUFDdEUsZ0JBQVUsZ0JBQWdCLEVBQUUscUJBQXFCLFVBQVUsQ0FBQztBQUM1RCxnQkFBVSxxQkFBcUI7QUFBQSxRQUM5QixlQUFlO0FBQUEsVUFDZDtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsVUFBVSxFQUFFLFlBQVksVUFBVTtBQUFBLFVBQ25DO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsVUFBVSxFQUFFLFlBQVksVUFBVTtBQUFBLFVBQ25DO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELHdCQUFrQixXQUFXLEVBQUUsUUFBUSxHQUFHLFdBQVcsTUFBUyxFQUFFLEdBQUcsYUFBYTtBQUNoRix3QkFBa0IsV0FBVyxFQUFFLFFBQVEsR0FBRyxXQUFXLE1BQVMsRUFBRSxHQUFHLGFBQWE7QUFBQSxJQUVqRixVQUFFO0FBQ0QsZUFBUyw0QkFBNEIsU0FBUyxtQkFBbUIsUUFBUSxhQUFhLENBQUM7QUFDdkYsZUFBUyw0QkFBNEIsU0FBUyxtQkFBbUIsa0JBQWtCLENBQUM7QUFFcEYsYUFBTyxZQUFZLFNBQVMsNEJBQTRCLEVBQUUsUUFBUSxvQkFBb0I7QUFBQSxJQUN2RjtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInRzIl0KfQo=
