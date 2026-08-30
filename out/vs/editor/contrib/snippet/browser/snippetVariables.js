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
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import * as path from "../../../../base/common/path.js";
import { dirname } from "../../../../base/common/resources.js";
import { commonPrefixLength, getLeadingWhitespace, isFalsyOrWhitespace, splitLines } from "../../../../base/common/strings.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { Text } from "./snippetParser.js";
import * as nls from "../../../../nls.js";
import { WORKSPACE_EXTENSION, isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier, isEmptyWorkspaceIdentifier } from "../../../../platform/workspace/common/workspace.js";
const KnownSnippetVariableNames = Object.freeze({
  "CURRENT_YEAR": true,
  "CURRENT_YEAR_SHORT": true,
  "CURRENT_MONTH": true,
  "CURRENT_DATE": true,
  "CURRENT_HOUR": true,
  "CURRENT_MINUTE": true,
  "CURRENT_SECOND": true,
  "CURRENT_MILLISECOND": true,
  "CURRENT_DAY_NAME": true,
  "CURRENT_DAY_NAME_SHORT": true,
  "CURRENT_MONTH_NAME": true,
  "CURRENT_MONTH_NAME_SHORT": true,
  "CURRENT_SECONDS_UNIX": true,
  "CURRENT_MILLISECONDS_UNIX": true,
  "CURRENT_TIMEZONE_OFFSET": true,
  "CURRENT_TIMEZONE_NAME": true,
  "SELECTION": true,
  "CLIPBOARD": true,
  "TM_SELECTED_TEXT": true,
  "TM_CURRENT_LINE": true,
  "TM_CURRENT_WORD": true,
  "TM_LINE_INDEX": true,
  "TM_LINE_NUMBER": true,
  "TM_FILENAME": true,
  "TM_FILENAME_BASE": true,
  "TM_DIRECTORY": true,
  "TM_DIRECTORY_BASE": true,
  "TM_FILEPATH": true,
  "CURSOR_INDEX": true,
  // 0-offset
  "CURSOR_NUMBER": true,
  // 1-offset
  "RELATIVE_FILEPATH": true,
  "BLOCK_COMMENT_START": true,
  "BLOCK_COMMENT_END": true,
  "LINE_COMMENT": true,
  "WORKSPACE_NAME": true,
  "WORKSPACE_FOLDER": true,
  "RANDOM": true,
  "RANDOM_HEX": true,
  "UUID": true
});
class CompositeSnippetVariableResolver {
  constructor(_delegates) {
    this._delegates = _delegates;
  }
  resolve(variable) {
    for (const delegate of this._delegates) {
      const value = delegate.resolve(variable);
      if (value !== void 0) {
        return value;
      }
    }
    return void 0;
  }
}
class SelectionBasedVariableResolver {
  constructor(_model, _selection, _selectionIdx, _overtypingCapturer) {
    this._model = _model;
    this._selection = _selection;
    this._selectionIdx = _selectionIdx;
    this._overtypingCapturer = _overtypingCapturer;
  }
  resolve(variable) {
    const { name } = variable;
    if (name === "SELECTION" || name === "TM_SELECTED_TEXT") {
      let value = this._model.getValueInRange(this._selection) || void 0;
      let isMultiline = this._selection.startLineNumber !== this._selection.endLineNumber;
      if (!value && this._overtypingCapturer) {
        const info = this._overtypingCapturer.getLastOvertypedInfo(this._selectionIdx);
        if (info) {
          value = info.value;
          isMultiline = info.multiline;
        }
      }
      if (value && isMultiline && variable.snippet) {
        const line = this._model.getLineContent(this._selection.startLineNumber);
        const lineLeadingWhitespace = getLeadingWhitespace(line, 0, this._selection.startColumn - 1);
        let varLeadingWhitespace = lineLeadingWhitespace;
        variable.snippet.walk((marker) => {
          if (marker === variable) {
            return false;
          }
          if (marker instanceof Text) {
            varLeadingWhitespace = getLeadingWhitespace(splitLines(marker.value).pop());
          }
          return true;
        });
        const whitespaceCommonLength = commonPrefixLength(varLeadingWhitespace, lineLeadingWhitespace);
        value = value.replace(
          /(\r\n|\r|\n)(.*)/g,
          (m, newline, rest) => `${newline}${varLeadingWhitespace.substr(whitespaceCommonLength)}${rest}`
        );
      }
      return value;
    } else if (name === "TM_CURRENT_LINE") {
      return this._model.getLineContent(this._selection.positionLineNumber);
    } else if (name === "TM_CURRENT_WORD") {
      const info = this._model.getWordAtPosition({
        lineNumber: this._selection.positionLineNumber,
        column: this._selection.positionColumn
      });
      return info && info.word || void 0;
    } else if (name === "TM_LINE_INDEX") {
      return String(this._selection.positionLineNumber - 1);
    } else if (name === "TM_LINE_NUMBER") {
      return String(this._selection.positionLineNumber);
    } else if (name === "CURSOR_INDEX") {
      return String(this._selectionIdx);
    } else if (name === "CURSOR_NUMBER") {
      return String(this._selectionIdx + 1);
    }
    return void 0;
  }
}
class ModelBasedVariableResolver {
  constructor(_labelService, _model) {
    this._labelService = _labelService;
    this._model = _model;
  }
  resolve(variable) {
    const { name } = variable;
    if (name === "TM_FILENAME") {
      return path.basename(this._model.uri.fsPath);
    } else if (name === "TM_FILENAME_BASE") {
      const name2 = path.basename(this._model.uri.fsPath);
      const idx = name2.lastIndexOf(".");
      if (idx <= 0) {
        return name2;
      } else {
        return name2.slice(0, idx);
      }
    } else if (name === "TM_DIRECTORY") {
      if (path.dirname(this._model.uri.fsPath) === ".") {
        return "";
      }
      return this._labelService.getUriLabel(dirname(this._model.uri));
    } else if (name === "TM_DIRECTORY_BASE") {
      if (path.dirname(this._model.uri.fsPath) === ".") {
        return "";
      }
      return path.basename(path.dirname(this._model.uri.fsPath));
    } else if (name === "TM_FILEPATH") {
      return this._labelService.getUriLabel(this._model.uri);
    } else if (name === "RELATIVE_FILEPATH") {
      return this._labelService.getUriLabel(this._model.uri, { relative: true, noPrefix: true });
    }
    return void 0;
  }
}
class ClipboardBasedVariableResolver {
  constructor(_readClipboardText, _selectionIdx, _selectionCount, _spread) {
    this._readClipboardText = _readClipboardText;
    this._selectionIdx = _selectionIdx;
    this._selectionCount = _selectionCount;
    this._spread = _spread;
  }
  resolve(variable) {
    if (variable.name !== "CLIPBOARD") {
      return void 0;
    }
    const clipboardText = this._readClipboardText();
    if (!clipboardText) {
      return void 0;
    }
    if (this._spread) {
      const lines = clipboardText.split(/\r\n|\n|\r/).filter((s) => !isFalsyOrWhitespace(s));
      if (lines.length === this._selectionCount) {
        return lines[this._selectionIdx];
      }
    }
    return clipboardText;
  }
}
let CommentBasedVariableResolver = class {
  constructor(_model, _selection, _languageConfigurationService) {
    this._model = _model;
    this._selection = _selection;
    this._languageConfigurationService = _languageConfigurationService;
  }
  resolve(variable) {
    const { name } = variable;
    const langId = this._model.getLanguageIdAtPosition(this._selection.selectionStartLineNumber, this._selection.selectionStartColumn);
    const config = this._languageConfigurationService.getLanguageConfiguration(langId).comments;
    if (!config) {
      return void 0;
    }
    if (name === "LINE_COMMENT") {
      return config.lineCommentToken || void 0;
    } else if (name === "BLOCK_COMMENT_START") {
      return config.blockCommentStartToken || void 0;
    } else if (name === "BLOCK_COMMENT_END") {
      return config.blockCommentEndToken || void 0;
    }
    return void 0;
  }
};
CommentBasedVariableResolver = __decorateClass([
  __decorateParam(2, ILanguageConfigurationService)
], CommentBasedVariableResolver);
const _TimeBasedVariableResolver = class _TimeBasedVariableResolver {
  constructor() {
    this._date = /* @__PURE__ */ new Date();
  }
  resolve(variable) {
    const { name } = variable;
    switch (name) {
      case "CURRENT_YEAR":
        return String(this._date.getFullYear());
      case "CURRENT_YEAR_SHORT":
        return String(this._date.getFullYear()).slice(-2);
      case "CURRENT_MONTH":
        return String(this._date.getMonth().valueOf() + 1).padStart(2, "0");
      case "CURRENT_DATE":
        return String(this._date.getDate().valueOf()).padStart(2, "0");
      case "CURRENT_HOUR":
        return String(this._date.getHours().valueOf()).padStart(2, "0");
      case "CURRENT_MINUTE":
        return String(this._date.getMinutes().valueOf()).padStart(2, "0");
      case "CURRENT_SECOND":
        return String(this._date.getSeconds().valueOf()).padStart(2, "0");
      case "CURRENT_MILLISECOND":
        return String(this._date.getMilliseconds().valueOf()).padStart(3, "0");
      case "CURRENT_DAY_NAME":
        return _TimeBasedVariableResolver.dayNames[this._date.getDay()];
      case "CURRENT_DAY_NAME_SHORT":
        return _TimeBasedVariableResolver.dayNamesShort[this._date.getDay()];
      case "CURRENT_MONTH_NAME":
        return _TimeBasedVariableResolver.monthNames[this._date.getMonth()];
      case "CURRENT_MONTH_NAME_SHORT":
        return _TimeBasedVariableResolver.monthNamesShort[this._date.getMonth()];
      case "CURRENT_SECONDS_UNIX":
        return String(Math.floor(this._date.getTime() / 1e3));
      case "CURRENT_MILLISECONDS_UNIX":
        return String(this._date.getTime());
      case "CURRENT_TIMEZONE_OFFSET": {
        const rawTimeOffset = this._date.getTimezoneOffset();
        const sign = rawTimeOffset > 0 ? "-" : "+";
        const hours = Math.trunc(Math.abs(rawTimeOffset / 60));
        const hoursString = hours < 10 ? "0" + hours : hours;
        const minutes = Math.abs(rawTimeOffset) - hours * 60;
        const minutesString = minutes < 10 ? "0" + minutes : minutes;
        return sign + hoursString + ":" + minutesString;
      }
      case "CURRENT_TIMEZONE_NAME":
        return this._timezoneName ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return void 0;
  }
};
_TimeBasedVariableResolver.dayNames = [nls.localize("Sunday", "Sunday"), nls.localize("Monday", "Monday"), nls.localize("Tuesday", "Tuesday"), nls.localize("Wednesday", "Wednesday"), nls.localize("Thursday", "Thursday"), nls.localize("Friday", "Friday"), nls.localize("Saturday", "Saturday")];
_TimeBasedVariableResolver.dayNamesShort = [nls.localize("SundayShort", "Sun"), nls.localize("MondayShort", "Mon"), nls.localize("TuesdayShort", "Tue"), nls.localize("WednesdayShort", "Wed"), nls.localize("ThursdayShort", "Thu"), nls.localize("FridayShort", "Fri"), nls.localize("SaturdayShort", "Sat")];
_TimeBasedVariableResolver.monthNames = [nls.localize("January", "January"), nls.localize("February", "February"), nls.localize("March", "March"), nls.localize("April", "April"), nls.localize("May", "May"), nls.localize("June", "June"), nls.localize("July", "July"), nls.localize("August", "August"), nls.localize("September", "September"), nls.localize("October", "October"), nls.localize("November", "November"), nls.localize("December", "December")];
_TimeBasedVariableResolver.monthNamesShort = [nls.localize("JanuaryShort", "Jan"), nls.localize("FebruaryShort", "Feb"), nls.localize("MarchShort", "Mar"), nls.localize("AprilShort", "Apr"), nls.localize("MayShort", "May"), nls.localize("JuneShort", "Jun"), nls.localize("JulyShort", "Jul"), nls.localize("AugustShort", "Aug"), nls.localize("SeptemberShort", "Sep"), nls.localize("OctoberShort", "Oct"), nls.localize("NovemberShort", "Nov"), nls.localize("DecemberShort", "Dec")];
let TimeBasedVariableResolver = _TimeBasedVariableResolver;
class WorkspaceBasedVariableResolver {
  constructor(_workspaceService) {
    this._workspaceService = _workspaceService;
  }
  resolve(variable) {
    if (!this._workspaceService) {
      return void 0;
    }
    const workspaceIdentifier = toWorkspaceIdentifier(this._workspaceService.getWorkspace());
    if (isEmptyWorkspaceIdentifier(workspaceIdentifier)) {
      return void 0;
    }
    if (variable.name === "WORKSPACE_NAME") {
      return this._resolveWorkspaceName(workspaceIdentifier);
    } else if (variable.name === "WORKSPACE_FOLDER") {
      return this._resoveWorkspacePath(workspaceIdentifier);
    }
    return void 0;
  }
  _resolveWorkspaceName(workspaceIdentifier) {
    if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return path.basename(workspaceIdentifier.uri.path);
    }
    let filename = path.basename(workspaceIdentifier.configPath.path);
    if (filename.endsWith(WORKSPACE_EXTENSION)) {
      filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
    }
    return filename;
  }
  _resoveWorkspacePath(workspaceIdentifier) {
    if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return normalizeDriveLetter(workspaceIdentifier.uri.fsPath);
    }
    const filename = path.basename(workspaceIdentifier.configPath.path);
    let folderpath = workspaceIdentifier.configPath.fsPath;
    if (folderpath.endsWith(filename)) {
      folderpath = folderpath.substr(0, folderpath.length - filename.length - 1);
    }
    return folderpath ? normalizeDriveLetter(folderpath) : "/";
  }
}
class RandomBasedVariableResolver {
  resolve(variable) {
    const { name } = variable;
    if (name === "RANDOM") {
      return Math.random().toString().slice(-6);
    } else if (name === "RANDOM_HEX") {
      return Math.random().toString(16).slice(-6);
    } else if (name === "UUID") {
      return generateUuid();
    }
    return void 0;
  }
}
export {
  ClipboardBasedVariableResolver,
  CommentBasedVariableResolver,
  CompositeSnippetVariableResolver,
  KnownSnippetVariableNames,
  ModelBasedVariableResolver,
  RandomBasedVariableResolver,
  SelectionBasedVariableResolver,
  TimeBasedVariableResolver,
  WorkspaceBasedVariableResolver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXGJyb3dzZXJcXHNuaXBwZXRWYXJpYWJsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb21tb25QcmVmaXhMZW5ndGgsIGdldExlYWRpbmdXaGl0ZXNwYWNlLCBpc0ZhbHN5T3JXaGl0ZXNwYWNlLCBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUZXh0LCBWYXJpYWJsZSwgVmFyaWFibGVSZXNvbHZlciB9IGZyb20gJy4vc25pcHBldFBhcnNlci5qcyc7XG5pbXBvcnQgeyBPdmVydHlwaW5nQ2FwdHVyZXIgfSBmcm9tICcuLi8uLi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdE92ZXJ0eXBpbmdDYXB0dXJlci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV09SS1NQQUNFX0VYVEVOU0lPTiwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IEtub3duU25pcHBldFZhcmlhYmxlTmFtZXMgPSBPYmplY3QuZnJlZXplPHsgW2tleTogc3RyaW5nXTogdHJ1ZSB9Pih7XG5cdCdDVVJSRU5UX1lFQVInOiB0cnVlLFxuXHQnQ1VSUkVOVF9ZRUFSX1NIT1JUJzogdHJ1ZSxcblx0J0NVUlJFTlRfTU9OVEgnOiB0cnVlLFxuXHQnQ1VSUkVOVF9EQVRFJzogdHJ1ZSxcblx0J0NVUlJFTlRfSE9VUic6IHRydWUsXG5cdCdDVVJSRU5UX01JTlVURSc6IHRydWUsXG5cdCdDVVJSRU5UX1NFQ09ORCc6IHRydWUsXG5cdCdDVVJSRU5UX01JTExJU0VDT05EJzogdHJ1ZSxcblx0J0NVUlJFTlRfREFZX05BTUUnOiB0cnVlLFxuXHQnQ1VSUkVOVF9EQVlfTkFNRV9TSE9SVCc6IHRydWUsXG5cdCdDVVJSRU5UX01PTlRIX05BTUUnOiB0cnVlLFxuXHQnQ1VSUkVOVF9NT05USF9OQU1FX1NIT1JUJzogdHJ1ZSxcblx0J0NVUlJFTlRfU0VDT05EU19VTklYJzogdHJ1ZSxcblx0J0NVUlJFTlRfTUlMTElTRUNPTkRTX1VOSVgnOiB0cnVlLFxuXHQnQ1VSUkVOVF9USU1FWk9ORV9PRkZTRVQnOiB0cnVlLFxuXHQnQ1VSUkVOVF9USU1FWk9ORV9OQU1FJzogdHJ1ZSxcblx0J1NFTEVDVElPTic6IHRydWUsXG5cdCdDTElQQk9BUkQnOiB0cnVlLFxuXHQnVE1fU0VMRUNURURfVEVYVCc6IHRydWUsXG5cdCdUTV9DVVJSRU5UX0xJTkUnOiB0cnVlLFxuXHQnVE1fQ1VSUkVOVF9XT1JEJzogdHJ1ZSxcblx0J1RNX0xJTkVfSU5ERVgnOiB0cnVlLFxuXHQnVE1fTElORV9OVU1CRVInOiB0cnVlLFxuXHQnVE1fRklMRU5BTUUnOiB0cnVlLFxuXHQnVE1fRklMRU5BTUVfQkFTRSc6IHRydWUsXG5cdCdUTV9ESVJFQ1RPUlknOiB0cnVlLFxuXHQnVE1fRElSRUNUT1JZX0JBU0UnOiB0cnVlLFxuXHQnVE1fRklMRVBBVEgnOiB0cnVlLFxuXHQnQ1VSU09SX0lOREVYJzogdHJ1ZSwgLy8gMC1vZmZzZXRcblx0J0NVUlNPUl9OVU1CRVInOiB0cnVlLCAvLyAxLW9mZnNldFxuXHQnUkVMQVRJVkVfRklMRVBBVEgnOiB0cnVlLFxuXHQnQkxPQ0tfQ09NTUVOVF9TVEFSVCc6IHRydWUsXG5cdCdCTE9DS19DT01NRU5UX0VORCc6IHRydWUsXG5cdCdMSU5FX0NPTU1FTlQnOiB0cnVlLFxuXHQnV09SS1NQQUNFX05BTUUnOiB0cnVlLFxuXHQnV09SS1NQQUNFX0ZPTERFUic6IHRydWUsXG5cdCdSQU5ET00nOiB0cnVlLFxuXHQnUkFORE9NX0hFWCc6IHRydWUsXG5cdCdVVUlEJzogdHJ1ZVxufSk7XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVTbmlwcGV0VmFyaWFibGVSZXNvbHZlciBpbXBsZW1lbnRzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2RlbGVnYXRlczogVmFyaWFibGVSZXNvbHZlcltdKSB7XG5cdFx0Ly9cblx0fVxuXG5cdHJlc29sdmUodmFyaWFibGU6IFZhcmlhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGRlbGVnYXRlIG9mIHRoaXMuX2RlbGVnYXRlcykge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBkZWxlZ2F0ZS5yZXNvbHZlKHZhcmlhYmxlKTtcblx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0aW9uQmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uOiBTZWxlY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uSWR4OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcnR5cGluZ0NhcHR1cmVyOiBPdmVydHlwaW5nQ2FwdHVyZXIgfCB1bmRlZmluZWRcblx0KSB7XG5cdFx0Ly9cblx0fVxuXG5cdHJlc29sdmUodmFyaWFibGU6IFZhcmlhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblxuXHRcdGNvbnN0IHsgbmFtZSB9ID0gdmFyaWFibGU7XG5cblx0XHRpZiAobmFtZSA9PT0gJ1NFTEVDVElPTicgfHwgbmFtZSA9PT0gJ1RNX1NFTEVDVEVEX1RFWFQnKSB7XG5cdFx0XHRsZXQgdmFsdWUgPSB0aGlzLl9tb2RlbC5nZXRWYWx1ZUluUmFuZ2UodGhpcy5fc2VsZWN0aW9uKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaXNNdWx0aWxpbmUgPSB0aGlzLl9zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICE9PSB0aGlzLl9zZWxlY3Rpb24uZW5kTGluZU51bWJlcjtcblxuXHRcdFx0Ly8gSWYgdGhlcmUgd2FzIG5vIHNlbGVjdGVkIHRleHQsIHRyeSB0byBnZXQgbGFzdCBvdmVydHlwZWQgdGV4dFxuXHRcdFx0aWYgKCF2YWx1ZSAmJiB0aGlzLl9vdmVydHlwaW5nQ2FwdHVyZXIpIHtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX292ZXJ0eXBpbmdDYXB0dXJlci5nZXRMYXN0T3ZlcnR5cGVkSW5mbyh0aGlzLl9zZWxlY3Rpb25JZHgpO1xuXHRcdFx0XHRpZiAoaW5mbykge1xuXHRcdFx0XHRcdHZhbHVlID0gaW5mby52YWx1ZTtcblx0XHRcdFx0XHRpc011bHRpbGluZSA9IGluZm8ubXVsdGlsaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2YWx1ZSAmJiBpc011bHRpbGluZSAmJiB2YXJpYWJsZS5zbmlwcGV0KSB7XG5cdFx0XHRcdC8vIFNlbGVjdGlvbiBpcyBhIG11bHRpbGluZSBzdHJpbmcgd2hpY2ggd2UgaW5kZW50YXRpb24gd2Ugbm93XG5cdFx0XHRcdC8vIG5lZWQgdG8gYWRqdXN0LiBXZSBjb21wYXJlIHRoZSBpbmRlbnRhdGlvbiBvZiB0aGlzIHZhcmlhYmxlXG5cdFx0XHRcdC8vIHdpdGggdGhlIGluZGVudGF0aW9uIGF0IHRoZSBlZGl0b3IgcG9zaXRpb24gYW5kIGFkZCBwb3RlbnRpYWxcblx0XHRcdFx0Ly8gZXh0cmEgaW5kZW50YXRpb24gdG8gdGhlIHZhbHVlXG5cblx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KHRoaXMuX3NlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBsaW5lTGVhZGluZ1doaXRlc3BhY2UgPSBnZXRMZWFkaW5nV2hpdGVzcGFjZShsaW5lLCAwLCB0aGlzLl9zZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSAxKTtcblxuXHRcdFx0XHRsZXQgdmFyTGVhZGluZ1doaXRlc3BhY2UgPSBsaW5lTGVhZGluZ1doaXRlc3BhY2U7XG5cdFx0XHRcdHZhcmlhYmxlLnNuaXBwZXQud2FsayhtYXJrZXIgPT4ge1xuXHRcdFx0XHRcdGlmIChtYXJrZXIgPT09IHZhcmlhYmxlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBUZXh0KSB7XG5cdFx0XHRcdFx0XHR2YXJMZWFkaW5nV2hpdGVzcGFjZSA9IGdldExlYWRpbmdXaGl0ZXNwYWNlKHNwbGl0TGluZXMobWFya2VyLnZhbHVlKS5wb3AoKSEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHdoaXRlc3BhY2VDb21tb25MZW5ndGggPSBjb21tb25QcmVmaXhMZW5ndGgodmFyTGVhZGluZ1doaXRlc3BhY2UsIGxpbmVMZWFkaW5nV2hpdGVzcGFjZSk7XG5cblx0XHRcdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxuXHRcdFx0XHRcdC8oXFxyXFxufFxccnxcXG4pKC4qKS9nLFxuXHRcdFx0XHRcdChtLCBuZXdsaW5lLCByZXN0KSA9PiBgJHtuZXdsaW5lfSR7dmFyTGVhZGluZ1doaXRlc3BhY2Uuc3Vic3RyKHdoaXRlc3BhY2VDb21tb25MZW5ndGgpfSR7cmVzdH1gXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdUTV9DVVJSRU5UX0xJTkUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuZ2V0TGluZUNvbnRlbnQodGhpcy5fc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlcik7XG5cblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdUTV9DVVJSRU5UX1dPUkQnKSB7XG5cdFx0XHRjb25zdCBpbmZvID0gdGhpcy5fbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24oe1xuXHRcdFx0XHRsaW5lTnVtYmVyOiB0aGlzLl9zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyLFxuXHRcdFx0XHRjb2x1bW46IHRoaXMuX3NlbGVjdGlvbi5wb3NpdGlvbkNvbHVtblxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gaW5mbyAmJiBpbmZvLndvcmQgfHwgdW5kZWZpbmVkO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fTElORV9JTkRFWCcpIHtcblx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlciAtIDEpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fTElORV9OVU1CRVInKSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX3NlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnQ1VSU09SX0lOREVYJykge1xuXHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9zZWxlY3Rpb25JZHgpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnQ1VSU09SX05VTUJFUicpIHtcblx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fc2VsZWN0aW9uSWR4ICsgMSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsQmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsXG5cdCkge1xuXHRcdC8vXG5cdH1cblxuXHRyZXNvbHZlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cblx0XHRjb25zdCB7IG5hbWUgfSA9IHZhcmlhYmxlO1xuXG5cdFx0aWYgKG5hbWUgPT09ICdUTV9GSUxFTkFNRScpIHtcblx0XHRcdHJldHVybiBwYXRoLmJhc2VuYW1lKHRoaXMuX21vZGVsLnVyaS5mc1BhdGgpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fRklMRU5BTUVfQkFTRScpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBwYXRoLmJhc2VuYW1lKHRoaXMuX21vZGVsLnVyaS5mc1BhdGgpO1xuXHRcdFx0Y29uc3QgaWR4ID0gbmFtZS5sYXN0SW5kZXhPZignLicpO1xuXHRcdFx0aWYgKGlkeCA8PSAwKSB7XG5cdFx0XHRcdHJldHVybiBuYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5hbWUuc2xpY2UoMCwgaWR4KTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1RNX0RJUkVDVE9SWScpIHtcblx0XHRcdGlmIChwYXRoLmRpcm5hbWUodGhpcy5fbW9kZWwudXJpLmZzUGF0aCkgPT09ICcuJykge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUodGhpcy5fbW9kZWwudXJpKSk7XG5cblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdUTV9ESVJFQ1RPUllfQkFTRScpIHtcblx0XHRcdGlmIChwYXRoLmRpcm5hbWUodGhpcy5fbW9kZWwudXJpLmZzUGF0aCkgPT09ICcuJykge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGF0aC5iYXNlbmFtZShwYXRoLmRpcm5hbWUodGhpcy5fbW9kZWwudXJpLmZzUGF0aCkpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fRklMRVBBVEgnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHRoaXMuX21vZGVsLnVyaSk7XG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnUkVMQVRJVkVfRklMRVBBVEgnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHRoaXMuX21vZGVsLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSwgbm9QcmVmaXg6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWFkQ2xpcGJvYXJkVGV4dCB7XG5cdCgpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIgaW1wbGVtZW50cyBWYXJpYWJsZVJlc29sdmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWFkQ2xpcGJvYXJkVGV4dDogSVJlYWRDbGlwYm9hcmRUZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbklkeDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbkNvdW50OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3ByZWFkOiBib29sZWFuXG5cdCkge1xuXHRcdC8vXG5cdH1cblxuXHRyZXNvbHZlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhcmlhYmxlLm5hbWUgIT09ICdDTElQQk9BUkQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsaXBib2FyZFRleHQgPSB0aGlzLl9yZWFkQ2xpcGJvYXJkVGV4dCgpO1xuXHRcdGlmICghY2xpcGJvYXJkVGV4dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBgc3ByZWFkYCBpcyBhc3NpZ25pbmcgZWFjaCBjdXJzb3IgYSBsaW5lIG9mIHRoZSBjbGlwYm9hcmRcblx0XHQvLyB0ZXh0IHdoZW5ldmVyIHRoZXJlIHRoZSBsaW5lIGNvdW50IGVxdWFscyB0aGUgY3Vyc29yIGNvdW50XG5cdFx0Ly8gYW5kIHdoZW4gZW5hYmxlZFxuXHRcdGlmICh0aGlzLl9zcHJlYWQpIHtcblx0XHRcdGNvbnN0IGxpbmVzID0gY2xpcGJvYXJkVGV4dC5zcGxpdCgvXFxyXFxufFxcbnxcXHIvKS5maWx0ZXIocyA9PiAhaXNGYWxzeU9yV2hpdGVzcGFjZShzKSk7XG5cdFx0XHRpZiAobGluZXMubGVuZ3RoID09PSB0aGlzLl9zZWxlY3Rpb25Db3VudCkge1xuXHRcdFx0XHRyZXR1cm4gbGluZXNbdGhpcy5fc2VsZWN0aW9uSWR4XTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNsaXBib2FyZFRleHQ7XG5cdH1cbn1cbmV4cG9ydCBjbGFzcyBDb21tZW50QmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbjogU2VsZWN0aW9uLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHQvL1xuXHR9XG5cdHJlc29sdmUodmFyaWFibGU6IFZhcmlhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB7IG5hbWUgfSA9IHZhcmlhYmxlO1xuXHRcdGNvbnN0IGxhbmdJZCA9IHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHRoaXMuX3NlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsIHRoaXMuX3NlbGVjdGlvbi5zZWxlY3Rpb25TdGFydENvbHVtbik7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ0lkKS5jb21tZW50cztcblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG5hbWUgPT09ICdMSU5FX0NPTU1FTlQnKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnLmxpbmVDb21tZW50VG9rZW4gfHwgdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ0JMT0NLX0NPTU1FTlRfU1RBUlQnKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnLmJsb2NrQ29tbWVudFN0YXJ0VG9rZW4gfHwgdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ0JMT0NLX0NPTU1FTlRfRU5EJykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5ibG9ja0NvbW1lbnRFbmRUb2tlbiB8fCB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbmV4cG9ydCBjbGFzcyBUaW1lQmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZGF5TmFtZXMgPSBbbmxzLmxvY2FsaXplKCdTdW5kYXknLCBcIlN1bmRheVwiKSwgbmxzLmxvY2FsaXplKCdNb25kYXknLCBcIk1vbmRheVwiKSwgbmxzLmxvY2FsaXplKCdUdWVzZGF5JywgXCJUdWVzZGF5XCIpLCBubHMubG9jYWxpemUoJ1dlZG5lc2RheScsIFwiV2VkbmVzZGF5XCIpLCBubHMubG9jYWxpemUoJ1RodXJzZGF5JywgXCJUaHVyc2RheVwiKSwgbmxzLmxvY2FsaXplKCdGcmlkYXknLCBcIkZyaWRheVwiKSwgbmxzLmxvY2FsaXplKCdTYXR1cmRheScsIFwiU2F0dXJkYXlcIildO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBkYXlOYW1lc1Nob3J0ID0gW25scy5sb2NhbGl6ZSgnU3VuZGF5U2hvcnQnLCBcIlN1blwiKSwgbmxzLmxvY2FsaXplKCdNb25kYXlTaG9ydCcsIFwiTW9uXCIpLCBubHMubG9jYWxpemUoJ1R1ZXNkYXlTaG9ydCcsIFwiVHVlXCIpLCBubHMubG9jYWxpemUoJ1dlZG5lc2RheVNob3J0JywgXCJXZWRcIiksIG5scy5sb2NhbGl6ZSgnVGh1cnNkYXlTaG9ydCcsIFwiVGh1XCIpLCBubHMubG9jYWxpemUoJ0ZyaWRheVNob3J0JywgXCJGcmlcIiksIG5scy5sb2NhbGl6ZSgnU2F0dXJkYXlTaG9ydCcsIFwiU2F0XCIpXTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgbW9udGhOYW1lcyA9IFtubHMubG9jYWxpemUoJ0phbnVhcnknLCBcIkphbnVhcnlcIiksIG5scy5sb2NhbGl6ZSgnRmVicnVhcnknLCBcIkZlYnJ1YXJ5XCIpLCBubHMubG9jYWxpemUoJ01hcmNoJywgXCJNYXJjaFwiKSwgbmxzLmxvY2FsaXplKCdBcHJpbCcsIFwiQXByaWxcIiksIG5scy5sb2NhbGl6ZSgnTWF5JywgXCJNYXlcIiksIG5scy5sb2NhbGl6ZSgnSnVuZScsIFwiSnVuZVwiKSwgbmxzLmxvY2FsaXplKCdKdWx5JywgXCJKdWx5XCIpLCBubHMubG9jYWxpemUoJ0F1Z3VzdCcsIFwiQXVndXN0XCIpLCBubHMubG9jYWxpemUoJ1NlcHRlbWJlcicsIFwiU2VwdGVtYmVyXCIpLCBubHMubG9jYWxpemUoJ09jdG9iZXInLCBcIk9jdG9iZXJcIiksIG5scy5sb2NhbGl6ZSgnTm92ZW1iZXInLCBcIk5vdmVtYmVyXCIpLCBubHMubG9jYWxpemUoJ0RlY2VtYmVyJywgXCJEZWNlbWJlclwiKV07XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IG1vbnRoTmFtZXNTaG9ydCA9IFtubHMubG9jYWxpemUoJ0phbnVhcnlTaG9ydCcsIFwiSmFuXCIpLCBubHMubG9jYWxpemUoJ0ZlYnJ1YXJ5U2hvcnQnLCBcIkZlYlwiKSwgbmxzLmxvY2FsaXplKCdNYXJjaFNob3J0JywgXCJNYXJcIiksIG5scy5sb2NhbGl6ZSgnQXByaWxTaG9ydCcsIFwiQXByXCIpLCBubHMubG9jYWxpemUoJ01heVNob3J0JywgXCJNYXlcIiksIG5scy5sb2NhbGl6ZSgnSnVuZVNob3J0JywgXCJKdW5cIiksIG5scy5sb2NhbGl6ZSgnSnVseVNob3J0JywgXCJKdWxcIiksIG5scy5sb2NhbGl6ZSgnQXVndXN0U2hvcnQnLCBcIkF1Z1wiKSwgbmxzLmxvY2FsaXplKCdTZXB0ZW1iZXJTaG9ydCcsIFwiU2VwXCIpLCBubHMubG9jYWxpemUoJ09jdG9iZXJTaG9ydCcsIFwiT2N0XCIpLCBubHMubG9jYWxpemUoJ05vdmVtYmVyU2hvcnQnLCBcIk5vdlwiKSwgbmxzLmxvY2FsaXplKCdEZWNlbWJlclNob3J0JywgXCJEZWNcIildO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGUgPSBuZXcgRGF0ZSgpO1xuXHRwcml2YXRlIF90aW1lem9uZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRyZXNvbHZlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgeyBuYW1lIH0gPSB2YXJpYWJsZTtcblxuXHRcdHN3aXRjaCAobmFtZSkge1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9ZRUFSJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldEZ1bGxZZWFyKCkpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9ZRUFSX1NIT1JUJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldEZ1bGxZZWFyKCkpLnNsaWNlKC0yKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfTU9OVEgnOlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX2RhdGUuZ2V0TW9udGgoKS52YWx1ZU9mKCkgKyAxKS5wYWRTdGFydCgyLCAnMCcpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9EQVRFJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldERhdGUoKS52YWx1ZU9mKCkpLnBhZFN0YXJ0KDIsICcwJyk7XG5cdFx0XHRjYXNlICdDVVJSRU5UX0hPVVInOlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX2RhdGUuZ2V0SG91cnMoKS52YWx1ZU9mKCkpLnBhZFN0YXJ0KDIsICcwJyk7XG5cdFx0XHRjYXNlICdDVVJSRU5UX01JTlVURSc6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fZGF0ZS5nZXRNaW51dGVzKCkudmFsdWVPZigpKS5wYWRTdGFydCgyLCAnMCcpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9TRUNPTkQnOlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX2RhdGUuZ2V0U2Vjb25kcygpLnZhbHVlT2YoKSkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfTUlMTElTRUNPTkQnOlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX2RhdGUuZ2V0TWlsbGlzZWNvbmRzKCkudmFsdWVPZigpKS5wYWRTdGFydCgzLCAnMCcpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9EQVlfTkFNRSc6XG5cdFx0XHRcdHJldHVybiBUaW1lQmFzZWRWYXJpYWJsZVJlc29sdmVyLmRheU5hbWVzW3RoaXMuX2RhdGUuZ2V0RGF5KCldO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9EQVlfTkFNRV9TSE9SVCc6XG5cdFx0XHRcdHJldHVybiBUaW1lQmFzZWRWYXJpYWJsZVJlc29sdmVyLmRheU5hbWVzU2hvcnRbdGhpcy5fZGF0ZS5nZXREYXkoKV07XG5cdFx0XHRjYXNlICdDVVJSRU5UX01PTlRIX05BTUUnOlxuXHRcdFx0XHRyZXR1cm4gVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlci5tb250aE5hbWVzW3RoaXMuX2RhdGUuZ2V0TW9udGgoKV07XG5cdFx0XHRjYXNlICdDVVJSRU5UX01PTlRIX05BTUVfU0hPUlQnOlxuXHRcdFx0XHRyZXR1cm4gVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlci5tb250aE5hbWVzU2hvcnRbdGhpcy5fZGF0ZS5nZXRNb250aCgpXTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfU0VDT05EU19VTklYJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyhNYXRoLmZsb29yKHRoaXMuX2RhdGUuZ2V0VGltZSgpIC8gMTAwMCkpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9NSUxMSVNFQ09ORFNfVU5JWCc6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fZGF0ZS5nZXRUaW1lKCkpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9USU1FWk9ORV9PRkZTRVQnOiB7XG5cdFx0XHRcdGNvbnN0IHJhd1RpbWVPZmZzZXQgPSB0aGlzLl9kYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7XG5cdFx0XHRcdGNvbnN0IHNpZ24gPSByYXdUaW1lT2Zmc2V0ID4gMCA/ICctJyA6ICcrJztcblx0XHRcdFx0Y29uc3QgaG91cnMgPSBNYXRoLnRydW5jKE1hdGguYWJzKHJhd1RpbWVPZmZzZXQgLyA2MCkpO1xuXHRcdFx0XHRjb25zdCBob3Vyc1N0cmluZyA9IChob3VycyA8IDEwID8gJzAnICsgaG91cnMgOiBob3Vycyk7XG5cdFx0XHRcdGNvbnN0IG1pbnV0ZXMgPSBNYXRoLmFicyhyYXdUaW1lT2Zmc2V0KSAtIGhvdXJzICogNjA7XG5cdFx0XHRcdGNvbnN0IG1pbnV0ZXNTdHJpbmcgPSAobWludXRlcyA8IDEwID8gJzAnICsgbWludXRlcyA6IG1pbnV0ZXMpO1xuXHRcdFx0XHRyZXR1cm4gc2lnbiArIGhvdXJzU3RyaW5nICsgJzonICsgbWludXRlc1N0cmluZztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0NVUlJFTlRfVElNRVpPTkVfTkFNRSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl90aW1lem9uZU5hbWUgPz89IEludGwuRGF0ZVRpbWVGb3JtYXQoKS5yZXNvbHZlZE9wdGlvbnMoKS50aW1lWm9uZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VCYXNlZFZhcmlhYmxlUmVzb2x2ZXIgaW1wbGVtZW50cyBWYXJpYWJsZVJlc29sdmVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHQvL1xuXHR9XG5cblx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlU2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VJZGVudGlmaWVyID0gdG9Xb3Jrc3BhY2VJZGVudGlmaWVyKHRoaXMuX3dvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpO1xuXHRcdGlmIChpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZGVudGlmaWVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodmFyaWFibGUubmFtZSA9PT0gJ1dPUktTUEFDRV9OQU1FJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVXb3Jrc3BhY2VOYW1lKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdH0gZWxzZSBpZiAodmFyaWFibGUubmFtZSA9PT0gJ1dPUktTUEFDRV9GT0xERVInKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3ZlV29ya3NwYWNlUGF0aCh3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHByaXZhdGUgX3Jlc29sdmVXb3Jrc3BhY2VOYW1lKHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiBwYXRoLmJhc2VuYW1lKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpLnBhdGgpO1xuXHRcdH1cblxuXHRcdGxldCBmaWxlbmFtZSA9IHBhdGguYmFzZW5hbWUod29ya3NwYWNlSWRlbnRpZmllci5jb25maWdQYXRoLnBhdGgpO1xuXHRcdGlmIChmaWxlbmFtZS5lbmRzV2l0aChXT1JLU1BBQ0VfRVhURU5TSU9OKSkge1xuXHRcdFx0ZmlsZW5hbWUgPSBmaWxlbmFtZS5zdWJzdHIoMCwgZmlsZW5hbWUubGVuZ3RoIC0gV09SS1NQQUNFX0VYVEVOU0lPTi5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZpbGVuYW1lO1xuXHR9XG5cdHByaXZhdGUgX3Jlc292ZVdvcmtzcGFjZVBhdGgod29ya3NwYWNlSWRlbnRpZmllcjogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZGVudGlmaWVyKSkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpLmZzUGF0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZW5hbWUgPSBwYXRoLmJhc2VuYW1lKHdvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aC5wYXRoKTtcblx0XHRsZXQgZm9sZGVycGF0aCA9IHdvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aC5mc1BhdGg7XG5cdFx0aWYgKGZvbGRlcnBhdGguZW5kc1dpdGgoZmlsZW5hbWUpKSB7XG5cdFx0XHRmb2xkZXJwYXRoID0gZm9sZGVycGF0aC5zdWJzdHIoMCwgZm9sZGVycGF0aC5sZW5ndGggLSBmaWxlbmFtZS5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIChmb2xkZXJwYXRoID8gbm9ybWFsaXplRHJpdmVMZXR0ZXIoZm9sZGVycGF0aCkgOiAnLycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSYW5kb21CYXNlZFZhcmlhYmxlUmVzb2x2ZXIgaW1wbGVtZW50cyBWYXJpYWJsZVJlc29sdmVyIHtcblx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgbmFtZSB9ID0gdmFyaWFibGU7XG5cblx0XHRpZiAobmFtZSA9PT0gJ1JBTkRPTScpIHtcblx0XHRcdHJldHVybiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKCkuc2xpY2UoLTYpO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1JBTkRPTV9IRVgnKSB7XG5cdFx0XHRyZXR1cm4gTWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoLTYpO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1VVSUQnKSB7XG5cdFx0XHRyZXR1cm4gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDRCQUE0QjtBQUNyQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CLHNCQUFzQixxQkFBcUIsa0JBQWtCO0FBQzFGLFNBQVMsb0JBQW9CO0FBRzdCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsWUFBd0M7QUFFakQs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
