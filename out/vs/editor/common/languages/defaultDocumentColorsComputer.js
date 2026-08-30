import { Color, HSLA } from "../../../base/common/color.js";
function _parseCaptureGroups(captureGroups) {
  const values = [];
  for (const captureGroup of captureGroups) {
    const parsedNumber = Number(captureGroup);
    if (parsedNumber || parsedNumber === 0 && captureGroup.replace(/\s/g, "") !== "") {
      values.push(parsedNumber);
    }
  }
  return values;
}
function _toIColor(r, g, b, a) {
  return {
    red: r / 255,
    blue: b / 255,
    green: g / 255,
    alpha: a
  };
}
function _findRange(model, match) {
  const index = match.index;
  const length = match[0].length;
  if (index === void 0) {
    return;
  }
  const startPosition = model.positionAt(index);
  const range = {
    startLineNumber: startPosition.lineNumber,
    startColumn: startPosition.column,
    endLineNumber: startPosition.lineNumber,
    endColumn: startPosition.column + length
  };
  return range;
}
function _findHexColorInformation(range, hexValue) {
  if (!range) {
    return;
  }
  const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
  if (!parsedHexColor) {
    return;
  }
  return {
    range,
    color: _toIColor(parsedHexColor.rgba.r, parsedHexColor.rgba.g, parsedHexColor.rgba.b, parsedHexColor.rgba.a)
  };
}
function _findRGBColorInformation(range, matches, isAlpha) {
  if (!range || matches.length !== 1) {
    return;
  }
  const match = matches[0];
  const captureGroups = match.values();
  const parsedRegex = _parseCaptureGroups(captureGroups);
  return {
    range,
    color: _toIColor(parsedRegex[0], parsedRegex[1], parsedRegex[2], isAlpha ? parsedRegex[3] : 1)
  };
}
function _findHSLColorInformation(range, matches, isAlpha) {
  if (!range || matches.length !== 1) {
    return;
  }
  const match = matches[0];
  const captureGroups = match.values();
  const parsedRegex = _parseCaptureGroups(captureGroups);
  const colorEquivalent = new Color(new HSLA(parsedRegex[0], parsedRegex[1] / 100, parsedRegex[2] / 100, isAlpha ? parsedRegex[3] : 1));
  return {
    range,
    color: _toIColor(colorEquivalent.rgba.r, colorEquivalent.rgba.g, colorEquivalent.rgba.b, colorEquivalent.rgba.a)
  };
}
function _findMatches(model, regex) {
  if (typeof model === "string") {
    return [...model.matchAll(regex)];
  } else {
    return model.findMatches(regex);
  }
}
function computeColors(model) {
  const result = [];
  const initialValidationRegex = /\b(rgb|rgba|hsl|hsla)(\([0-9\s,.\%\/]*\))|^(#)([A-Fa-f0-9]{3})\b|^(#)([A-Fa-f0-9]{4})\b|^(#)([A-Fa-f0-9]{6})\b|^(#)([A-Fa-f0-9]{8})\b|(?<=['"\s])(#)([A-Fa-f0-9]{3})\b|(?<=['"\s])(#)([A-Fa-f0-9]{4})\b|(?<=['"\s])(#)([A-Fa-f0-9]{6})\b|(?<=['"\s])(#)([A-Fa-f0-9]{8})\b/gm;
  const initialValidationMatches = _findMatches(model, initialValidationRegex);
  if (initialValidationMatches.length > 0) {
    for (const initialMatch of initialValidationMatches) {
      const initialCaptureGroups = initialMatch.filter((captureGroup) => captureGroup !== void 0);
      const colorScheme = initialCaptureGroups[1];
      const colorParameters = initialCaptureGroups[2];
      if (!colorParameters) {
        continue;
      }
      let colorInformation;
      if (colorScheme === "rgb") {
        const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*\)$/gm;
        colorInformation = _findRGBColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
      } else if (colorScheme === "rgba") {
        const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*(?:[\s,]|[\s]*\/)\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\s*\)$/gm;
        colorInformation = _findRGBColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
      } else if (colorScheme === "hsl") {
        const regexParameters = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*\)$/gm;
        colorInformation = _findHSLColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
      } else if (colorScheme === "hsla") {
        const regexParameters = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*(?:[\s,]|[\s]*\/)\s*(0[.][0-9]+|[.][0-9]+|[01][.]0*|[01])\s*\)$/gm;
        colorInformation = _findHSLColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
      } else if (colorScheme === "#") {
        colorInformation = _findHexColorInformation(_findRange(model, initialMatch), colorScheme + colorParameters);
      }
      if (colorInformation) {
        result.push(colorInformation);
      }
    }
  }
  return result;
}
function computeDefaultDocumentColors(model) {
  if (!model || typeof model.getValue !== "function" || typeof model.positionAt !== "function") {
    return [];
  }
  return computeColors(model);
}
export {
  computeDefaultDocumentColors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VzXFxkZWZhdWx0RG9jdW1lbnRDb2xvcnNDb21wdXRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBDb2xvciwgSFNMQSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29sb3IsIElDb2xvckluZm9ybWF0aW9uIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRG9jdW1lbnRDb2xvckNvbXB1dGVyVGFyZ2V0IHtcblx0Z2V0VmFsdWUoKTogc3RyaW5nO1xuXHRwb3NpdGlvbkF0KG9mZnNldDogbnVtYmVyKTogSVBvc2l0aW9uO1xuXHRmaW5kTWF0Y2hlcyhyZWdleDogUmVnRXhwKTogUmVnRXhwTWF0Y2hBcnJheVtdO1xufVxuXG5mdW5jdGlvbiBfcGFyc2VDYXB0dXJlR3JvdXBzKGNhcHR1cmVHcm91cHM6IEl0ZXJhYmxlSXRlcmF0b3I8c3RyaW5nPikge1xuXHRjb25zdCB2YWx1ZXMgPSBbXTtcblx0Zm9yIChjb25zdCBjYXB0dXJlR3JvdXAgb2YgY2FwdHVyZUdyb3Vwcykge1xuXHRcdGNvbnN0IHBhcnNlZE51bWJlciA9IE51bWJlcihjYXB0dXJlR3JvdXApO1xuXHRcdGlmIChwYXJzZWROdW1iZXIgfHwgcGFyc2VkTnVtYmVyID09PSAwICYmIGNhcHR1cmVHcm91cC5yZXBsYWNlKC9cXHMvZywgJycpICE9PSAnJykge1xuXHRcdFx0dmFsdWVzLnB1c2gocGFyc2VkTnVtYmVyKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHZhbHVlcztcbn1cblxuZnVuY3Rpb24gX3RvSUNvbG9yKHI6IG51bWJlciwgZzogbnVtYmVyLCBiOiBudW1iZXIsIGE6IG51bWJlcik6IElDb2xvciB7XG5cdHJldHVybiB7XG5cdFx0cmVkOiByIC8gMjU1LFxuXHRcdGJsdWU6IGIgLyAyNTUsXG5cdFx0Z3JlZW46IGcgLyAyNTUsXG5cdFx0YWxwaGE6IGFcblx0fTtcbn1cblxuZnVuY3Rpb24gX2ZpbmRSYW5nZShtb2RlbDogSURvY3VtZW50Q29sb3JDb21wdXRlclRhcmdldCwgbWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpOiBJUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRjb25zdCBpbmRleCA9IG1hdGNoLmluZGV4O1xuXHRjb25zdCBsZW5ndGggPSBtYXRjaFswXS5sZW5ndGg7XG5cdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBtb2RlbC5wb3NpdGlvbkF0KGluZGV4KTtcblx0Y29uc3QgcmFuZ2U6IElSYW5nZSA9IHtcblx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0UG9zaXRpb24ubGluZU51bWJlcixcblx0XHRzdGFydENvbHVtbjogc3RhcnRQb3NpdGlvbi5jb2x1bW4sXG5cdFx0ZW5kTGluZU51bWJlcjogc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdGVuZENvbHVtbjogc3RhcnRQb3NpdGlvbi5jb2x1bW4gKyBsZW5ndGhcblx0fTtcblx0cmV0dXJuIHJhbmdlO1xufVxuXG5mdW5jdGlvbiBfZmluZEhleENvbG9ySW5mb3JtYXRpb24ocmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCwgaGV4VmFsdWU6IHN0cmluZykge1xuXHRpZiAoIXJhbmdlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHBhcnNlZEhleENvbG9yID0gQ29sb3IuRm9ybWF0LkNTUy5wYXJzZUhleChoZXhWYWx1ZSk7XG5cdGlmICghcGFyc2VkSGV4Q29sb3IpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cmV0dXJuIHtcblx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0Y29sb3I6IF90b0lDb2xvcihwYXJzZWRIZXhDb2xvci5yZ2JhLnIsIHBhcnNlZEhleENvbG9yLnJnYmEuZywgcGFyc2VkSGV4Q29sb3IucmdiYS5iLCBwYXJzZWRIZXhDb2xvci5yZ2JhLmEpXG5cdH07XG59XG5cbmZ1bmN0aW9uIF9maW5kUkdCQ29sb3JJbmZvcm1hdGlvbihyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBtYXRjaGVzOiBSZWdFeHBNYXRjaEFycmF5W10sIGlzQWxwaGE6IGJvb2xlYW4pIHtcblx0aWYgKCFyYW5nZSB8fCBtYXRjaGVzLmxlbmd0aCAhPT0gMSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBtYXRjaCA9IG1hdGNoZXNbMF07XG5cdGNvbnN0IGNhcHR1cmVHcm91cHMgPSBtYXRjaC52YWx1ZXMoKTtcblx0Y29uc3QgcGFyc2VkUmVnZXggPSBfcGFyc2VDYXB0dXJlR3JvdXBzKGNhcHR1cmVHcm91cHMpO1xuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiByYW5nZSxcblx0XHRjb2xvcjogX3RvSUNvbG9yKHBhcnNlZFJlZ2V4WzBdLCBwYXJzZWRSZWdleFsxXSwgcGFyc2VkUmVnZXhbMl0sIGlzQWxwaGEgPyBwYXJzZWRSZWdleFszXSA6IDEpXG5cdH07XG59XG5cbmZ1bmN0aW9uIF9maW5kSFNMQ29sb3JJbmZvcm1hdGlvbihyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBtYXRjaGVzOiBSZWdFeHBNYXRjaEFycmF5W10sIGlzQWxwaGE6IGJvb2xlYW4pIHtcblx0aWYgKCFyYW5nZSB8fCBtYXRjaGVzLmxlbmd0aCAhPT0gMSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBtYXRjaCA9IG1hdGNoZXNbMF07XG5cdGNvbnN0IGNhcHR1cmVHcm91cHMgPSBtYXRjaC52YWx1ZXMoKTtcblx0Y29uc3QgcGFyc2VkUmVnZXggPSBfcGFyc2VDYXB0dXJlR3JvdXBzKGNhcHR1cmVHcm91cHMpO1xuXHRjb25zdCBjb2xvckVxdWl2YWxlbnQgPSBuZXcgQ29sb3IobmV3IEhTTEEocGFyc2VkUmVnZXhbMF0sIHBhcnNlZFJlZ2V4WzFdIC8gMTAwLCBwYXJzZWRSZWdleFsyXSAvIDEwMCwgaXNBbHBoYSA/IHBhcnNlZFJlZ2V4WzNdIDogMSkpO1xuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiByYW5nZSxcblx0XHRjb2xvcjogX3RvSUNvbG9yKGNvbG9yRXF1aXZhbGVudC5yZ2JhLnIsIGNvbG9yRXF1aXZhbGVudC5yZ2JhLmcsIGNvbG9yRXF1aXZhbGVudC5yZ2JhLmIsIGNvbG9yRXF1aXZhbGVudC5yZ2JhLmEpXG5cdH07XG59XG5cbmZ1bmN0aW9uIF9maW5kTWF0Y2hlcyhtb2RlbDogSURvY3VtZW50Q29sb3JDb21wdXRlclRhcmdldCB8IHN0cmluZywgcmVnZXg6IFJlZ0V4cCk6IFJlZ0V4cE1hdGNoQXJyYXlbXSB7XG5cdGlmICh0eXBlb2YgbW9kZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIFsuLi5tb2RlbC5tYXRjaEFsbChyZWdleCldO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBtb2RlbC5maW5kTWF0Y2hlcyhyZWdleCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcHV0ZUNvbG9ycyhtb2RlbDogSURvY3VtZW50Q29sb3JDb21wdXRlclRhcmdldCk6IElDb2xvckluZm9ybWF0aW9uW10ge1xuXHRjb25zdCByZXN1bHQ6IElDb2xvckluZm9ybWF0aW9uW10gPSBbXTtcblx0Ly8gRWFybHkgdmFsaWRhdGlvbiBmb3IgUkdCIGFuZCBIU0wgKGluY2x1ZGluZyBDU1MgTGV2ZWwgNCBzeW50YXggd2l0aCAvIHNlcGFyYXRvcilcblx0Y29uc3QgaW5pdGlhbFZhbGlkYXRpb25SZWdleCA9IC9cXGIocmdifHJnYmF8aHNsfGhzbGEpKFxcKFswLTlcXHMsLlxcJVxcL10qXFwpKXxeKCMpKFtBLUZhLWYwLTldezN9KVxcYnxeKCMpKFtBLUZhLWYwLTldezR9KVxcYnxeKCMpKFtBLUZhLWYwLTldezZ9KVxcYnxeKCMpKFtBLUZhLWYwLTldezh9KVxcYnwoPzw9WydcIlxcc10pKCMpKFtBLUZhLWYwLTldezN9KVxcYnwoPzw9WydcIlxcc10pKCMpKFtBLUZhLWYwLTldezR9KVxcYnwoPzw9WydcIlxcc10pKCMpKFtBLUZhLWYwLTldezZ9KVxcYnwoPzw9WydcIlxcc10pKCMpKFtBLUZhLWYwLTldezh9KVxcYi9nbTtcblx0Y29uc3QgaW5pdGlhbFZhbGlkYXRpb25NYXRjaGVzID0gX2ZpbmRNYXRjaGVzKG1vZGVsLCBpbml0aWFsVmFsaWRhdGlvblJlZ2V4KTtcblxuXHQvLyBQb3RlbnRpYWwgY29sb3JzIGhhdmUgYmVlbiBmb3VuZCwgdmFsaWRhdGUgdGhlIHBhcmFtZXRlcnNcblx0aWYgKGluaXRpYWxWYWxpZGF0aW9uTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0Zm9yIChjb25zdCBpbml0aWFsTWF0Y2ggb2YgaW5pdGlhbFZhbGlkYXRpb25NYXRjaGVzKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsQ2FwdHVyZUdyb3VwcyA9IGluaXRpYWxNYXRjaC5maWx0ZXIoY2FwdHVyZUdyb3VwID0+IGNhcHR1cmVHcm91cCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGNvbG9yU2NoZW1lID0gaW5pdGlhbENhcHR1cmVHcm91cHNbMV07XG5cdFx0XHRjb25zdCBjb2xvclBhcmFtZXRlcnMgPSBpbml0aWFsQ2FwdHVyZUdyb3Vwc1syXTtcblx0XHRcdGlmICghY29sb3JQYXJhbWV0ZXJzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNvbG9ySW5mb3JtYXRpb247XG5cdFx0XHRpZiAoY29sb3JTY2hlbWUgPT09ICdyZ2InKSB7XG5cdFx0XHRcdC8vIFN1cHBvcnRzIGJvdGggY29tbWEtc2VwYXJhdGVkIChyZ2IoMjU1LCAwLCAwKSkgYW5kIENTUyBMZXZlbCA0IHNwYWNlLXNlcGFyYXRlZCBzeW50YXggKHJnYigyNTUgMCAwKSlcblx0XHRcdFx0Y29uc3QgcmVnZXhQYXJhbWV0ZXJzID0gL15cXChcXHMqKDI1WzAtNV18MlswLTRdWzAtOV18MVswLTldezJ9fFsxLTldWzAtOV18WzAtOV0pXFxzKltcXHMsXVxccyooMjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV17Mn18WzEtOV1bMC05XXxbMC05XSlcXHMqW1xccyxdXFxzKigyNVswLTVdfDJbMC00XVswLTldfDFbMC05XXsyfXxbMS05XVswLTldfFswLTldKVxccypcXCkkL2dtO1xuXHRcdFx0XHRjb2xvckluZm9ybWF0aW9uID0gX2ZpbmRSR0JDb2xvckluZm9ybWF0aW9uKF9maW5kUmFuZ2UobW9kZWwsIGluaXRpYWxNYXRjaCksIF9maW5kTWF0Y2hlcyhjb2xvclBhcmFtZXRlcnMsIHJlZ2V4UGFyYW1ldGVycyksIGZhbHNlKTtcblx0XHRcdH0gZWxzZSBpZiAoY29sb3JTY2hlbWUgPT09ICdyZ2JhJykge1xuXHRcdFx0XHQvLyBTdXBwb3J0cyBib3RoIGNvbW1hLXNlcGFyYXRlZCAocmdiYSgyNTUsIDAsIDAsIDAuNSkpIGFuZCBDU1MgTGV2ZWwgNCBzeW50YXggKHJnYmEoMjU1IDAgMCAvIDAuNSkpXG5cdFx0XHRcdGNvbnN0IHJlZ2V4UGFyYW1ldGVycyA9IC9eXFwoXFxzKigyNVswLTVdfDJbMC00XVswLTldfDFbMC05XXsyfXxbMS05XVswLTldfFswLTldKVxccypbXFxzLF1cXHMqKDI1WzAtNV18MlswLTRdWzAtOV18MVswLTldezJ9fFsxLTldWzAtOV18WzAtOV0pXFxzKltcXHMsXVxccyooMjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV17Mn18WzEtOV1bMC05XXxbMC05XSlcXHMqKD86W1xccyxdfFtcXHNdKlxcLylcXHMqKDBbLl1bMC05XSt8Wy5dWzAtOV0rfFswMV1bLl18WzAxXSlcXHMqXFwpJC9nbTtcblx0XHRcdFx0Y29sb3JJbmZvcm1hdGlvbiA9IF9maW5kUkdCQ29sb3JJbmZvcm1hdGlvbihfZmluZFJhbmdlKG1vZGVsLCBpbml0aWFsTWF0Y2gpLCBfZmluZE1hdGNoZXMoY29sb3JQYXJhbWV0ZXJzLCByZWdleFBhcmFtZXRlcnMpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoY29sb3JTY2hlbWUgPT09ICdoc2wnKSB7XG5cdFx0XHRcdGNvbnN0IHJlZ2V4UGFyYW1ldGVycyA9IC9eXFwoXFxzKigoPzozNjAoPzpcXC4wKyk/fCg/OjM2WzBdfDNbMC01XVswLTldfFsxMl1bMC05XVswLTldfFsxLTldP1swLTldKSg/OlxcLlxcZCspPykpXFxzKltcXHMsXVxccyooMTAwKD86XFwuMCspP3xcXGR7MSwyfVsuXVxcZCp8XFxkezEsMn0pJVxccypbXFxzLF1cXHMqKDEwMCg/OlxcLjArKT98XFxkezEsMn1bLl1cXGQqfFxcZHsxLDJ9KSVcXHMqXFwpJC9nbTtcblx0XHRcdFx0Y29sb3JJbmZvcm1hdGlvbiA9IF9maW5kSFNMQ29sb3JJbmZvcm1hdGlvbihfZmluZFJhbmdlKG1vZGVsLCBpbml0aWFsTWF0Y2gpLCBfZmluZE1hdGNoZXMoY29sb3JQYXJhbWV0ZXJzLCByZWdleFBhcmFtZXRlcnMpLCBmYWxzZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbG9yU2NoZW1lID09PSAnaHNsYScpIHtcblx0XHRcdFx0Ly8gU3VwcG9ydHMgYm90aCBjb21tYS1zZXBhcmF0ZWQgKGhzbGEoMjUzLCAxMDAlLCA1MCUsIDAuNSkpIGFuZCBDU1MgTGV2ZWwgNCBzeW50YXggKGhzbGEoMjUzIDEwMCUgNTAlIC8gMC41KSlcblx0XHRcdFx0Y29uc3QgcmVnZXhQYXJhbWV0ZXJzID0gL15cXChcXHMqKCg/OjM2MCg/OlxcLjArKT98KD86MzZbMF18M1swLTVdWzAtOV18WzEyXVswLTldWzAtOV18WzEtOV0/WzAtOV0pKD86XFwuXFxkKyk/KSlcXHMqW1xccyxdXFxzKigxMDAoPzpcXC4wKyk/fFxcZHsxLDJ9Wy5dXFxkKnxcXGR7MSwyfSklXFxzKltcXHMsXVxccyooMTAwKD86XFwuMCspP3xcXGR7MSwyfVsuXVxcZCp8XFxkezEsMn0pJVxccyooPzpbXFxzLF18W1xcc10qXFwvKVxccyooMFsuXVswLTldK3xbLl1bMC05XSt8WzAxXVsuXTAqfFswMV0pXFxzKlxcKSQvZ207XG5cdFx0XHRcdGNvbG9ySW5mb3JtYXRpb24gPSBfZmluZEhTTENvbG9ySW5mb3JtYXRpb24oX2ZpbmRSYW5nZShtb2RlbCwgaW5pdGlhbE1hdGNoKSwgX2ZpbmRNYXRjaGVzKGNvbG9yUGFyYW1ldGVycywgcmVnZXhQYXJhbWV0ZXJzKSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbG9yU2NoZW1lID09PSAnIycpIHtcblx0XHRcdFx0Y29sb3JJbmZvcm1hdGlvbiA9IF9maW5kSGV4Q29sb3JJbmZvcm1hdGlvbihfZmluZFJhbmdlKG1vZGVsLCBpbml0aWFsTWF0Y2gpLCBjb2xvclNjaGVtZSArIGNvbG9yUGFyYW1ldGVycyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29sb3JJbmZvcm1hdGlvbikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChjb2xvckluZm9ybWF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGFuIGFycmF5IG9mIGFsbCBkZWZhdWx0IGRvY3VtZW50IGNvbG9ycyBpbiB0aGUgcHJvdmlkZWQgZG9jdW1lbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWw6IElEb2N1bWVudENvbG9yQ29tcHV0ZXJUYXJnZXQpOiBJQ29sb3JJbmZvcm1hdGlvbltdIHtcblx0aWYgKCFtb2RlbCB8fCB0eXBlb2YgbW9kZWwuZ2V0VmFsdWUgIT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIG1vZGVsLnBvc2l0aW9uQXQgIT09ICdmdW5jdGlvbicpIHtcblx0XHQvLyBVbmtub3duIGNhbGxlciFcblx0XHRyZXR1cm4gW107XG5cdH1cblx0cmV0dXJuIGNvbXB1dGVDb2xvcnMobW9kZWwpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsU0FBUyxPQUFPLFlBQVk7QUFXNUIsU0FBUyxvQkFBb0IsZUFBeUM7QUFDckUsUUFBTSxTQUFTLENBQUM7QUFDaEIsYUFBVyxnQkFBZ0IsZUFBZTtBQUN6QyxVQUFNLGVBQWUsT0FBTyxZQUFZO0FBQ3hDLFFBQUksZ0JBQWdCLGlCQUFpQixLQUFLLGFBQWEsUUFBUSxPQUFPLEVBQUUsTUFBTSxJQUFJO0FBQ2pGLGFBQU8sS0FBSyxZQUFZO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxVQUFVLEdBQVcsR0FBVyxHQUFXLEdBQW1CO0FBQ3RFLFNBQU87QUFBQSxJQUNOLEtBQUssSUFBSTtBQUFBLElBQ1QsTUFBTSxJQUFJO0FBQUEsSUFDVixPQUFPLElBQUk7QUFBQSxJQUNYLE9BQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLFdBQVcsT0FBcUMsT0FBNkM7QUFDckcsUUFBTSxRQUFRLE1BQU07QUFDcEIsUUFBTSxTQUFTLE1BQU0sQ0FBQyxFQUFFO0FBQ3hCLE1BQUksVUFBVSxRQUFXO0FBQ3hCO0FBQUEsRUFDRDtBQUNBLFFBQU0sZ0JBQWdCLE1BQU0sV0FBVyxLQUFLO0FBQzVDLFFBQU0sUUFBZ0I7QUFBQSxJQUNyQixpQkFBaUIsY0FBYztBQUFBLElBQy9CLGFBQWEsY0FBYztBQUFBLElBQzNCLGVBQWUs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
