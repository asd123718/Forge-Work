import { Color, RGBA } from "../../../../base/common/color.js";
import { isDefined } from "../../../../base/common/types.js";
import { editorHoverBackground, listActiveSelectionBackground, listFocusBackground, listInactiveFocusBackground, listInactiveSelectionBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../common/theme.js";
import { ansiColorIdentifiers } from "../../terminal/common/terminalColorRegistry.js";
function handleANSIOutput(text, linkDetector, workspaceFolder, highlights, hoverBehavior) {
  const root = document.createElement("span");
  const textLength = text.length;
  let styleNames = [];
  let customFgColor;
  let customBgColor;
  let customUnderlineColor;
  let colorsInverted = false;
  let currentPos = 0;
  let unprintedChars = 0;
  let buffer = "";
  while (currentPos < textLength) {
    let sequenceFound = false;
    if (text.charCodeAt(currentPos) === 27 && text.charAt(currentPos + 1) === "[") {
      const startPos = currentPos;
      currentPos += 2;
      let ansiSequence = "";
      while (currentPos < textLength) {
        const char = text.charAt(currentPos);
        ansiSequence += char;
        currentPos++;
        if (char.match(/^[ABCDHIJKfhmpsu]$/)) {
          sequenceFound = true;
          break;
        }
      }
      if (sequenceFound) {
        unprintedChars += 2 + ansiSequence.length;
        appendStylizedStringToContainer(root, buffer, styleNames, linkDetector, workspaceFolder, customFgColor, customBgColor, customUnderlineColor, highlights, currentPos - buffer.length - unprintedChars, hoverBehavior);
        buffer = "";
        if (ansiSequence.match(/^(?:[34][0-8]|9[0-7]|10[0-7]|[0-9]|2[1-5,7-9]|[34]9|5[8,9]|1[0-9])(?:;[349][0-7]|10[0-7]|[013]|[245]|[34]9)?(?:;[012]?[0-9]?[0-9])*;?m$/)) {
          const styleCodes = ansiSequence.slice(0, -1).split(";").filter((elem) => elem !== "").map((elem) => parseInt(elem, 10));
          if (styleCodes[0] === 38 || styleCodes[0] === 48 || styleCodes[0] === 58) {
            const colorType = styleCodes[0] === 38 ? "foreground" : styleCodes[0] === 48 ? "background" : "underline";
            if (styleCodes[1] === 5) {
              set8BitColor(styleCodes, colorType);
            } else if (styleCodes[1] === 2) {
              set24BitColor(styleCodes, colorType);
            }
          } else {
            setBasicFormatters(styleCodes);
          }
        } else {
        }
      } else {
        currentPos = startPos;
      }
    }
    if (sequenceFound === false) {
      buffer += text.charAt(currentPos);
      currentPos++;
    }
  }
  if (buffer) {
    appendStylizedStringToContainer(root, buffer, styleNames, linkDetector, workspaceFolder, customFgColor, customBgColor, customUnderlineColor, highlights, currentPos - buffer.length, hoverBehavior);
  }
  return root;
  function changeColor(colorType, color) {
    if (colorType === "foreground") {
      customFgColor = color;
    } else if (colorType === "background") {
      customBgColor = color;
    } else if (colorType === "underline") {
      customUnderlineColor = color;
    }
    styleNames = styleNames.filter((style) => style !== `code-${colorType}-colored`);
    if (color !== void 0) {
      styleNames.push(`code-${colorType}-colored`);
    }
  }
  function reverseForegroundAndBackgroundColors() {
    const oldFgColor = customFgColor;
    changeColor("foreground", customBgColor);
    changeColor("background", oldFgColor);
  }
  function setBasicFormatters(styleCodes) {
    for (const code of styleCodes) {
      switch (code) {
        case 0: {
          styleNames = [];
          customFgColor = void 0;
          customBgColor = void 0;
          break;
        }
        case 1: {
          styleNames = styleNames.filter((style) => style !== `code-bold`);
          styleNames.push("code-bold");
          break;
        }
        case 2: {
          styleNames = styleNames.filter((style) => style !== `code-dim`);
          styleNames.push("code-dim");
          break;
        }
        case 3: {
          styleNames = styleNames.filter((style) => style !== `code-italic`);
          styleNames.push("code-italic");
          break;
        }
        case 4: {
          styleNames = styleNames.filter((style) => style !== `code-underline` && style !== `code-double-underline`);
          styleNames.push("code-underline");
          break;
        }
        case 5: {
          styleNames = styleNames.filter((style) => style !== `code-blink`);
          styleNames.push("code-blink");
          break;
        }
        case 6: {
          styleNames = styleNames.filter((style) => style !== `code-rapid-blink`);
          styleNames.push("code-rapid-blink");
          break;
        }
        case 7: {
          if (!colorsInverted) {
            colorsInverted = true;
            reverseForegroundAndBackgroundColors();
          }
          break;
        }
        case 8: {
          styleNames = styleNames.filter((style) => style !== `code-hidden`);
          styleNames.push("code-hidden");
          break;
        }
        case 9: {
          styleNames = styleNames.filter((style) => style !== `code-strike-through`);
          styleNames.push("code-strike-through");
          break;
        }
        case 10: {
          styleNames = styleNames.filter((style) => !style.startsWith("code-font"));
          break;
        }
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20: {
          styleNames = styleNames.filter((style) => !style.startsWith("code-font"));
          styleNames.push(`code-font-${code - 10}`);
          break;
        }
        case 21: {
          styleNames = styleNames.filter((style) => style !== `code-underline` && style !== `code-double-underline`);
          styleNames.push("code-double-underline");
          break;
        }
        case 22: {
          styleNames = styleNames.filter((style) => style !== `code-bold` && style !== `code-dim`);
          break;
        }
        case 23: {
          styleNames = styleNames.filter((style) => style !== `code-italic` && style !== `code-font-10`);
          break;
        }
        case 24: {
          styleNames = styleNames.filter((style) => style !== `code-underline` && style !== `code-double-underline`);
          break;
        }
        case 25: {
          styleNames = styleNames.filter((style) => style !== `code-blink` && style !== `code-rapid-blink`);
          break;
        }
        case 27: {
          if (colorsInverted) {
            colorsInverted = false;
            reverseForegroundAndBackgroundColors();
          }
          break;
        }
        case 28: {
          styleNames = styleNames.filter((style) => style !== `code-hidden`);
          break;
        }
        case 29: {
          styleNames = styleNames.filter((style) => style !== `code-strike-through`);
          break;
        }
        case 53: {
          styleNames = styleNames.filter((style) => style !== `code-overline`);
          styleNames.push("code-overline");
          break;
        }
        case 55: {
          styleNames = styleNames.filter((style) => style !== `code-overline`);
          break;
        }
        case 39: {
          changeColor("foreground", void 0);
          break;
        }
        case 49: {
          changeColor("background", void 0);
          break;
        }
        case 59: {
          changeColor("underline", void 0);
          break;
        }
        case 73: {
          styleNames = styleNames.filter((style) => style !== `code-superscript` && style !== `code-subscript`);
          styleNames.push("code-superscript");
          break;
        }
        case 74: {
          styleNames = styleNames.filter((style) => style !== `code-superscript` && style !== `code-subscript`);
          styleNames.push("code-subscript");
          break;
        }
        case 75: {
          styleNames = styleNames.filter((style) => style !== `code-superscript` && style !== `code-subscript`);
          break;
        }
        default: {
          setBasicColor(code);
          break;
        }
      }
    }
  }
  function set24BitColor(styleCodes, colorType) {
    if (styleCodes.length >= 5 && styleCodes[2] >= 0 && styleCodes[2] <= 255 && styleCodes[3] >= 0 && styleCodes[3] <= 255 && styleCodes[4] >= 0 && styleCodes[4] <= 255) {
      const customColor = new RGBA(styleCodes[2], styleCodes[3], styleCodes[4]);
      changeColor(colorType, customColor);
    }
  }
  function set8BitColor(styleCodes, colorType) {
    let colorNumber = styleCodes[2];
    const color = calcANSI8bitColor(colorNumber);
    if (color) {
      changeColor(colorType, color);
    } else if (colorNumber >= 0 && colorNumber <= 15) {
      if (colorType === "underline") {
        const colorName = ansiColorIdentifiers[colorNumber];
        changeColor(colorType, `--vscode-debug-ansi-${colorName}`);
        return;
      }
      colorNumber += 30;
      if (colorNumber >= 38) {
        colorNumber += 52;
      }
      if (colorType === "background") {
        colorNumber += 10;
      }
      setBasicColor(colorNumber);
    }
  }
  function setBasicColor(styleCode) {
    let colorType;
    let colorIndex;
    if (styleCode >= 30 && styleCode <= 37) {
      colorIndex = styleCode - 30;
      colorType = "foreground";
    } else if (styleCode >= 90 && styleCode <= 97) {
      colorIndex = styleCode - 90 + 8;
      colorType = "foreground";
    } else if (styleCode >= 40 && styleCode <= 47) {
      colorIndex = styleCode - 40;
      colorType = "background";
    } else if (styleCode >= 100 && styleCode <= 107) {
      colorIndex = styleCode - 100 + 8;
      colorType = "background";
    }
    if (colorIndex !== void 0 && colorType) {
      const colorName = ansiColorIdentifiers[colorIndex];
      changeColor(colorType, `--vscode-debug-ansi-${colorName.replaceAll(".", "-")}`);
    }
  }
}
function appendStylizedStringToContainer(root, stringContent, cssClasses, linkDetector, workspaceFolder, customTextColor, customBackgroundColor, customUnderlineColor, highlights, offset, hoverBehavior) {
  if (!root || !stringContent) {
    return;
  }
  const container = linkDetector.linkify(
    stringContent,
    hoverBehavior,
    true,
    workspaceFolder,
    void 0,
    highlights?.map((h) => ({ start: h.start - offset, end: h.end - offset, extraClasses: h.extraClasses }))
  );
  container.className = cssClasses.join(" ");
  if (customTextColor) {
    container.style.color = typeof customTextColor === "string" ? `var(${customTextColor})` : Color.Format.CSS.formatRGB(new Color(customTextColor));
  }
  if (customBackgroundColor) {
    container.style.backgroundColor = typeof customBackgroundColor === "string" ? `var(${customBackgroundColor})` : Color.Format.CSS.formatRGB(new Color(customBackgroundColor));
  }
  if (customUnderlineColor) {
    container.style.textDecorationColor = typeof customUnderlineColor === "string" ? `var(${customUnderlineColor})` : Color.Format.CSS.formatRGB(new Color(customUnderlineColor));
  }
  root.appendChild(container);
}
function calcANSI8bitColor(colorNumber) {
  if (colorNumber % 1 !== 0) {
    return;
  }
  if (colorNumber >= 16 && colorNumber <= 231) {
    colorNumber -= 16;
    let blue = colorNumber % 6;
    colorNumber = (colorNumber - blue) / 6;
    let green = colorNumber % 6;
    colorNumber = (colorNumber - green) / 6;
    let red = colorNumber;
    const convFactor = 255 / 5;
    blue = Math.round(blue * convFactor);
    green = Math.round(green * convFactor);
    red = Math.round(red * convFactor);
    return new RGBA(red, green, blue);
  } else if (colorNumber >= 232 && colorNumber <= 255) {
    colorNumber -= 232;
    const colorLevel = Math.round(colorNumber / 23 * 255);
    return new RGBA(colorLevel, colorLevel, colorLevel);
  } else {
    return;
  }
}
registerThemingParticipant((theme, collector) => {
  const areas = [
    { selector: ".monaco-workbench .sidebar, .monaco-workbench .auxiliarybar", bg: theme.getColor(SIDE_BAR_BACKGROUND) },
    { selector: ".monaco-workbench .panel", bg: theme.getColor(PANEL_BACKGROUND) },
    { selector: ".monaco-workbench .monaco-list-row.selected", bg: theme.getColor(listInactiveSelectionBackground) },
    { selector: ".monaco-workbench .monaco-list-row.focused", bg: theme.getColor(listInactiveFocusBackground) },
    { selector: ".monaco-workbench .monaco-list:focus .monaco-list-row.focused", bg: theme.getColor(listFocusBackground) },
    { selector: ".monaco-workbench .monaco-list:focus .monaco-list-row.selected", bg: theme.getColor(listActiveSelectionBackground) },
    { selector: ".debug-hover-widget", bg: theme.getColor(editorHoverBackground) }
  ];
  for (const { selector, bg } of areas) {
    const content = ansiColorIdentifiers.map((color) => {
      const actual = theme.getColor(color);
      if (!actual) {
        return void 0;
      }
      return `--vscode-debug-ansi-${color.replaceAll(".", "-")}:${bg ? bg.ensureConstrast(actual, 4) : actual}`;
    }).filter(isDefined);
    collector.addRule(`${selector} { ${content.join(";")} }`);
  }
});
export {
  appendStylizedStringToContainer,
  calcANSI8bitColor,
  handleANSIOutput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0FOU0lIYW5kbGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IENvbG9yLCBSR0JBIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZWRpdG9ySG92ZXJCYWNrZ3JvdW5kLCBsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgbGlzdEZvY3VzQmFja2dyb3VuZCwgbGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kLCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5ELCBTSURFX0JBUl9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGFuc2lDb2xvcklkZW50aWZpZXJzIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEsIElMaW5rRGV0ZWN0b3IgfSBmcm9tICcuL2xpbmtEZXRlY3Rvci5qcyc7XG5cbi8qKlxuICogQHBhcmFtIHRleHQgVGhlIGNvbnRlbnQgdG8gc3R5bGl6ZS5cbiAqIEByZXR1cm5zIEFuIHtAbGluayBIVE1MU3BhbkVsZW1lbnR9IHRoYXQgY29udGFpbnMgdGhlIHBvdGVudGlhbGx5IHN0eWxpemVkIHRleHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVBTlNJT3V0cHV0KHRleHQ6IHN0cmluZywgbGlua0RldGVjdG9yOiBJTGlua0RldGVjdG9yLCB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIGhpZ2hsaWdodHM6IElIaWdobGlnaHRbXSB8IHVuZGVmaW5lZCwgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhKTogSFRNTFNwYW5FbGVtZW50IHtcblxuXHRjb25zdCByb290OiBIVE1MU3BhbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdGNvbnN0IHRleHRMZW5ndGg6IG51bWJlciA9IHRleHQubGVuZ3RoO1xuXG5cdGxldCBzdHlsZU5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgY3VzdG9tRmdDb2xvcjogUkdCQSB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGN1c3RvbUJnQ29sb3I6IFJHQkEgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBjdXN0b21VbmRlcmxpbmVDb2xvcjogUkdCQSB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGNvbG9yc0ludmVydGVkOiBib29sZWFuID0gZmFsc2U7XG5cdGxldCBjdXJyZW50UG9zOiBudW1iZXIgPSAwO1xuXHRsZXQgdW5wcmludGVkQ2hhcnMgPSAwO1xuXHRsZXQgYnVmZmVyOiBzdHJpbmcgPSAnJztcblxuXHR3aGlsZSAoY3VycmVudFBvcyA8IHRleHRMZW5ndGgpIHtcblxuXHRcdGxldCBzZXF1ZW5jZUZvdW5kOiBib29sZWFuID0gZmFsc2U7XG5cblx0XHQvLyBQb3RlbnRpYWxseSBhbiBBTlNJIGVzY2FwZSBzZXF1ZW5jZS5cblx0XHQvLyBTZWUgaHR0cDovL2FzY2lpLXRhYmxlLmNvbS9hbnNpLWVzY2FwZS1zZXF1ZW5jZXMucGhwICYgaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZVxuXHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQoY3VycmVudFBvcykgPT09IDI3ICYmIHRleHQuY2hhckF0KGN1cnJlbnRQb3MgKyAxKSA9PT0gJ1snKSB7XG5cblx0XHRcdGNvbnN0IHN0YXJ0UG9zOiBudW1iZXIgPSBjdXJyZW50UG9zO1xuXHRcdFx0Y3VycmVudFBvcyArPSAyOyAvLyBJZ25vcmUgJ0VzY1snIGFzIGl0J3MgaW4gZXZlcnkgc2VxdWVuY2UuXG5cblx0XHRcdGxldCBhbnNpU2VxdWVuY2U6IHN0cmluZyA9ICcnO1xuXG5cdFx0XHR3aGlsZSAoY3VycmVudFBvcyA8IHRleHRMZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgY2hhcjogc3RyaW5nID0gdGV4dC5jaGFyQXQoY3VycmVudFBvcyk7XG5cdFx0XHRcdGFuc2lTZXF1ZW5jZSArPSBjaGFyO1xuXG5cdFx0XHRcdGN1cnJlbnRQb3MrKztcblxuXHRcdFx0XHQvLyBMb29rIGZvciBhIGtub3duIHNlcXVlbmNlIHRlcm1pbmF0aW5nIGNoYXJhY3Rlci5cblx0XHRcdFx0aWYgKGNoYXIubWF0Y2goL15bQUJDREhJSktmaG1wc3VdJC8pKSB7XG5cdFx0XHRcdFx0c2VxdWVuY2VGb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VxdWVuY2VGb3VuZCkge1xuXG5cdFx0XHRcdHVucHJpbnRlZENoYXJzICs9IDIgKyBhbnNpU2VxdWVuY2UubGVuZ3RoO1xuXG5cdFx0XHRcdC8vIEZsdXNoIGJ1ZmZlciB3aXRoIHByZXZpb3VzIHN0eWxlcy5cblx0XHRcdFx0YXBwZW5kU3R5bGl6ZWRTdHJpbmdUb0NvbnRhaW5lcihyb290LCBidWZmZXIsIHN0eWxlTmFtZXMsIGxpbmtEZXRlY3Rvciwgd29ya3NwYWNlRm9sZGVyLCBjdXN0b21GZ0NvbG9yLCBjdXN0b21CZ0NvbG9yLCBjdXN0b21VbmRlcmxpbmVDb2xvciwgaGlnaGxpZ2h0cywgY3VycmVudFBvcyAtIGJ1ZmZlci5sZW5ndGggLSB1bnByaW50ZWRDaGFycywgaG92ZXJCZWhhdmlvcik7XG5cdFx0XHRcdGJ1ZmZlciA9ICcnO1xuXG5cdFx0XHRcdC8qXG5cdFx0XHRcdCAqIENlcnRhaW4gcmFuZ2VzIHRoYXQgYXJlIG1hdGNoZWQgaGVyZSBkbyBub3QgY29udGFpbiByZWFsIGdyYXBoaWNzIHJlbmRpdGlvbiBzZXF1ZW5jZXMuIEZvclxuXHRcdFx0XHQgKiB0aGUgc2FrZSBvZiBoYXZpbmcgYSBzaW1wbGVyIGV4cHJlc3Npb24sIHRoZXkgaGF2ZSBiZWVuIGluY2x1ZGVkIGFueXdheS5cblx0XHRcdFx0ICovXG5cdFx0XHRcdGlmIChhbnNpU2VxdWVuY2UubWF0Y2goL14oPzpbMzRdWzAtOF18OVswLTddfDEwWzAtN118WzAtOV18MlsxLTUsNy05XXxbMzRdOXw1WzgsOV18MVswLTldKSg/OjtbMzQ5XVswLTddfDEwWzAtN118WzAxM118WzI0NV18WzM0XTkpPyg/OjtbMDEyXT9bMC05XT9bMC05XSkqOz9tJC8pKSB7XG5cblx0XHRcdFx0XHRjb25zdCBzdHlsZUNvZGVzOiBudW1iZXJbXSA9IGFuc2lTZXF1ZW5jZS5zbGljZSgwLCAtMSkgLy8gUmVtb3ZlIGZpbmFsICdtJyBjaGFyYWN0ZXIuXG5cdFx0XHRcdFx0XHQuc3BsaXQoJzsnKVx0XHRcdFx0XHRcdFx0XHRcdFx0ICAgLy8gU2VwYXJhdGUgc3R5bGUgY29kZXMuXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGVsZW0gPT4gZWxlbSAhPT0gJycpXHRcdFx0ICAgICAgICAgICAvLyBGaWx0ZXIgZW1wdHkgZWxlbXMgYXMgJzM0O20nIC0+IFsnMzQnLCAnJ10uXG5cdFx0XHRcdFx0XHQubWFwKGVsZW0gPT4gcGFyc2VJbnQoZWxlbSwgMTApKTtcdFx0ICAgICAgICAgICAvLyBDb252ZXJ0IHRvIG51bWJlcnMuXG5cblx0XHRcdFx0XHRpZiAoc3R5bGVDb2Rlc1swXSA9PT0gMzggfHwgc3R5bGVDb2Rlc1swXSA9PT0gNDggfHwgc3R5bGVDb2Rlc1swXSA9PT0gNTgpIHtcblx0XHRcdFx0XHRcdC8vIEFkdmFuY2VkIGNvbG9yIGNvZGUgLSBjYW4ndCBiZSBjb21iaW5lZCB3aXRoIGZvcm1hdHRpbmcgY29kZXMgbGlrZSBzaW1wbGUgY29sb3JzIGNhblxuXHRcdFx0XHRcdFx0Ly8gSWdub3JlcyBpbnZhbGlkIGNvbG9ycyBhbmQgYWRkaXRpb25hbCBpbmZvIGJleW9uZCB3aGF0IGlzIG5lY2Vzc2FyeVxuXHRcdFx0XHRcdFx0Y29uc3QgY29sb3JUeXBlID0gKHN0eWxlQ29kZXNbMF0gPT09IDM4KSA/ICdmb3JlZ3JvdW5kJyA6ICgoc3R5bGVDb2Rlc1swXSA9PT0gNDgpID8gJ2JhY2tncm91bmQnIDogJ3VuZGVybGluZScpO1xuXG5cdFx0XHRcdFx0XHRpZiAoc3R5bGVDb2Rlc1sxXSA9PT0gNSkge1xuXHRcdFx0XHRcdFx0XHRzZXQ4Qml0Q29sb3Ioc3R5bGVDb2RlcywgY29sb3JUeXBlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoc3R5bGVDb2Rlc1sxXSA9PT0gMikge1xuXHRcdFx0XHRcdFx0XHRzZXQyNEJpdENvbG9yKHN0eWxlQ29kZXMsIGNvbG9yVHlwZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNldEJhc2ljRm9ybWF0dGVycyhzdHlsZUNvZGVzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBVbnN1cHBvcnRlZCBzZXF1ZW5jZSBzbyBzaW1wbHkgaGlkZSBpdC5cblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50UG9zID0gc3RhcnRQb3M7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlcXVlbmNlRm91bmQgPT09IGZhbHNlKSB7XG5cdFx0XHRidWZmZXIgKz0gdGV4dC5jaGFyQXQoY3VycmVudFBvcyk7XG5cdFx0XHRjdXJyZW50UG9zKys7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRmx1c2ggcmVtYWluaW5nIHRleHQgYnVmZmVyIGlmIG5vdCBlbXB0eS5cblx0aWYgKGJ1ZmZlcikge1xuXHRcdGFwcGVuZFN0eWxpemVkU3RyaW5nVG9Db250YWluZXIocm9vdCwgYnVmZmVyLCBzdHlsZU5hbWVzLCBsaW5rRGV0ZWN0b3IsIHdvcmtzcGFjZUZvbGRlciwgY3VzdG9tRmdDb2xvciwgY3VzdG9tQmdDb2xvciwgY3VzdG9tVW5kZXJsaW5lQ29sb3IsIGhpZ2hsaWdodHMsIGN1cnJlbnRQb3MgLSBidWZmZXIubGVuZ3RoLCBob3ZlckJlaGF2aW9yKTtcblx0fVxuXG5cdHJldHVybiByb290O1xuXG5cdC8qKlxuXHQgKiBDaGFuZ2UgdGhlIGZvcmVncm91bmQgb3IgYmFja2dyb3VuZCBjb2xvciBieSBjbGVhcmluZyB0aGUgY3VycmVudCBjb2xvclxuXHQgKiBhbmQgYWRkaW5nIHRoZSBuZXcgb25lLlxuXHQgKiBAcGFyYW0gY29sb3JUeXBlIElmIGAnZm9yZWdyb3VuZCdgLCB3aWxsIGNoYW5nZSB0aGUgZm9yZWdyb3VuZCBjb2xvciwgaWZcblx0ICogXHRgJ2JhY2tncm91bmQnYCwgd2lsbCBjaGFuZ2UgdGhlIGJhY2tncm91bmQgY29sb3IsIGFuZCBpZiBgJ3VuZGVybGluZSdgXG5cdCAqIHdpbGwgc2V0IHRoZSB1bmRlcmxpbmUgY29sb3IuXG5cdCAqIEBwYXJhbSBjb2xvciBDb2xvciB0byBjaGFuZ2UgdG8uIElmIGB1bmRlZmluZWRgIG9yIG5vdCBwcm92aWRlZCxcblx0ICogd2lsbCBjbGVhciBjdXJyZW50IGNvbG9yIHdpdGhvdXQgYWRkaW5nIGEgbmV3IG9uZS5cblx0ICovXG5cdGZ1bmN0aW9uIGNoYW5nZUNvbG9yKGNvbG9yVHlwZTogJ2ZvcmVncm91bmQnIHwgJ2JhY2tncm91bmQnIHwgJ3VuZGVybGluZScsIGNvbG9yPzogUkdCQSB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChjb2xvclR5cGUgPT09ICdmb3JlZ3JvdW5kJykge1xuXHRcdFx0Y3VzdG9tRmdDb2xvciA9IGNvbG9yO1xuXHRcdH0gZWxzZSBpZiAoY29sb3JUeXBlID09PSAnYmFja2dyb3VuZCcpIHtcblx0XHRcdGN1c3RvbUJnQ29sb3IgPSBjb2xvcjtcblx0XHR9IGVsc2UgaWYgKGNvbG9yVHlwZSA9PT0gJ3VuZGVybGluZScpIHtcblx0XHRcdGN1c3RvbVVuZGVybGluZUNvbG9yID0gY29sb3I7XG5cdFx0fVxuXHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtJHtjb2xvclR5cGV9LWNvbG9yZWRgKTtcblx0XHRpZiAoY29sb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3R5bGVOYW1lcy5wdXNoKGBjb2RlLSR7Y29sb3JUeXBlfS1jb2xvcmVkYCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN3YXAgZm9yZWdyb3VuZCBhbmQgYmFja2dyb3VuZCBjb2xvcnMuICBVc2VkIGZvciBjb2xvciBpbnZlcnNpb24uICBDYWxsZXIgc2hvdWxkIGNoZWNrXG5cdCAqIFtdIGZsYWcgdG8gbWFrZSBzdXJlIGl0IGlzIGFwcHJvcHJpYXRlIHRvIHR1cm4gT04gb3IgT0ZGIChpZiBpdCBpcyBhbHJlYWR5IGludmVydGVkIGRvbid0IGNhbGxcblx0ICovXG5cdGZ1bmN0aW9uIHJldmVyc2VGb3JlZ3JvdW5kQW5kQmFja2dyb3VuZENvbG9ycygpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRGZ0NvbG9yID0gY3VzdG9tRmdDb2xvcjtcblx0XHRjaGFuZ2VDb2xvcignZm9yZWdyb3VuZCcsIGN1c3RvbUJnQ29sb3IpO1xuXHRcdGNoYW5nZUNvbG9yKCdiYWNrZ3JvdW5kJywgb2xkRmdDb2xvcik7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsY3VsYXRlIGFuZCBzZXQgYmFzaWMgQU5TSSBmb3JtYXR0aW5nLiBTdXBwb3J0cyBPTi9PRkYgb2YgYm9sZCwgaXRhbGljLCB1bmRlcmxpbmUsXG5cdCAqIGRvdWJsZSB1bmRlcmxpbmUsICBjcm9zc2VkLW91dC9zdHJpa2V0aHJvdWdoLCBvdmVybGluZSwgZGltLCBibGluaywgcmFwaWQgYmxpbmssXG5cdCAqIHJldmVyc2UvaW52ZXJ0IHZpZGVvLCBoaWRkZW4sIHN1cGVyc2NyaXB0LCBzdWJzY3JpcHQgYW5kIGFsdGVybmF0ZSBmb250IGNvZGVzLFxuXHQgKiBjbGVhcmluZy9yZXNldHRpbmcgb2YgZm9yZWdyb3VuZCwgYmFja2dyb3VuZCBhbmQgdW5kZXJsaW5lIGNvbG9ycyxcblx0ICogc2V0dGluZyBub3JtYWwgZm9yZWdyb3VuZCBhbmQgYmFja2dyb3VuZCBjb2xvcnMsIGFuZCBicmlnaHQgZm9yZWdyb3VuZCBhbmRcblx0ICogYmFja2dyb3VuZCBjb2xvcnMuIE5vdCB0byBiZSB1c2VkIGZvciBjb2RlcyBjb250YWluaW5nIGFkdmFuY2VkIGNvbG9ycy5cblx0ICogV2lsbCBpZ25vcmUgaW52YWxpZCBjb2Rlcy5cblx0ICogQHBhcmFtIHN0eWxlQ29kZXMgQXJyYXkgb2YgQU5TSSBiYXNpYyBzdHlsaW5nIG51bWJlcnMsIHdoaWNoIHdpbGwgYmVcblx0ICogYXBwbGllZCBpbiBvcmRlci4gTmV3IGNvbG9ycyBhbmQgYmFja2dyb3VuZHMgY2xlYXIgb2xkIG9uZXM7IG5ldyBmb3JtYXR0aW5nXG5cdCAqIGRvZXMgbm90LlxuXHQgKiBAc2VlIHtAbGluayBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI1NHUiB9XG5cdCAqL1xuXHRmdW5jdGlvbiBzZXRCYXNpY0Zvcm1hdHRlcnMoc3R5bGVDb2RlczogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNvZGUgb2Ygc3R5bGVDb2Rlcykge1xuXHRcdFx0c3dpdGNoIChjb2RlKSB7XG5cdFx0XHRcdGNhc2UgMDogeyAgLy8gcmVzZXQgKGV2ZXJ5dGhpbmcpXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IFtdO1xuXHRcdFx0XHRcdGN1c3RvbUZnQ29sb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y3VzdG9tQmdDb2xvciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDE6IHsgLy8gYm9sZFxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtYm9sZGApO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1ib2xkJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyOiB7IC8vIGRpbVxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtZGltYCk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLWRpbScpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMzogeyAvLyBpdGFsaWNcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLWl0YWxpY2ApO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1pdGFsaWMnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDQ6IHsgLy8gdW5kZXJsaW5lXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtdW5kZXJsaW5lYCAmJiBzdHlsZSAhPT0gYGNvZGUtZG91YmxlLXVuZGVybGluZWApKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtdW5kZXJsaW5lJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA1OiB7IC8vIGJsaW5rXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IHN0eWxlICE9PSBgY29kZS1ibGlua2ApO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1ibGluaycpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgNjogeyAvLyByYXBpZCBibGlua1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtcmFwaWQtYmxpbmtgKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtcmFwaWQtYmxpbmsnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDc6IHsgLy8gaW52ZXJ0IGZvcmVncm91bmQgYW5kIGJhY2tncm91bmRcblx0XHRcdFx0XHRpZiAoIWNvbG9yc0ludmVydGVkKSB7XG5cdFx0XHRcdFx0XHRjb2xvcnNJbnZlcnRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXZlcnNlRm9yZWdyb3VuZEFuZEJhY2tncm91bmRDb2xvcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA4OiB7IC8vIGhpZGRlblxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtaGlkZGVuYCk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLWhpZGRlbicpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgOTogeyAvLyBzdHJpa2UtdGhyb3VnaC9jcm9zc2VkLW91dFxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtc3RyaWtlLXRocm91Z2hgKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtc3RyaWtlLXRocm91Z2gnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDEwOiB7IC8vIG5vcm1hbCBkZWZhdWx0IGZvbnRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gIXN0eWxlLnN0YXJ0c1dpdGgoJ2NvZGUtZm9udCcpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDExOiBjYXNlIDEyOiBjYXNlIDEzOiBjYXNlIDE0OiBjYXNlIDE1OiBjYXNlIDE2OiBjYXNlIDE3OiBjYXNlIDE4OiBjYXNlIDE5OiBjYXNlIDIwOiB7IC8vIGZvbnQgY29kZXMgKGFuZCAyMCBpcyAnYmxhY2tsZXR0ZXInIGZvbnQgY29kZSlcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gIXN0eWxlLnN0YXJ0c1dpdGgoJ2NvZGUtZm9udCcpKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goYGNvZGUtZm9udC0ke2NvZGUgLSAxMH1gKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDIxOiB7IC8vIGRvdWJsZSB1bmRlcmxpbmVcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gKHN0eWxlICE9PSBgY29kZS11bmRlcmxpbmVgICYmIHN0eWxlICE9PSBgY29kZS1kb3VibGUtdW5kZXJsaW5lYCkpO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1kb3VibGUtdW5kZXJsaW5lJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyMjogeyAvLyBub3JtYWwgaW50ZW5zaXR5IChib2xkIG9mZiBhbmQgZGltIG9mZilcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gKHN0eWxlICE9PSBgY29kZS1ib2xkYCAmJiBzdHlsZSAhPT0gYGNvZGUtZGltYCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMjM6IHsgLy8gTmVpdGhlciBpdGFsaWMgb3IgYmxhY2tsZXR0ZXIgKGZvbnQgMTApXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtaXRhbGljYCAmJiBzdHlsZSAhPT0gYGNvZGUtZm9udC0xMGApKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDI0OiB7IC8vIG5vdCB1bmRlcmxpbmVkIChOZWl0aGVyIHNpbmdseSBub3IgZG91Ymx5IHVuZGVybGluZWQpXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtdW5kZXJsaW5lYCAmJiBzdHlsZSAhPT0gYGNvZGUtZG91YmxlLXVuZGVybGluZWApKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDI1OiB7IC8vIG5vdCBibGlua2luZ1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiAoc3R5bGUgIT09IGBjb2RlLWJsaW5rYCAmJiBzdHlsZSAhPT0gYGNvZGUtcmFwaWQtYmxpbmtgKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyNzogeyAvLyBub3QgcmV2ZXJzZWQvaW52ZXJ0ZWRcblx0XHRcdFx0XHRpZiAoY29sb3JzSW52ZXJ0ZWQpIHtcblx0XHRcdFx0XHRcdGNvbG9yc0ludmVydGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRyZXZlcnNlRm9yZWdyb3VuZEFuZEJhY2tncm91bmRDb2xvcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyODogeyAvLyBub3QgaGlkZGVuIChyZXZlYWwpXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IHN0eWxlICE9PSBgY29kZS1oaWRkZW5gKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDI5OiB7IC8vIG5vdCBjcm9zc2VkLW91dFxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtc3RyaWtlLXRocm91Z2hgKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDUzOiB7IC8vIG92ZXJsaW5lZFxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtb3ZlcmxpbmVgKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtb3ZlcmxpbmUnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDU1OiB7IC8vIG5vdCBvdmVybGluZWRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLW92ZXJsaW5lYCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAzOTogeyAgLy8gZGVmYXVsdCBmb3JlZ3JvdW5kIGNvbG9yXG5cdFx0XHRcdFx0Y2hhbmdlQ29sb3IoJ2ZvcmVncm91bmQnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgNDk6IHsgIC8vIGRlZmF1bHQgYmFja2dyb3VuZCBjb2xvclxuXHRcdFx0XHRcdGNoYW5nZUNvbG9yKCdiYWNrZ3JvdW5kJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDU5OiB7ICAvLyBkZWZhdWx0IHVuZGVybGluZSBjb2xvclxuXHRcdFx0XHRcdGNoYW5nZUNvbG9yKCd1bmRlcmxpbmUnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgNzM6IHsgLy8gc3VwZXJzY3JpcHRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gKHN0eWxlICE9PSBgY29kZS1zdXBlcnNjcmlwdGAgJiYgc3R5bGUgIT09IGBjb2RlLXN1YnNjcmlwdGApKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtc3VwZXJzY3JpcHQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDc0OiB7IC8vIHN1YnNjcmlwdFxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiAoc3R5bGUgIT09IGBjb2RlLXN1cGVyc2NyaXB0YCAmJiBzdHlsZSAhPT0gYGNvZGUtc3Vic2NyaXB0YCkpO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1zdWJzY3JpcHQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDc1OiB7IC8vIG5laXRoZXIgc3VwZXJzY3JpcHQgb3Igc3Vic2NyaXB0XG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtc3VwZXJzY3JpcHRgICYmIHN0eWxlICE9PSBgY29kZS1zdWJzY3JpcHRgKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdHNldEJhc2ljQ29sb3IoY29kZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FsY3VsYXRlIGFuZCBzZXQgc3R5bGluZyBmb3IgY29tcGxpY2F0ZWQgMjQtYml0IEFOU0kgY29sb3IgY29kZXMuXG5cdCAqIEBwYXJhbSBzdHlsZUNvZGVzIEZ1bGwgbGlzdCBvZiBpbnRlZ2VyIGNvZGVzIHRoYXQgbWFrZSB1cCB0aGUgZnVsbCBBTlNJXG5cdCAqIHNlcXVlbmNlLCBpbmNsdWRpbmcgdGhlIHR3byBkZWZpbmluZyBjb2RlcyBhbmQgdGhlIHRocmVlIFJHQiBjb2Rlcy5cblx0ICogQHBhcmFtIGNvbG9yVHlwZSBJZiBgJ2ZvcmVncm91bmQnYCwgd2lsbCBzZXQgZm9yZWdyb3VuZCBjb2xvciwgaWZcblx0ICogYCdiYWNrZ3JvdW5kJ2AsIHdpbGwgc2V0IGJhY2tncm91bmQgY29sb3IsIGFuZCBpZiBpdCBpcyBgJ3VuZGVybGluZSdgXG5cdCAqIHdpbGwgc2V0IHRoZSB1bmRlcmxpbmUgY29sb3IuXG5cdCAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjMjQtYml0IH1cblx0ICovXG5cdGZ1bmN0aW9uIHNldDI0Qml0Q29sb3Ioc3R5bGVDb2RlczogbnVtYmVyW10sIGNvbG9yVHlwZTogJ2ZvcmVncm91bmQnIHwgJ2JhY2tncm91bmQnIHwgJ3VuZGVybGluZScpOiB2b2lkIHtcblx0XHRpZiAoc3R5bGVDb2Rlcy5sZW5ndGggPj0gNSAmJlxuXHRcdFx0c3R5bGVDb2Rlc1syXSA+PSAwICYmIHN0eWxlQ29kZXNbMl0gPD0gMjU1ICYmXG5cdFx0XHRzdHlsZUNvZGVzWzNdID49IDAgJiYgc3R5bGVDb2Rlc1szXSA8PSAyNTUgJiZcblx0XHRcdHN0eWxlQ29kZXNbNF0gPj0gMCAmJiBzdHlsZUNvZGVzWzRdIDw9IDI1NSkge1xuXHRcdFx0Y29uc3QgY3VzdG9tQ29sb3IgPSBuZXcgUkdCQShzdHlsZUNvZGVzWzJdLCBzdHlsZUNvZGVzWzNdLCBzdHlsZUNvZGVzWzRdKTtcblx0XHRcdGNoYW5nZUNvbG9yKGNvbG9yVHlwZSwgY3VzdG9tQ29sb3IpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxjdWxhdGUgYW5kIHNldCBzdHlsaW5nIGZvciBhZHZhbmNlZCA4LWJpdCBBTlNJIGNvbG9yIGNvZGVzLlxuXHQgKiBAcGFyYW0gc3R5bGVDb2RlcyBGdWxsIGxpc3Qgb2YgaW50ZWdlciBjb2RlcyB0aGF0IG1ha2UgdXAgdGhlIEFOU0lcblx0ICogc2VxdWVuY2UsIGluY2x1ZGluZyB0aGUgdHdvIGRlZmluaW5nIGNvZGVzIGFuZCB0aGUgb25lIGNvbG9yIGNvZGUuXG5cdCAqIEBwYXJhbSBjb2xvclR5cGUgSWYgYCdmb3JlZ3JvdW5kJ2AsIHdpbGwgc2V0IGZvcmVncm91bmQgY29sb3IsIGlmXG5cdCAqIGAnYmFja2dyb3VuZCdgLCB3aWxsIHNldCBiYWNrZ3JvdW5kIGNvbG9yIGFuZCBpZiBpdCBpcyBgJ3VuZGVybGluZSdgXG5cdCAqIHdpbGwgc2V0IHRoZSB1bmRlcmxpbmUgY29sb3IuXG5cdCAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjOC1iaXQgfVxuXHQgKi9cblx0ZnVuY3Rpb24gc2V0OEJpdENvbG9yKHN0eWxlQ29kZXM6IG51bWJlcltdLCBjb2xvclR5cGU6ICdmb3JlZ3JvdW5kJyB8ICdiYWNrZ3JvdW5kJyB8ICd1bmRlcmxpbmUnKTogdm9pZCB7XG5cdFx0bGV0IGNvbG9yTnVtYmVyID0gc3R5bGVDb2Rlc1syXTtcblx0XHRjb25zdCBjb2xvciA9IGNhbGNBTlNJOGJpdENvbG9yKGNvbG9yTnVtYmVyKTtcblxuXHRcdGlmIChjb2xvcikge1xuXHRcdFx0Y2hhbmdlQ29sb3IoY29sb3JUeXBlLCBjb2xvcik7XG5cdFx0fSBlbHNlIGlmIChjb2xvck51bWJlciA+PSAwICYmIGNvbG9yTnVtYmVyIDw9IDE1KSB7XG5cdFx0XHRpZiAoY29sb3JUeXBlID09PSAndW5kZXJsaW5lJykge1xuXHRcdFx0XHQvLyBmb3IgdW5kZXJsaW5lIGNvbG9ycyB3ZSBqdXN0IGRlY29kZSB0aGUgMC0xNSBjb2xvciBudW1iZXIgdG8gdGhlbWUgY29sb3IsIHNldCBhbmQgcmV0dXJuXG5cdFx0XHRcdGNvbnN0IGNvbG9yTmFtZSA9IGFuc2lDb2xvcklkZW50aWZpZXJzW2NvbG9yTnVtYmVyXTtcblx0XHRcdFx0Y2hhbmdlQ29sb3IoY29sb3JUeXBlLCBgLS12c2NvZGUtZGVidWctYW5zaS0ke2NvbG9yTmFtZX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTmVlZCB0byBtYXAgdG8gb25lIG9mIHRoZSBmb3VyIGJhc2ljIGNvbG9yIHJhbmdlcyAoMzAtMzcsIDkwLTk3LCA0MC00NywgMTAwLTEwNylcblx0XHRcdGNvbG9yTnVtYmVyICs9IDMwO1xuXHRcdFx0aWYgKGNvbG9yTnVtYmVyID49IDM4KSB7XG5cdFx0XHRcdC8vIEJyaWdodCBjb2xvcnNcblx0XHRcdFx0Y29sb3JOdW1iZXIgKz0gNTI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29sb3JUeXBlID09PSAnYmFja2dyb3VuZCcpIHtcblx0XHRcdFx0Y29sb3JOdW1iZXIgKz0gMTA7XG5cdFx0XHR9XG5cdFx0XHRzZXRCYXNpY0NvbG9yKGNvbG9yTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FsY3VsYXRlIGFuZCBzZXQgc3R5bGluZyBmb3IgYmFzaWMgYnJpZ2h0IGFuZCBkYXJrIEFOU0kgY29sb3IgY29kZXMuIFVzZXNcblx0ICogdGhlbWUgY29sb3JzIGlmIGF2YWlsYWJsZS4gQXV0b21hdGljYWxseSBkaXN0aW5ndWlzaGVzIGJldHdlZW4gZm9yZWdyb3VuZFxuXHQgKiBhbmQgYmFja2dyb3VuZCBjb2xvcnM7IGRvZXMgbm90IHN1cHBvcnQgY29sb3ItY2xlYXJpbmcgY29kZXMgMzkgYW5kIDQ5LlxuXHQgKiBAcGFyYW0gc3R5bGVDb2RlIEludGVnZXIgY29sb3IgY29kZSBvbiBvbmUgb2YgdGhlIGZvbGxvd2luZyByYW5nZXM6XG5cdCAqIFszMC0zNywgOTAtOTcsIDQwLTQ3LCAxMDAtMTA3XS4gSWYgbm90IG9uIG9uZSBvZiB0aGVzZSByYW5nZXMsIHdpbGwgZG9cblx0ICogbm90aGluZy5cblx0ICovXG5cdGZ1bmN0aW9uIHNldEJhc2ljQ29sb3Ioc3R5bGVDb2RlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRsZXQgY29sb3JUeXBlOiAnZm9yZWdyb3VuZCcgfCAnYmFja2dyb3VuZCcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbG9ySW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzdHlsZUNvZGUgPj0gMzAgJiYgc3R5bGVDb2RlIDw9IDM3KSB7XG5cdFx0XHRjb2xvckluZGV4ID0gc3R5bGVDb2RlIC0gMzA7XG5cdFx0XHRjb2xvclR5cGUgPSAnZm9yZWdyb3VuZCc7XG5cdFx0fSBlbHNlIGlmIChzdHlsZUNvZGUgPj0gOTAgJiYgc3R5bGVDb2RlIDw9IDk3KSB7XG5cdFx0XHRjb2xvckluZGV4ID0gKHN0eWxlQ29kZSAtIDkwKSArIDg7IC8vIEhpZ2gtaW50ZW5zaXR5IChicmlnaHQpXG5cdFx0XHRjb2xvclR5cGUgPSAnZm9yZWdyb3VuZCc7XG5cdFx0fSBlbHNlIGlmIChzdHlsZUNvZGUgPj0gNDAgJiYgc3R5bGVDb2RlIDw9IDQ3KSB7XG5cdFx0XHRjb2xvckluZGV4ID0gc3R5bGVDb2RlIC0gNDA7XG5cdFx0XHRjb2xvclR5cGUgPSAnYmFja2dyb3VuZCc7XG5cdFx0fSBlbHNlIGlmIChzdHlsZUNvZGUgPj0gMTAwICYmIHN0eWxlQ29kZSA8PSAxMDcpIHtcblx0XHRcdGNvbG9ySW5kZXggPSAoc3R5bGVDb2RlIC0gMTAwKSArIDg7IC8vIEhpZ2gtaW50ZW5zaXR5IChicmlnaHQpXG5cdFx0XHRjb2xvclR5cGUgPSAnYmFja2dyb3VuZCc7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbG9ySW5kZXggIT09IHVuZGVmaW5lZCAmJiBjb2xvclR5cGUpIHtcblx0XHRcdGNvbnN0IGNvbG9yTmFtZSA9IGFuc2lDb2xvcklkZW50aWZpZXJzW2NvbG9ySW5kZXhdO1xuXHRcdFx0Y2hhbmdlQ29sb3IoY29sb3JUeXBlLCBgLS12c2NvZGUtZGVidWctYW5zaS0ke2NvbG9yTmFtZS5yZXBsYWNlQWxsKCcuJywgJy0nKX1gKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0gcm9vdCBUaGUge0BsaW5rIEhUTUxFbGVtZW50fSB0byBhcHBlbmQgdGhlIGNvbnRlbnQgdG8uXG4gKiBAcGFyYW0gc3RyaW5nQ29udGVudCBUaGUgdGV4dCBjb250ZW50IHRvIGJlIGFwcGVuZGVkLlxuICogQHBhcmFtIGNzc0NsYXNzZXMgVGhlIGxpc3Qgb2YgQ1NTIHN0eWxlcyB0byBhcHBseSB0byB0aGUgdGV4dCBjb250ZW50LlxuICogQHBhcmFtIGxpbmtEZXRlY3RvciBUaGUge0BsaW5rIElMaW5rRGV0ZWN0b3J9IHJlc3BvbnNpYmxlIGZvciBnZW5lcmF0aW5nIGxpbmtzIGZyb20ge0BwYXJhbSBzdHJpbmdDb250ZW50fS5cbiAqIEBwYXJhbSBjdXN0b21UZXh0Q29sb3IgSWYgcHJvdmlkZWQsIHdpbGwgYXBwbHkgY3VzdG9tIGNvbG9yIHdpdGggaW5saW5lIHN0eWxlLlxuICogQHBhcmFtIGN1c3RvbUJhY2tncm91bmRDb2xvciBJZiBwcm92aWRlZCwgd2lsbCBhcHBseSBjdXN0b20gYmFja2dyb3VuZENvbG9yIHdpdGggaW5saW5lIHN0eWxlLlxuICogQHBhcmFtIGN1c3RvbVVuZGVybGluZUNvbG9yIElmIHByb3ZpZGVkLCB3aWxsIGFwcGx5IGN1c3RvbSB0ZXh0RGVjb3JhdGlvbkNvbG9yIHdpdGggaW5saW5lIHN0eWxlLlxuICogQHBhcmFtIGhpZ2hsaWdodHMgVGhlIHJhbmdlcyB0byBoaWdobGlnaHQuXG4gKiBAcGFyYW0gb2Zmc2V0IFRoZSBzdGFydGluZyBpbmRleCBvZiB0aGUgc3RyaW5nQ29udGVudCBpbiB0aGUgb3JpZ2luYWwgdGV4dC5cbiAqIEBwYXJhbSBob3ZlckJlaGF2aW9yIGhvdmVyIGJlaGF2aW9yIHdpdGggZGlzcG9zYWJsZSBzdG9yZSBmb3IgbWFuYWdpbmcgZXZlbnQgbGlzdGVuZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kU3R5bGl6ZWRTdHJpbmdUb0NvbnRhaW5lcihcblx0cm9vdDogSFRNTEVsZW1lbnQsXG5cdHN0cmluZ0NvbnRlbnQ6IHN0cmluZyxcblx0Y3NzQ2xhc3Nlczogc3RyaW5nW10sXG5cdGxpbmtEZXRlY3RvcjogSUxpbmtEZXRlY3Rvcixcblx0d29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLFxuXHRjdXN0b21UZXh0Q29sb3I6IFJHQkEgfCBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGN1c3RvbUJhY2tncm91bmRDb2xvcjogUkdCQSB8IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0Y3VzdG9tVW5kZXJsaW5lQ29sb3I6IFJHQkEgfCBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGhpZ2hsaWdodHM6IElIaWdobGlnaHRbXSB8IHVuZGVmaW5lZCxcblx0b2Zmc2V0OiBudW1iZXIsXG5cdGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSxcbik6IHZvaWQge1xuXHRpZiAoIXJvb3QgfHwgIXN0cmluZ0NvbnRlbnQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBjb250YWluZXIgPSBsaW5rRGV0ZWN0b3IubGlua2lmeShcblx0XHRzdHJpbmdDb250ZW50LFxuXHRcdGhvdmVyQmVoYXZpb3IsXG5cdFx0dHJ1ZSxcblx0XHR3b3Jrc3BhY2VGb2xkZXIsXG5cdFx0dW5kZWZpbmVkLFxuXHRcdGhpZ2hsaWdodHM/Lm1hcChoID0+ICh7IHN0YXJ0OiBoLnN0YXJ0IC0gb2Zmc2V0LCBlbmQ6IGguZW5kIC0gb2Zmc2V0LCBleHRyYUNsYXNzZXM6IGguZXh0cmFDbGFzc2VzIH0pKSxcblx0KTtcblxuXHRjb250YWluZXIuY2xhc3NOYW1lID0gY3NzQ2xhc3Nlcy5qb2luKCcgJyk7XG5cdGlmIChjdXN0b21UZXh0Q29sb3IpIHtcblx0XHRjb250YWluZXIuc3R5bGUuY29sb3IgPVxuXHRcdFx0dHlwZW9mIGN1c3RvbVRleHRDb2xvciA9PT0gJ3N0cmluZycgPyBgdmFyKCR7Y3VzdG9tVGV4dENvbG9yfSlgIDogQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRSR0IobmV3IENvbG9yKGN1c3RvbVRleHRDb2xvcikpO1xuXHR9XG5cdGlmIChjdXN0b21CYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID1cblx0XHRcdHR5cGVvZiBjdXN0b21CYWNrZ3JvdW5kQ29sb3IgPT09ICdzdHJpbmcnID8gYHZhcigke2N1c3RvbUJhY2tncm91bmRDb2xvcn0pYCA6IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0UkdCKG5ldyBDb2xvcihjdXN0b21CYWNrZ3JvdW5kQ29sb3IpKTtcblx0fVxuXHRpZiAoY3VzdG9tVW5kZXJsaW5lQ29sb3IpIHtcblx0XHRjb250YWluZXIuc3R5bGUudGV4dERlY29yYXRpb25Db2xvciA9XG5cdFx0XHR0eXBlb2YgY3VzdG9tVW5kZXJsaW5lQ29sb3IgPT09ICdzdHJpbmcnID8gYHZhcigke2N1c3RvbVVuZGVybGluZUNvbG9yfSlgIDogQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRSR0IobmV3IENvbG9yKGN1c3RvbVVuZGVybGluZUNvbG9yKSk7XG5cdH1cblxuXHRyb290LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG59XG5cbi8qKlxuICogQ2FsY3VsYXRlIHRoZSBjb2xvciBmcm9tIHRoZSBjb2xvciBzZXQgZGVmaW5lZCBpbiB0aGUgQU5TSSA4LWJpdCBzdGFuZGFyZC5cbiAqIFN0YW5kYXJkIGFuZCBoaWdoIGludGVuc2l0eSBjb2xvcnMgYXJlIG5vdCBkZWZpbmVkIGluIHRoZSBzdGFuZGFyZCBhcyBzcGVjaWZpY1xuICogY29sb3JzLCBzbyB0aGVzZSBhbmQgaW52YWxpZCBjb2xvcnMgcmV0dXJuIGB1bmRlZmluZWRgLlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSM4LWJpdCB9IGZvciBpbmZvLlxuICogQHBhcmFtIGNvbG9yTnVtYmVyIFRoZSBudW1iZXIgKHJhbmdpbmcgZnJvbSAxNiB0byAyNTUpIHJlZmVycmluZyB0byB0aGUgY29sb3JcbiAqIGRlc2lyZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYWxjQU5TSThiaXRDb2xvcihjb2xvck51bWJlcjogbnVtYmVyKTogUkdCQSB8IHVuZGVmaW5lZCB7XG5cdGlmIChjb2xvck51bWJlciAlIDEgIT09IDApIHtcblx0XHQvLyBTaG91bGQgYmUgaW50ZWdlclxuXHRcdHJldHVybjtcblx0fSBpZiAoY29sb3JOdW1iZXIgPj0gMTYgJiYgY29sb3JOdW1iZXIgPD0gMjMxKSB7XG5cdFx0Ly8gQ29udmVydHMgdG8gb25lIG9mIDIxNiBSR0IgY29sb3JzXG5cdFx0Y29sb3JOdW1iZXIgLT0gMTY7XG5cblx0XHRsZXQgYmx1ZTogbnVtYmVyID0gY29sb3JOdW1iZXIgJSA2O1xuXHRcdGNvbG9yTnVtYmVyID0gKGNvbG9yTnVtYmVyIC0gYmx1ZSkgLyA2O1xuXHRcdGxldCBncmVlbjogbnVtYmVyID0gY29sb3JOdW1iZXIgJSA2O1xuXHRcdGNvbG9yTnVtYmVyID0gKGNvbG9yTnVtYmVyIC0gZ3JlZW4pIC8gNjtcblx0XHRsZXQgcmVkOiBudW1iZXIgPSBjb2xvck51bWJlcjtcblxuXHRcdC8vIHJlZCwgZ3JlZW4sIGJsdWUgbm93IHJhbmdlIG9uIFswLCA1XSwgbmVlZCB0byBtYXAgdG8gWzAsMjU1XVxuXHRcdGNvbnN0IGNvbnZGYWN0b3I6IG51bWJlciA9IDI1NSAvIDU7XG5cdFx0Ymx1ZSA9IE1hdGgucm91bmQoYmx1ZSAqIGNvbnZGYWN0b3IpO1xuXHRcdGdyZWVuID0gTWF0aC5yb3VuZChncmVlbiAqIGNvbnZGYWN0b3IpO1xuXHRcdHJlZCA9IE1hdGgucm91bmQocmVkICogY29udkZhY3Rvcik7XG5cblx0XHRyZXR1cm4gbmV3IFJHQkEocmVkLCBncmVlbiwgYmx1ZSk7XG5cdH0gZWxzZSBpZiAoY29sb3JOdW1iZXIgPj0gMjMyICYmIGNvbG9yTnVtYmVyIDw9IDI1NSkge1xuXHRcdC8vIENvbnZlcnRzIHRvIGEgZ3JheXNjYWxlIHZhbHVlXG5cdFx0Y29sb3JOdW1iZXIgLT0gMjMyO1xuXHRcdGNvbnN0IGNvbG9yTGV2ZWw6IG51bWJlciA9IE1hdGgucm91bmQoY29sb3JOdW1iZXIgLyAyMyAqIDI1NSk7XG5cdFx0cmV0dXJuIG5ldyBSR0JBKGNvbG9yTGV2ZWwsIGNvbG9yTGV2ZWwsIGNvbG9yTGV2ZWwpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybjtcblx0fVxufVxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBhcmVhcyA9IFtcblx0XHR7IHNlbGVjdG9yOiAnLm1vbmFjby13b3JrYmVuY2ggLnNpZGViYXIsIC5tb25hY28td29ya2JlbmNoIC5hdXhpbGlhcnliYXInLCBiZzogdGhlbWUuZ2V0Q29sb3IoU0lERV9CQVJfQkFDS0dST1VORCkgfSxcblx0XHR7IHNlbGVjdG9yOiAnLm1vbmFjby13b3JrYmVuY2ggLnBhbmVsJywgYmc6IHRoZW1lLmdldENvbG9yKFBBTkVMX0JBQ0tHUk9VTkQpIH0sXG5cdFx0eyBzZWxlY3RvcjogJy5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQnLCBiZzogdGhlbWUuZ2V0Q29sb3IobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkgfSxcblx0XHR7IHNlbGVjdG9yOiAnLm1vbmFjby13b3JrYmVuY2ggLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkJywgYmc6IHRoZW1lLmdldENvbG9yKGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZCkgfSxcblx0XHR7IHNlbGVjdG9yOiAnLm1vbmFjby13b3JrYmVuY2ggLm1vbmFjby1saXN0OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCcsIGJnOiB0aGVtZS5nZXRDb2xvcihsaXN0Rm9jdXNCYWNrZ3JvdW5kKSB9LFxuXHRcdHsgc2VsZWN0b3I6ICcubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Q6Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCcsIGJnOiB0aGVtZS5nZXRDb2xvcihsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkgfSxcblx0XHR7IHNlbGVjdG9yOiAnLmRlYnVnLWhvdmVyLXdpZGdldCcsIGJnOiB0aGVtZS5nZXRDb2xvcihlZGl0b3JIb3ZlckJhY2tncm91bmQpIH0sXG5cdF07XG5cblx0Zm9yIChjb25zdCB7IHNlbGVjdG9yLCBiZyB9IG9mIGFyZWFzKSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGFuc2lDb2xvcklkZW50aWZpZXJzXG5cdFx0XHQubWFwKGNvbG9yID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gdGhlbWUuZ2V0Q29sb3IoY29sb3IpO1xuXHRcdFx0XHRpZiAoIWFjdHVhbCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdC8vIHRoaXMgdXNlcyB0aGUgZGVmYXVsdCBjb250cmFzdCByYXRpbyBvZiA0IChmcm9tIHRoZSB0ZXJtaW5hbCksXG5cdFx0XHRcdC8vIHdlIG1heSB3YW50IHRvIG1ha2UgdGhpcyBjb25maWd1cmFibGUgaW4gdGhlIGZ1dHVyZSwgYnV0IHRoaXMgaXNcblx0XHRcdFx0Ly8gZ29vZCB0byBrZWVwIHRoaW5ncyBzYW5lIHRvIHN0YXJ0IHdpdGguXG5cdFx0XHRcdHJldHVybiBgLS12c2NvZGUtZGVidWctYW5zaS0ke2NvbG9yLnJlcGxhY2VBbGwoJy4nLCAnLScpfToke2JnID8gYmcuZW5zdXJlQ29uc3RyYXN0KGFjdHVhbCwgNCkgOiBhY3R1YWx9YDtcblx0XHRcdH0pXG5cdFx0XHQuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgJHtzZWxlY3Rvcn0geyAke2NvbnRlbnQuam9pbignOycpfSB9YCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxPQUFPLFlBQVk7QUFDNUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUIsK0JBQStCLHFCQUFxQiw2QkFBNkIsdUNBQXVDO0FBQ3hKLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsa0JBQWtCLDJCQUEyQjtBQUN0RCxTQUFTLDRCQUE0QjtBQU85QixTQUFTLGlCQUFpQixNQUFjLGNBQTZCLGlCQUErQyxZQUFzQyxlQUFnRTtBQUVoTyxRQUFNLE9BQXdCLFNBQVMsY0FBYyxNQUFNO0FBQzNELFFBQU0sYUFBcUIsS0FBSztBQUVoQyxNQUFJLGFBQXVCLENBQUM7QUFDNUIsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSSxpQkFBMEI7QUFDOUIsTUFBSSxhQUFxQjtBQUN6QixNQUFJLGlCQUFpQjtBQUNyQixNQUFJLFNBQWlCO0FBRXJCLFNBQU8sYUFBYSxZQUFZO0FBRS9CLFFBQUksZ0JBQXlCO0FBSTdCLFFBQUksS0FBSyxXQUFXLFVBQVUsTUFBTSxNQUFN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
