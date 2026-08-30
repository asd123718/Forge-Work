import * as fs from "fs";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { Extensions, asCssVariableName } from "../../../../../platform/theme/common/colorRegistry.js";
import { Extensions as SizeExtensions, asCssVariableName as asSizeCssVariableName } from "../../../../../platform/theme/common/sizeUtils.js";
import { asTextOrError } from "../../../../../platform/request/common/request.js";
import * as pfs from "../../../../../base/node/pfs.js";
import * as path from "../../../../../base/common/path.js";
import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { RequestService } from "../../../../../platform/request/node/requestService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import "../../../../workbench.desktop.main.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { FileAccess } from "../../../../../base/common/network.js";
const experimental = [];
const knwonVariablesFileName = "vscode-known-variables.json";
suite("Color Registry", function() {
  test(`update colors in ${knwonVariablesFileName}`, async function() {
    const varFilePath = FileAccess.asFileUri(`vs/../../build/lib/stylelint/${knwonVariablesFileName}`).fsPath;
    const content = (await fs.promises.readFile(varFilePath)).toString();
    const variablesInfo = JSON.parse(content);
    const colorsArray = variablesInfo.colors;
    assert.ok(colorsArray && colorsArray.length > 0, "${knwonVariablesFileName} contains no color descriptions");
    const colors = new Set(colorsArray);
    const updatedColors = [];
    const missing = [];
    const themingRegistry = Registry.as(Extensions.ColorContribution);
    for (const color of themingRegistry.getColors()) {
      const id = asCssVariableName(color.id);
      if (!colors.has(id)) {
        if (!color.deprecationMessage) {
          missing.push(id);
        }
      } else {
        colors.delete(id);
      }
      updatedColors.push(id);
    }
    const superfluousKeys = [...colors.keys()];
    let errorText = "";
    if (missing.length > 0) {
      errorText += `
Adding the following colors:

${JSON.stringify(missing, void 0, "	")}
`;
    }
    if (superfluousKeys.length > 0) {
      errorText += `
Removing the following colors:

${superfluousKeys.join("\n")}
`;
    }
    const sizesArray = variablesInfo.sizes || [];
    const sizes = new Set(sizesArray);
    const updatedSizes = [];
    const missingSizes = [];
    const sizeRegistry = Registry.as(SizeExtensions.SizeContribution);
    for (const size of sizeRegistry.getSizes()) {
      const id = asSizeCssVariableName(size.id);
      if (!sizes.has(id)) {
        if (!size.deprecationMessage) {
          missingSizes.push(id);
        }
      } else {
        sizes.delete(id);
      }
      updatedSizes.push(id);
    }
    const superfluousSizes = [...sizes.keys()];
    if (missingSizes.length > 0) {
      errorText += `
Adding the following sizes:

${JSON.stringify(missingSizes, void 0, "	")}
`;
    }
    if (superfluousSizes.length > 0) {
      errorText += `
Removing the following sizes:

${superfluousSizes.join("\n")}
`;
    }
    if (errorText.length > 0) {
      updatedColors.sort();
      variablesInfo.colors = updatedColors;
      updatedSizes.sort();
      variablesInfo.sizes = updatedSizes;
      await pfs.Promises.writeFile(varFilePath, JSON.stringify(variablesInfo, void 0, "	"));
      assert.fail(`
Updating ${path.normalize(varFilePath)}.
Please verify and commit.

${errorText}
`);
    }
  });
  test("all colors listed in theme-color.md", async function() {
    const environmentService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.args = { _: [] };
      }
    }();
    const docUrl = "https://raw.githubusercontent.com/microsoft/vscode-docs/vnext/api/references/theme-color.md";
    const reqContext = await new RequestService("local", new TestConfigurationService(), environmentService, new NullLogService()).request({ url: docUrl, callSite: "colorRegistry.releaseTest" }, CancellationToken.None);
    const content = await asTextOrError(reqContext);
    const expression = /-\s*\`([\w\.]+)\`: (.*)/g;
    let m;
    const colorsInDoc = /* @__PURE__ */ Object.create(null);
    let nColorsInDoc = 0;
    while (m = expression.exec(content)) {
      colorsInDoc[m[1]] = { description: m[2], offset: m.index, length: m.length };
      nColorsInDoc++;
    }
    assert.ok(nColorsInDoc > 0, "theme-color.md contains to color descriptions");
    const missing = /* @__PURE__ */ Object.create(null);
    const descriptionDiffs = /* @__PURE__ */ Object.create(null);
    const themingRegistry = Registry.as(Extensions.ColorContribution);
    for (const color of themingRegistry.getColors()) {
      if (!colorsInDoc[color.id]) {
        if (!color.deprecationMessage) {
          missing[color.id] = getDescription(color);
        }
      } else {
        const docDescription = colorsInDoc[color.id].description;
        const specDescription = getDescription(color);
        if (docDescription !== specDescription) {
          descriptionDiffs[color.id] = { docDescription, specDescription };
        }
        delete colorsInDoc[color.id];
      }
    }
    const colorsInExtensions = await getColorsFromExtension();
    for (const colorId in colorsInExtensions) {
      if (!colorsInDoc[colorId]) {
        missing[colorId] = colorsInExtensions[colorId];
      } else {
        delete colorsInDoc[colorId];
      }
    }
    for (const colorId of experimental) {
      if (missing[colorId]) {
        delete missing[colorId];
      }
      if (colorsInDoc[colorId]) {
        assert.fail(`Color ${colorId} found in doc but marked experimental. Please remove from experimental list.`);
      }
    }
    const superfluousKeys = Object.keys(colorsInDoc);
    const undocumentedKeys = Object.keys(missing).map((k) => `\`${k}\`: ${missing[k]}`);
    let errorText = "";
    if (undocumentedKeys.length > 0) {
      errorText += `

Add the following colors:

${undocumentedKeys.join("\n")}
`;
    }
    if (superfluousKeys.length > 0) {
      errorText += `
Remove the following colors:

${superfluousKeys.join("\n")}
`;
    }
    if (errorText.length > 0) {
      assert.fail(`

Open https://github.dev/microsoft/vscode-docs/blob/vnext/api/references/theme-color.md#50${errorText}`);
    }
  });
});
function getDescription(color) {
  let specDescription = color.description;
  if (color.deprecationMessage) {
    specDescription = specDescription + " " + color.deprecationMessage;
  }
  return specDescription;
}
async function getColorsFromExtension() {
  const extPath = FileAccess.asFileUri("vs/../../extensions").fsPath;
  const extFolders = await pfs.Promises.readDirsInDir(extPath);
  const result = /* @__PURE__ */ Object.create(null);
  for (const folder of extFolders) {
    try {
      const packageJSON = JSON.parse((await fs.promises.readFile(path.join(extPath, folder, "package.json"))).toString());
      const contributes = packageJSON["contributes"];
      if (contributes) {
        const colors = contributes["colors"];
        if (colors) {
          for (const color of colors) {
            const colorId = color["id"];
            if (colorId) {
              result[colorId] = colorId["description"];
            }
          }
        }
      }
    } catch (e) {
    }
  }
  return result;
}
export {
  experimental
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRoZW1lc1xcdGVzdFxcbm9kZVxcY29sb3JSZWdpc3RyeS5yZWxlYXNlVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb2xvclJlZ2lzdHJ5LCBFeHRlbnNpb25zLCBDb2xvckNvbnRyaWJ1dGlvbiwgYXNDc3NWYXJpYWJsZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU2l6ZVJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFNpemVFeHRlbnNpb25zLCBhc0Nzc1ZhcmlhYmxlTmFtZSBhcyBhc1NpemVDc3NWYXJpYWJsZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vc2l6ZVV0aWxzLmpzJztcbmltcG9ydCB7IGFzVGV4dE9yRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCAqIGFzIHBmcyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3Qvbm9kZS9yZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCAnLi4vLi4vLi4vLi4vd29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cbmludGVyZmFjZSBDb2xvckluZm8ge1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRvZmZzZXQ6IG51bWJlcjtcblx0bGVuZ3RoOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBEZXNjcmlwdGlvbkRpZmYge1xuXHRkb2NEZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRzcGVjRGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGV4cGVyaW1lbnRhbDogc3RyaW5nW10gPSBbXTsgLy8gJ3NldHRpbmdzLm1vZGlmaWVkSXRlbUZvcmVncm91bmQnLCAnZWRpdG9yVW5uZWNlc3NhcnkuZm9yZWdyb3VuZCcgXTtcblxuXG5jb25zdCBrbndvblZhcmlhYmxlc0ZpbGVOYW1lID0gJ3ZzY29kZS1rbm93bi12YXJpYWJsZXMuanNvbic7XG5cbnN1aXRlKCdDb2xvciBSZWdpc3RyeScsIGZ1bmN0aW9uICgpIHtcblxuXHR0ZXN0KGB1cGRhdGUgY29sb3JzIGluICR7a253b25WYXJpYWJsZXNGaWxlTmFtZX1gLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmFyRmlsZVBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaShgdnMvLi4vLi4vYnVpbGQvbGliL3N0eWxlbGludC8ke2tud29uVmFyaWFibGVzRmlsZU5hbWV9YCkuZnNQYXRoO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUodmFyRmlsZVBhdGgpKS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgdmFyaWFibGVzSW5mbyA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cblx0XHRjb25zdCBjb2xvcnNBcnJheSA9IHZhcmlhYmxlc0luZm8uY29sb3JzIGFzIHN0cmluZ1tdO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbG9yc0FycmF5ICYmIGNvbG9yc0FycmF5Lmxlbmd0aCA+IDAsICcke2tud29uVmFyaWFibGVzRmlsZU5hbWV9IGNvbnRhaW5zIG5vIGNvbG9yIGRlc2NyaXB0aW9ucycpO1xuXG5cdFx0Y29uc3QgY29sb3JzID0gbmV3IFNldChjb2xvcnNBcnJheSk7XG5cblx0XHRjb25zdCB1cGRhdGVkQ29sb3JzID0gW107XG5cdFx0Y29uc3QgbWlzc2luZyA9IFtdO1xuXHRcdGNvbnN0IHRoZW1pbmdSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb2xvclJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbG9yQ29udHJpYnV0aW9uKTtcblx0XHRmb3IgKGNvbnN0IGNvbG9yIG9mIHRoZW1pbmdSZWdpc3RyeS5nZXRDb2xvcnMoKSkge1xuXHRcdFx0Y29uc3QgaWQgPSBhc0Nzc1ZhcmlhYmxlTmFtZShjb2xvci5pZCk7XG5cblx0XHRcdGlmICghY29sb3JzLmhhcyhpZCkpIHtcblx0XHRcdFx0aWYgKCFjb2xvci5kZXByZWNhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0XHRtaXNzaW5nLnB1c2goaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb2xvcnMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZWRDb2xvcnMucHVzaChpZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VwZXJmbHVvdXNLZXlzID0gWy4uLmNvbG9ycy5rZXlzKCldO1xuXG5cdFx0bGV0IGVycm9yVGV4dCA9ICcnO1xuXHRcdGlmIChtaXNzaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdGVycm9yVGV4dCArPSBgXFxuXFxBZGRpbmcgdGhlIGZvbGxvd2luZyBjb2xvcnM6XFxuXFxuJHtKU09OLnN0cmluZ2lmeShtaXNzaW5nLCB1bmRlZmluZWQsICdcXHQnKX1cXG5gO1xuXHRcdH1cblx0XHRpZiAoc3VwZXJmbHVvdXNLZXlzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVycm9yVGV4dCArPSBgXFxuXFxSZW1vdmluZyB0aGUgZm9sbG93aW5nIGNvbG9yczpcXG5cXG4ke3N1cGVyZmx1b3VzS2V5cy5qb2luKCdcXG4nKX1cXG5gO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpemVzQXJyYXkgPSB2YXJpYWJsZXNJbmZvLnNpemVzIGFzIHN0cmluZ1tdIHx8IFtdO1xuXHRcdGNvbnN0IHNpemVzID0gbmV3IFNldChzaXplc0FycmF5KTtcblx0XHRjb25zdCB1cGRhdGVkU2l6ZXMgPSBbXTtcblx0XHRjb25zdCBtaXNzaW5nU2l6ZXMgPSBbXTtcblx0XHRjb25zdCBzaXplUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJU2l6ZVJlZ2lzdHJ5PihTaXplRXh0ZW5zaW9ucy5TaXplQ29udHJpYnV0aW9uKTtcblx0XHRmb3IgKGNvbnN0IHNpemUgb2Ygc2l6ZVJlZ2lzdHJ5LmdldFNpemVzKCkpIHtcblx0XHRcdGNvbnN0IGlkID0gYXNTaXplQ3NzVmFyaWFibGVOYW1lKHNpemUuaWQpO1xuXG5cdFx0XHRpZiAoIXNpemVzLmhhcyhpZCkpIHtcblx0XHRcdFx0aWYgKCFzaXplLmRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRcdG1pc3NpbmdTaXplcy5wdXNoKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2l6ZXMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZWRTaXplcy5wdXNoKGlkKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdXBlcmZsdW91c1NpemVzID0gWy4uLnNpemVzLmtleXMoKV07XG5cblx0XHRpZiAobWlzc2luZ1NpemVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVycm9yVGV4dCArPSBgXFxuXFxBZGRpbmcgdGhlIGZvbGxvd2luZyBzaXplczpcXG5cXG4ke0pTT04uc3RyaW5naWZ5KG1pc3NpbmdTaXplcywgdW5kZWZpbmVkLCAnXFx0Jyl9XFxuYDtcblx0XHR9XG5cdFx0aWYgKHN1cGVyZmx1b3VzU2l6ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZXJyb3JUZXh0ICs9IGBcXG5cXFJlbW92aW5nIHRoZSBmb2xsb3dpbmcgc2l6ZXM6XFxuXFxuJHtzdXBlcmZsdW91c1NpemVzLmpvaW4oJ1xcbicpfVxcbmA7XG5cdFx0fVxuXG5cdFx0aWYgKGVycm9yVGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0XHR1cGRhdGVkQ29sb3JzLnNvcnQoKTtcblx0XHRcdHZhcmlhYmxlc0luZm8uY29sb3JzID0gdXBkYXRlZENvbG9ycztcblx0XHRcdHVwZGF0ZWRTaXplcy5zb3J0KCk7XG5cdFx0XHR2YXJpYWJsZXNJbmZvLnNpemVzID0gdXBkYXRlZFNpemVzO1xuXHRcdFx0YXdhaXQgcGZzLlByb21pc2VzLndyaXRlRmlsZSh2YXJGaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkodmFyaWFibGVzSW5mbywgdW5kZWZpbmVkLCAnXFx0JykpO1xuXG5cdFx0XHRhc3NlcnQuZmFpbChgXFxuXFxVcGRhdGluZyAke3BhdGgubm9ybWFsaXplKHZhckZpbGVQYXRoKX0uXFxuUGxlYXNlIHZlcmlmeSBhbmQgY29tbWl0LlxcblxcbiR7ZXJyb3JUZXh0fVxcbmApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYWxsIGNvbG9ycyBsaXN0ZWQgaW4gdGhlbWUtY29sb3IubWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gYXZvaWQgaW1wb3J0aW5nIHRoZSBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlIGFzIGl0IGJyaW5ncyBpbiBhIGR1cGxpY2F0ZSByZWdpc3RyYXRpb24gb2YgdGhlIGZpbGUgZWRpdG9yIGlucHV0IGZhY3RvcnkuXG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgYXJncyA9IHsgXzogW10gfTsgfTtcblxuXHRcdGNvbnN0IGRvY1VybCA9ICdodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbWljcm9zb2Z0L3ZzY29kZS1kb2NzL3ZuZXh0L2FwaS9yZWZlcmVuY2VzL3RoZW1lLWNvbG9yLm1kJztcblxuXHRcdGNvbnN0IHJlcUNvbnRleHQgPSBhd2FpdCBuZXcgUmVxdWVzdFNlcnZpY2UoJ2xvY2FsJywgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLCBlbnZpcm9ubWVudFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKS5yZXF1ZXN0KHsgdXJsOiBkb2NVcmwsIGNhbGxTaXRlOiAnY29sb3JSZWdpc3RyeS5yZWxlYXNlVGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCBhc1RleHRPckVycm9yKHJlcUNvbnRleHQpKSE7XG5cblx0XHRjb25zdCBleHByZXNzaW9uID0gLy1cXHMqXFxgKFtcXHdcXC5dKylcXGA6ICguKikvZztcblxuXHRcdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdGNvbnN0IGNvbG9yc0luRG9jOiB7IFtpZDogc3RyaW5nXTogQ29sb3JJbmZvIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGxldCBuQ29sb3JzSW5Eb2MgPSAwO1xuXHRcdHdoaWxlIChtID0gZXhwcmVzc2lvbi5leGVjKGNvbnRlbnQpKSB7XG5cdFx0XHRjb2xvcnNJbkRvY1ttWzFdXSA9IHsgZGVzY3JpcHRpb246IG1bMl0sIG9mZnNldDogbS5pbmRleCwgbGVuZ3RoOiBtLmxlbmd0aCB9O1xuXHRcdFx0bkNvbG9yc0luRG9jKys7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhuQ29sb3JzSW5Eb2MgPiAwLCAndGhlbWUtY29sb3IubWQgY29udGFpbnMgdG8gY29sb3IgZGVzY3JpcHRpb25zJyk7XG5cblx0XHRjb25zdCBtaXNzaW5nID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbkRpZmZzOiB7IFtpZDogc3RyaW5nXTogRGVzY3JpcHRpb25EaWZmIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0Y29uc3QgdGhlbWluZ1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbG9yUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29sb3JDb250cmlidXRpb24pO1xuXHRcdGZvciAoY29uc3QgY29sb3Igb2YgdGhlbWluZ1JlZ2lzdHJ5LmdldENvbG9ycygpKSB7XG5cdFx0XHRpZiAoIWNvbG9yc0luRG9jW2NvbG9yLmlkXSkge1xuXHRcdFx0XHRpZiAoIWNvbG9yLmRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRcdG1pc3NpbmdbY29sb3IuaWRdID0gZ2V0RGVzY3JpcHRpb24oY29sb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkb2NEZXNjcmlwdGlvbiA9IGNvbG9yc0luRG9jW2NvbG9yLmlkXS5kZXNjcmlwdGlvbjtcblx0XHRcdFx0Y29uc3Qgc3BlY0Rlc2NyaXB0aW9uID0gZ2V0RGVzY3JpcHRpb24oY29sb3IpO1xuXHRcdFx0XHRpZiAoZG9jRGVzY3JpcHRpb24gIT09IHNwZWNEZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uRGlmZnNbY29sb3IuaWRdID0geyBkb2NEZXNjcmlwdGlvbiwgc3BlY0Rlc2NyaXB0aW9uIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVsZXRlIGNvbG9yc0luRG9jW2NvbG9yLmlkXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgY29sb3JzSW5FeHRlbnNpb25zID0gYXdhaXQgZ2V0Q29sb3JzRnJvbUV4dGVuc2lvbigpO1xuXHRcdGZvciAoY29uc3QgY29sb3JJZCBpbiBjb2xvcnNJbkV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghY29sb3JzSW5Eb2NbY29sb3JJZF0pIHtcblx0XHRcdFx0bWlzc2luZ1tjb2xvcklkXSA9IGNvbG9yc0luRXh0ZW5zaW9uc1tjb2xvcklkXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlbGV0ZSBjb2xvcnNJbkRvY1tjb2xvcklkXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb2xvcklkIG9mIGV4cGVyaW1lbnRhbCkge1xuXHRcdFx0aWYgKG1pc3NpbmdbY29sb3JJZF0pIHtcblx0XHRcdFx0ZGVsZXRlIG1pc3NpbmdbY29sb3JJZF07XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29sb3JzSW5Eb2NbY29sb3JJZF0pIHtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoYENvbG9yICR7Y29sb3JJZH0gZm91bmQgaW4gZG9jIGJ1dCBtYXJrZWQgZXhwZXJpbWVudGFsLiBQbGVhc2UgcmVtb3ZlIGZyb20gZXhwZXJpbWVudGFsIGxpc3QuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN1cGVyZmx1b3VzS2V5cyA9IE9iamVjdC5rZXlzKGNvbG9yc0luRG9jKTtcblx0XHRjb25zdCB1bmRvY3VtZW50ZWRLZXlzID0gT2JqZWN0LmtleXMobWlzc2luZykubWFwKGsgPT4gYFxcYCR7a31cXGA6ICR7bWlzc2luZ1trXX1gKTtcblxuXG5cdFx0bGV0IGVycm9yVGV4dCA9ICcnO1xuXHRcdGlmICh1bmRvY3VtZW50ZWRLZXlzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVycm9yVGV4dCArPSBgXFxuXFxuQWRkIHRoZSBmb2xsb3dpbmcgY29sb3JzOlxcblxcbiR7dW5kb2N1bWVudGVkS2V5cy5qb2luKCdcXG4nKX1cXG5gO1xuXHRcdH1cblx0XHRpZiAoc3VwZXJmbHVvdXNLZXlzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVycm9yVGV4dCArPSBgXFxuXFxSZW1vdmUgdGhlIGZvbGxvd2luZyBjb2xvcnM6XFxuXFxuJHtzdXBlcmZsdW91c0tleXMuam9pbignXFxuJyl9XFxuYDtcblx0XHR9XG5cblx0XHRpZiAoZXJyb3JUZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdGFzc2VydC5mYWlsKGBcXG5cXG5PcGVuIGh0dHBzOi8vZ2l0aHViLmRldi9taWNyb3NvZnQvdnNjb2RlLWRvY3MvYmxvYi92bmV4dC9hcGkvcmVmZXJlbmNlcy90aGVtZS1jb2xvci5tZCM1MCR7ZXJyb3JUZXh0fWApO1xuXHRcdH1cblx0fSk7XG59KTtcblxuZnVuY3Rpb24gZ2V0RGVzY3JpcHRpb24oY29sb3I6IENvbG9yQ29udHJpYnV0aW9uKSB7XG5cdGxldCBzcGVjRGVzY3JpcHRpb24gPSBjb2xvci5kZXNjcmlwdGlvbjtcblx0aWYgKGNvbG9yLmRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdHNwZWNEZXNjcmlwdGlvbiA9IHNwZWNEZXNjcmlwdGlvbiArICcgJyArIGNvbG9yLmRlcHJlY2F0aW9uTWVzc2FnZTtcblx0fVxuXHRyZXR1cm4gc3BlY0Rlc2NyaXB0aW9uO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRDb2xvcnNGcm9tRXh0ZW5zaW9uKCk6IFByb21pc2U8eyBbaWQ6IHN0cmluZ106IHN0cmluZyB9PiB7XG5cdGNvbnN0IGV4dFBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvLi4vLi4vZXh0ZW5zaW9ucycpLmZzUGF0aDtcblx0Y29uc3QgZXh0Rm9sZGVycyA9IGF3YWl0IHBmcy5Qcm9taXNlcy5yZWFkRGlyc0luRGlyKGV4dFBhdGgpO1xuXHRjb25zdCByZXN1bHQ6IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdGZvciAoY29uc3QgZm9sZGVyIG9mIGV4dEZvbGRlcnMpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFja2FnZUpTT04gPSBKU09OLnBhcnNlKChhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShwYXRoLmpvaW4oZXh0UGF0aCwgZm9sZGVyLCAncGFja2FnZS5qc29uJykpKS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVzID0gcGFja2FnZUpTT05bJ2NvbnRyaWJ1dGVzJ107XG5cdFx0XHRpZiAoY29udHJpYnV0ZXMpIHtcblx0XHRcdFx0Y29uc3QgY29sb3JzID0gY29udHJpYnV0ZXNbJ2NvbG9ycyddO1xuXHRcdFx0XHRpZiAoY29sb3JzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb2xvciBvZiBjb2xvcnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbG9ySWQgPSBjb2xvclsnaWQnXTtcblx0XHRcdFx0XHRcdGlmIChjb2xvcklkKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdFtjb2xvcklkXSA9IGNvbG9ySWRbJ2Rlc2NyaXB0aW9uJ107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gaWdub3JlXG5cdFx0fVxuXG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUF5QixZQUErQix5QkFBeUI7QUFDakYsU0FBd0IsY0FBYyxnQkFBZ0IscUJBQXFCLDZCQUE2QjtBQUN4RyxTQUFTLHFCQUFxQjtBQUM5QixZQUFZLFNBQVM7QUFDckIsWUFBWSxVQUFVO0FBQ3RCLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUV6QyxPQUFPO0FBQ1AsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBRXJCLFNBQVMsa0JBQWtCO0FBYXBCLE1BQU0sZUFBeUIsQ0FBQztBQUd2QyxNQUFNLHlCQUF5QjtBQUUvQixNQUFNLGtCQUFrQixXQUFZO0FBRW5DLE9BQUssb0JBQW9CLHNCQUFzQixJQUFJLGlCQUFrQjtBQUNwRSxVQUFNLGNBQWMsV0FBVyxVQUFVLGdDQUFnQyxzQkFBc0IsRUFBRSxFQUFFO0FBQ25HLFVBQU0sV0FBVyxNQUFNLEdBQUcsU0FBUyxTQUFTLFdBQVcsR0FBRyxTQUFTO0FBRW5FLFVBQU0sZ0JBQWdCLEtBQUssTUFBTSxPQUFPO0FBRXhDLFVBQU0sY0FBYyxjQUFjO0FBRWxDLFdBQU8sR0FBRyxlQUFlLFlBQVksU0FBUyxHQUFHLDBEQUEwRDtBQUUzRyxVQUFNLFNBQVMsSUFBSSxJQUFJLFdBQVc7QUFFbEMsVUFBTSxnQkFBZ0IsQ0FBQztBQUN2QixVQUFNLFVBQVUsQ0FBQztBQUNqQixVQUFNLGtCQUFr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
