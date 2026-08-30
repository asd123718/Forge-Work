import assert from "assert";
import { Extensions as ThemeingExtensions } from "../../../../../platform/theme/common/colorRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ansiColorIdentifiers, registerColors } from "../../common/terminalColorRegistry.js";
import { Color } from "../../../../../base/common/color.js";
import { ColorScheme } from "../../../../../platform/theme/common/theme.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
registerColors();
const themingRegistry = Registry.as(ThemeingExtensions.ColorContribution);
function getMockTheme(type) {
  const theme = {
    selector: "",
    label: "",
    type,
    getColor: (colorId) => themingRegistry.resolveDefaultColor(colorId, theme),
    defines: () => true,
    getTokenStyleMetadata: () => void 0,
    tokenColorMap: [],
    tokenFontMap: [],
    semanticHighlighting: false
  };
  return theme;
}
suite("Workbench - TerminalColorRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hc colors", function() {
    const theme = getMockTheme(ColorScheme.HIGH_CONTRAST_DARK);
    const colors = ansiColorIdentifiers.map((colorId) => Color.Format.CSS.formatHexA(theme.getColor(colorId), true));
    assert.deepStrictEqual(colors, [
      "#000000",
      "#cd0000",
      "#00cd00",
      "#cdcd00",
      "#0000ee",
      "#cd00cd",
      "#00cdcd",
      "#e5e5e5",
      "#7f7f7f",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#5c5cff",
      "#ff00ff",
      "#00ffff",
      "#ffffff"
    ], "The high contrast terminal colors should be used when the hc theme is active");
  });
  test("light colors", function() {
    const theme = getMockTheme(ColorScheme.LIGHT);
    const colors = ansiColorIdentifiers.map((colorId) => Color.Format.CSS.formatHexA(theme.getColor(colorId), true));
    assert.deepStrictEqual(colors, [
      "#000000",
      "#cd3131",
      "#107c10",
      "#949800",
      "#0451a5",
      "#bc05bc",
      "#0598bc",
      "#555555",
      "#666666",
      "#cd3131",
      "#14ce14",
      "#b5ba00",
      "#0451a5",
      "#bc05bc",
      "#0598bc",
      "#a5a5a5"
    ], "The light terminal colors should be used when the light theme is active");
  });
  test("dark colors", function() {
    const theme = getMockTheme(ColorScheme.DARK);
    const colors = ansiColorIdentifiers.map((colorId) => Color.Format.CSS.formatHexA(theme.getColor(colorId), true));
    assert.deepStrictEqual(colors, [
      "#000000",
      "#cd3131",
      "#0dbc79",
      "#e5e510",
      "#2472c8",
      "#bc3fbc",
      "#11a8cd",
      "#e5e5e5",
      "#666666",
      "#f14c4c",
      "#23d18b",
      "#f5f543",
      "#3b8eea",
      "#d670d6",
      "#29b8db",
      "#e5e5e5"
    ], "The dark terminal colors should be used when a dark theme is active");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxjb21tb25cXHRlcm1pbmFsQ29sb3JSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBUaGVtZWluZ0V4dGVuc2lvbnMsIElDb2xvclJlZ2lzdHJ5LCBDb2xvcklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhbnNpQ29sb3JJZGVudGlmaWVycywgcmVnaXN0ZXJDb2xvcnMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5yZWdpc3RlckNvbG9ycygpO1xuXG5jb25zdCB0aGVtaW5nUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29sb3JSZWdpc3RyeT4oVGhlbWVpbmdFeHRlbnNpb25zLkNvbG9yQ29udHJpYnV0aW9uKTtcbmZ1bmN0aW9uIGdldE1vY2tUaGVtZSh0eXBlOiBDb2xvclNjaGVtZSk6IElDb2xvclRoZW1lIHtcblx0Y29uc3QgdGhlbWUgPSB7XG5cdFx0c2VsZWN0b3I6ICcnLFxuXHRcdGxhYmVsOiAnJyxcblx0XHR0eXBlOiB0eXBlLFxuXHRcdGdldENvbG9yOiAoY29sb3JJZDogQ29sb3JJZGVudGlmaWVyKTogQ29sb3IgfCB1bmRlZmluZWQgPT4gdGhlbWluZ1JlZ2lzdHJ5LnJlc29sdmVEZWZhdWx0Q29sb3IoY29sb3JJZCwgdGhlbWUpLFxuXHRcdGRlZmluZXM6ICgpID0+IHRydWUsXG5cdFx0Z2V0VG9rZW5TdHlsZU1ldGFkYXRhOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0dG9rZW5Db2xvck1hcDogW10sXG5cdFx0dG9rZW5Gb250TWFwOiBbXSxcblx0XHRzZW1hbnRpY0hpZ2hsaWdodGluZzogZmFsc2Vcblx0fTtcblx0cmV0dXJuIHRoZW1lO1xufVxuXG5zdWl0ZSgnV29ya2JlbmNoIC0gVGVybWluYWxDb2xvclJlZ2lzdHJ5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdoYyBjb2xvcnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGhlbWUgPSBnZXRNb2NrVGhlbWUoQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLKTtcblx0XHRjb25zdCBjb2xvcnMgPSBhbnNpQ29sb3JJZGVudGlmaWVycy5tYXAoY29sb3JJZCA9PiBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEodGhlbWUuZ2V0Q29sb3IoY29sb3JJZCkhLCB0cnVlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbG9ycywgW1xuXHRcdFx0JyMwMDAwMDAnLFxuXHRcdFx0JyNjZDAwMDAnLFxuXHRcdFx0JyMwMGNkMDAnLFxuXHRcdFx0JyNjZGNkMDAnLFxuXHRcdFx0JyMwMDAwZWUnLFxuXHRcdFx0JyNjZDAwY2QnLFxuXHRcdFx0JyMwMGNkY2QnLFxuXHRcdFx0JyNlNWU1ZTUnLFxuXHRcdFx0JyM3ZjdmN2YnLFxuXHRcdFx0JyNmZjAwMDAnLFxuXHRcdFx0JyMwMGZmMDAnLFxuXHRcdFx0JyNmZmZmMDAnLFxuXHRcdFx0JyM1YzVjZmYnLFxuXHRcdFx0JyNmZjAwZmYnLFxuXHRcdFx0JyMwMGZmZmYnLFxuXHRcdFx0JyNmZmZmZmYnXG5cdFx0XSwgJ1RoZSBoaWdoIGNvbnRyYXN0IHRlcm1pbmFsIGNvbG9ycyBzaG91bGQgYmUgdXNlZCB3aGVuIHRoZSBoYyB0aGVtZSBpcyBhY3RpdmUnKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdsaWdodCBjb2xvcnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGhlbWUgPSBnZXRNb2NrVGhlbWUoQ29sb3JTY2hlbWUuTElHSFQpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGFuc2lDb2xvcklkZW50aWZpZXJzLm1hcChjb2xvcklkID0+IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QSh0aGVtZS5nZXRDb2xvcihjb2xvcklkKSEsIHRydWUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sb3JzLCBbXG5cdFx0XHQnIzAwMDAwMCcsXG5cdFx0XHQnI2NkMzEzMScsXG5cdFx0XHQnIzEwN2MxMCcsXG5cdFx0XHQnIzk0OTgwMCcsXG5cdFx0XHQnIzA0NTFhNScsXG5cdFx0XHQnI2JjMDViYycsXG5cdFx0XHQnIzA1OThiYycsXG5cdFx0XHQnIzU1NTU1NScsXG5cdFx0XHQnIzY2NjY2NicsXG5cdFx0XHQnI2NkMzEzMScsXG5cdFx0XHQnIzE0Y2UxNCcsXG5cdFx0XHQnI2I1YmEwMCcsXG5cdFx0XHQnIzA0NTFhNScsXG5cdFx0XHQnI2JjMDViYycsXG5cdFx0XHQnIzA1OThiYycsXG5cdFx0XHQnI2E1YTVhNSdcblx0XHRdLCAnVGhlIGxpZ2h0IHRlcm1pbmFsIGNvbG9ycyBzaG91bGQgYmUgdXNlZCB3aGVuIHRoZSBsaWdodCB0aGVtZSBpcyBhY3RpdmUnKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdkYXJrIGNvbG9ycycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0aGVtZSA9IGdldE1vY2tUaGVtZShDb2xvclNjaGVtZS5EQVJLKTtcblx0XHRjb25zdCBjb2xvcnMgPSBhbnNpQ29sb3JJZGVudGlmaWVycy5tYXAoY29sb3JJZCA9PiBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEodGhlbWUuZ2V0Q29sb3IoY29sb3JJZCkhLCB0cnVlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbG9ycywgW1xuXHRcdFx0JyMwMDAwMDAnLFxuXHRcdFx0JyNjZDMxMzEnLFxuXHRcdFx0JyMwZGJjNzknLFxuXHRcdFx0JyNlNWU1MTAnLFxuXHRcdFx0JyMyNDcyYzgnLFxuXHRcdFx0JyNiYzNmYmMnLFxuXHRcdFx0JyMxMWE4Y2QnLFxuXHRcdFx0JyNlNWU1ZTUnLFxuXHRcdFx0JyM2NjY2NjYnLFxuXHRcdFx0JyNmMTRjNGMnLFxuXHRcdFx0JyMyM2QxOGInLFxuXHRcdFx0JyNmNWY1NDMnLFxuXHRcdFx0JyMzYjhlZWEnLFxuXHRcdFx0JyNkNjcwZDYnLFxuXHRcdFx0JyMyOWI4ZGInLFxuXHRcdFx0JyNlNWU1ZTUnXG5cdFx0XSwgJ1RoZSBkYXJrIHRlcm1pbmFsIGNvbG9ycyBzaG91bGQgYmUgdXNlZCB3aGVuIGEgZGFyayB0aGVtZSBpcyBhY3RpdmUnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWMsMEJBQTJEO0FBQ2xGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCLHNCQUFzQjtBQUVyRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywrQ0FBK0M7QUFFeEQsZUFBZTtBQUVmLE1BQU0sa0JBQWtCLFNBQVMsR0FBbUIsbUJBQW1CLGlCQUFpQjtBQUN4RixTQUFTLGFBQWEsTUFBZ0M7QUFDckQsUUFBTSxRQUFRO0FBQUEsSUFDYixVQUFVO0FBQUEsSUFDVixPQUFPO0FBQUEsSUFDUDtBQUFBLElBQ0EsVUFBVSxDQUFDLFlBQWdELGdCQUFnQixvQkFBb0IsU0FBUyxLQUFLO0FBQUEsSUFDN0csU0FBUyxNQUFNO0FBQUEsSUFDZix1QkFBdUIsTUFBTTtBQUFBLElBQzdCLGVBQWUsQ0FBQztBQUFBLElBQ2hCLGNBQWMsQ0FBQztBQUFBLElBQ2Ysc0JBQXNCO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1I7QUFFQSxNQUFNLHFDQUFxQyxNQUFNO0FBQ2hELDBDQUF3QztBQUV4QyxPQUFLLGFBQWEsV0FBWTtBQUM3QixVQUFNLFFBQVEsYUFBYSxZQUFZLGtCQUFrQjtBQUN6RCxVQUFNLFNBQVMscUJBQXFCLElBQUksYUFBVyxNQUFNLE9BQU8sSUFBSSxXQUFXLE1BQU0sU0FBUyxPQUFPLEdBQUksSUFBSSxDQUFDO0FBRTlHLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyw4RUFBOEU7QUFBQSxFQUVsRixDQUFDO0FBRUQsT0FBSyxnQkFBZ0IsV0FBWTtBQUNoQyxVQUFNLFFBQVEsYUFBYSxZQUFZLEtBQUs7QUFDNUMsVUFBTSxTQUFTLHFCQUFxQixJQUFJLGFBQVcsTUFBTSxPQUFPLElBQUksV0FBVyxNQUFNLFNBQVMsT0FBTyxHQUFJLElBQUksQ0FBQztBQUU5RyxXQUFPLGdCQUFnQixRQUFRO0FBQUEsTUFDOUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcseUVBQXlFO0FBQUEsRUFFN0UsQ0FBQztBQUVELE9BQUssZUFBZSxXQUFZO0FBQy9CLFVBQU0sUUFBUSxhQUFhLFlBQVksSUFBSTtBQUMzQyxVQUFNLFNBQVMscUJBQXFCLElBQUksYUFBVyxNQUFNLE9BQU8sSUFBSSxXQUFXLE1BQU0sU0FBUyxPQUFPLEdBQUksSUFBSSxDQUFDO0FBRTlHLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxxRUFBcUU7QUFBQSxFQUN6RSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
