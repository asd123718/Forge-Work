import { localize } from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import * as Strings from "../../../../base/common/strings.js";
import * as Assert from "../../../../base/common/assert.js";
import { join, normalize } from "../../../../base/common/path.js";
import * as Types from "../../../../base/common/types.js";
import * as UUID from "../../../../base/common/uuid.js";
import * as Platform from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { ValidationStatus, ValidationState, Parser } from "../../../../base/common/parsers.js";
import { asArray } from "../../../../base/common/arrays.js";
import { Schemas as NetworkSchemas } from "../../../../base/common/network.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { Emitter } from "../../../../base/common/event.js";
import { FileType } from "../../../../platform/files/common/files.js";
var FileLocationKind = /* @__PURE__ */ ((FileLocationKind2) => {
  FileLocationKind2[FileLocationKind2["Default"] = 0] = "Default";
  FileLocationKind2[FileLocationKind2["Relative"] = 1] = "Relative";
  FileLocationKind2[FileLocationKind2["Absolute"] = 2] = "Absolute";
  FileLocationKind2[FileLocationKind2["AutoDetect"] = 3] = "AutoDetect";
  FileLocationKind2[FileLocationKind2["Search"] = 4] = "Search";
  return FileLocationKind2;
})(FileLocationKind || {});
((FileLocationKind2) => {
  function fromString(value) {
    value = value.toLowerCase();
    if (value === "absolute") {
      return 2 /* Absolute */;
    } else if (value === "relative") {
      return 1 /* Relative */;
    } else if (value === "autodetect") {
      return 3 /* AutoDetect */;
    } else if (value === "search") {
      return 4 /* Search */;
    } else {
      return void 0;
    }
  }
  FileLocationKind2.fromString = fromString;
})(FileLocationKind || (FileLocationKind = {}));
var ProblemLocationKind = /* @__PURE__ */ ((ProblemLocationKind2) => {
  ProblemLocationKind2[ProblemLocationKind2["File"] = 0] = "File";
  ProblemLocationKind2[ProblemLocationKind2["Location"] = 1] = "Location";
  return ProblemLocationKind2;
})(ProblemLocationKind || {});
((ProblemLocationKind2) => {
  function fromString(value) {
    value = value.toLowerCase();
    if (value === "file") {
      return 0 /* File */;
    } else if (value === "location") {
      return 1 /* Location */;
    } else {
      return void 0;
    }
  }
  ProblemLocationKind2.fromString = fromString;
})(ProblemLocationKind || (ProblemLocationKind = {}));
var ApplyToKind = /* @__PURE__ */ ((ApplyToKind2) => {
  ApplyToKind2[ApplyToKind2["allDocuments"] = 0] = "allDocuments";
  ApplyToKind2[ApplyToKind2["openDocuments"] = 1] = "openDocuments";
  ApplyToKind2[ApplyToKind2["closedDocuments"] = 2] = "closedDocuments";
  return ApplyToKind2;
})(ApplyToKind || {});
((ApplyToKind2) => {
  function fromString(value) {
    value = value.toLowerCase();
    if (value === "alldocuments") {
      return 0 /* allDocuments */;
    } else if (value === "opendocuments") {
      return 1 /* openDocuments */;
    } else if (value === "closeddocuments") {
      return 2 /* closedDocuments */;
    } else {
      return void 0;
    }
  }
  ApplyToKind2.fromString = fromString;
})(ApplyToKind || (ApplyToKind = {}));
function isNamedProblemMatcher(value) {
  return value && Types.isString(value.name) ? true : false;
}
async function getResource(filename, matcher, fileService) {
  const kind = matcher.fileLocation;
  let fullPath;
  if (kind === 2 /* Absolute */) {
    fullPath = filename;
  } else if (kind === 1 /* Relative */ && matcher.filePrefix && Types.isString(matcher.filePrefix)) {
    fullPath = join(matcher.filePrefix, filename);
  } else if (kind === 3 /* AutoDetect */) {
    const matcherClone = Objects.deepClone(matcher);
    matcherClone.fileLocation = 1 /* Relative */;
    if (fileService) {
      const relative = await getResource(filename, matcherClone);
      let stat = void 0;
      try {
        stat = await fileService.stat(relative);
      } catch (ex) {
      }
      if (stat) {
        return relative;
      }
    }
    matcherClone.fileLocation = 2 /* Absolute */;
    return getResource(filename, matcherClone);
  } else if (kind === 4 /* Search */ && fileService) {
    const fsProvider = fileService.getProvider(NetworkSchemas.file);
    if (fsProvider) {
      const uri = await searchForFileLocation(filename, fsProvider, matcher.filePrefix);
      fullPath = uri?.path;
    }
    if (!fullPath) {
      const absoluteMatcher = Objects.deepClone(matcher);
      absoluteMatcher.fileLocation = 2 /* Absolute */;
      return getResource(filename, absoluteMatcher);
    }
  }
  if (fullPath === void 0) {
    throw new Error("FileLocationKind is not actionable. Does the matcher have a filePrefix? This should never happen.");
  }
  fullPath = normalize(fullPath);
  fullPath = fullPath.replace(/\\/g, "/");
  if (fullPath[0] !== "/") {
    fullPath = "/" + fullPath;
  }
  if (matcher.uriProvider !== void 0) {
    return matcher.uriProvider(fullPath);
  } else {
    return URI.file(fullPath);
  }
}
async function searchForFileLocation(filename, fsProvider, args) {
  const exclusions = new Set(asArray(args.exclude || []).map((x) => URI.file(x).path));
  async function search(dir) {
    if (exclusions.has(dir.path)) {
      return void 0;
    }
    const entries = await fsProvider.readdir(dir);
    const subdirs = [];
    for (const [name, fileType] of entries) {
      if (fileType === FileType.Directory) {
        subdirs.push(URI.joinPath(dir, name));
        continue;
      }
      if (fileType === FileType.File) {
        const fullUri = URI.joinPath(dir, name);
        if (fullUri.path.endsWith(filename)) {
          return fullUri;
        }
      }
    }
    for (const subdir of subdirs) {
      const result = await search(subdir);
      if (result) {
        return result;
      }
    }
    return void 0;
  }
  for (const dir of asArray(args.include || [])) {
    const hit = await search(URI.file(dir));
    if (hit) {
      return hit;
    }
  }
  return void 0;
}
function createLineMatcher(matcher, fileService, logService) {
  const pattern = matcher.pattern;
  if (Array.isArray(pattern)) {
    return new MultiLineMatcher(matcher, fileService, logService);
  } else {
    return new SingleLineMatcher(matcher, fileService, logService);
  }
}
const endOfLine = Platform.OS === Platform.OperatingSystem.Windows ? "\r\n" : "\n";
class AbstractLineMatcher {
  constructor(matcher, fileService, logService) {
    this.matcher = matcher;
    this.fileService = fileService;
    this.logService = logService;
  }
  handle(lines, start = 0) {
    return { match: null, continue: false };
  }
  next(line) {
    return null;
  }
  regexpExec(regexp, line) {
    const start = Date.now();
    const result = regexp.exec(line);
    const elapsed = Date.now() - start;
    if (elapsed > 5) {
      this.logService?.trace(`ProblemMatcher: slow regexp took ${elapsed}ms to execute`, regexp.source);
    }
    return result;
  }
  fillProblemData(data, pattern, matches) {
    if (data) {
      this.fillProperty(data, "file", pattern, matches, true);
      this.appendProperty(data, "message", pattern, matches, true);
      this.fillProperty(data, "code", pattern, matches, true);
      this.fillProperty(data, "severity", pattern, matches, true);
      this.fillProperty(data, "location", pattern, matches, true);
      this.fillProperty(data, "line", pattern, matches);
      this.fillProperty(data, "character", pattern, matches);
      this.fillProperty(data, "endLine", pattern, matches);
      this.fillProperty(data, "endCharacter", pattern, matches);
      return true;
    } else {
      return false;
    }
  }
  appendProperty(data, property, pattern, matches, trim = false) {
    const patternProperty = pattern[property];
    if (Types.isUndefined(data[property])) {
      this.fillProperty(data, property, pattern, matches, trim);
    } else if (!Types.isUndefined(patternProperty) && patternProperty < matches.length) {
      let value = matches[patternProperty];
      if (trim) {
        value = Strings.trim(value);
      }
      data[property] = data[property] + endOfLine + value;
    }
  }
  fillProperty(data, property, pattern, matches, trim = false) {
    const patternAtProperty = pattern[property];
    if (Types.isUndefined(data[property]) && !Types.isUndefined(patternAtProperty) && patternAtProperty < matches.length) {
      let value = matches[patternAtProperty];
      if (value !== void 0) {
        if (trim) {
          value = Strings.trim(value);
        }
        data[property] = value;
      }
    }
  }
  getMarkerMatch(data) {
    try {
      const location = this.getLocation(data);
      if (data.file && location && data.message) {
        const marker = {
          severity: this.getSeverity(data),
          startLineNumber: location.startLineNumber,
          startColumn: location.startCharacter,
          endLineNumber: location.endLineNumber,
          endColumn: location.endCharacter,
          message: data.message
        };
        if (data.code !== void 0) {
          marker.code = data.code;
        }
        if (this.matcher.source !== void 0) {
          marker.source = this.matcher.source;
        }
        return {
          description: this.matcher,
          resource: this.getResource(data.file),
          marker
        };
      }
    } catch (err) {
      console.error(`Failed to convert problem data into match: ${JSON.stringify(data)}`);
    }
    return void 0;
  }
  getResource(filename) {
    return getResource(filename, this.matcher, this.fileService);
  }
  getLocation(data) {
    if (data.kind === 0 /* File */) {
      return this.createLocation(0, 0, 0, 0);
    }
    if (data.location) {
      return this.parseLocationInfo(data.location);
    }
    if (!data.line) {
      return null;
    }
    const startLine = parseInt(data.line);
    const startColumn = data.character ? parseInt(data.character) : void 0;
    const endLine = data.endLine ? parseInt(data.endLine) : void 0;
    const endColumn = data.endCharacter ? parseInt(data.endCharacter) : void 0;
    return this.createLocation(startLine, startColumn, endLine, endColumn);
  }
  parseLocationInfo(value) {
    if (!value || !value.match(/(\d+|\d+,\d+|\d+,\d+,\d+,\d+)/)) {
      return null;
    }
    const parts = value.split(",");
    const startLine = parseInt(parts[0]);
    const startColumn = parts.length > 1 ? parseInt(parts[1]) : void 0;
    if (parts.length > 3) {
      return this.createLocation(startLine, startColumn, parseInt(parts[2]), parseInt(parts[3]));
    } else {
      return this.createLocation(startLine, startColumn, void 0, void 0);
    }
  }
  createLocation(startLine, startColumn, endLine, endColumn) {
    if (startColumn !== void 0 && endColumn !== void 0) {
      return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: endLine || startLine, endCharacter: endColumn };
    }
    if (startColumn !== void 0) {
      return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: startLine, endCharacter: startColumn };
    }
    return { startLineNumber: startLine, startCharacter: 1, endLineNumber: startLine, endCharacter: 2 ** 31 - 1 };
  }
  getSeverity(data) {
    let result = null;
    if (data.severity) {
      const value = data.severity;
      if (value) {
        result = Severity.fromValue(value);
        if (result === Severity.Ignore) {
          if (value === "E") {
            result = Severity.Error;
          } else if (value === "W") {
            result = Severity.Warning;
          } else if (value === "I") {
            result = Severity.Info;
          } else if (Strings.equalsIgnoreCase(value, "hint")) {
            result = Severity.Info;
          } else if (Strings.equalsIgnoreCase(value, "note")) {
            result = Severity.Info;
          }
        }
      }
    }
    if (result === null || result === Severity.Ignore) {
      result = this.matcher.severity || Severity.Error;
    }
    return MarkerSeverity.fromSeverity(result);
  }
}
class SingleLineMatcher extends AbstractLineMatcher {
  constructor(matcher, fileService, logService) {
    super(matcher, fileService, logService);
    this.pattern = matcher.pattern;
  }
  get matchLength() {
    return 1;
  }
  handle(lines, start = 0) {
    Assert.ok(lines.length - start === 1);
    const data = /* @__PURE__ */ Object.create(null);
    if (this.pattern.kind !== void 0) {
      data.kind = this.pattern.kind;
    }
    const matches = this.regexpExec(this.pattern.regexp, lines[start]);
    if (matches) {
      this.fillProblemData(data, this.pattern, matches);
      if (data.kind === 1 /* Location */ && !data.location && !data.line && data.file) {
        data.kind = 0 /* File */;
      }
      const match = this.getMarkerMatch(data);
      if (match) {
        return { match, continue: false };
      }
    }
    return { match: null, continue: false };
  }
  next(line) {
    return null;
  }
}
class MultiLineMatcher extends AbstractLineMatcher {
  constructor(matcher, fileService, logService) {
    super(matcher, fileService, logService);
    this.patterns = matcher.pattern;
  }
  get matchLength() {
    return this.patterns.length;
  }
  handle(lines, start = 0) {
    Assert.ok(lines.length - start === this.patterns.length);
    this.data = /* @__PURE__ */ Object.create(null);
    let data = this.data;
    data.kind = this.patterns[0].kind;
    for (let i = 0; i < this.patterns.length; i++) {
      const pattern = this.patterns[i];
      const matches = this.regexpExec(pattern.regexp, lines[i + start]);
      if (!matches) {
        return { match: null, continue: false };
      } else {
        if (pattern.loop && i === this.patterns.length - 1) {
          data = Objects.deepClone(data);
        }
        this.fillProblemData(data, pattern, matches);
      }
    }
    const loop = !!this.patterns[this.patterns.length - 1].loop;
    if (!loop) {
      this.data = void 0;
    }
    const markerMatch = data ? this.getMarkerMatch(data) : null;
    return { match: markerMatch ? markerMatch : null, continue: loop };
  }
  next(line) {
    const pattern = this.patterns[this.patterns.length - 1];
    Assert.ok(pattern.loop === true && this.data !== null);
    const matches = this.regexpExec(pattern.regexp, line);
    if (!matches) {
      this.data = void 0;
      return null;
    }
    const data = Objects.deepClone(this.data);
    let problemMatch;
    if (this.fillProblemData(data, pattern, matches)) {
      problemMatch = this.getMarkerMatch(data);
    }
    return problemMatch ? problemMatch : null;
  }
}
var Config;
((Config2) => {
  let CheckedProblemPattern;
  ((CheckedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && Types.isString(candidate.regexp);
    }
    CheckedProblemPattern2.is = is;
  })(CheckedProblemPattern = Config2.CheckedProblemPattern || (Config2.CheckedProblemPattern = {}));
  let NamedProblemPattern;
  ((NamedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && Types.isString(candidate.name);
    }
    NamedProblemPattern2.is = is;
  })(NamedProblemPattern = Config2.NamedProblemPattern || (Config2.NamedProblemPattern = {}));
  let NamedCheckedProblemPattern;
  ((NamedCheckedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && NamedProblemPattern.is(candidate) && Types.isString(candidate.regexp);
    }
    NamedCheckedProblemPattern2.is = is;
  })(NamedCheckedProblemPattern = Config2.NamedCheckedProblemPattern || (Config2.NamedCheckedProblemPattern = {}));
  let MultiLineProblemPattern;
  ((MultiLineProblemPattern2) => {
    function is(value) {
      return Array.isArray(value);
    }
    MultiLineProblemPattern2.is = is;
  })(MultiLineProblemPattern = Config2.MultiLineProblemPattern || (Config2.MultiLineProblemPattern = {}));
  let MultiLineCheckedProblemPattern;
  ((MultiLineCheckedProblemPattern2) => {
    function is(value) {
      if (!MultiLineProblemPattern.is(value)) {
        return false;
      }
      for (const element of value) {
        if (!Config2.CheckedProblemPattern.is(element)) {
          return false;
        }
      }
      return true;
    }
    MultiLineCheckedProblemPattern2.is = is;
  })(MultiLineCheckedProblemPattern = Config2.MultiLineCheckedProblemPattern || (Config2.MultiLineCheckedProblemPattern = {}));
  let NamedMultiLineCheckedProblemPattern;
  ((NamedMultiLineCheckedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && Types.isString(candidate.name) && Array.isArray(candidate.patterns) && MultiLineCheckedProblemPattern.is(candidate.patterns);
    }
    NamedMultiLineCheckedProblemPattern2.is = is;
  })(NamedMultiLineCheckedProblemPattern = Config2.NamedMultiLineCheckedProblemPattern || (Config2.NamedMultiLineCheckedProblemPattern = {}));
  function isNamedProblemMatcher2(value) {
    return Types.isString(value.name);
  }
  Config2.isNamedProblemMatcher = isNamedProblemMatcher2;
})(Config || (Config = {}));
class ProblemPatternParser extends Parser {
  constructor(logger) {
    super(logger);
  }
  parse(value) {
    if (Config.NamedMultiLineCheckedProblemPattern.is(value)) {
      return this.createNamedMultiLineProblemPattern(value);
    } else if (Config.MultiLineCheckedProblemPattern.is(value)) {
      return this.createMultiLineProblemPattern(value);
    } else if (Config.NamedCheckedProblemPattern.is(value)) {
      const result = this.createSingleProblemPattern(value);
      result.name = value.name;
      return result;
    } else if (Config.CheckedProblemPattern.is(value)) {
      return this.createSingleProblemPattern(value);
    } else {
      this.error(localize("ProblemPatternParser.problemPattern.missingRegExp", "The problem pattern is missing a regular expression."));
      return null;
    }
  }
  createSingleProblemPattern(value) {
    const result = this.doCreateSingleProblemPattern(value, true);
    if (result === void 0) {
      return null;
    } else if (result.kind === void 0) {
      result.kind = 1 /* Location */;
    }
    return this.validateProblemPattern([result]) ? result : null;
  }
  createNamedMultiLineProblemPattern(value) {
    const validPatterns = this.createMultiLineProblemPattern(value.patterns);
    if (!validPatterns) {
      return null;
    }
    const result = {
      name: value.name,
      label: value.label ? value.label : value.name,
      patterns: validPatterns
    };
    return result;
  }
  createMultiLineProblemPattern(values) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
      const pattern = this.doCreateSingleProblemPattern(values[i], false);
      if (pattern === void 0) {
        return null;
      }
      if (i < values.length - 1) {
        if (!Types.isUndefined(pattern.loop) && pattern.loop) {
          pattern.loop = false;
          this.error(localize("ProblemPatternParser.loopProperty.notLast", "The loop property is only supported on the last line matcher."));
        }
      }
      result.push(pattern);
    }
    if (!result || result.length === 0) {
      this.error(localize("ProblemPatternParser.problemPattern.emptyPattern", "The problem pattern is invalid. It must contain at least one pattern."));
      return null;
    }
    if (result[0].kind === void 0) {
      result[0].kind = 1 /* Location */;
    }
    return this.validateProblemPattern(result) ? result : null;
  }
  doCreateSingleProblemPattern(value, setDefaults) {
    const regexp = this.createRegularExpression(value.regexp);
    if (regexp === void 0) {
      return void 0;
    }
    let result = { regexp };
    if (value.kind) {
      result.kind = ProblemLocationKind.fromString(value.kind);
    }
    function copyProperty(result2, source, resultKey, sourceKey) {
      const value2 = source[sourceKey];
      if (typeof value2 === "number") {
        result2[resultKey] = value2;
      }
    }
    copyProperty(result, value, "file", "file");
    copyProperty(result, value, "location", "location");
    copyProperty(result, value, "line", "line");
    copyProperty(result, value, "character", "column");
    copyProperty(result, value, "endLine", "endLine");
    copyProperty(result, value, "endCharacter", "endColumn");
    copyProperty(result, value, "severity", "severity");
    copyProperty(result, value, "code", "code");
    copyProperty(result, value, "message", "message");
    if (value.loop === true || value.loop === false) {
      result.loop = value.loop;
    }
    if (setDefaults) {
      if (result.location || result.kind === 0 /* File */) {
        const defaultValue = {
          file: 1,
          message: 0
        };
        result = Objects.mixin(result, defaultValue, false);
      } else {
        const defaultValue = {
          file: 1,
          line: 2,
          character: 3,
          message: 0
        };
        result = Objects.mixin(result, defaultValue, false);
      }
    }
    return result;
  }
  validateProblemPattern(values) {
    if (!values || values.length === 0) {
      this.error(localize("ProblemPatternParser.problemPattern.emptyPattern", "The problem pattern is invalid. It must contain at least one pattern."));
      return false;
    }
    let file = false, message = false, location = false, line = false;
    const locationKind = values[0].kind === void 0 ? 1 /* Location */ : values[0].kind;
    values.forEach((pattern, i) => {
      if (i !== 0 && pattern.kind) {
        this.error(localize("ProblemPatternParser.problemPattern.kindProperty.notFirst", "The problem pattern is invalid. The kind property must be provided only in the first element"));
      }
      file = file || !Types.isUndefined(pattern.file);
      message = message || !Types.isUndefined(pattern.message);
      location = location || !Types.isUndefined(pattern.location);
      line = line || !Types.isUndefined(pattern.line);
    });
    if (!(file && message)) {
      this.error(localize("ProblemPatternParser.problemPattern.missingProperty", "The problem pattern is invalid. It must have at least have a file and a message."));
      return false;
    }
    if (locationKind === 1 /* Location */ && !(location || line)) {
      this.error(localize("ProblemPatternParser.problemPattern.missingLocation", 'The problem pattern is invalid. It must either have kind: "file" or have a line or location match group.'));
      return false;
    }
    return true;
  }
  createRegularExpression(value) {
    let result;
    try {
      result = new RegExp(value);
    } catch (err) {
      this.error(localize("ProblemPatternParser.invalidRegexp", "Error: The string {0} is not a valid regular expression.\n", value));
    }
    return result;
  }
}
class ExtensionRegistryReporter {
  constructor(_collector, _validationStatus = new ValidationStatus()) {
    this._collector = _collector;
    this._validationStatus = _validationStatus;
  }
  info(message) {
    this._validationStatus.state = ValidationState.Info;
    this._collector.info(message);
  }
  warn(message) {
    this._validationStatus.state = ValidationState.Warning;
    this._collector.warn(message);
  }
  error(message) {
    this._validationStatus.state = ValidationState.Error;
    this._collector.error(message);
  }
  fatal(message) {
    this._validationStatus.state = ValidationState.Fatal;
    this._collector.error(message);
  }
  get status() {
    return this._validationStatus;
  }
}
var Schemas;
((Schemas2) => {
  Schemas2.ProblemPattern = {
    default: {
      regexp: "^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$",
      file: 1,
      location: 2,
      message: 3
    },
    type: "object",
    additionalProperties: false,
    properties: {
      regexp: {
        type: "string",
        description: localize("ProblemPatternSchema.regexp", "The regular expression to find an error, warning or info in the output.")
      },
      kind: {
        type: "string",
        description: localize("ProblemPatternSchema.kind", "whether the pattern matches a location (file and line) or only a file.")
      },
      file: {
        type: "integer",
        description: localize("ProblemPatternSchema.file", "The match group index of the filename. If omitted 1 is used.")
      },
      location: {
        type: "integer",
        description: localize("ProblemPatternSchema.location", "The match group index of the problem's location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.")
      },
      line: {
        type: "integer",
        description: localize("ProblemPatternSchema.line", "The match group index of the problem's line. Defaults to 2")
      },
      column: {
        type: "integer",
        description: localize("ProblemPatternSchema.column", "The match group index of the problem's line character. Defaults to 3")
      },
      endLine: {
        type: "integer",
        description: localize("ProblemPatternSchema.endLine", "The match group index of the problem's end line. Defaults to undefined")
      },
      endColumn: {
        type: "integer",
        description: localize("ProblemPatternSchema.endColumn", "The match group index of the problem's end line character. Defaults to undefined")
      },
      severity: {
        type: "integer",
        description: localize("ProblemPatternSchema.severity", "The match group index of the problem's severity. Defaults to undefined")
      },
      code: {
        type: "integer",
        description: localize("ProblemPatternSchema.code", "The match group index of the problem's code. Defaults to undefined")
      },
      message: {
        type: "integer",
        description: localize("ProblemPatternSchema.message", "The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.")
      },
      loop: {
        type: "boolean",
        description: localize("ProblemPatternSchema.loop", "In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.")
      }
    }
  };
  Schemas2.NamedProblemPattern = Objects.deepClone(Schemas2.ProblemPattern);
  Schemas2.NamedProblemPattern.properties = Objects.deepClone(Schemas2.NamedProblemPattern.properties) || {};
  Schemas2.NamedProblemPattern.properties["name"] = {
    type: "string",
    description: localize("NamedProblemPatternSchema.name", "The name of the problem pattern.")
  };
  Schemas2.MultiLineProblemPattern = {
    type: "array",
    items: Schemas2.ProblemPattern
  };
  Schemas2.NamedMultiLineProblemPattern = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: {
        type: "string",
        description: localize("NamedMultiLineProblemPatternSchema.name", "The name of the problem multi line problem pattern.")
      },
      patterns: {
        type: "array",
        description: localize("NamedMultiLineProblemPatternSchema.patterns", "The actual patterns."),
        items: Schemas2.ProblemPattern
      }
    }
  };
  Schemas2.WatchingPattern = {
    type: "object",
    additionalProperties: false,
    properties: {
      regexp: {
        type: "string",
        description: localize("WatchingPatternSchema.regexp", "The regular expression to detect the begin or end of a background task.")
      },
      file: {
        type: "integer",
        description: localize("WatchingPatternSchema.file", "The match group index of the filename. Can be omitted.")
      }
    }
  };
  Schemas2.PatternType = {
    anyOf: [
      {
        type: "string",
        description: localize("PatternTypeSchema.name", "The name of a contributed or predefined pattern")
      },
      Schemas2.ProblemPattern,
      Schemas2.MultiLineProblemPattern
    ],
    description: localize("PatternTypeSchema.description", "A problem pattern or the name of a contributed or predefined problem pattern. Can be omitted if base is specified.")
  };
  Schemas2.ProblemMatcher = {
    type: "object",
    additionalProperties: false,
    properties: {
      base: {
        type: "string",
        description: localize("ProblemMatcherSchema.base", "The name of a base problem matcher to use.")
      },
      owner: {
        type: "string",
        description: localize("ProblemMatcherSchema.owner", "The owner of the problem inside Code. Can be omitted if base is specified. Defaults to 'external' if omitted and base is not specified.")
      },
      source: {
        type: "string",
        description: localize("ProblemMatcherSchema.source", "A human-readable string describing the source of this diagnostic, e.g. 'typescript' or 'super lint'.")
      },
      severity: {
        type: "string",
        enum: ["error", "warning", "info"],
        description: localize("ProblemMatcherSchema.severity", "The default severity for captures problems. Is used if the pattern doesn't define a match group for severity.")
      },
      applyTo: {
        type: "string",
        enum: ["allDocuments", "openDocuments", "closedDocuments"],
        description: localize("ProblemMatcherSchema.applyTo", "Controls if a problem reported on a text document is applied only to open, closed or all documents.")
      },
      pattern: Schemas2.PatternType,
      fileLocation: {
        oneOf: [
          {
            type: "string",
            enum: ["absolute", "relative", "autoDetect", "search"]
          },
          {
            type: "array",
            prefixItems: [
              {
                type: "string",
                enum: ["absolute", "relative", "autoDetect", "search"]
              }
            ],
            minItems: 1,
            maxItems: 1,
            additionalItems: false
          },
          {
            type: "array",
            prefixItems: [
              { type: "string", enum: ["relative", "autoDetect"] },
              { type: "string" }
            ],
            minItems: 2,
            maxItems: 2,
            additionalItems: false,
            examples: [
              ["relative", "${workspaceFolder}"],
              ["autoDetect", "${workspaceFolder}"]
            ]
          },
          {
            type: "array",
            prefixItems: [
              { type: "string", enum: ["search"] },
              {
                type: "object",
                properties: {
                  "include": {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } }
                    ]
                  },
                  "exclude": {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } }
                    ]
                  }
                },
                required: ["include"]
              }
            ],
            minItems: 2,
            maxItems: 2,
            additionalItems: false,
            examples: [
              ["search", { "include": ["${workspaceFolder}"] }],
              ["search", { "include": ["${workspaceFolder}"], "exclude": [] }]
            ]
          }
        ],
        description: localize("ProblemMatcherSchema.fileLocation", "Defines how file names reported in a problem pattern should be interpreted. A relative fileLocation may be an array, where the second element of the array is the path of the relative file location. The search fileLocation mode, performs a deep (and, possibly, heavy) file system search within the directories specified by the include/exclude properties of the second element (or the current workspace directory if not specified).")
      },
      background: {
        type: "object",
        additionalProperties: false,
        description: localize("ProblemMatcherSchema.background", "Patterns to track the begin and end of a matcher active on a background task."),
        properties: {
          activeOnStart: {
            type: "boolean",
            description: localize("ProblemMatcherSchema.background.activeOnStart", "If set to true the background monitor starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.")
          },
          beginsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.background.beginsPattern", "If matched in the output the start of a background task is signaled.")
          },
          endsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.background.endsPattern", "If matched in the output the end of a background task is signaled.")
          }
        }
      },
      watching: {
        type: "object",
        additionalProperties: false,
        deprecationMessage: localize("ProblemMatcherSchema.watching.deprecated", "The watching property is deprecated. Use background instead."),
        description: localize("ProblemMatcherSchema.watching", "Patterns to track the begin and end of a watching matcher."),
        properties: {
          activeOnStart: {
            type: "boolean",
            description: localize("ProblemMatcherSchema.watching.activeOnStart", "If set to true the watcher starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.")
          },
          beginsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.watching.beginsPattern", "If matched in the output the start of a watching task is signaled.")
          },
          endsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.watching.endsPattern", "If matched in the output the end of a watching task is signaled.")
          }
        }
      }
    }
  };
  Schemas2.LegacyProblemMatcher = Objects.deepClone(Schemas2.ProblemMatcher);
  Schemas2.LegacyProblemMatcher.properties = Objects.deepClone(Schemas2.LegacyProblemMatcher.properties) || {};
  Schemas2.LegacyProblemMatcher.properties["watchedTaskBeginsRegExp"] = {
    type: "string",
    deprecationMessage: localize("LegacyProblemMatcherSchema.watchedBegin.deprecated", "This property is deprecated. Use the watching property instead."),
    description: localize("LegacyProblemMatcherSchema.watchedBegin", "A regular expression signaling that a watched tasks begins executing triggered through file watching.")
  };
  Schemas2.LegacyProblemMatcher.properties["watchedTaskEndsRegExp"] = {
    type: "string",
    deprecationMessage: localize("LegacyProblemMatcherSchema.watchedEnd.deprecated", "This property is deprecated. Use the watching property instead."),
    description: localize("LegacyProblemMatcherSchema.watchedEnd", "A regular expression signaling that a watched tasks ends executing.")
  };
  Schemas2.NamedProblemMatcher = Objects.deepClone(Schemas2.ProblemMatcher);
  Schemas2.NamedProblemMatcher.properties = Objects.deepClone(Schemas2.NamedProblemMatcher.properties) || {};
  Schemas2.NamedProblemMatcher.properties.name = {
    type: "string",
    description: localize("NamedProblemMatcherSchema.name", "The name of the problem matcher used to refer to it.")
  };
  Schemas2.NamedProblemMatcher.properties.label = {
    type: "string",
    description: localize("NamedProblemMatcherSchema.label", "A human readable label of the problem matcher.")
  };
})(Schemas || (Schemas = {}));
const problemPatternExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "problemPatterns",
  jsonSchema: {
    description: localize("ProblemPatternExtPoint", "Contributes problem patterns"),
    type: "array",
    items: {
      anyOf: [
        Schemas.NamedProblemPattern,
        Schemas.NamedMultiLineProblemPattern
      ]
    }
  }
});
class ProblemPatternRegistryImpl {
  constructor() {
    this.patterns = /* @__PURE__ */ Object.create(null);
    this.fillDefaults();
    this.readyPromise = new Promise((resolve, reject) => {
      problemPatternExtPoint.setHandler((extensions, delta) => {
        try {
          delta.removed.forEach((extension) => {
            const problemPatterns = extension.value;
            for (const pattern of problemPatterns) {
              if (this.patterns[pattern.name]) {
                delete this.patterns[pattern.name];
              }
            }
          });
          delta.added.forEach((extension) => {
            const problemPatterns = extension.value;
            const parser = new ProblemPatternParser(new ExtensionRegistryReporter(extension.collector));
            for (const pattern of problemPatterns) {
              if (Config.NamedMultiLineCheckedProblemPattern.is(pattern)) {
                const result = parser.parse(pattern);
                if (parser.problemReporter.status.state < ValidationState.Error) {
                  this.add(result.name, result.patterns);
                } else {
                  extension.collector.error(localize("ProblemPatternRegistry.error", "Invalid problem pattern. The pattern will be ignored."));
                  extension.collector.error(JSON.stringify(pattern, void 0, 4));
                }
              } else if (Config.NamedProblemPattern.is(pattern)) {
                const result = parser.parse(pattern);
                if (parser.problemReporter.status.state < ValidationState.Error) {
                  this.add(pattern.name, result);
                } else {
                  extension.collector.error(localize("ProblemPatternRegistry.error", "Invalid problem pattern. The pattern will be ignored."));
                  extension.collector.error(JSON.stringify(pattern, void 0, 4));
                }
              }
              parser.reset();
            }
          });
        } catch (error) {
        }
        resolve(void 0);
      });
    });
  }
  onReady() {
    return this.readyPromise;
  }
  add(key, value) {
    this.patterns[key] = value;
  }
  get(key) {
    return this.patterns[key];
  }
  fillDefaults() {
    this.add("msCompile", {
      regexp: /^\s*(?:\s*\d+>)?(\S.*?)(?:\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\))?\s*:\s+(?:(\S+)\s+)?((?:fatal +)?error|warning|info)\s+(\w+\d+)?\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 4,
      code: 5,
      message: 6
    });
    this.add("gulp-tsc", {
      regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(\d+)\s+(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      code: 3,
      message: 4
    });
    this.add("cpp", {
      regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(C\d+)\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 3,
      code: 4,
      message: 5
    });
    this.add("csc", {
      regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(CS\d+)\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 3,
      code: 4,
      message: 5
    });
    this.add("vb", {
      regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(BC\d+)\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 3,
      code: 4,
      message: 5
    });
    this.add("lessCompile", {
      regexp: /^\s*(.*) in file (.*) line no. (\d+)$/,
      kind: 1 /* Location */,
      message: 1,
      file: 2,
      line: 3
    });
    this.add("jshint", {
      regexp: /^(.*):\s+line\s+(\d+),\s+col\s+(\d+),\s(.+?)(?:\s+\((\w)(\d+)\))?$/,
      kind: 1 /* Location */,
      file: 1,
      line: 2,
      character: 3,
      message: 4,
      severity: 5,
      code: 6
    });
    this.add("jshint-stylish", [
      {
        regexp: /^(.+)$/,
        kind: 1 /* Location */,
        file: 1
      },
      {
        regexp: /^\s+line\s+(\d+)\s+col\s+(\d+)\s+(.+?)(?:\s+\((\w)(\d+)\))?$/,
        line: 1,
        character: 2,
        message: 3,
        severity: 4,
        code: 5,
        loop: true
      }
    ]);
    this.add("eslint-compact", {
      regexp: /^(.+):\sline\s(\d+),\scol\s(\d+),\s(Error|Warning|Info)\s-\s(.+)\s\((.+)\)$/,
      file: 1,
      kind: 1 /* Location */,
      line: 2,
      character: 3,
      severity: 4,
      message: 5,
      code: 6
    });
    this.add("eslint-stylish", [
      {
        regexp: /^((?:[a-zA-Z]:)*[./\\]+.*?)$/,
        kind: 1 /* Location */,
        file: 1
      },
      {
        regexp: /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)(?:\s\s+(.*))?$/,
        line: 1,
        character: 2,
        severity: 3,
        message: 4,
        code: 5,
        loop: true
      }
    ]);
    this.add("go", {
      regexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/,
      kind: 1 /* Location */,
      file: 2,
      line: 4,
      character: 6,
      message: 7
    });
  }
}
const ProblemPatternRegistry = new ProblemPatternRegistryImpl();
class ProblemMatcherParser extends Parser {
  constructor(logger) {
    super(logger);
  }
  parse(json) {
    const result = this.createProblemMatcher(json);
    if (!this.checkProblemMatcherValid(json, result)) {
      return void 0;
    }
    this.addWatchingMatcher(json, result);
    return result;
  }
  checkProblemMatcherValid(externalProblemMatcher, problemMatcher) {
    if (!problemMatcher) {
      this.error(localize("ProblemMatcherParser.noProblemMatcher", "Error: the description can't be converted into a problem matcher:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    if (!problemMatcher.pattern) {
      this.error(localize("ProblemMatcherParser.noProblemPattern", "Error: the description doesn't define a valid problem pattern:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    if (!problemMatcher.owner) {
      this.error(localize("ProblemMatcherParser.noOwner", "Error: the description doesn't define an owner:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    if (Types.isUndefined(problemMatcher.fileLocation)) {
      this.error(localize("ProblemMatcherParser.noFileLocation", "Error: the description doesn't define a file location:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    return true;
  }
  createProblemMatcher(description) {
    let result = null;
    const owner = Types.isString(description.owner) ? description.owner : UUID.generateUuid();
    const source = Types.isString(description.source) ? description.source : void 0;
    let applyTo = Types.isString(description.applyTo) ? ApplyToKind.fromString(description.applyTo) : 0 /* allDocuments */;
    if (!applyTo) {
      applyTo = 0 /* allDocuments */;
    }
    let fileLocation = void 0;
    let filePrefix = void 0;
    let kind;
    if (Types.isUndefined(description.fileLocation)) {
      fileLocation = 1 /* Relative */;
      filePrefix = "${workspaceFolder}";
    } else if (Types.isString(description.fileLocation)) {
      kind = FileLocationKind.fromString(description.fileLocation);
      if (kind) {
        fileLocation = kind;
        if (kind === 1 /* Relative */ || kind === 3 /* AutoDetect */) {
          filePrefix = "${workspaceFolder}";
        } else if (kind === 4 /* Search */) {
          filePrefix = { include: ["${workspaceFolder}"] };
        }
      }
    } else if (Types.isStringArray(description.fileLocation)) {
      const values = description.fileLocation;
      if (values.length > 0) {
        kind = FileLocationKind.fromString(values[0]);
        if (values.length === 1 && kind === 2 /* Absolute */) {
          fileLocation = kind;
        } else if (values.length === 2 && (kind === 1 /* Relative */ || kind === 3 /* AutoDetect */) && values[1]) {
          fileLocation = kind;
          filePrefix = values[1];
        }
      }
    } else if (Array.isArray(description.fileLocation)) {
      const kind2 = FileLocationKind.fromString(description.fileLocation[0]);
      if (kind2 === 4 /* Search */) {
        fileLocation = 4 /* Search */;
        filePrefix = description.fileLocation[1] ?? { include: ["${workspaceFolder}"] };
      }
    }
    const pattern = description.pattern ? this.createProblemPattern(description.pattern) : void 0;
    let severity = description.severity ? Severity.fromValue(description.severity) : void 0;
    if (severity === Severity.Ignore) {
      this.info(localize("ProblemMatcherParser.unknownSeverity", "Info: unknown severity {0}. Valid values are error, warning and info.\n", description.severity));
      severity = Severity.Error;
    }
    if (Types.isString(description.base)) {
      const variableName = description.base;
      if (variableName.length > 1 && variableName[0] === "$") {
        const base = ProblemMatcherRegistry.get(variableName.substring(1));
        if (base) {
          result = Objects.deepClone(base);
          if (description.owner !== void 0 && owner !== void 0) {
            result.owner = owner;
          }
          if (description.source !== void 0 && source !== void 0) {
            result.source = source;
          }
          if (description.fileLocation !== void 0 && fileLocation !== void 0) {
            result.fileLocation = fileLocation;
            result.filePrefix = filePrefix;
          }
          if (description.pattern !== void 0 && pattern !== void 0 && pattern !== null) {
            result.pattern = pattern;
          }
          if (description.severity !== void 0 && severity !== void 0) {
            result.severity = severity;
          }
          if (description.applyTo !== void 0 && applyTo !== void 0) {
            result.applyTo = applyTo;
          }
        }
      }
    } else if (fileLocation && pattern) {
      result = {
        owner,
        applyTo,
        fileLocation,
        pattern
      };
      if (source) {
        result.source = source;
      }
      if (filePrefix) {
        result.filePrefix = filePrefix;
      }
      if (severity) {
        result.severity = severity;
      }
    }
    if (Config.isNamedProblemMatcher(description)) {
      result.name = description.name;
      result.label = Types.isString(description.label) ? description.label : description.name;
    }
    return result;
  }
  createProblemPattern(value) {
    if (Types.isString(value)) {
      const variableName = value;
      if (variableName.length > 1 && variableName[0] === "$") {
        const result = ProblemPatternRegistry.get(variableName.substring(1));
        if (!result) {
          this.error(localize("ProblemMatcherParser.noDefinedPatter", "Error: the pattern with the identifier {0} doesn't exist.", variableName));
        }
        return result;
      } else {
        if (variableName.length === 0) {
          this.error(localize("ProblemMatcherParser.noIdentifier", "Error: the pattern property refers to an empty identifier."));
        } else {
          this.error(localize("ProblemMatcherParser.noValidIdentifier", "Error: the pattern property {0} is not a valid pattern variable name.", variableName));
        }
      }
    } else if (value) {
      const problemPatternParser = new ProblemPatternParser(this.problemReporter);
      if (Array.isArray(value)) {
        return problemPatternParser.parse(value);
      } else {
        return problemPatternParser.parse(value);
      }
    }
    return null;
  }
  addWatchingMatcher(external, internal) {
    const oldBegins = this.createRegularExpression(external.watchedTaskBeginsRegExp);
    const oldEnds = this.createRegularExpression(external.watchedTaskEndsRegExp);
    if (oldBegins && oldEnds) {
      internal.watching = {
        activeOnStart: false,
        beginsPattern: { regexp: oldBegins },
        endsPattern: { regexp: oldEnds }
      };
      return;
    }
    const backgroundMonitor = external.background || external.watching;
    if (Types.isUndefinedOrNull(backgroundMonitor)) {
      return;
    }
    const begins = this.createWatchingPattern(backgroundMonitor.beginsPattern);
    const ends = this.createWatchingPattern(backgroundMonitor.endsPattern);
    if (begins && ends) {
      internal.watching = {
        activeOnStart: Types.isBoolean(backgroundMonitor.activeOnStart) ? backgroundMonitor.activeOnStart : false,
        beginsPattern: begins,
        endsPattern: ends
      };
      return;
    }
    if (begins || ends) {
      this.error(localize("ProblemMatcherParser.problemPattern.watchingMatcher", "A problem matcher must define both a begin pattern and an end pattern for watching."));
    }
  }
  createWatchingPattern(external) {
    if (Types.isUndefinedOrNull(external)) {
      return null;
    }
    let regexp;
    let file;
    if (Types.isString(external)) {
      regexp = this.createRegularExpression(external);
    } else {
      regexp = this.createRegularExpression(external.regexp);
      if (Types.isNumber(external.file)) {
        file = external.file;
      }
    }
    if (!regexp) {
      return null;
    }
    return file ? { regexp, file } : { regexp, file: 1 };
  }
  createRegularExpression(value) {
    let result = null;
    if (!value) {
      return result;
    }
    try {
      result = new RegExp(value);
    } catch (err) {
      this.error(localize("ProblemMatcherParser.invalidRegexp", "Error: The string {0} is not a valid regular expression.\n", value));
    }
    return result;
  }
}
const problemMatchersExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "problemMatchers",
  deps: [problemPatternExtPoint],
  jsonSchema: {
    description: localize("ProblemMatcherExtPoint", "Contributes problem matchers"),
    type: "array",
    items: Schemas.NamedProblemMatcher
  }
});
class ProblemMatcherRegistryImpl {
  constructor() {
    this._onMatchersChanged = new Emitter();
    this.onMatcherChanged = this._onMatchersChanged.event;
    this.matchers = /* @__PURE__ */ Object.create(null);
    this.fillDefaults();
    this.readyPromise = new Promise((resolve, reject) => {
      problemMatchersExtPoint.setHandler((extensions, delta) => {
        try {
          delta.removed.forEach((extension) => {
            const problemMatchers = extension.value;
            for (const matcher2 of problemMatchers) {
              if (this.matchers[matcher2.name]) {
                delete this.matchers[matcher2.name];
              }
            }
          });
          delta.added.forEach((extension) => {
            const problemMatchers = extension.value;
            const parser = new ProblemMatcherParser(new ExtensionRegistryReporter(extension.collector));
            for (const matcher2 of problemMatchers) {
              const result = parser.parse(matcher2);
              if (result && isNamedProblemMatcher(result)) {
                this.add(result);
              }
            }
          });
          if (delta.removed.length > 0 || delta.added.length > 0) {
            this._onMatchersChanged.fire();
          }
        } catch (error) {
        }
        const matcher = this.get("tsc-watch");
        if (matcher) {
          matcher.tscWatch = true;
        }
        resolve(void 0);
      });
    });
  }
  onReady() {
    ProblemPatternRegistry.onReady();
    return this.readyPromise;
  }
  add(matcher) {
    this.matchers[matcher.name] = matcher;
  }
  get(name) {
    return this.matchers[name];
  }
  keys() {
    return Object.keys(this.matchers);
  }
  fillDefaults() {
    this.add({
      name: "msCompile",
      label: localize("msCompile", "Microsoft compiler problems"),
      owner: "msCompile",
      source: "cpp",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("msCompile")
    });
    this.add({
      name: "lessCompile",
      label: localize("lessCompile", "Less problems"),
      deprecated: true,
      owner: "lessCompile",
      source: "less",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("lessCompile"),
      severity: Severity.Error
    });
    this.add({
      name: "gulp-tsc",
      label: localize("gulp-tsc", "Gulp TSC Problems"),
      owner: "typescript",
      source: "ts",
      applyTo: 2 /* closedDocuments */,
      fileLocation: 1 /* Relative */,
      filePrefix: "${workspaceFolder}",
      pattern: ProblemPatternRegistry.get("gulp-tsc")
    });
    this.add({
      name: "jshint",
      label: localize("jshint", "JSHint problems"),
      owner: "jshint",
      source: "jshint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("jshint")
    });
    this.add({
      name: "jshint-stylish",
      label: localize("jshint-stylish", "JSHint stylish problems"),
      owner: "jshint",
      source: "jshint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("jshint-stylish")
    });
    this.add({
      name: "eslint-compact",
      label: localize("eslint-compact", "ESLint compact problems"),
      owner: "eslint",
      source: "eslint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      filePrefix: "${workspaceFolder}",
      pattern: ProblemPatternRegistry.get("eslint-compact")
    });
    this.add({
      name: "eslint-stylish",
      label: localize("eslint-stylish", "ESLint stylish problems"),
      owner: "eslint",
      source: "eslint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("eslint-stylish")
    });
    this.add({
      name: "go",
      label: localize("go", "Go problems"),
      owner: "go",
      source: "go",
      applyTo: 0 /* allDocuments */,
      fileLocation: 1 /* Relative */,
      filePrefix: "${workspaceFolder}",
      pattern: ProblemPatternRegistry.get("go")
    });
  }
}
const ProblemMatcherRegistry = new ProblemMatcherRegistryImpl();
export {
  ApplyToKind,
  Config,
  ExtensionRegistryReporter,
  FileLocationKind,
  ProblemLocationKind,
  ProblemMatcherParser,
  ProblemMatcherRegistry,
  ProblemPatternParser,
  ProblemPatternRegistry,
  Schemas,
  createLineMatcher,
  getResource,
  isNamedProblemMatcher
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXHByb2JsZW1NYXRjaGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgU3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAqIGFzIEFzc2VydCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgam9pbiwgbm9ybWFsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBVVUlEIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICogYXMgUGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgVmFsaWRhdGlvblN0YXR1cywgVmFsaWRhdGlvblN0YXRlLCBJUHJvYmxlbVJlcG9ydGVyLCBQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXJzZXJzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIGFzIE5ldHdvcmtTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cbmltcG9ydCB7IElNYXJrZXJEYXRhLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRmlsZVR5cGUsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSwgSUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGVudW0gRmlsZUxvY2F0aW9uS2luZCB7XG5cdERlZmF1bHQsXG5cdFJlbGF0aXZlLFxuXHRBYnNvbHV0ZSxcblx0QXV0b0RldGVjdCxcblx0U2VhcmNoXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRmlsZUxvY2F0aW9uS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBGaWxlTG9jYXRpb25LaW5kIHwgdW5kZWZpbmVkIHtcblx0XHR2YWx1ZSA9IHZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKHZhbHVlID09PSAnYWJzb2x1dGUnKSB7XG5cdFx0XHRyZXR1cm4gRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSAncmVsYXRpdmUnKSB7XG5cdFx0XHRyZXR1cm4gRmlsZUxvY2F0aW9uS2luZC5SZWxhdGl2ZTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSAnYXV0b2RldGVjdCcpIHtcblx0XHRcdHJldHVybiBGaWxlTG9jYXRpb25LaW5kLkF1dG9EZXRlY3Q7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ3NlYXJjaCcpIHtcblx0XHRcdHJldHVybiBGaWxlTG9jYXRpb25LaW5kLlNlYXJjaDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gUHJvYmxlbUxvY2F0aW9uS2luZCB7XG5cdEZpbGUsXG5cdExvY2F0aW9uXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUHJvYmxlbUxvY2F0aW9uS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBQcm9ibGVtTG9jYXRpb25LaW5kIHwgdW5kZWZpbmVkIHtcblx0XHR2YWx1ZSA9IHZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKHZhbHVlID09PSAnZmlsZScpIHtcblx0XHRcdHJldHVybiBQcm9ibGVtTG9jYXRpb25LaW5kLkZpbGU7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2xvY2F0aW9uJykge1xuXHRcdFx0cmV0dXJuIFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2JsZW1QYXR0ZXJuIHtcblx0cmVnZXhwOiBSZWdFeHA7XG5cblx0a2luZD86IFByb2JsZW1Mb2NhdGlvbktpbmQ7XG5cblx0ZmlsZT86IG51bWJlcjtcblxuXHRtZXNzYWdlPzogbnVtYmVyO1xuXG5cdGxvY2F0aW9uPzogbnVtYmVyO1xuXG5cdGxpbmU/OiBudW1iZXI7XG5cblx0Y2hhcmFjdGVyPzogbnVtYmVyO1xuXG5cdGVuZExpbmU/OiBudW1iZXI7XG5cblx0ZW5kQ2hhcmFjdGVyPzogbnVtYmVyO1xuXG5cdGNvZGU/OiBudW1iZXI7XG5cblx0c2V2ZXJpdHk/OiBudW1iZXI7XG5cblx0bG9vcD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5hbWVkUHJvYmxlbVBhdHRlcm4gZXh0ZW5kcyBJUHJvYmxlbVBhdHRlcm4ge1xuXHRuYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIE11bHRpTGluZVByb2JsZW1QYXR0ZXJuID0gSVByb2JsZW1QYXR0ZXJuW107XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdhdGNoaW5nUGF0dGVybiB7XG5cdHJlZ2V4cDogUmVnRXhwO1xuXHRmaWxlPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXYXRjaGluZ01hdGNoZXIge1xuXHRhY3RpdmVPblN0YXJ0OiBib29sZWFuO1xuXHRiZWdpbnNQYXR0ZXJuOiBJV2F0Y2hpbmdQYXR0ZXJuO1xuXHRlbmRzUGF0dGVybjogSVdhdGNoaW5nUGF0dGVybjtcbn1cblxuZXhwb3J0IGVudW0gQXBwbHlUb0tpbmQge1xuXHRhbGxEb2N1bWVudHMsXG5cdG9wZW5Eb2N1bWVudHMsXG5cdGNsb3NlZERvY3VtZW50c1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIEFwcGx5VG9LaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdHJpbmcodmFsdWU6IHN0cmluZyk6IEFwcGx5VG9LaW5kIHwgdW5kZWZpbmVkIHtcblx0XHR2YWx1ZSA9IHZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKHZhbHVlID09PSAnYWxsZG9jdW1lbnRzJykge1xuXHRcdFx0cmV0dXJuIEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cztcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSAnb3BlbmRvY3VtZW50cycpIHtcblx0XHRcdHJldHVybiBBcHBseVRvS2luZC5vcGVuRG9jdW1lbnRzO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICdjbG9zZWRkb2N1bWVudHMnKSB7XG5cdFx0XHRyZXR1cm4gQXBwbHlUb0tpbmQuY2xvc2VkRG9jdW1lbnRzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2JsZW1NYXRjaGVyIHtcblx0b3duZXI6IHN0cmluZztcblx0c291cmNlPzogc3RyaW5nO1xuXHRhcHBseVRvOiBBcHBseVRvS2luZDtcblx0ZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kO1xuXHRmaWxlUHJlZml4Pzogc3RyaW5nIHwgQ29uZmlnLlNlYXJjaEZpbGVMb2NhdGlvbkFyZ3M7XG5cdHBhdHRlcm46IFR5cGVzLlNpbmdsZU9yTWFueTxJUHJvYmxlbVBhdHRlcm4+O1xuXHRzZXZlcml0eT86IFNldmVyaXR5O1xuXHR3YXRjaGluZz86IElXYXRjaGluZ01hdGNoZXI7XG5cdHVyaVByb3ZpZGVyPzogKHBhdGg6IHN0cmluZykgPT4gVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOYW1lZFByb2JsZW1NYXRjaGVyIGV4dGVuZHMgUHJvYmxlbU1hdGNoZXIge1xuXHRuYW1lOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGRlcHJlY2F0ZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuIHtcblx0bmFtZTogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRwYXR0ZXJuczogTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05hbWVkUHJvYmxlbU1hdGNoZXIodmFsdWU6IFByb2JsZW1NYXRjaGVyIHwgdW5kZWZpbmVkKTogdmFsdWUgaXMgSU5hbWVkUHJvYmxlbU1hdGNoZXIge1xuXHRyZXR1cm4gdmFsdWUgJiYgVHlwZXMuaXNTdHJpbmcoKDxJTmFtZWRQcm9ibGVtTWF0Y2hlcj52YWx1ZSkubmFtZSkgPyB0cnVlIDogZmFsc2U7XG59XG5cbmludGVyZmFjZSBJTG9jYXRpb24ge1xuXHRzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0c3RhcnRDaGFyYWN0ZXI6IG51bWJlcjtcblx0ZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRlbmRDaGFyYWN0ZXI6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElQcm9ibGVtRGF0YSB7XG5cdGtpbmQ/OiBQcm9ibGVtTG9jYXRpb25LaW5kO1xuXHRmaWxlPzogc3RyaW5nO1xuXHRsb2NhdGlvbj86IHN0cmluZztcblx0bGluZT86IHN0cmluZztcblx0Y2hhcmFjdGVyPzogc3RyaW5nO1xuXHRlbmRMaW5lPzogc3RyaW5nO1xuXHRlbmRDaGFyYWN0ZXI/OiBzdHJpbmc7XG5cdG1lc3NhZ2U/OiBzdHJpbmc7XG5cdHNldmVyaXR5Pzogc3RyaW5nO1xuXHRjb2RlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtTWF0Y2gge1xuXHRyZXNvdXJjZTogUHJvbWlzZTxVUkk+O1xuXHRtYXJrZXI6IElNYXJrZXJEYXRhO1xuXHRkZXNjcmlwdGlvbjogUHJvYmxlbU1hdGNoZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhhbmRsZVJlc3VsdCB7XG5cdG1hdGNoOiBJUHJvYmxlbU1hdGNoIHwgbnVsbDtcblx0Y29udGludWU6IGJvb2xlYW47XG59XG5cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFJlc291cmNlKGZpbGVuYW1lOiBzdHJpbmcsIG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSk6IFByb21pc2U8VVJJPiB7XG5cdGNvbnN0IGtpbmQgPSBtYXRjaGVyLmZpbGVMb2NhdGlvbjtcblx0bGV0IGZ1bGxQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGlmIChraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLkFic29sdXRlKSB7XG5cdFx0ZnVsbFBhdGggPSBmaWxlbmFtZTtcblx0fSBlbHNlIGlmICgoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5SZWxhdGl2ZSkgJiYgbWF0Y2hlci5maWxlUHJlZml4ICYmIFR5cGVzLmlzU3RyaW5nKG1hdGNoZXIuZmlsZVByZWZpeCkpIHtcblx0XHRmdWxsUGF0aCA9IGpvaW4obWF0Y2hlci5maWxlUHJlZml4LCBmaWxlbmFtZSk7XG5cdH0gZWxzZSBpZiAoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5BdXRvRGV0ZWN0KSB7XG5cdFx0Y29uc3QgbWF0Y2hlckNsb25lID0gT2JqZWN0cy5kZWVwQ2xvbmUobWF0Y2hlcik7XG5cdFx0bWF0Y2hlckNsb25lLmZpbGVMb2NhdGlvbiA9IEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmU7XG5cdFx0aWYgKGZpbGVTZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCByZWxhdGl2ZSA9IGF3YWl0IGdldFJlc291cmNlKGZpbGVuYW1lLCBtYXRjaGVyQ2xvbmUpO1xuXHRcdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdGF0ID0gYXdhaXQgZmlsZVNlcnZpY2Uuc3RhdChyZWxhdGl2ZSk7XG5cdFx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0XHQvLyBEbyBub3RoaW5nLCB3ZSBqdXN0IG5lZWQgdG8gY2F0Y2ggZmlsZSByZXNvbHV0aW9uIGVycm9ycy5cblx0XHRcdH1cblx0XHRcdGlmIChzdGF0KSB7XG5cdFx0XHRcdHJldHVybiByZWxhdGl2ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRtYXRjaGVyQ2xvbmUuZmlsZUxvY2F0aW9uID0gRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZTtcblx0XHRyZXR1cm4gZ2V0UmVzb3VyY2UoZmlsZW5hbWUsIG1hdGNoZXJDbG9uZSk7XG5cdH0gZWxzZSBpZiAoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5TZWFyY2ggJiYgZmlsZVNlcnZpY2UpIHtcblx0XHRjb25zdCBmc1Byb3ZpZGVyID0gZmlsZVNlcnZpY2UuZ2V0UHJvdmlkZXIoTmV0d29ya1NjaGVtYXMuZmlsZSk7XG5cdFx0aWYgKGZzUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlYXJjaEZvckZpbGVMb2NhdGlvbihmaWxlbmFtZSwgZnNQcm92aWRlciwgbWF0Y2hlci5maWxlUHJlZml4IGFzIENvbmZpZy5TZWFyY2hGaWxlTG9jYXRpb25BcmdzKTtcblx0XHRcdGZ1bGxQYXRoID0gdXJpPy5wYXRoO1xuXHRcdH1cblxuXHRcdGlmICghZnVsbFBhdGgpIHtcblx0XHRcdGNvbnN0IGFic29sdXRlTWF0Y2hlciA9IE9iamVjdHMuZGVlcENsb25lKG1hdGNoZXIpO1xuXHRcdFx0YWJzb2x1dGVNYXRjaGVyLmZpbGVMb2NhdGlvbiA9IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGU7XG5cdFx0XHRyZXR1cm4gZ2V0UmVzb3VyY2UoZmlsZW5hbWUsIGFic29sdXRlTWF0Y2hlcik7XG5cdFx0fVxuXHR9XG5cdGlmIChmdWxsUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdGaWxlTG9jYXRpb25LaW5kIGlzIG5vdCBhY3Rpb25hYmxlLiBEb2VzIHRoZSBtYXRjaGVyIGhhdmUgYSBmaWxlUHJlZml4PyBUaGlzIHNob3VsZCBuZXZlciBoYXBwZW4uJyk7XG5cdH1cblx0ZnVsbFBhdGggPSBub3JtYWxpemUoZnVsbFBhdGgpO1xuXHRmdWxsUGF0aCA9IGZ1bGxQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblx0aWYgKGZ1bGxQYXRoWzBdICE9PSAnLycpIHtcblx0XHRmdWxsUGF0aCA9ICcvJyArIGZ1bGxQYXRoO1xuXHR9XG5cdGlmIChtYXRjaGVyLnVyaVByb3ZpZGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gbWF0Y2hlci51cmlQcm92aWRlcihmdWxsUGF0aCk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGZ1bGxQYXRoKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBzZWFyY2hGb3JGaWxlTG9jYXRpb24oZmlsZW5hbWU6IHN0cmluZywgZnNQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgYXJnczogQ29uZmlnLlNlYXJjaEZpbGVMb2NhdGlvbkFyZ3MpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBleGNsdXNpb25zID0gbmV3IFNldChhc0FycmF5KGFyZ3MuZXhjbHVkZSB8fCBbXSkubWFwKHggPT4gVVJJLmZpbGUoeCkucGF0aCkpO1xuXHRhc3luYyBmdW5jdGlvbiBzZWFyY2goZGlyOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChleGNsdXNpb25zLmhhcyhkaXIucGF0aCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IGZzUHJvdmlkZXIucmVhZGRpcihkaXIpO1xuXHRcdGNvbnN0IHN1YmRpcnM6IFVSSVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtuYW1lLCBmaWxlVHlwZV0gb2YgZW50cmllcykge1xuXHRcdFx0aWYgKGZpbGVUeXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdFx0c3ViZGlycy5wdXNoKFVSSS5qb2luUGF0aChkaXIsIG5hbWUpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaWxlVHlwZSA9PT0gRmlsZVR5cGUuRmlsZSkge1xuXHRcdFx0XHQvKipcblx0XHRcdFx0ICogTm90ZSB0aGF0IHNvbWV0aW1lcyB0aGUgZ2l2ZW4gYGZpbGVuYW1lYCBjb3VsZCBiZSBhIHJlbGF0aXZlXG5cdFx0XHRcdCAqIHBhdGggKG5vdCBqdXN0IHRoZSBcIm5hbWUuZXh0XCIgcGFydCkuIEZvciBleGFtcGxlLCB0aGVcblx0XHRcdFx0ICogYGZpbGVuYW1lYCBjYW4gYmUgXCIvc3ViZGlyL25hbWUuZXh0XCIuIFNvLCBqdXN0IGNvbXBhcmluZ1xuXHRcdFx0XHQgKiBgbmFtZWAgYXMgYGZpbGVuYW1lYCBpcyBub3Qgc3VmZmljaWVudC4gVGhlIHdvcmthcm91bmQgaGVyZVxuXHRcdFx0XHQgKiBpcyB0byBmb3JtIHRoZSBVUkkgd2l0aCBgZGlyYCBhbmQgYG5hbWVgIGFuZCBjaGVjayBpZiBpdCBlbmRzXG5cdFx0XHRcdCAqIHdpdGggdGhlIGdpdmVuIGBmaWxlbmFtZWAuXG5cdFx0XHRcdCAqL1xuXHRcdFx0XHRjb25zdCBmdWxsVXJpID0gVVJJLmpvaW5QYXRoKGRpciwgbmFtZSk7XG5cdFx0XHRcdGlmIChmdWxsVXJpLnBhdGguZW5kc1dpdGgoZmlsZW5hbWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZ1bGxVcmk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHN1YmRpciBvZiBzdWJkaXJzKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZWFyY2goc3ViZGlyKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZvciAoY29uc3QgZGlyIG9mIGFzQXJyYXkoYXJncy5pbmNsdWRlIHx8IFtdKSkge1xuXHRcdGNvbnN0IGhpdCA9IGF3YWl0IHNlYXJjaChVUkkuZmlsZShkaXIpKTtcblx0XHRpZiAoaGl0KSB7XG5cdFx0XHRyZXR1cm4gaGl0O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaW5lTWF0Y2hlciB7XG5cdG1hdGNoTGVuZ3RoOiBudW1iZXI7XG5cdG5leHQobGluZTogc3RyaW5nKTogSVByb2JsZW1NYXRjaCB8IG51bGw7XG5cdGhhbmRsZShsaW5lczogc3RyaW5nW10sIHN0YXJ0PzogbnVtYmVyKTogSUhhbmRsZVJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpbmVNYXRjaGVyKG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKTogSUxpbmVNYXRjaGVyIHtcblx0Y29uc3QgcGF0dGVybiA9IG1hdGNoZXIucGF0dGVybjtcblx0aWYgKEFycmF5LmlzQXJyYXkocGF0dGVybikpIHtcblx0XHRyZXR1cm4gbmV3IE11bHRpTGluZU1hdGNoZXIobWF0Y2hlciwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBuZXcgU2luZ2xlTGluZU1hdGNoZXIobWF0Y2hlciwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9XG59XG5cbmNvbnN0IGVuZE9mTGluZTogc3RyaW5nID0gUGxhdGZvcm0uT1MgPT09IFBsYXRmb3JtLk9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ1xcclxcbicgOiAnXFxuJztcblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RMaW5lTWF0Y2hlciBpbXBsZW1lbnRzIElMaW5lTWF0Y2hlciB7XG5cdHByaXZhdGUgbWF0Y2hlcjogUHJvYmxlbU1hdGNoZXI7XG5cdHByaXZhdGUgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2U7XG5cdHByaXZhdGUgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKSB7XG5cdFx0dGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcblx0XHR0aGlzLmZpbGVTZXJ2aWNlID0gZmlsZVNlcnZpY2U7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGUobGluZXM6IHN0cmluZ1tdLCBzdGFydDogbnVtYmVyID0gMCk6IElIYW5kbGVSZXN1bHQge1xuXHRcdHJldHVybiB7IG1hdGNoOiBudWxsLCBjb250aW51ZTogZmFsc2UgfTtcblx0fVxuXG5cdHB1YmxpYyBuZXh0KGxpbmU6IHN0cmluZyk6IElQcm9ibGVtTWF0Y2ggfCBudWxsIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXQgbWF0Y2hMZW5ndGgoKTogbnVtYmVyO1xuXG5cdHByb3RlY3RlZCByZWdleHBFeGVjKHJlZ2V4cDogUmVnRXhwLCBsaW5lOiBzdHJpbmcpOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIHtcblx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVnZXhwLmV4ZWMobGluZSk7XG5cdFx0Y29uc3QgZWxhcHNlZCA9IERhdGUubm93KCkgLSBzdGFydDtcblx0XHRpZiAoZWxhcHNlZCA+IDUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZT8udHJhY2UoYFByb2JsZW1NYXRjaGVyOiBzbG93IHJlZ2V4cCB0b29rICR7ZWxhcHNlZH1tcyB0byBleGVjdXRlYCwgcmVnZXhwLnNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZmlsbFByb2JsZW1EYXRhKGRhdGE6IElQcm9ibGVtRGF0YSB8IHVuZGVmaW5lZCwgcGF0dGVybjogSVByb2JsZW1QYXR0ZXJuLCBtYXRjaGVzOiBSZWdFeHBFeGVjQXJyYXkpOiBkYXRhIGlzIElQcm9ibGVtRGF0YSB7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdHRoaXMuZmlsbFByb3BlcnR5KGRhdGEsICdmaWxlJywgcGF0dGVybiwgbWF0Y2hlcywgdHJ1ZSk7XG5cdFx0XHR0aGlzLmFwcGVuZFByb3BlcnR5KGRhdGEsICdtZXNzYWdlJywgcGF0dGVybiwgbWF0Y2hlcywgdHJ1ZSk7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCAnY29kZScsIHBhdHRlcm4sIG1hdGNoZXMsIHRydWUpO1xuXHRcdFx0dGhpcy5maWxsUHJvcGVydHkoZGF0YSwgJ3NldmVyaXR5JywgcGF0dGVybiwgbWF0Y2hlcywgdHJ1ZSk7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCAnbG9jYXRpb24nLCBwYXR0ZXJuLCBtYXRjaGVzLCB0cnVlKTtcblx0XHRcdHRoaXMuZmlsbFByb3BlcnR5KGRhdGEsICdsaW5lJywgcGF0dGVybiwgbWF0Y2hlcyk7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCAnY2hhcmFjdGVyJywgcGF0dGVybiwgbWF0Y2hlcyk7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCAnZW5kTGluZScsIHBhdHRlcm4sIG1hdGNoZXMpO1xuXHRcdFx0dGhpcy5maWxsUHJvcGVydHkoZGF0YSwgJ2VuZENoYXJhY3RlcicsIHBhdHRlcm4sIG1hdGNoZXMpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZFByb3BlcnR5KGRhdGE6IElQcm9ibGVtRGF0YSwgcHJvcGVydHk6IGtleW9mIElQcm9ibGVtRGF0YSwgcGF0dGVybjogSVByb2JsZW1QYXR0ZXJuLCBtYXRjaGVzOiBSZWdFeHBFeGVjQXJyYXksIHRyaW06IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHBhdHRlcm5Qcm9wZXJ0eSA9IHBhdHRlcm5bcHJvcGVydHldO1xuXHRcdGlmIChUeXBlcy5pc1VuZGVmaW5lZChkYXRhW3Byb3BlcnR5XSkpIHtcblx0XHRcdHRoaXMuZmlsbFByb3BlcnR5KGRhdGEsIHByb3BlcnR5LCBwYXR0ZXJuLCBtYXRjaGVzLCB0cmltKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoIVR5cGVzLmlzVW5kZWZpbmVkKHBhdHRlcm5Qcm9wZXJ0eSkgJiYgcGF0dGVyblByb3BlcnR5IDwgbWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdGxldCB2YWx1ZSA9IG1hdGNoZXNbcGF0dGVyblByb3BlcnR5XTtcblx0XHRcdGlmICh0cmltKSB7XG5cdFx0XHRcdHZhbHVlID0gU3RyaW5ncy50cmltKHZhbHVlKSE7XG5cdFx0XHR9XG5cdFx0XHQoZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KVtwcm9wZXJ0eV0gPSBkYXRhW3Byb3BlcnR5XSEgKyBlbmRPZkxpbmUgKyB2YWx1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbGxQcm9wZXJ0eShkYXRhOiBJUHJvYmxlbURhdGEsIHByb3BlcnR5OiBrZXlvZiBJUHJvYmxlbURhdGEsIHBhdHRlcm46IElQcm9ibGVtUGF0dGVybiwgbWF0Y2hlczogUmVnRXhwRXhlY0FycmF5LCB0cmltOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCBwYXR0ZXJuQXRQcm9wZXJ0eSA9IHBhdHRlcm5bcHJvcGVydHldO1xuXHRcdGlmIChUeXBlcy5pc1VuZGVmaW5lZChkYXRhW3Byb3BlcnR5XSkgJiYgIVR5cGVzLmlzVW5kZWZpbmVkKHBhdHRlcm5BdFByb3BlcnR5KSAmJiBwYXR0ZXJuQXRQcm9wZXJ0eSA8IG1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRsZXQgdmFsdWUgPSBtYXRjaGVzW3BhdHRlcm5BdFByb3BlcnR5XTtcblx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmICh0cmltKSB7XG5cdFx0XHRcdFx0dmFsdWUgPSBTdHJpbmdzLnRyaW0odmFsdWUpITtcblx0XHRcdFx0fVxuXHRcdFx0XHQoZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0TWFya2VyTWF0Y2goZGF0YTogSVByb2JsZW1EYXRhKTogSVByb2JsZW1NYXRjaCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRMb2NhdGlvbihkYXRhKTtcblx0XHRcdGlmIChkYXRhLmZpbGUgJiYgbG9jYXRpb24gJiYgZGF0YS5tZXNzYWdlKSB7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcjogSU1hcmtlckRhdGEgPSB7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IHRoaXMuZ2V0U2V2ZXJpdHkoZGF0YSksXG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsb2NhdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IGxvY2F0aW9uLnN0YXJ0Q2hhcmFjdGVyLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxvY2F0aW9uLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBsb2NhdGlvbi5lbmRDaGFyYWN0ZXIsXG5cdFx0XHRcdFx0bWVzc2FnZTogZGF0YS5tZXNzYWdlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChkYXRhLmNvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG1hcmtlci5jb2RlID0gZGF0YS5jb2RlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLm1hdGNoZXIuc291cmNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRtYXJrZXIuc291cmNlID0gdGhpcy5tYXRjaGVyLnNvdXJjZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLm1hdGNoZXIsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuZ2V0UmVzb3VyY2UoZGF0YS5maWxlKSxcblx0XHRcdFx0XHRtYXJrZXI6IG1hcmtlclxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGNvbnZlcnQgcHJvYmxlbSBkYXRhIGludG8gbWF0Y2g6ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UmVzb3VyY2UoZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIGdldFJlc291cmNlKGZpbGVuYW1lLCB0aGlzLm1hdGNoZXIsIHRoaXMuZmlsZVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMb2NhdGlvbihkYXRhOiBJUHJvYmxlbURhdGEpOiBJTG9jYXRpb24gfCBudWxsIHtcblx0XHRpZiAoZGF0YS5raW5kID09PSBQcm9ibGVtTG9jYXRpb25LaW5kLkZpbGUpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUxvY2F0aW9uKDAsIDAsIDAsIDApO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5sb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VMb2NhdGlvbkluZm8oZGF0YS5sb2NhdGlvbik7XG5cdFx0fVxuXHRcdGlmICghZGF0YS5saW5lKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gcGFyc2VJbnQoZGF0YS5saW5lKTtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IGRhdGEuY2hhcmFjdGVyID8gcGFyc2VJbnQoZGF0YS5jaGFyYWN0ZXIpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGVuZExpbmUgPSBkYXRhLmVuZExpbmUgPyBwYXJzZUludChkYXRhLmVuZExpbmUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IGRhdGEuZW5kQ2hhcmFjdGVyID8gcGFyc2VJbnQoZGF0YS5lbmRDaGFyYWN0ZXIpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUxvY2F0aW9uKHN0YXJ0TGluZSwgc3RhcnRDb2x1bW4sIGVuZExpbmUsIGVuZENvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlTG9jYXRpb25JbmZvKHZhbHVlOiBzdHJpbmcpOiBJTG9jYXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXZhbHVlIHx8ICF2YWx1ZS5tYXRjaCgvKFxcZCt8XFxkKyxcXGQrfFxcZCssXFxkKyxcXGQrLFxcZCspLykpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBwYXJ0cyA9IHZhbHVlLnNwbGl0KCcsJyk7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gcGFyc2VJbnQocGFydHNbMF0pO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gcGFydHMubGVuZ3RoID4gMSA/IHBhcnNlSW50KHBhcnRzWzFdKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocGFydHMubGVuZ3RoID4gMykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlTG9jYXRpb24oc3RhcnRMaW5lLCBzdGFydENvbHVtbiwgcGFyc2VJbnQocGFydHNbMl0pLCBwYXJzZUludChwYXJ0c1szXSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVMb2NhdGlvbihzdGFydExpbmUsIHN0YXJ0Q29sdW1uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVMb2NhdGlvbihzdGFydExpbmU6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCwgZW5kTGluZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBlbmRDb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCk6IElMb2NhdGlvbiB7XG5cdFx0aWYgKHN0YXJ0Q29sdW1uICE9PSB1bmRlZmluZWQgJiYgZW5kQ29sdW1uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lLCBzdGFydENoYXJhY3Rlcjogc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXI6IGVuZExpbmUgfHwgc3RhcnRMaW5lLCBlbmRDaGFyYWN0ZXI6IGVuZENvbHVtbiB9O1xuXHRcdH1cblx0XHRpZiAoc3RhcnRDb2x1bW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmUsIHN0YXJ0Q2hhcmFjdGVyOiBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogc3RhcnRMaW5lLCBlbmRDaGFyYWN0ZXI6IHN0YXJ0Q29sdW1uIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lLCBzdGFydENoYXJhY3RlcjogMSwgZW5kTGluZU51bWJlcjogc3RhcnRMaW5lLCBlbmRDaGFyYWN0ZXI6IDIgKiogMzEgLSAxIH07IC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODAyODgjaXNzdWVjb21tZW50LTY1MDYzNjQ0MiBmb3IgZGlzY3Vzc2lvblxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXZlcml0eShkYXRhOiBJUHJvYmxlbURhdGEpOiBNYXJrZXJTZXZlcml0eSB7XG5cdFx0bGV0IHJlc3VsdDogU2V2ZXJpdHkgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoZGF0YS5zZXZlcml0eSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBkYXRhLnNldmVyaXR5O1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHJlc3VsdCA9IFNldmVyaXR5LmZyb21WYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdGlmIChyZXN1bHQgPT09IFNldmVyaXR5Lklnbm9yZSkge1xuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ0UnKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBTZXZlcml0eS5FcnJvcjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSAnVycpIHtcblx0XHRcdFx0XHRcdHJlc3VsdCA9IFNldmVyaXR5Lldhcm5pbmc7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ0knKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBTZXZlcml0eS5JbmZvO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoU3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHZhbHVlLCAnaGludCcpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBTZXZlcml0eS5JbmZvO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoU3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHZhbHVlLCAnbm90ZScpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBTZXZlcml0eS5JbmZvO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzdWx0ID09PSBudWxsIHx8IHJlc3VsdCA9PT0gU2V2ZXJpdHkuSWdub3JlKSB7XG5cdFx0XHRyZXN1bHQgPSB0aGlzLm1hdGNoZXIuc2V2ZXJpdHkgfHwgU2V2ZXJpdHkuRXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiBNYXJrZXJTZXZlcml0eS5mcm9tU2V2ZXJpdHkocmVzdWx0KTtcblx0fVxufVxuXG5jbGFzcyBTaW5nbGVMaW5lTWF0Y2hlciBleHRlbmRzIEFic3RyYWN0TGluZU1hdGNoZXIge1xuXG5cdHByaXZhdGUgcGF0dGVybjogSVByb2JsZW1QYXR0ZXJuO1xuXG5cdGNvbnN0cnVjdG9yKG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIobWF0Y2hlciwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMucGF0dGVybiA9IDxJUHJvYmxlbVBhdHRlcm4+bWF0Y2hlci5wYXR0ZXJuO1xuXHR9XG5cblx0cHVibGljIGdldCBtYXRjaExlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGhhbmRsZShsaW5lczogc3RyaW5nW10sIHN0YXJ0OiBudW1iZXIgPSAwKTogSUhhbmRsZVJlc3VsdCB7XG5cdFx0QXNzZXJ0Lm9rKGxpbmVzLmxlbmd0aCAtIHN0YXJ0ID09PSAxKTtcblx0XHRjb25zdCBkYXRhOiBJUHJvYmxlbURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGlmICh0aGlzLnBhdHRlcm4ua2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkYXRhLmtpbmQgPSB0aGlzLnBhdHRlcm4ua2luZDtcblx0XHR9XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IHRoaXMucmVnZXhwRXhlYyh0aGlzLnBhdHRlcm4ucmVnZXhwLCBsaW5lc1tzdGFydF0pO1xuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHR0aGlzLmZpbGxQcm9ibGVtRGF0YShkYXRhLCB0aGlzLnBhdHRlcm4sIG1hdGNoZXMpO1xuXHRcdFx0aWYgKGRhdGEua2luZCA9PT0gUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbiAmJiAhZGF0YS5sb2NhdGlvbiAmJiAhZGF0YS5saW5lICYmIGRhdGEuZmlsZSkge1xuXHRcdFx0XHRkYXRhLmtpbmQgPSBQcm9ibGVtTG9jYXRpb25LaW5kLkZpbGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYXRjaCA9IHRoaXMuZ2V0TWFya2VyTWF0Y2goZGF0YSk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWF0Y2g6IG1hdGNoLCBjb250aW51ZTogZmFsc2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgbWF0Y2g6IG51bGwsIGNvbnRpbnVlOiBmYWxzZSB9O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG5leHQobGluZTogc3RyaW5nKTogSVByb2JsZW1NYXRjaCB8IG51bGwge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNsYXNzIE11bHRpTGluZU1hdGNoZXIgZXh0ZW5kcyBBYnN0cmFjdExpbmVNYXRjaGVyIHtcblxuXHRwcml2YXRlIHBhdHRlcm5zOiBJUHJvYmxlbVBhdHRlcm5bXTtcblx0cHJpdmF0ZSBkYXRhOiBJUHJvYmxlbURhdGEgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IobWF0Y2hlcjogUHJvYmxlbU1hdGNoZXIsIGZpbGVTZXJ2aWNlPzogSUZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlPzogSUxvZ1NlcnZpY2UpIHtcblx0XHRzdXBlcihtYXRjaGVyLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5wYXR0ZXJucyA9IDxJUHJvYmxlbVBhdHRlcm5bXT5tYXRjaGVyLnBhdHRlcm47XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1hdGNoTGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMucGF0dGVybnMubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGhhbmRsZShsaW5lczogc3RyaW5nW10sIHN0YXJ0OiBudW1iZXIgPSAwKTogSUhhbmRsZVJlc3VsdCB7XG5cdFx0QXNzZXJ0Lm9rKGxpbmVzLmxlbmd0aCAtIHN0YXJ0ID09PSB0aGlzLnBhdHRlcm5zLmxlbmd0aCk7XG5cdFx0dGhpcy5kYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRsZXQgZGF0YSA9IHRoaXMuZGF0YSE7XG5cdFx0ZGF0YS5raW5kID0gdGhpcy5wYXR0ZXJuc1swXS5raW5kO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wYXR0ZXJucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IHRoaXMucGF0dGVybnNbaV07XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5yZWdleHBFeGVjKHBhdHRlcm4ucmVnZXhwLCBsaW5lc1tpICsgc3RhcnRdKTtcblx0XHRcdGlmICghbWF0Y2hlcykge1xuXHRcdFx0XHRyZXR1cm4geyBtYXRjaDogbnVsbCwgY29udGludWU6IGZhbHNlIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBPbmx5IHRoZSBsYXN0IHBhdHRlcm4gY2FuIGxvb3Bcblx0XHRcdFx0aWYgKHBhdHRlcm4ubG9vcCAmJiBpID09PSB0aGlzLnBhdHRlcm5zLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRkYXRhID0gT2JqZWN0cy5kZWVwQ2xvbmUoZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5maWxsUHJvYmxlbURhdGEoZGF0YSwgcGF0dGVybiwgbWF0Y2hlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGxvb3AgPSAhIXRoaXMucGF0dGVybnNbdGhpcy5wYXR0ZXJucy5sZW5ndGggLSAxXS5sb29wO1xuXHRcdGlmICghbG9vcCkge1xuXHRcdFx0dGhpcy5kYXRhID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZXJNYXRjaCA9IGRhdGEgPyB0aGlzLmdldE1hcmtlck1hdGNoKGRhdGEpIDogbnVsbDtcblx0XHRyZXR1cm4geyBtYXRjaDogbWFya2VyTWF0Y2ggPyBtYXJrZXJNYXRjaCA6IG51bGwsIGNvbnRpbnVlOiBsb29wIH07XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgbmV4dChsaW5lOiBzdHJpbmcpOiBJUHJvYmxlbU1hdGNoIHwgbnVsbCB7XG5cdFx0Y29uc3QgcGF0dGVybiA9IHRoaXMucGF0dGVybnNbdGhpcy5wYXR0ZXJucy5sZW5ndGggLSAxXTtcblx0XHRBc3NlcnQub2socGF0dGVybi5sb29wID09PSB0cnVlICYmIHRoaXMuZGF0YSAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IHRoaXMucmVnZXhwRXhlYyhwYXR0ZXJuLnJlZ2V4cCwgbGluZSk7XG5cdFx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0XHR0aGlzLmRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IE9iamVjdHMuZGVlcENsb25lKHRoaXMuZGF0YSk7XG5cdFx0bGV0IHByb2JsZW1NYXRjaDogSVByb2JsZW1NYXRjaCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5maWxsUHJvYmxlbURhdGEoZGF0YSwgcGF0dGVybiwgbWF0Y2hlcykpIHtcblx0XHRcdHByb2JsZW1NYXRjaCA9IHRoaXMuZ2V0TWFya2VyTWF0Y2goZGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9ibGVtTWF0Y2ggPyBwcm9ibGVtTWF0Y2ggOiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29uZmlnIHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtUGF0dGVybiB7XG5cblx0XHQvKipcblx0XHQqIFRoZSByZWd1bGFyIGV4cHJlc3Npb24gdG8gZmluZCBhIHByb2JsZW0gaW4gdGhlIGNvbnNvbGUgb3V0cHV0IG9mIGFuXG5cdFx0KiBleGVjdXRlZCB0YXNrLlxuXHRcdCovXG5cdFx0cmVnZXhwPzogc3RyaW5nO1xuXG5cdFx0LyoqXG5cdFx0KiBXaGV0aGVyIHRoZSBwYXR0ZXJuIG1hdGNoZXMgYSB3aG9sZSBmaWxlLCBvciBhIGxvY2F0aW9uIChmaWxlL2xpbmUpXG5cdFx0KlxuXHRcdCogVGhlIGRlZmF1bHQgaXMgdG8gbWF0Y2ggZm9yIGEgbG9jYXRpb24uIE9ubHkgdmFsaWQgb24gdGhlXG5cdFx0KiBmaXJzdCBwcm9ibGVtIHBhdHRlcm4gaW4gYSBtdWx0aSBsaW5lIHByb2JsZW0gbWF0Y2hlci5cblx0XHQqL1xuXHRcdGtpbmQ/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgZmlsZW5hbWUuXG5cdFx0KiBJZiBvbWl0dGVkIDEgaXMgdXNlZC5cblx0XHQqL1xuXHRcdGZpbGU/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbSdzIGxvY2F0aW9uLiBWYWxpZCBsb2NhdGlvblxuXHRcdCogcGF0dGVybnMgYXJlOiAobGluZSksIChsaW5lLGNvbHVtbikgYW5kIChzdGFydExpbmUsc3RhcnRDb2x1bW4sZW5kTGluZSxlbmRDb2x1bW4pLlxuXHRcdCogSWYgb21pdHRlZCB0aGUgbGluZSBhbmQgY29sdW1uIHByb3BlcnRpZXMgYXJlIHVzZWQuXG5cdFx0Ki9cblx0XHRsb2NhdGlvbj86IG51bWJlcjtcblxuXHRcdC8qKlxuXHRcdCogVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtJ3MgbGluZSBpbiB0aGUgc291cmNlIGZpbGUuXG5cdFx0KlxuXHRcdCogRGVmYXVsdHMgdG8gMi5cblx0XHQqL1xuXHRcdGxpbmU/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbSdzIGNvbHVtbiBpbiB0aGUgc291cmNlIGZpbGUuXG5cdFx0KlxuXHRcdCogRGVmYXVsdHMgdG8gMy5cblx0XHQqL1xuXHRcdGNvbHVtbj86IG51bWJlcjtcblxuXHRcdC8qKlxuXHRcdCogVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtJ3MgZW5kIGxpbmUgaW4gdGhlIHNvdXJjZSBmaWxlLlxuXHRcdCpcblx0XHQqIERlZmF1bHRzIHRvIHVuZGVmaW5lZC4gTm8gZW5kIGxpbmUgaXMgY2FwdHVyZWQuXG5cdFx0Ki9cblx0XHRlbmRMaW5lPzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW0ncyBlbmQgY29sdW1uIGluIHRoZSBzb3VyY2UgZmlsZS5cblx0XHQqXG5cdFx0KiBEZWZhdWx0cyB0byB1bmRlZmluZWQuIE5vIGVuZCBjb2x1bW4gaXMgY2FwdHVyZWQuXG5cdFx0Ki9cblx0XHRlbmRDb2x1bW4/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbSdzIHNldmVyaXR5LlxuXHRcdCpcblx0XHQqIERlZmF1bHRzIHRvIHVuZGVmaW5lZC4gSW4gdGhpcyBjYXNlIHRoZSBwcm9ibGVtIG1hdGNoZXIncyBzZXZlcml0eVxuXHRcdCogaXMgdXNlZC5cblx0XHQqL1xuXHRcdHNldmVyaXR5PzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW0ncyBjb2RlLlxuXHRcdCpcblx0XHQqIERlZmF1bHRzIHRvIHVuZGVmaW5lZC4gTm8gY29kZSBpcyBjYXB0dXJlZC5cblx0XHQqL1xuXHRcdGNvZGU/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgbWVzc2FnZS4gSWYgb21pdHRlZCBpdCBkZWZhdWx0c1xuXHRcdCogdG8gNCBpZiBsb2NhdGlvbiBpcyBzcGVjaWZpZWQuIE90aGVyd2lzZSBpdCBkZWZhdWx0cyB0byA1LlxuXHRcdCovXG5cdFx0bWVzc2FnZT86IG51bWJlcjtcblxuXHRcdC8qKlxuXHRcdCogU3BlY2lmaWVzIGlmIHRoZSBsYXN0IHBhdHRlcm4gaW4gYSBtdWx0aSBsaW5lIHByb2JsZW0gbWF0Y2hlciBzaG91bGRcblx0XHQqIGxvb3AgYXMgbG9uZyBhcyBpdCBkb2VzIG1hdGNoIGEgbGluZSBjb25zZXF1ZW50bHkuIE9ubHkgdmFsaWQgb24gdGhlXG5cdFx0KiBsYXN0IHByb2JsZW0gcGF0dGVybiBpbiBhIG11bHRpIGxpbmUgcHJvYmxlbSBtYXRjaGVyLlxuXHRcdCovXG5cdFx0bG9vcD86IGJvb2xlYW47XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIElDaGVja2VkUHJvYmxlbVBhdHRlcm4gZXh0ZW5kcyBJUHJvYmxlbVBhdHRlcm4ge1xuXHRcdC8qKlxuXHRcdCogVGhlIHJlZ3VsYXIgZXhwcmVzc2lvbiB0byBmaW5kIGEgcHJvYmxlbSBpbiB0aGUgY29uc29sZSBvdXRwdXQgb2YgYW5cblx0XHQqIGV4ZWN1dGVkIHRhc2suXG5cdFx0Ki9cblx0XHRyZWdleHA6IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBuYW1lc3BhY2UgQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIHtcblx0XHRleHBvcnQgZnVuY3Rpb24gaXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZTogSVByb2JsZW1QYXR0ZXJuID0gdmFsdWUgYXMgSVByb2JsZW1QYXR0ZXJuO1xuXHRcdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiBUeXBlcy5pc1N0cmluZyhjYW5kaWRhdGUucmVnZXhwKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIElOYW1lZFByb2JsZW1QYXR0ZXJuIGV4dGVuZHMgSVByb2JsZW1QYXR0ZXJuIHtcblx0XHQvKipcblx0XHQgKiBUaGUgbmFtZSBvZiB0aGUgcHJvYmxlbSBwYXR0ZXJuLlxuXHRcdCAqL1xuXHRcdG5hbWU6IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCAqIEEgaHVtYW4gcmVhZGFibGUgbGFiZWxcblx0XHQgKi9cblx0XHRsYWJlbD86IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBuYW1lc3BhY2UgTmFtZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSU5hbWVkUHJvYmxlbVBhdHRlcm4ge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlOiBJTmFtZWRQcm9ibGVtUGF0dGVybiA9IHZhbHVlIGFzIElOYW1lZFByb2JsZW1QYXR0ZXJuO1xuXHRcdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiBUeXBlcy5pc1N0cmluZyhjYW5kaWRhdGUubmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJTmFtZWRDaGVja2VkUHJvYmxlbVBhdHRlcm4gZXh0ZW5kcyBJTmFtZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0LyoqXG5cdFx0KiBUaGUgcmVndWxhciBleHByZXNzaW9uIHRvIGZpbmQgYSBwcm9ibGVtIGluIHRoZSBjb25zb2xlIG91dHB1dCBvZiBhblxuXHRcdCogZXhlY3V0ZWQgdGFzay5cblx0XHQqL1xuXHRcdHJlZ2V4cDogc3RyaW5nO1xuXHR9XG5cblx0ZXhwb3J0IG5hbWVzcGFjZSBOYW1lZENoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSU5hbWVkQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZTogSU5hbWVkUHJvYmxlbVBhdHRlcm4gPSB2YWx1ZSBhcyBJTmFtZWRQcm9ibGVtUGF0dGVybjtcblx0XHRcdHJldHVybiBjYW5kaWRhdGUgJiYgTmFtZWRQcm9ibGVtUGF0dGVybi5pcyhjYW5kaWRhdGUpICYmIFR5cGVzLmlzU3RyaW5nKGNhbmRpZGF0ZS5yZWdleHApO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCB0eXBlIE11bHRpTGluZVByb2JsZW1QYXR0ZXJuID0gSVByb2JsZW1QYXR0ZXJuW107XG5cblx0ZXhwb3J0IG5hbWVzcGFjZSBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4ge1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCB0eXBlIE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiA9IElDaGVja2VkUHJvYmxlbVBhdHRlcm5bXTtcblxuXHRleHBvcnQgbmFtZXNwYWNlIE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIHtcblx0XHRcdGlmICghTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4uaXModmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB2YWx1ZSkge1xuXHRcdFx0XHRpZiAoIUNvbmZpZy5DaGVja2VkUHJvYmxlbVBhdHRlcm4uaXMoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSU5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIHtcblx0XHQvKipcblx0XHQgKiBUaGUgbmFtZSBvZiB0aGUgcHJvYmxlbSBwYXR0ZXJuLlxuXHRcdCAqL1xuXHRcdG5hbWU6IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCAqIEEgaHVtYW4gcmVhZGFibGUgbGFiZWxcblx0XHQgKi9cblx0XHRsYWJlbD86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBhY3R1YWwgcGF0dGVybnNcblx0XHQgKi9cblx0XHRwYXR0ZXJuczogTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuO1xuXHR9XG5cblx0ZXhwb3J0IG5hbWVzcGFjZSBOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSU5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIElOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybjtcblx0XHRcdHJldHVybiBjYW5kaWRhdGUgJiYgVHlwZXMuaXNTdHJpbmcoY2FuZGlkYXRlLm5hbWUpICYmIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnBhdHRlcm5zKSAmJiBNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm4uaXMoY2FuZGlkYXRlLnBhdHRlcm5zKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgdHlwZSBOYW1lZFByb2JsZW1QYXR0ZXJucyA9IChDb25maWcuSU5hbWVkUHJvYmxlbVBhdHRlcm4gfCBDb25maWcuSU5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuKVtdO1xuXG5cdC8qKlxuXHQqIEEgd2F0Y2hpbmcgcGF0dGVyblxuXHQqL1xuXHRleHBvcnQgaW50ZXJmYWNlIElXYXRjaGluZ1BhdHRlcm4ge1xuXHRcdC8qKlxuXHRcdCogVGhlIGFjdHVhbCByZWd1bGFyIGV4cHJlc3Npb25cblx0XHQqL1xuXHRcdHJlZ2V4cD86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBmaWxlbmFtZS4gSWYgcHJvdmlkZWQgdGhlIGV4cHJlc3Npb25cblx0XHQqIGlzIG1hdGNoZWQgZm9yIHRoYXQgZmlsZSBvbmx5LlxuXHRcdCovXG5cdFx0ZmlsZT86IG51bWJlcjtcblx0fVxuXG5cdC8qKlxuXHQqIEEgZGVzY3JpcHRpb24gdG8gdHJhY2sgdGhlIHN0YXJ0IGFuZCBlbmQgb2YgYSB3YXRjaGluZyB0YXNrLlxuXHQqL1xuXHRleHBvcnQgaW50ZXJmYWNlIElCYWNrZ3JvdW5kTW9uaXRvciB7XG5cblx0XHQvKipcblx0XHQqIElmIHNldCB0byB0cnVlIHRoZSB3YXRjaGVyIHN0YXJ0cyBpbiBhY3RpdmUgbW9kZS4gVGhpcyBpcyB0aGVcblx0XHQqIHNhbWUgYXMgb3V0cHV0dGluZyBhIGxpbmUgdGhhdCBtYXRjaGVzIGJlZ2luc1BhdHRlcm4gd2hlbiB0aGVcblx0XHQqIHRhc2sgc3RhcnRzLlxuXHRcdCovXG5cdFx0YWN0aXZlT25TdGFydD86IGJvb2xlYW47XG5cblx0XHQvKipcblx0XHQqIElmIG1hdGNoZWQgaW4gdGhlIG91dHB1dCB0aGUgc3RhcnQgb2YgYSB3YXRjaGluZyB0YXNrIGlzIHNpZ25hbGVkLlxuXHRcdCovXG5cdFx0YmVnaW5zUGF0dGVybj86IHN0cmluZyB8IElXYXRjaGluZ1BhdHRlcm47XG5cblx0XHQvKipcblx0XHQqIElmIG1hdGNoZWQgaW4gdGhlIG91dHB1dCB0aGUgZW5kIG9mIGEgd2F0Y2hpbmcgdGFzayBpcyBzaWduYWxlZC5cblx0XHQqL1xuXHRcdGVuZHNQYXR0ZXJuPzogc3RyaW5nIHwgSVdhdGNoaW5nUGF0dGVybjtcblx0fVxuXG5cdC8qKlxuXHQqIEEgZGVzY3JpcHRpb24gb2YgYSBwcm9ibGVtIG1hdGNoZXIgdGhhdCBkZXRlY3RzIHByb2JsZW1zXG5cdCogaW4gYnVpbGQgb3V0cHV0LlxuXHQqL1xuXHRleHBvcnQgaW50ZXJmYWNlIFByb2JsZW1NYXRjaGVyIHtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBuYW1lIG9mIGEgYmFzZSBwcm9ibGVtIG1hdGNoZXIgdG8gdXNlLiBJZiBzcGVjaWZpZWQgdGhlXG5cdFx0ICogYmFzZSBwcm9ibGVtIG1hdGNoZXIgd2lsbCBiZSB1c2VkIGFzIGEgdGVtcGxhdGUgYW5kIHByb3BlcnRpZXNcblx0XHQgKiBzcGVjaWZpZWQgaGVyZSB3aWxsIHJlcGxhY2UgcHJvcGVydGllcyBvZiB0aGUgYmFzZSBwcm9ibGVtXG5cdFx0ICogbWF0Y2hlclxuXHRcdCAqL1xuXHRcdGJhc2U/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgb3duZXIgb2YgdGhlIHByb2R1Y2VkIFZTQ29kZSBwcm9ibGVtLiBUaGlzIGlzIHR5cGljYWxseVxuXHRcdCAqIHRoZSBpZGVudGlmaWVyIG9mIGEgVlNDb2RlIGxhbmd1YWdlIHNlcnZpY2UgaWYgdGhlIHByb2JsZW1zIGFyZVxuXHRcdCAqIHRvIGJlIG1lcmdlZCB3aXRoIHRoZSBvbmUgcHJvZHVjZWQgYnkgdGhlIGxhbmd1YWdlIHNlcnZpY2Vcblx0XHQgKiBvciBhIGdlbmVyYXRlZCBpbnRlcm5hbCBpZC4gRGVmYXVsdHMgdG8gdGhlIGdlbmVyYXRlZCBpbnRlcm5hbCBpZC5cblx0XHQgKi9cblx0XHRvd25lcj86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCAqIEEgaHVtYW4tcmVhZGFibGUgc3RyaW5nIGRlc2NyaWJpbmcgdGhlIHNvdXJjZSBvZiB0aGlzIHByb2JsZW0uXG5cdFx0ICogRS5nLiAndHlwZXNjcmlwdCcgb3IgJ3N1cGVyIGxpbnQnLlxuXHRcdCAqL1xuXHRcdHNvdXJjZT86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogU3BlY2lmaWVzIHRvIHdoaWNoIGtpbmQgb2YgZG9jdW1lbnRzIHRoZSBwcm9ibGVtcyBmb3VuZCBieSB0aGlzXG5cdFx0KiBtYXRjaGVyIGFyZSBhcHBsaWVkLiBWYWxpZCB2YWx1ZXMgYXJlOlxuXHRcdCpcblx0XHQqICAgXCJhbGxEb2N1bWVudHNcIjogcHJvYmxlbXMgZm91bmQgaW4gYWxsIGRvY3VtZW50cyBhcmUgYXBwbGllZC5cblx0XHQqICAgXCJvcGVuRG9jdW1lbnRzXCI6IHByb2JsZW1zIGZvdW5kIGluIGRvY3VtZW50cyB0aGF0IGFyZSBvcGVuXG5cdFx0KiAgIGFyZSBhcHBsaWVkLlxuXHRcdCogICBcImNsb3NlZERvY3VtZW50c1wiOiBwcm9ibGVtcyBmb3VuZCBpbiBjbG9zZWQgZG9jdW1lbnRzIGFyZVxuXHRcdCogICBhcHBsaWVkLlxuXHRcdCovXG5cdFx0YXBwbHlUbz86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogVGhlIHNldmVyaXR5IG9mIHRoZSBWU0NvZGUgcHJvYmxlbSBwcm9kdWNlZCBieSB0aGlzIHByb2JsZW0gbWF0Y2hlci5cblx0XHQqXG5cdFx0KiBWYWxpZCB2YWx1ZXMgYXJlOlxuXHRcdCogICBcImVycm9yXCI6IHRvIHByb2R1Y2UgZXJyb3JzLlxuXHRcdCogICBcIndhcm5pbmdcIjogdG8gcHJvZHVjZSB3YXJuaW5ncy5cblx0XHQqICAgXCJpbmZvXCI6IHRvIHByb2R1Y2UgaW5mb3MuXG5cdFx0KlxuXHRcdCogVGhlIHZhbHVlIGlzIHVzZWQgaWYgYSBwYXR0ZXJuIGRvZXNuJ3Qgc3BlY2lmeSBhIHNldmVyaXR5IG1hdGNoIGdyb3VwLlxuXHRcdCogRGVmYXVsdHMgdG8gXCJlcnJvclwiIGlmIG9taXR0ZWQuXG5cdFx0Ki9cblx0XHRzZXZlcml0eT86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogRGVmaW5lcyBob3cgZmlsZW5hbWUgcmVwb3J0ZWQgaW4gYSBwcm9ibGVtIHBhdHRlcm5cblx0XHQqIHNob3VsZCBiZSByZWFkLiBWYWxpZCB2YWx1ZXMgYXJlOlxuXHRcdCogIC0gXCJhYnNvbHV0ZVwiOiB0aGUgZmlsZW5hbWUgaXMgYWx3YXlzIHRyZWF0ZWQgYWJzb2x1dGUuXG5cdFx0KiAgLSBcInJlbGF0aXZlXCI6IHRoZSBmaWxlbmFtZSBpcyBhbHdheXMgdHJlYXRlZCByZWxhdGl2ZSB0b1xuXHRcdCogICAgdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkuIFRoaXMgaXMgdGhlIGRlZmF1bHQuXG5cdFx0KiAgLSBbXCJyZWxhdGl2ZVwiLCBcInBhdGggdmFsdWVcIl06IHRoZSBmaWxlbmFtZSBpcyBhbHdheXNcblx0XHQqICAgIHRyZWF0ZWQgcmVsYXRpdmUgdG8gdGhlIGdpdmVuIHBhdGggdmFsdWUuXG5cdFx0KiAgLSBcImF1dG9kZXRlY3RcIjogdGhlIGZpbGVuYW1lIGlzIHRyZWF0ZWQgcmVsYXRpdmUgdG9cblx0XHQqICAgIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBkaXJlY3RvcnksIGFuZCBpZiB0aGUgZmlsZVxuXHRcdCogICAgZG9lcyBub3QgZXhpc3QsIGl0IGlzIHRyZWF0ZWQgYXMgYWJzb2x1dGUuXG5cdFx0KiAgLSBbXCJhdXRvZGV0ZWN0XCIsIFwicGF0aCB2YWx1ZVwiXTogdGhlIGZpbGVuYW1lIGlzIHRyZWF0ZWRcblx0XHQqICAgIHJlbGF0aXZlIHRvIHRoZSBnaXZlbiBwYXRoIHZhbHVlLCBhbmQgaWYgaXQgZG9lcyBub3Rcblx0XHQqICAgIGV4aXN0LCBpdCBpcyB0cmVhdGVkIGFzIGFic29sdXRlLlxuXHRcdCogIC0gW1wic2VhcmNoXCIsIHsgaW5jbHVkZT86IFwiXCIgfCBbXTsgZXhjbHVkZT86IFwiXCIgfCBbXSB9XTogVGhlIGZpbGVuYW1lXG5cdFx0KiAgICBuZWVkcyB0byBiZSBzZWFyY2hlZCB1bmRlciB0aGUgZGlyZWN0b3JpZXMgbmFtZWQgYnkgdGhlIFwiaW5jbHVkZVwiXG5cdFx0KiAgICBwcm9wZXJ0eSBhbmQgdGhlaXIgbmVzdGVkIHN1YmRpcmVjdG9yaWVzLiBXaXRoIFwiZXhjbHVkZVwiIHByb3BlcnR5XG5cdFx0KiAgICBwcmVzZW50LCB0aGUgZGlyZWN0b3JpZXMgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSB0aGUgc2VhcmNoLiBXaGVuXG5cdFx0KiAgICBgaW5jbHVkZWAgaXMgbm90IHVucHJvdmlkZWQsIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBkaXJlY3Rvcnkgc2hvdWxkXG5cdFx0KiAgICBiZSB1c2VkIGFzIHRoZSBkZWZhdWx0LlxuXHRcdCovXG5cdFx0ZmlsZUxvY2F0aW9uPzogVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz4gfCBbJ3NlYXJjaCcsIFNlYXJjaEZpbGVMb2NhdGlvbkFyZ3NdO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbmFtZSBvZiBhIHByZWRlZmluZWQgcHJvYmxlbSBwYXR0ZXJuLCB0aGUgaW5saW5lIGRlZmluaXRpb25cblx0XHQqIG9mIGEgcHJvYmxlbSBwYXR0ZXJuIG9yIGFuIGFycmF5IG9mIHByb2JsZW0gcGF0dGVybnMgdG8gbWF0Y2hcblx0XHQqIHByb2JsZW1zIHNwcmVhZCBvdmVyIG11bHRpcGxlIGxpbmVzLlxuXHRcdCovXG5cdFx0cGF0dGVybj86IHN0cmluZyB8IFR5cGVzLlNpbmdsZU9yTWFueTxJUHJvYmxlbVBhdHRlcm4+O1xuXG5cdFx0LyoqXG5cdFx0KiBBIHJlZ3VsYXIgZXhwcmVzc2lvbiBzaWduYWxpbmcgdGhhdCBhIHdhdGNoZWQgdGFza3MgYmVnaW5zIGV4ZWN1dGluZ1xuXHRcdCogdHJpZ2dlcmVkIHRocm91Z2ggZmlsZSB3YXRjaGluZy5cblx0XHQqL1xuXHRcdHdhdGNoZWRUYXNrQmVnaW5zUmVnRXhwPzogc3RyaW5nO1xuXG5cdFx0LyoqXG5cdFx0KiBBIHJlZ3VsYXIgZXhwcmVzc2lvbiBzaWduYWxpbmcgdGhhdCBhIHdhdGNoZWQgdGFza3MgZW5kcyBleGVjdXRpbmcuXG5cdFx0Ki9cblx0XHR3YXRjaGVkVGFza0VuZHNSZWdFeHA/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBAZGVwcmVjYXRlZCBVc2UgYmFja2dyb3VuZCBpbnN0ZWFkLlxuXHRcdCAqL1xuXHRcdHdhdGNoaW5nPzogSUJhY2tncm91bmRNb25pdG9yO1xuXHRcdGJhY2tncm91bmQ/OiBJQmFja2dyb3VuZE1vbml0b3I7XG5cdH1cblxuXHRleHBvcnQgdHlwZSBTZWFyY2hGaWxlTG9jYXRpb25BcmdzID0ge1xuXHRcdGluY2x1ZGU/OiBUeXBlcy5TaW5nbGVPck1hbnk8c3RyaW5nPjtcblx0XHRleGNsdWRlPzogVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz47XG5cdH07XG5cblx0ZXhwb3J0IHR5cGUgUHJvYmxlbU1hdGNoZXJUeXBlID0gc3RyaW5nIHwgUHJvYmxlbU1hdGNoZXIgfCBBcnJheTxzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlcj47XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJTmFtZWRQcm9ibGVtTWF0Y2hlciBleHRlbmRzIFByb2JsZW1NYXRjaGVyIHtcblx0XHQvKipcblx0XHQqIFRoaXMgbmFtZSBjYW4gYmUgdXNlZCB0byByZWZlciB0byB0aGVcblx0XHQqIHByb2JsZW0gbWF0Y2hlciBmcm9tIHdpdGhpbiBhIHRhc2suXG5cdFx0Ki9cblx0XHRuYW1lOiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBBIGh1bWFuIHJlYWRhYmxlIGxhYmVsLlxuXHRcdCAqL1xuXHRcdGxhYmVsPzogc3RyaW5nO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzTmFtZWRQcm9ibGVtTWF0Y2hlcih2YWx1ZTogUHJvYmxlbU1hdGNoZXIpOiB2YWx1ZSBpcyBJTmFtZWRQcm9ibGVtTWF0Y2hlciB7XG5cdFx0cmV0dXJuIFR5cGVzLmlzU3RyaW5nKCg8SU5hbWVkUHJvYmxlbU1hdGNoZXI+dmFsdWUpLm5hbWUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQcm9ibGVtUGF0dGVyblBhcnNlciBleHRlbmRzIFBhcnNlciB7XG5cblx0Y29uc3RydWN0b3IobG9nZ2VyOiBJUHJvYmxlbVJlcG9ydGVyKSB7XG5cdFx0c3VwZXIobG9nZ2VyKTtcblx0fVxuXG5cdHB1YmxpYyBwYXJzZSh2YWx1ZTogQ29uZmlnLklQcm9ibGVtUGF0dGVybik6IElQcm9ibGVtUGF0dGVybjtcblx0cHVibGljIHBhcnNlKHZhbHVlOiBDb25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4pOiBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybjtcblx0cHVibGljIHBhcnNlKHZhbHVlOiBDb25maWcuSU5hbWVkUHJvYmxlbVBhdHRlcm4pOiBJTmFtZWRQcm9ibGVtUGF0dGVybjtcblx0cHVibGljIHBhcnNlKHZhbHVlOiBDb25maWcuSU5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuKTogSU5hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm47XG5cdHB1YmxpYyBwYXJzZSh2YWx1ZTogQ29uZmlnLklQcm9ibGVtUGF0dGVybiB8IENvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiB8IENvbmZpZy5JTmFtZWRQcm9ibGVtUGF0dGVybiB8IENvbmZpZy5JTmFtZWRNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm4pOiBJUHJvYmxlbVBhdHRlcm4gfCBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiB8IElOYW1lZFByb2JsZW1QYXR0ZXJuIHwgSU5hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gfCBudWxsIHtcblx0XHRpZiAoQ29uZmlnLk5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLmlzKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlTmFtZWRNdWx0aUxpbmVQcm9ibGVtUGF0dGVybih2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChDb25maWcuTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLmlzKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4odmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoQ29uZmlnLk5hbWVkQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLmlzKHZhbHVlKSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5jcmVhdGVTaW5nbGVQcm9ibGVtUGF0dGVybih2YWx1ZSkgYXMgSU5hbWVkUHJvYmxlbVBhdHRlcm47XG5cdFx0XHRyZXN1bHQubmFtZSA9IHZhbHVlLm5hbWU7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZWxzZSBpZiAoQ29uZmlnLkNoZWNrZWRQcm9ibGVtUGF0dGVybi5pcyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZVNpbmdsZVByb2JsZW1QYXR0ZXJuKHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIucHJvYmxlbVBhdHRlcm4ubWlzc2luZ1JlZ0V4cCcsICdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIG1pc3NpbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uJykpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTaW5nbGVQcm9ibGVtUGF0dGVybih2YWx1ZTogQ29uZmlnLklDaGVja2VkUHJvYmxlbVBhdHRlcm4pOiBJUHJvYmxlbVBhdHRlcm4gfCBudWxsIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmRvQ3JlYXRlU2luZ2xlUHJvYmxlbVBhdHRlcm4odmFsdWUsIHRydWUpO1xuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSBlbHNlIGlmIChyZXN1bHQua2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQua2luZCA9IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZhbGlkYXRlUHJvYmxlbVBhdHRlcm4oW3Jlc3VsdF0pID8gcmVzdWx0IDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTmFtZWRNdWx0aUxpbmVQcm9ibGVtUGF0dGVybih2YWx1ZTogQ29uZmlnLklOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybik6IElOYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuIHwgbnVsbCB7XG5cdFx0Y29uc3QgdmFsaWRQYXR0ZXJucyA9IHRoaXMuY3JlYXRlTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4odmFsdWUucGF0dGVybnMpO1xuXHRcdGlmICghdmFsaWRQYXR0ZXJucykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdG5hbWU6IHZhbHVlLm5hbWUsXG5cdFx0XHRsYWJlbDogdmFsdWUubGFiZWwgPyB2YWx1ZS5sYWJlbCA6IHZhbHVlLm5hbWUsXG5cdFx0XHRwYXR0ZXJuczogdmFsaWRQYXR0ZXJuc1xuXHRcdH07XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4odmFsdWVzOiBDb25maWcuTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuKTogTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gfCBudWxsIHtcblx0XHRjb25zdCByZXN1bHQ6IE11bHRpTGluZVByb2JsZW1QYXR0ZXJuID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSB0aGlzLmRvQ3JlYXRlU2luZ2xlUHJvYmxlbVBhdHRlcm4odmFsdWVzW2ldLCBmYWxzZSk7XG5cdFx0XHRpZiAocGF0dGVybiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGkgPCB2YWx1ZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRpZiAoIVR5cGVzLmlzVW5kZWZpbmVkKHBhdHRlcm4ubG9vcCkgJiYgcGF0dGVybi5sb29wKSB7XG5cdFx0XHRcdFx0cGF0dGVybi5sb29wID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIubG9vcFByb3BlcnR5Lm5vdExhc3QnLCAnVGhlIGxvb3AgcHJvcGVydHkgaXMgb25seSBzdXBwb3J0ZWQgb24gdGhlIGxhc3QgbGluZSBtYXRjaGVyLicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gocGF0dGVybik7XG5cdFx0fVxuXHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUGFyc2VyLnByb2JsZW1QYXR0ZXJuLmVtcHR5UGF0dGVybicsICdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIEl0IG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgcGF0dGVybi4nKSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdFswXS5raW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdFswXS5raW5kID0gUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudmFsaWRhdGVQcm9ibGVtUGF0dGVybihyZXN1bHQpID8gcmVzdWx0IDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVTaW5nbGVQcm9ibGVtUGF0dGVybih2YWx1ZTogQ29uZmlnLklDaGVja2VkUHJvYmxlbVBhdHRlcm4sIHNldERlZmF1bHRzOiBib29sZWFuKTogSVByb2JsZW1QYXR0ZXJuIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWdleHAgPSB0aGlzLmNyZWF0ZVJlZ3VsYXJFeHByZXNzaW9uKHZhbHVlLnJlZ2V4cCk7XG5cdFx0aWYgKHJlZ2V4cCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0OiBJUHJvYmxlbVBhdHRlcm4gPSB7IHJlZ2V4cCB9O1xuXHRcdGlmICh2YWx1ZS5raW5kKSB7XG5cdFx0XHRyZXN1bHQua2luZCA9IFByb2JsZW1Mb2NhdGlvbktpbmQuZnJvbVN0cmluZyh2YWx1ZS5raW5kKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjb3B5UHJvcGVydHkocmVzdWx0OiBJUHJvYmxlbVBhdHRlcm4sIHNvdXJjZTogQ29uZmlnLklQcm9ibGVtUGF0dGVybiwgcmVzdWx0S2V5OiBrZXlvZiBJUHJvYmxlbVBhdHRlcm4sIHNvdXJjZUtleToga2V5b2YgQ29uZmlnLklQcm9ibGVtUGF0dGVybikge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzb3VyY2Vbc291cmNlS2V5XTtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdChyZXN1bHQgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcmVzdWx0S2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb3B5UHJvcGVydHkocmVzdWx0LCB2YWx1ZSwgJ2ZpbGUnLCAnZmlsZScpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnbG9jYXRpb24nLCAnbG9jYXRpb24nKTtcblx0XHRjb3B5UHJvcGVydHkocmVzdWx0LCB2YWx1ZSwgJ2xpbmUnLCAnbGluZScpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnY2hhcmFjdGVyJywgJ2NvbHVtbicpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnZW5kTGluZScsICdlbmRMaW5lJyk7XG5cdFx0Y29weVByb3BlcnR5KHJlc3VsdCwgdmFsdWUsICdlbmRDaGFyYWN0ZXInLCAnZW5kQ29sdW1uJyk7XG5cdFx0Y29weVByb3BlcnR5KHJlc3VsdCwgdmFsdWUsICdzZXZlcml0eScsICdzZXZlcml0eScpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnY29kZScsICdjb2RlJyk7XG5cdFx0Y29weVByb3BlcnR5KHJlc3VsdCwgdmFsdWUsICdtZXNzYWdlJywgJ21lc3NhZ2UnKTtcblx0XHRpZiAodmFsdWUubG9vcCA9PT0gdHJ1ZSB8fCB2YWx1ZS5sb29wID09PSBmYWxzZSkge1xuXHRcdFx0cmVzdWx0Lmxvb3AgPSB2YWx1ZS5sb29wO1xuXHRcdH1cblx0XHRpZiAoc2V0RGVmYXVsdHMpIHtcblx0XHRcdGlmIChyZXN1bHQubG9jYXRpb24gfHwgcmVzdWx0LmtpbmQgPT09IFByb2JsZW1Mb2NhdGlvbktpbmQuRmlsZSkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0VmFsdWU6IFBhcnRpYWw8SVByb2JsZW1QYXR0ZXJuPiA9IHtcblx0XHRcdFx0XHRmaWxlOiAxLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IDBcblx0XHRcdFx0fTtcblx0XHRcdFx0cmVzdWx0ID0gT2JqZWN0cy5taXhpbihyZXN1bHQsIGRlZmF1bHRWYWx1ZSwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFZhbHVlOiBQYXJ0aWFsPElQcm9ibGVtUGF0dGVybj4gPSB7XG5cdFx0XHRcdFx0ZmlsZTogMSxcblx0XHRcdFx0XHRsaW5lOiAyLFxuXHRcdFx0XHRcdGNoYXJhY3RlcjogMyxcblx0XHRcdFx0XHRtZXNzYWdlOiAwXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJlc3VsdCA9IE9iamVjdHMubWl4aW4ocmVzdWx0LCBkZWZhdWx0VmFsdWUsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVQcm9ibGVtUGF0dGVybih2YWx1ZXM6IElQcm9ibGVtUGF0dGVybltdKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF2YWx1ZXMgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIucHJvYmxlbVBhdHRlcm4uZW1wdHlQYXR0ZXJuJywgJ1RoZSBwcm9ibGVtIHBhdHRlcm4gaXMgaW52YWxpZC4gSXQgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBwYXR0ZXJuLicpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0bGV0IGZpbGU6IGJvb2xlYW4gPSBmYWxzZSwgbWVzc2FnZTogYm9vbGVhbiA9IGZhbHNlLCBsb2NhdGlvbjogYm9vbGVhbiA9IGZhbHNlLCBsaW5lOiBib29sZWFuID0gZmFsc2U7XG5cdFx0Y29uc3QgbG9jYXRpb25LaW5kID0gKHZhbHVlc1swXS5raW5kID09PSB1bmRlZmluZWQpID8gUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbiA6IHZhbHVlc1swXS5raW5kO1xuXG5cdFx0dmFsdWVzLmZvckVhY2goKHBhdHRlcm4sIGkpID0+IHtcblx0XHRcdGlmIChpICE9PSAwICYmIHBhdHRlcm4ua2luZCkge1xuXHRcdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblBhcnNlci5wcm9ibGVtUGF0dGVybi5raW5kUHJvcGVydHkubm90Rmlyc3QnLCAnVGhlIHByb2JsZW0gcGF0dGVybiBpcyBpbnZhbGlkLiBUaGUga2luZCBwcm9wZXJ0eSBtdXN0IGJlIHByb3ZpZGVkIG9ubHkgaW4gdGhlIGZpcnN0IGVsZW1lbnQnKSk7XG5cdFx0XHR9XG5cdFx0XHRmaWxlID0gZmlsZSB8fCAhVHlwZXMuaXNVbmRlZmluZWQocGF0dGVybi5maWxlKTtcblx0XHRcdG1lc3NhZ2UgPSBtZXNzYWdlIHx8ICFUeXBlcy5pc1VuZGVmaW5lZChwYXR0ZXJuLm1lc3NhZ2UpO1xuXHRcdFx0bG9jYXRpb24gPSBsb2NhdGlvbiB8fCAhVHlwZXMuaXNVbmRlZmluZWQocGF0dGVybi5sb2NhdGlvbik7XG5cdFx0XHRsaW5lID0gbGluZSB8fCAhVHlwZXMuaXNVbmRlZmluZWQocGF0dGVybi5saW5lKTtcblx0XHR9KTtcblx0XHRpZiAoIShmaWxlICYmIG1lc3NhZ2UpKSB7XG5cdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblBhcnNlci5wcm9ibGVtUGF0dGVybi5taXNzaW5nUHJvcGVydHknLCAnVGhlIHByb2JsZW0gcGF0dGVybiBpcyBpbnZhbGlkLiBJdCBtdXN0IGhhdmUgYXQgbGVhc3QgaGF2ZSBhIGZpbGUgYW5kIGEgbWVzc2FnZS4nKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbktpbmQgPT09IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24gJiYgIShsb2NhdGlvbiB8fCBsaW5lKSkge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIucHJvYmxlbVBhdHRlcm4ubWlzc2luZ0xvY2F0aW9uJywgJ1RoZSBwcm9ibGVtIHBhdHRlcm4gaXMgaW52YWxpZC4gSXQgbXVzdCBlaXRoZXIgaGF2ZSBraW5kOiBcImZpbGVcIiBvciBoYXZlIGEgbGluZSBvciBsb2NhdGlvbiBtYXRjaCBncm91cC4nKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSZWd1bGFyRXhwcmVzc2lvbih2YWx1ZTogc3RyaW5nKTogUmVnRXhwIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmVzdWx0OiBSZWdFeHAgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IG5ldyBSZWdFeHAodmFsdWUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIuaW52YWxpZFJlZ2V4cCcsICdFcnJvcjogVGhlIHN0cmluZyB7MH0gaXMgbm90IGEgdmFsaWQgcmVndWxhciBleHByZXNzaW9uLlxcbicsIHZhbHVlKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblJlZ2lzdHJ5UmVwb3J0ZXIgaW1wbGVtZW50cyBJUHJvYmxlbVJlcG9ydGVyIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCBwcml2YXRlIF92YWxpZGF0aW9uU3RhdHVzOiBWYWxpZGF0aW9uU3RhdHVzID0gbmV3IFZhbGlkYXRpb25TdGF0dXMoKSkge1xuXHR9XG5cblx0cHVibGljIGluZm8obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5JbmZvO1xuXHRcdHRoaXMuX2NvbGxlY3Rvci5pbmZvKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5XYXJuaW5nO1xuXHRcdHRoaXMuX2NvbGxlY3Rvci53YXJuKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGUgPSBWYWxpZGF0aW9uU3RhdGUuRXJyb3I7XG5cdFx0dGhpcy5fY29sbGVjdG9yLmVycm9yKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGZhdGFsKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGUgPSBWYWxpZGF0aW9uU3RhdGUuRmF0YWw7XG5cdFx0dGhpcy5fY29sbGVjdG9yLmVycm9yKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGF0dXMoKTogVmFsaWRhdGlvblN0YXR1cyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRpb25TdGF0dXM7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTY2hlbWFzIHtcblxuXHRleHBvcnQgY29uc3QgUHJvYmxlbVBhdHRlcm46IElKU09OU2NoZW1hID0ge1xuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdHJlZ2V4cDogJ14oW15cXFxcXFxcXHNdLiopXFxcXFxcXFwoKFxcXFxcXFxcZCssXFxcXFxcXFxkKylcXFxcXFxcXCk6XFxcXFxcXFxzKiguKikkJyxcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsb2NhdGlvbjogMixcblx0XHRcdG1lc3NhZ2U6IDNcblx0XHR9LFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRyZWdleHA6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEucmVnZXhwJywgJ1RoZSByZWd1bGFyIGV4cHJlc3Npb24gdG8gZmluZCBhbiBlcnJvciwgd2FybmluZyBvciBpbmZvIGluIHRoZSBvdXRwdXQuJylcblx0XHRcdH0sXG5cdFx0XHRraW5kOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLmtpbmQnLCAnd2hldGhlciB0aGUgcGF0dGVybiBtYXRjaGVzIGEgbG9jYXRpb24gKGZpbGUgYW5kIGxpbmUpIG9yIG9ubHkgYSBmaWxlLicpXG5cdFx0XHR9LFxuXHRcdFx0ZmlsZToge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEuZmlsZScsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIGZpbGVuYW1lLiBJZiBvbWl0dGVkIDEgaXMgdXNlZC4nKVxuXHRcdFx0fSxcblx0XHRcdGxvY2F0aW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5sb2NhdGlvbicsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW1cXCdzIGxvY2F0aW9uLiBWYWxpZCBsb2NhdGlvbiBwYXR0ZXJucyBhcmU6IChsaW5lKSwgKGxpbmUsY29sdW1uKSBhbmQgKHN0YXJ0TGluZSxzdGFydENvbHVtbixlbmRMaW5lLGVuZENvbHVtbikuIElmIG9taXR0ZWQgKGxpbmUsY29sdW1uKSBpcyBhc3N1bWVkLicpXG5cdFx0XHR9LFxuXHRcdFx0bGluZToge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEubGluZScsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW1cXCdzIGxpbmUuIERlZmF1bHRzIHRvIDInKVxuXHRcdFx0fSxcblx0XHRcdGNvbHVtbjoge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEuY29sdW1uJywgJ1RoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbVxcJ3MgbGluZSBjaGFyYWN0ZXIuIERlZmF1bHRzIHRvIDMnKVxuXHRcdFx0fSxcblx0XHRcdGVuZExpbmU6IHtcblx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLmVuZExpbmUnLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtXFwncyBlbmQgbGluZS4gRGVmYXVsdHMgdG8gdW5kZWZpbmVkJylcblx0XHRcdH0sXG5cdFx0XHRlbmRDb2x1bW46IHtcblx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLmVuZENvbHVtbicsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW1cXCdzIGVuZCBsaW5lIGNoYXJhY3Rlci4gRGVmYXVsdHMgdG8gdW5kZWZpbmVkJylcblx0XHRcdH0sXG5cdFx0XHRzZXZlcml0eToge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEuc2V2ZXJpdHknLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtXFwncyBzZXZlcml0eS4gRGVmYXVsdHMgdG8gdW5kZWZpbmVkJylcblx0XHRcdH0sXG5cdFx0XHRjb2RlOiB7XG5cdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5jb2RlJywgJ1RoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbVxcJ3MgY29kZS4gRGVmYXVsdHMgdG8gdW5kZWZpbmVkJylcblx0XHRcdH0sXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5tZXNzYWdlJywgJ1RoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgbWVzc2FnZS4gSWYgb21pdHRlZCBpdCBkZWZhdWx0cyB0byA0IGlmIGxvY2F0aW9uIGlzIHNwZWNpZmllZC4gT3RoZXJ3aXNlIGl0IGRlZmF1bHRzIHRvIDUuJylcblx0XHRcdH0sXG5cdFx0XHRsb29wOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5sb29wJywgJ0luIGEgbXVsdGkgbGluZSBtYXRjaGVyIGxvb3AgaW5kaWNhdGVkIHdoZXRoZXIgdGhpcyBwYXR0ZXJuIGlzIGV4ZWN1dGVkIGluIGEgbG9vcCBhcyBsb25nIGFzIGl0IG1hdGNoZXMuIENhbiBvbmx5IHNwZWNpZmllZCBvbiBhIGxhc3QgcGF0dGVybiBpbiBhIG11bHRpIGxpbmUgcGF0dGVybi4nKVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRleHBvcnQgY29uc3QgTmFtZWRQcm9ibGVtUGF0dGVybjogSUpTT05TY2hlbWEgPSBPYmplY3RzLmRlZXBDbG9uZShQcm9ibGVtUGF0dGVybik7XG5cdE5hbWVkUHJvYmxlbVBhdHRlcm4ucHJvcGVydGllcyA9IE9iamVjdHMuZGVlcENsb25lKE5hbWVkUHJvYmxlbVBhdHRlcm4ucHJvcGVydGllcykgfHwge307XG5cdE5hbWVkUHJvYmxlbVBhdHRlcm4ucHJvcGVydGllc1snbmFtZSddID0ge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnTmFtZWRQcm9ibGVtUGF0dGVyblNjaGVtYS5uYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSBwcm9ibGVtIHBhdHRlcm4uJylcblx0fTtcblxuXHRleHBvcnQgY29uc3QgTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm46IElKU09OU2NoZW1hID0ge1xuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IFByb2JsZW1QYXR0ZXJuXG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IE5hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm46IElKU09OU2NoZW1hID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRuYW1lOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ05hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm5TY2hlbWEubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgcHJvYmxlbSBtdWx0aSBsaW5lIHByb2JsZW0gcGF0dGVybi4nKVxuXHRcdFx0fSxcblx0XHRcdHBhdHRlcm5zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnTmFtZWRNdWx0aUxpbmVQcm9ibGVtUGF0dGVyblNjaGVtYS5wYXR0ZXJucycsICdUaGUgYWN0dWFsIHBhdHRlcm5zLicpLFxuXHRcdFx0XHRpdGVtczogUHJvYmxlbVBhdHRlcm5cblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IFdhdGNoaW5nUGF0dGVybjogSUpTT05TY2hlbWEgPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHJlZ2V4cDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdXYXRjaGluZ1BhdHRlcm5TY2hlbWEucmVnZXhwJywgJ1RoZSByZWd1bGFyIGV4cHJlc3Npb24gdG8gZGV0ZWN0IHRoZSBiZWdpbiBvciBlbmQgb2YgYSBiYWNrZ3JvdW5kIHRhc2suJylcblx0XHRcdH0sXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdXYXRjaGluZ1BhdHRlcm5TY2hlbWEuZmlsZScsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIGZpbGVuYW1lLiBDYW4gYmUgb21pdHRlZC4nKVxuXHRcdFx0fSxcblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IFBhdHRlcm5UeXBlOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRhbnlPZjogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQYXR0ZXJuVHlwZVNjaGVtYS5uYW1lJywgJ1RoZSBuYW1lIG9mIGEgY29udHJpYnV0ZWQgb3IgcHJlZGVmaW5lZCBwYXR0ZXJuJylcblx0XHRcdH0sXG5cdFx0XHRTY2hlbWFzLlByb2JsZW1QYXR0ZXJuLFxuXHRcdFx0U2NoZW1hcy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVyblxuXHRcdF0sXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQYXR0ZXJuVHlwZVNjaGVtYS5kZXNjcmlwdGlvbicsICdBIHByb2JsZW0gcGF0dGVybiBvciB0aGUgbmFtZSBvZiBhIGNvbnRyaWJ1dGVkIG9yIHByZWRlZmluZWQgcHJvYmxlbSBwYXR0ZXJuLiBDYW4gYmUgb21pdHRlZCBpZiBiYXNlIGlzIHNwZWNpZmllZC4nKVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBQcm9ibGVtTWF0Y2hlcjogSUpTT05TY2hlbWEgPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGJhc2U6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuYmFzZScsICdUaGUgbmFtZSBvZiBhIGJhc2UgcHJvYmxlbSBtYXRjaGVyIHRvIHVzZS4nKVxuXHRcdFx0fSxcblx0XHRcdG93bmVyOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLm93bmVyJywgJ1RoZSBvd25lciBvZiB0aGUgcHJvYmxlbSBpbnNpZGUgQ29kZS4gQ2FuIGJlIG9taXR0ZWQgaWYgYmFzZSBpcyBzcGVjaWZpZWQuIERlZmF1bHRzIHRvIFxcJ2V4dGVybmFsXFwnIGlmIG9taXR0ZWQgYW5kIGJhc2UgaXMgbm90IHNwZWNpZmllZC4nKVxuXHRcdFx0fSxcblx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS5zb3VyY2UnLCAnQSBodW1hbi1yZWFkYWJsZSBzdHJpbmcgZGVzY3JpYmluZyB0aGUgc291cmNlIG9mIHRoaXMgZGlhZ25vc3RpYywgZS5nLiBcXCd0eXBlc2NyaXB0XFwnIG9yIFxcJ3N1cGVyIGxpbnRcXCcuJylcblx0XHRcdH0sXG5cdFx0XHRzZXZlcml0eToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZW51bTogWydlcnJvcicsICd3YXJuaW5nJywgJ2luZm8nXSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS5zZXZlcml0eScsICdUaGUgZGVmYXVsdCBzZXZlcml0eSBmb3IgY2FwdHVyZXMgcHJvYmxlbXMuIElzIHVzZWQgaWYgdGhlIHBhdHRlcm4gZG9lc25cXCd0IGRlZmluZSBhIG1hdGNoIGdyb3VwIGZvciBzZXZlcml0eS4nKVxuXHRcdFx0fSxcblx0XHRcdGFwcGx5VG86IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnYWxsRG9jdW1lbnRzJywgJ29wZW5Eb2N1bWVudHMnLCAnY2xvc2VkRG9jdW1lbnRzJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuYXBwbHlUbycsICdDb250cm9scyBpZiBhIHByb2JsZW0gcmVwb3J0ZWQgb24gYSB0ZXh0IGRvY3VtZW50IGlzIGFwcGxpZWQgb25seSB0byBvcGVuLCBjbG9zZWQgb3IgYWxsIGRvY3VtZW50cy4nKVxuXHRcdFx0fSxcblx0XHRcdHBhdHRlcm46IFBhdHRlcm5UeXBlLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiB7XG5cdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ2Fic29sdXRlJywgJ3JlbGF0aXZlJywgJ2F1dG9EZXRlY3QnLCAnc2VhcmNoJ11cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRwcmVmaXhJdGVtczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydhYnNvbHV0ZScsICdyZWxhdGl2ZScsICdhdXRvRGV0ZWN0JywgJ3NlYXJjaCddXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdFx0XHRtYXhJdGVtczogMSxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtczogZmFsc2Vcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRwcmVmaXhJdGVtczogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBlbnVtOiBbJ3JlbGF0aXZlJywgJ2F1dG9EZXRlY3QnXSB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0bWluSXRlbXM6IDIsXG5cdFx0XHRcdFx0XHRtYXhJdGVtczogMixcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtczogZmFsc2UsXG5cdFx0XHRcdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHRcdFx0XHRbJ3JlbGF0aXZlJywgJyR7d29ya3NwYWNlRm9sZGVyfSddLFxuXHRcdFx0XHRcdFx0XHRbJ2F1dG9EZXRlY3QnLCAnJHt3b3Jrc3BhY2VGb2xkZXJ9J10sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0cHJlZml4SXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgZW51bTogWydzZWFyY2gnXSB9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J2luY2x1ZGUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSB9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHQnZXhjbHVkZSc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnYXJyYXknLCBpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9IH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2luY2x1ZGUnXVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0bWluSXRlbXM6IDIsXG5cdFx0XHRcdFx0XHRtYXhJdGVtczogMixcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtczogZmFsc2UsXG5cdFx0XHRcdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHRcdFx0XHRbJ3NlYXJjaCcsIHsgJ2luY2x1ZGUnOiBbJyR7d29ya3NwYWNlRm9sZGVyfSddIH1dLFxuXHRcdFx0XHRcdFx0XHRbJ3NlYXJjaCcsIHsgJ2luY2x1ZGUnOiBbJyR7d29ya3NwYWNlRm9sZGVyfSddLCAnZXhjbHVkZSc6IFtdIH1dXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS5maWxlTG9jYXRpb24nLCAnRGVmaW5lcyBob3cgZmlsZSBuYW1lcyByZXBvcnRlZCBpbiBhIHByb2JsZW0gcGF0dGVybiBzaG91bGQgYmUgaW50ZXJwcmV0ZWQuIEEgcmVsYXRpdmUgZmlsZUxvY2F0aW9uIG1heSBiZSBhbiBhcnJheSwgd2hlcmUgdGhlIHNlY29uZCBlbGVtZW50IG9mIHRoZSBhcnJheSBpcyB0aGUgcGF0aCBvZiB0aGUgcmVsYXRpdmUgZmlsZSBsb2NhdGlvbi4gVGhlIHNlYXJjaCBmaWxlTG9jYXRpb24gbW9kZSwgcGVyZm9ybXMgYSBkZWVwIChhbmQsIHBvc3NpYmx5LCBoZWF2eSkgZmlsZSBzeXN0ZW0gc2VhcmNoIHdpdGhpbiB0aGUgZGlyZWN0b3JpZXMgc3BlY2lmaWVkIGJ5IHRoZSBpbmNsdWRlL2V4Y2x1ZGUgcHJvcGVydGllcyBvZiB0aGUgc2Vjb25kIGVsZW1lbnQgKG9yIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBkaXJlY3RvcnkgaWYgbm90IHNwZWNpZmllZCkuJylcblx0XHRcdH0sXG5cdFx0XHRiYWNrZ3JvdW5kOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuYmFja2dyb3VuZCcsICdQYXR0ZXJucyB0byB0cmFjayB0aGUgYmVnaW4gYW5kIGVuZCBvZiBhIG1hdGNoZXIgYWN0aXZlIG9uIGEgYmFja2dyb3VuZCB0YXNrLicpLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YWN0aXZlT25TdGFydDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS5iYWNrZ3JvdW5kLmFjdGl2ZU9uU3RhcnQnLCAnSWYgc2V0IHRvIHRydWUgdGhlIGJhY2tncm91bmQgbW9uaXRvciBzdGFydHMgaW4gYWN0aXZlIG1vZGUuIFRoaXMgaXMgdGhlIHNhbWUgYXMgb3V0cHV0dGluZyBhIGxpbmUgdGhhdCBtYXRjaGVzIGJlZ2luc1BhdHRlcm4gd2hlbiB0aGUgdGFzayBzdGFydHMuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJlZ2luc1BhdHRlcm46IHtcblx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRTY2hlbWFzLldhdGNoaW5nUGF0dGVyblxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuYmFja2dyb3VuZC5iZWdpbnNQYXR0ZXJuJywgJ0lmIG1hdGNoZWQgaW4gdGhlIG91dHB1dCB0aGUgc3RhcnQgb2YgYSBiYWNrZ3JvdW5kIHRhc2sgaXMgc2lnbmFsZWQuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGVuZHNQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0U2NoZW1hcy5XYXRjaGluZ1BhdHRlcm5cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLmJhY2tncm91bmQuZW5kc1BhdHRlcm4nLCAnSWYgbWF0Y2hlZCBpbiB0aGUgb3V0cHV0IHRoZSBlbmQgb2YgYSBiYWNrZ3JvdW5kIHRhc2sgaXMgc2lnbmFsZWQuJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR3YXRjaGluZzoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS53YXRjaGluZy5kZXByZWNhdGVkJywgJ1RoZSB3YXRjaGluZyBwcm9wZXJ0eSBpcyBkZXByZWNhdGVkLiBVc2UgYmFja2dyb3VuZCBpbnN0ZWFkLicpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoaW5nJywgJ1BhdHRlcm5zIHRvIHRyYWNrIHRoZSBiZWdpbiBhbmQgZW5kIG9mIGEgd2F0Y2hpbmcgbWF0Y2hlci4nKSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGFjdGl2ZU9uU3RhcnQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEud2F0Y2hpbmcuYWN0aXZlT25TdGFydCcsICdJZiBzZXQgdG8gdHJ1ZSB0aGUgd2F0Y2hlciBzdGFydHMgaW4gYWN0aXZlIG1vZGUuIFRoaXMgaXMgdGhlIHNhbWUgYXMgb3V0cHV0dGluZyBhIGxpbmUgdGhhdCBtYXRjaGVzIGJlZ2luc1BhdHRlcm4gd2hlbiB0aGUgdGFzayBzdGFydHMuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJlZ2luc1BhdHRlcm46IHtcblx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRTY2hlbWFzLldhdGNoaW5nUGF0dGVyblxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEud2F0Y2hpbmcuYmVnaW5zUGF0dGVybicsICdJZiBtYXRjaGVkIGluIHRoZSBvdXRwdXQgdGhlIHN0YXJ0IG9mIGEgd2F0Y2hpbmcgdGFzayBpcyBzaWduYWxlZC4nKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZW5kc1BhdHRlcm46IHtcblx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRTY2hlbWFzLldhdGNoaW5nUGF0dGVyblxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEud2F0Y2hpbmcuZW5kc1BhdHRlcm4nLCAnSWYgbWF0Y2hlZCBpbiB0aGUgb3V0cHV0IHRoZSBlbmQgb2YgYSB3YXRjaGluZyB0YXNrIGlzIHNpZ25hbGVkLicpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBMZWdhY3lQcm9ibGVtTWF0Y2hlcjogSUpTT05TY2hlbWEgPSBPYmplY3RzLmRlZXBDbG9uZShQcm9ibGVtTWF0Y2hlcik7XG5cdExlZ2FjeVByb2JsZW1NYXRjaGVyLnByb3BlcnRpZXMgPSBPYmplY3RzLmRlZXBDbG9uZShMZWdhY3lQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzKSB8fCB7fTtcblx0TGVnYWN5UHJvYmxlbU1hdGNoZXIucHJvcGVydGllc1snd2F0Y2hlZFRhc2tCZWdpbnNSZWdFeHAnXSA9IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdMZWdhY3lQcm9ibGVtTWF0Y2hlclNjaGVtYS53YXRjaGVkQmVnaW4uZGVwcmVjYXRlZCcsICdUaGlzIHByb3BlcnR5IGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgd2F0Y2hpbmcgcHJvcGVydHkgaW5zdGVhZC4nKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ0xlZ2FjeVByb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoZWRCZWdpbicsICdBIHJlZ3VsYXIgZXhwcmVzc2lvbiBzaWduYWxpbmcgdGhhdCBhIHdhdGNoZWQgdGFza3MgYmVnaW5zIGV4ZWN1dGluZyB0cmlnZ2VyZWQgdGhyb3VnaCBmaWxlIHdhdGNoaW5nLicpXG5cdH07XG5cdExlZ2FjeVByb2JsZW1NYXRjaGVyLnByb3BlcnRpZXNbJ3dhdGNoZWRUYXNrRW5kc1JlZ0V4cCddID0ge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ0xlZ2FjeVByb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoZWRFbmQuZGVwcmVjYXRlZCcsICdUaGlzIHByb3BlcnR5IGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgd2F0Y2hpbmcgcHJvcGVydHkgaW5zdGVhZC4nKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ0xlZ2FjeVByb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoZWRFbmQnLCAnQSByZWd1bGFyIGV4cHJlc3Npb24gc2lnbmFsaW5nIHRoYXQgYSB3YXRjaGVkIHRhc2tzIGVuZHMgZXhlY3V0aW5nLicpXG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IE5hbWVkUHJvYmxlbU1hdGNoZXI6IElKU09OU2NoZW1hID0gT2JqZWN0cy5kZWVwQ2xvbmUoUHJvYmxlbU1hdGNoZXIpO1xuXHROYW1lZFByb2JsZW1NYXRjaGVyLnByb3BlcnRpZXMgPSBPYmplY3RzLmRlZXBDbG9uZShOYW1lZFByb2JsZW1NYXRjaGVyLnByb3BlcnRpZXMpIHx8IHt9O1xuXHROYW1lZFByb2JsZW1NYXRjaGVyLnByb3BlcnRpZXMubmFtZSA9IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ05hbWVkUHJvYmxlbU1hdGNoZXJTY2hlbWEubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgcHJvYmxlbSBtYXRjaGVyIHVzZWQgdG8gcmVmZXIgdG8gaXQuJylcblx0fTtcblx0TmFtZWRQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzLmxhYmVsID0ge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnTmFtZWRQcm9ibGVtTWF0Y2hlclNjaGVtYS5sYWJlbCcsICdBIGh1bWFuIHJlYWRhYmxlIGxhYmVsIG9mIHRoZSBwcm9ibGVtIG1hdGNoZXIuJylcblx0fTtcbn1cblxuY29uc3QgcHJvYmxlbVBhdHRlcm5FeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PENvbmZpZy5OYW1lZFByb2JsZW1QYXR0ZXJucz4oe1xuXHRleHRlbnNpb25Qb2ludDogJ3Byb2JsZW1QYXR0ZXJucycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuRXh0UG9pbnQnLCAnQ29udHJpYnV0ZXMgcHJvYmxlbSBwYXR0ZXJucycpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFNjaGVtYXMuTmFtZWRQcm9ibGVtUGF0dGVybixcblx0XHRcdFx0U2NoZW1hcy5OYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuXG5cdFx0XHRdXG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGludGVyZmFjZSBJUHJvYmxlbVBhdHRlcm5SZWdpc3RyeSB7XG5cdG9uUmVhZHkoKTogUHJvbWlzZTx2b2lkPjtcblxuXHRnZXQoa2V5OiBzdHJpbmcpOiBJUHJvYmxlbVBhdHRlcm4gfCBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybjtcbn1cblxuY2xhc3MgUHJvYmxlbVBhdHRlcm5SZWdpc3RyeUltcGwgaW1wbGVtZW50cyBJUHJvYmxlbVBhdHRlcm5SZWdpc3RyeSB7XG5cblx0cHJpdmF0ZSBwYXR0ZXJuczogSVN0cmluZ0RpY3Rpb25hcnk8VHlwZXMuU2luZ2xlT3JNYW55PElQcm9ibGVtUGF0dGVybj4+O1xuXHRwcml2YXRlIHJlYWR5UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnBhdHRlcm5zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLmZpbGxEZWZhdWx0cygpO1xuXHRcdHRoaXMucmVhZHlQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0cHJvYmxlbVBhdHRlcm5FeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0XHQvLyBXZSBnZXQgYWxsIHN0YXRpY2FsbHkga25vdyBleHRlbnNpb24gZHVyaW5nIHN0YXJ0dXAgaW4gb25lIGJhdGNoXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0ZGVsdGEucmVtb3ZlZC5mb3JFYWNoKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9ibGVtUGF0dGVybnMgPSBleHRlbnNpb24udmFsdWUgYXMgQ29uZmlnLk5hbWVkUHJvYmxlbVBhdHRlcm5zO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHByb2JsZW1QYXR0ZXJucykge1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5wYXR0ZXJuc1twYXR0ZXJuLm5hbWVdKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMucGF0dGVybnNbcGF0dGVybi5uYW1lXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGRlbHRhLmFkZGVkLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJucyA9IGV4dGVuc2lvbi52YWx1ZSBhcyBDb25maWcuTmFtZWRQcm9ibGVtUGF0dGVybnM7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJzZXIgPSBuZXcgUHJvYmxlbVBhdHRlcm5QYXJzZXIobmV3IEV4dGVuc2lvblJlZ2lzdHJ5UmVwb3J0ZXIoZXh0ZW5zaW9uLmNvbGxlY3RvcikpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHByb2JsZW1QYXR0ZXJucykge1xuXHRcdFx0XHRcdFx0XHRpZiAoQ29uZmlnLk5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLmlzKHBhdHRlcm4pKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlKHBhdHRlcm4pO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwYXJzZXIucHJvYmxlbVJlcG9ydGVyLnN0YXR1cy5zdGF0ZSA8IFZhbGlkYXRpb25TdGF0ZS5FcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5hZGQocmVzdWx0Lm5hbWUsIHJlc3VsdC5wYXR0ZXJucyk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZXJyb3InLCAnSW52YWxpZCBwcm9ibGVtIHBhdHRlcm4uIFRoZSBwYXR0ZXJuIHdpbGwgYmUgaWdub3JlZC4nKSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKEpTT04uc3RyaW5naWZ5KHBhdHRlcm4sIHVuZGVmaW5lZCwgNCkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRlbHNlIGlmIChDb25maWcuTmFtZWRQcm9ibGVtUGF0dGVybi5pcyhwYXR0ZXJuKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZShwYXR0ZXJuKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocGFyc2VyLnByb2JsZW1SZXBvcnRlci5zdGF0dXMuc3RhdGUgPCBWYWxpZGF0aW9uU3RhdGUuRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuYWRkKHBhdHRlcm4ubmFtZSwgcmVzdWx0KTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5lcnJvcicsICdJbnZhbGlkIHByb2JsZW0gcGF0dGVybi4gVGhlIHBhdHRlcm4gd2lsbCBiZSBpZ25vcmVkLicpKTtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoSlNPTi5zdHJpbmdpZnkocGF0dGVybiwgdW5kZWZpbmVkLCA0KSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHBhcnNlci5yZXNldCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIERvIG5vdGhpbmdcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvblJlYWR5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlYWR5UHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBhZGQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUeXBlcy5TaW5nbGVPck1hbnk8SVByb2JsZW1QYXR0ZXJuPik6IHZvaWQge1xuXHRcdHRoaXMucGF0dGVybnNba2V5XSA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldChrZXk6IHN0cmluZyk6IFR5cGVzLlNpbmdsZU9yTWFueTxJUHJvYmxlbVBhdHRlcm4+IHtcblx0XHRyZXR1cm4gdGhpcy5wYXR0ZXJuc1trZXldO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWxsRGVmYXVsdHMoKTogdm9pZCB7XG5cdFx0dGhpcy5hZGQoJ21zQ29tcGlsZScsIHtcblx0XHRcdHJlZ2V4cDogL15cXHMqKD86XFxzKlxcZCs+KT8oXFxTLio/KSg/OlxcKChcXGQrfFxcZCssXFxkK3xcXGQrLFxcZCssXFxkKyxcXGQrKVxcKSk/XFxzKjpcXHMrKD86KFxcUyspXFxzKyk/KCg/OmZhdGFsICspP2Vycm9yfHdhcm5pbmd8aW5mbylcXHMrKFxcdytcXGQrKT9cXHMqOlxccyooLiopJC8sXG5cdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0ZmlsZTogMSxcblx0XHRcdGxvY2F0aW9uOiAyLFxuXHRcdFx0c2V2ZXJpdHk6IDQsXG5cdFx0XHRjb2RlOiA1LFxuXHRcdFx0bWVzc2FnZTogNlxuXHRcdH0pO1xuXHRcdHRoaXMuYWRkKCdndWxwLXRzYycsIHtcblx0XHRcdHJlZ2V4cDogL14oW15cXHNdLiopXFwoKFxcZCt8XFxkKyxcXGQrfFxcZCssXFxkKyxcXGQrLFxcZCspXFwpOlxccysoXFxkKylcXHMrKC4qKSQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsb2NhdGlvbjogMixcblx0XHRcdGNvZGU6IDMsXG5cdFx0XHRtZXNzYWdlOiA0XG5cdFx0fSk7XG5cdFx0dGhpcy5hZGQoJ2NwcCcsIHtcblx0XHRcdHJlZ2V4cDogL14oXFxTLiopXFwoKFxcZCt8XFxkKyxcXGQrfFxcZCssXFxkKyxcXGQrLFxcZCspXFwpOlxccysoZXJyb3J8d2FybmluZ3xpbmZvKVxccysoQ1xcZCspXFxzKjpcXHMqKC4qKSQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsb2NhdGlvbjogMixcblx0XHRcdHNldmVyaXR5OiAzLFxuXHRcdFx0Y29kZTogNCxcblx0XHRcdG1lc3NhZ2U6IDVcblx0XHR9KTtcblx0XHR0aGlzLmFkZCgnY3NjJywge1xuXHRcdFx0cmVnZXhwOiAvXihcXFMuKilcXCgoXFxkK3xcXGQrLFxcZCt8XFxkKyxcXGQrLFxcZCssXFxkKylcXCk6XFxzKyhlcnJvcnx3YXJuaW5nfGluZm8pXFxzKyhDU1xcZCspXFxzKjpcXHMqKC4qKSQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsb2NhdGlvbjogMixcblx0XHRcdHNldmVyaXR5OiAzLFxuXHRcdFx0Y29kZTogNCxcblx0XHRcdG1lc3NhZ2U6IDVcblx0XHR9KTtcblx0XHR0aGlzLmFkZCgndmInLCB7XG5cdFx0XHRyZWdleHA6IC9eKFxcUy4qKVxcKChcXGQrfFxcZCssXFxkK3xcXGQrLFxcZCssXFxkKyxcXGQrKVxcKTpcXHMrKGVycm9yfHdhcm5pbmd8aW5mbylcXHMrKEJDXFxkKylcXHMqOlxccyooLiopJC8sXG5cdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0ZmlsZTogMSxcblx0XHRcdGxvY2F0aW9uOiAyLFxuXHRcdFx0c2V2ZXJpdHk6IDMsXG5cdFx0XHRjb2RlOiA0LFxuXHRcdFx0bWVzc2FnZTogNVxuXHRcdH0pO1xuXHRcdHRoaXMuYWRkKCdsZXNzQ29tcGlsZScsIHtcblx0XHRcdHJlZ2V4cDogL15cXHMqKC4qKSBpbiBmaWxlICguKikgbGluZSBuby4gKFxcZCspJC8sXG5cdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0bWVzc2FnZTogMSxcblx0XHRcdGZpbGU6IDIsXG5cdFx0XHRsaW5lOiAzXG5cdFx0fSk7XG5cdFx0dGhpcy5hZGQoJ2pzaGludCcsIHtcblx0XHRcdHJlZ2V4cDogL14oLiopOlxccytsaW5lXFxzKyhcXGQrKSxcXHMrY29sXFxzKyhcXGQrKSxcXHMoLis/KSg/OlxccytcXCgoXFx3KShcXGQrKVxcKSk/JC8sXG5cdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0ZmlsZTogMSxcblx0XHRcdGxpbmU6IDIsXG5cdFx0XHRjaGFyYWN0ZXI6IDMsXG5cdFx0XHRtZXNzYWdlOiA0LFxuXHRcdFx0c2V2ZXJpdHk6IDUsXG5cdFx0XHRjb2RlOiA2XG5cdFx0fSk7XG5cdFx0dGhpcy5hZGQoJ2pzaGludC1zdHlsaXNoJywgW1xuXHRcdFx0e1xuXHRcdFx0XHRyZWdleHA6IC9eKC4rKSQvLFxuXHRcdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0XHRmaWxlOiAxXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyZWdleHA6IC9eXFxzK2xpbmVcXHMrKFxcZCspXFxzK2NvbFxccysoXFxkKylcXHMrKC4rPykoPzpcXHMrXFwoKFxcdykoXFxkKylcXCkpPyQvLFxuXHRcdFx0XHRsaW5lOiAxLFxuXHRcdFx0XHRjaGFyYWN0ZXI6IDIsXG5cdFx0XHRcdG1lc3NhZ2U6IDMsXG5cdFx0XHRcdHNldmVyaXR5OiA0LFxuXHRcdFx0XHRjb2RlOiA1LFxuXHRcdFx0XHRsb29wOiB0cnVlXG5cdFx0XHR9XG5cdFx0XSk7XG5cdFx0dGhpcy5hZGQoJ2VzbGludC1jb21wYWN0Jywge1xuXHRcdFx0cmVnZXhwOiAvXiguKyk6XFxzbGluZVxccyhcXGQrKSxcXHNjb2xcXHMoXFxkKyksXFxzKEVycm9yfFdhcm5pbmd8SW5mbylcXHMtXFxzKC4rKVxcc1xcKCguKylcXCkkLyxcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0bGluZTogMixcblx0XHRcdGNoYXJhY3RlcjogMyxcblx0XHRcdHNldmVyaXR5OiA0LFxuXHRcdFx0bWVzc2FnZTogNSxcblx0XHRcdGNvZGU6IDZcblx0XHR9KTtcblx0XHR0aGlzLmFkZCgnZXNsaW50LXN0eWxpc2gnLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHJlZ2V4cDogL14oKD86W2EtekEtWl06KSpbLi9cXFxcXSsuKj8pJC8sXG5cdFx0XHRcdGtpbmQ6IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24sXG5cdFx0XHRcdGZpbGU6IDFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJlZ2V4cDogL15cXHMrKFxcZCspOihcXGQrKVxccysoZXJyb3J8d2FybmluZ3xpbmZvKVxccysoLis/KSg/Olxcc1xccysoLiopKT8kLyxcblx0XHRcdFx0bGluZTogMSxcblx0XHRcdFx0Y2hhcmFjdGVyOiAyLFxuXHRcdFx0XHRzZXZlcml0eTogMyxcblx0XHRcdFx0bWVzc2FnZTogNCxcblx0XHRcdFx0Y29kZTogNSxcblx0XHRcdFx0bG9vcDogdHJ1ZVxuXHRcdFx0fVxuXHRcdF0pO1xuXHRcdHRoaXMuYWRkKCdnbycsIHtcblx0XHRcdHJlZ2V4cDogL14oW146XSo6ICk/KCguOik/W146XSopOihcXGQrKSg6KFxcZCspKT86ICguKikkLyxcblx0XHRcdGtpbmQ6IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24sXG5cdFx0XHRmaWxlOiAyLFxuXHRcdFx0bGluZTogNCxcblx0XHRcdGNoYXJhY3RlcjogNixcblx0XHRcdG1lc3NhZ2U6IDdcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgUHJvYmxlbVBhdHRlcm5SZWdpc3RyeTogSVByb2JsZW1QYXR0ZXJuUmVnaXN0cnkgPSBuZXcgUHJvYmxlbVBhdHRlcm5SZWdpc3RyeUltcGwoKTtcblxuZXhwb3J0IGNsYXNzIFByb2JsZW1NYXRjaGVyUGFyc2VyIGV4dGVuZHMgUGFyc2VyIHtcblxuXHRjb25zdHJ1Y3Rvcihsb2dnZXI6IElQcm9ibGVtUmVwb3J0ZXIpIHtcblx0XHRzdXBlcihsb2dnZXIpO1xuXHR9XG5cblx0cHVibGljIHBhcnNlKGpzb246IENvbmZpZy5Qcm9ibGVtTWF0Y2hlcik6IFByb2JsZW1NYXRjaGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNyZWF0ZVByb2JsZW1NYXRjaGVyKGpzb24pO1xuXHRcdGlmICghdGhpcy5jaGVja1Byb2JsZW1NYXRjaGVyVmFsaWQoanNvbiwgcmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5hZGRXYXRjaGluZ01hdGNoZXIoanNvbiwgcmVzdWx0KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNoZWNrUHJvYmxlbU1hdGNoZXJWYWxpZChleHRlcm5hbFByb2JsZW1NYXRjaGVyOiBDb25maWcuUHJvYmxlbU1hdGNoZXIsIHByb2JsZW1NYXRjaGVyOiBQcm9ibGVtTWF0Y2hlciB8IG51bGwpOiBwcm9ibGVtTWF0Y2hlciBpcyBQcm9ibGVtTWF0Y2hlciB7XG5cdFx0aWYgKCFwcm9ibGVtTWF0Y2hlcikge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJQYXJzZXIubm9Qcm9ibGVtTWF0Y2hlcicsICdFcnJvcjogdGhlIGRlc2NyaXB0aW9uIGNhblxcJ3QgYmUgY29udmVydGVkIGludG8gYSBwcm9ibGVtIG1hdGNoZXI6XFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWxQcm9ibGVtTWF0Y2hlciwgbnVsbCwgNCkpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFwcm9ibGVtTWF0Y2hlci5wYXR0ZXJuKSB7XG5cdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclBhcnNlci5ub1Byb2JsZW1QYXR0ZXJuJywgJ0Vycm9yOiB0aGUgZGVzY3JpcHRpb24gZG9lc25cXCd0IGRlZmluZSBhIHZhbGlkIHByb2JsZW0gcGF0dGVybjpcXG57MH1cXG4nLCBKU09OLnN0cmluZ2lmeShleHRlcm5hbFByb2JsZW1NYXRjaGVyLCBudWxsLCA0KSkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXByb2JsZW1NYXRjaGVyLm93bmVyKSB7XG5cdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclBhcnNlci5ub093bmVyJywgJ0Vycm9yOiB0aGUgZGVzY3JpcHRpb24gZG9lc25cXCd0IGRlZmluZSBhbiBvd25lcjpcXG57MH1cXG4nLCBKU09OLnN0cmluZ2lmeShleHRlcm5hbFByb2JsZW1NYXRjaGVyLCBudWxsLCA0KSkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoVHlwZXMuaXNVbmRlZmluZWQocHJvYmxlbU1hdGNoZXIuZmlsZUxvY2F0aW9uKSkge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJQYXJzZXIubm9GaWxlTG9jYXRpb24nLCAnRXJyb3I6IHRoZSBkZXNjcmlwdGlvbiBkb2VzblxcJ3QgZGVmaW5lIGEgZmlsZSBsb2NhdGlvbjpcXG57MH1cXG4nLCBKU09OLnN0cmluZ2lmeShleHRlcm5hbFByb2JsZW1NYXRjaGVyLCBudWxsLCA0KSkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUHJvYmxlbU1hdGNoZXIoZGVzY3JpcHRpb246IENvbmZpZy5Qcm9ibGVtTWF0Y2hlcik6IFByb2JsZW1NYXRjaGVyIHwgbnVsbCB7XG5cdFx0bGV0IHJlc3VsdDogUHJvYmxlbU1hdGNoZXIgfCBudWxsID0gbnVsbDtcblxuXHRcdGNvbnN0IG93bmVyID0gVHlwZXMuaXNTdHJpbmcoZGVzY3JpcHRpb24ub3duZXIpID8gZGVzY3JpcHRpb24ub3duZXIgOiBVVUlELmdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IFR5cGVzLmlzU3RyaW5nKGRlc2NyaXB0aW9uLnNvdXJjZSkgPyBkZXNjcmlwdGlvbi5zb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0bGV0IGFwcGx5VG8gPSBUeXBlcy5pc1N0cmluZyhkZXNjcmlwdGlvbi5hcHBseVRvKSA/IEFwcGx5VG9LaW5kLmZyb21TdHJpbmcoZGVzY3JpcHRpb24uYXBwbHlUbykgOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHM7XG5cdFx0aWYgKCFhcHBseVRvKSB7XG5cdFx0XHRhcHBseVRvID0gQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzO1xuXHRcdH1cblx0XHRsZXQgZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBmaWxlUHJlZml4OiBzdHJpbmcgfCBDb25maWcuU2VhcmNoRmlsZUxvY2F0aW9uQXJncyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGxldCBraW5kOiBGaWxlTG9jYXRpb25LaW5kIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChUeXBlcy5pc1VuZGVmaW5lZChkZXNjcmlwdGlvbi5maWxlTG9jYXRpb24pKSB7XG5cdFx0XHRmaWxlTG9jYXRpb24gPSBGaWxlTG9jYXRpb25LaW5kLlJlbGF0aXZlO1xuXHRcdFx0ZmlsZVByZWZpeCA9ICcke3dvcmtzcGFjZUZvbGRlcn0nO1xuXHRcdH0gZWxzZSBpZiAoVHlwZXMuaXNTdHJpbmcoZGVzY3JpcHRpb24uZmlsZUxvY2F0aW9uKSkge1xuXHRcdFx0a2luZCA9IEZpbGVMb2NhdGlvbktpbmQuZnJvbVN0cmluZyg8c3RyaW5nPmRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvbik7XG5cdFx0XHRpZiAoa2luZCkge1xuXHRcdFx0XHRmaWxlTG9jYXRpb24gPSBraW5kO1xuXHRcdFx0XHRpZiAoKGtpbmQgPT09IEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmUpIHx8IChraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLkF1dG9EZXRlY3QpKSB7XG5cdFx0XHRcdFx0ZmlsZVByZWZpeCA9ICcke3dvcmtzcGFjZUZvbGRlcn0nO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGtpbmQgPT09IEZpbGVMb2NhdGlvbktpbmQuU2VhcmNoKSB7XG5cdFx0XHRcdFx0ZmlsZVByZWZpeCA9IHsgaW5jbHVkZTogWycke3dvcmtzcGFjZUZvbGRlcn0nXSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChUeXBlcy5pc1N0cmluZ0FycmF5KGRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvbikpIHtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IDxzdHJpbmdbXT5kZXNjcmlwdGlvbi5maWxlTG9jYXRpb247XG5cdFx0XHRpZiAodmFsdWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0a2luZCA9IEZpbGVMb2NhdGlvbktpbmQuZnJvbVN0cmluZyh2YWx1ZXNbMF0pO1xuXHRcdFx0XHRpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSAmJiBraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLkFic29sdXRlKSB7XG5cdFx0XHRcdFx0ZmlsZUxvY2F0aW9uID0ga2luZDtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZXMubGVuZ3RoID09PSAyICYmIChraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLlJlbGF0aXZlIHx8IGtpbmQgPT09IEZpbGVMb2NhdGlvbktpbmQuQXV0b0RldGVjdCkgJiYgdmFsdWVzWzFdKSB7XG5cdFx0XHRcdFx0ZmlsZUxvY2F0aW9uID0ga2luZDtcblx0XHRcdFx0XHRmaWxlUHJlZml4ID0gdmFsdWVzWzFdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvbikpIHtcblx0XHRcdGNvbnN0IGtpbmQgPSBGaWxlTG9jYXRpb25LaW5kLmZyb21TdHJpbmcoZGVzY3JpcHRpb24uZmlsZUxvY2F0aW9uWzBdKTtcblx0XHRcdGlmIChraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLlNlYXJjaCkge1xuXHRcdFx0XHRmaWxlTG9jYXRpb24gPSBGaWxlTG9jYXRpb25LaW5kLlNlYXJjaDtcblx0XHRcdFx0ZmlsZVByZWZpeCA9IGRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvblsxXSA/PyB7IGluY2x1ZGU6IFsnJHt3b3Jrc3BhY2VGb2xkZXJ9J10gfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwYXR0ZXJuID0gZGVzY3JpcHRpb24ucGF0dGVybiA/IHRoaXMuY3JlYXRlUHJvYmxlbVBhdHRlcm4oZGVzY3JpcHRpb24ucGF0dGVybikgOiB1bmRlZmluZWQ7XG5cblx0XHRsZXQgc2V2ZXJpdHkgPSBkZXNjcmlwdGlvbi5zZXZlcml0eSA/IFNldmVyaXR5LmZyb21WYWx1ZShkZXNjcmlwdGlvbi5zZXZlcml0eSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHNldmVyaXR5ID09PSBTZXZlcml0eS5JZ25vcmUpIHtcblx0XHRcdHRoaXMuaW5mbyhsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJQYXJzZXIudW5rbm93blNldmVyaXR5JywgJ0luZm86IHVua25vd24gc2V2ZXJpdHkgezB9LiBWYWxpZCB2YWx1ZXMgYXJlIGVycm9yLCB3YXJuaW5nIGFuZCBpbmZvLlxcbicsIGRlc2NyaXB0aW9uLnNldmVyaXR5KSk7XG5cdFx0XHRzZXZlcml0eSA9IFNldmVyaXR5LkVycm9yO1xuXHRcdH1cblxuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhkZXNjcmlwdGlvbi5iYXNlKSkge1xuXHRcdFx0Y29uc3QgdmFyaWFibGVOYW1lID0gPHN0cmluZz5kZXNjcmlwdGlvbi5iYXNlO1xuXHRcdFx0aWYgKHZhcmlhYmxlTmFtZS5sZW5ndGggPiAxICYmIHZhcmlhYmxlTmFtZVswXSA9PT0gJyQnKSB7XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmdldCh2YXJpYWJsZU5hbWUuc3Vic3RyaW5nKDEpKTtcblx0XHRcdFx0aWYgKGJhc2UpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBPYmplY3RzLmRlZXBDbG9uZShiYXNlKTtcblx0XHRcdFx0XHRpZiAoZGVzY3JpcHRpb24ub3duZXIgIT09IHVuZGVmaW5lZCAmJiBvd25lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQub3duZXIgPSBvd25lcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uLnNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuc291cmNlID0gc291cmNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGVzY3JpcHRpb24uZmlsZUxvY2F0aW9uICE9PSB1bmRlZmluZWQgJiYgZmlsZUxvY2F0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5maWxlTG9jYXRpb24gPSBmaWxlTG9jYXRpb247XG5cdFx0XHRcdFx0XHRyZXN1bHQuZmlsZVByZWZpeCA9IGZpbGVQcmVmaXg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbi5wYXR0ZXJuICE9PSB1bmRlZmluZWQgJiYgcGF0dGVybiAhPT0gdW5kZWZpbmVkICYmIHBhdHRlcm4gIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wYXR0ZXJuID0gcGF0dGVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uLnNldmVyaXR5ICE9PSB1bmRlZmluZWQgJiYgc2V2ZXJpdHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnNldmVyaXR5ID0gc2V2ZXJpdHk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbi5hcHBseVRvICE9PSB1bmRlZmluZWQgJiYgYXBwbHlUbyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuYXBwbHlUbyA9IGFwcGx5VG87XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChmaWxlTG9jYXRpb24gJiYgcGF0dGVybikge1xuXHRcdFx0cmVzdWx0ID0ge1xuXHRcdFx0XHRvd25lcjogb3duZXIsXG5cdFx0XHRcdGFwcGx5VG86IGFwcGx5VG8sXG5cdFx0XHRcdGZpbGVMb2NhdGlvbjogZmlsZUxvY2F0aW9uLFxuXHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuLFxuXHRcdFx0fTtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0cmVzdWx0LnNvdXJjZSA9IHNvdXJjZTtcblx0XHRcdH1cblx0XHRcdGlmIChmaWxlUHJlZml4KSB7XG5cdFx0XHRcdHJlc3VsdC5maWxlUHJlZml4ID0gZmlsZVByZWZpeDtcblx0XHRcdH1cblx0XHRcdGlmIChzZXZlcml0eSkge1xuXHRcdFx0XHRyZXN1bHQuc2V2ZXJpdHkgPSBzZXZlcml0eTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKENvbmZpZy5pc05hbWVkUHJvYmxlbU1hdGNoZXIoZGVzY3JpcHRpb24pKSB7XG5cdFx0XHQocmVzdWx0IGFzIElOYW1lZFByb2JsZW1NYXRjaGVyKS5uYW1lID0gZGVzY3JpcHRpb24ubmFtZTtcblx0XHRcdChyZXN1bHQgYXMgSU5hbWVkUHJvYmxlbU1hdGNoZXIpLmxhYmVsID0gVHlwZXMuaXNTdHJpbmcoZGVzY3JpcHRpb24ubGFiZWwpID8gZGVzY3JpcHRpb24ubGFiZWwgOiBkZXNjcmlwdGlvbi5uYW1lO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQcm9ibGVtUGF0dGVybih2YWx1ZTogc3RyaW5nIHwgQ29uZmlnLklQcm9ibGVtUGF0dGVybiB8IENvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybik6IFR5cGVzLlNpbmdsZU9yTWFueTxJUHJvYmxlbVBhdHRlcm4+IHwgbnVsbCB7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0Y29uc3QgdmFyaWFibGVOYW1lOiBzdHJpbmcgPSA8c3RyaW5nPnZhbHVlO1xuXHRcdFx0aWYgKHZhcmlhYmxlTmFtZS5sZW5ndGggPiAxICYmIHZhcmlhYmxlTmFtZVswXSA9PT0gJyQnKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KHZhcmlhYmxlTmFtZS5zdWJzdHJpbmcoMSkpO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLm5vRGVmaW5lZFBhdHRlcicsICdFcnJvcjogdGhlIHBhdHRlcm4gd2l0aCB0aGUgaWRlbnRpZmllciB7MH0gZG9lc25cXCd0IGV4aXN0LicsIHZhcmlhYmxlTmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodmFyaWFibGVOYW1lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLm5vSWRlbnRpZmllcicsICdFcnJvcjogdGhlIHBhdHRlcm4gcHJvcGVydHkgcmVmZXJzIHRvIGFuIGVtcHR5IGlkZW50aWZpZXIuJykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLm5vVmFsaWRJZGVudGlmaWVyJywgJ0Vycm9yOiB0aGUgcGF0dGVybiBwcm9wZXJ0eSB7MH0gaXMgbm90IGEgdmFsaWQgcGF0dGVybiB2YXJpYWJsZSBuYW1lLicsIHZhcmlhYmxlTmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSkge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm5QYXJzZXIgPSBuZXcgUHJvYmxlbVBhdHRlcm5QYXJzZXIodGhpcy5wcm9ibGVtUmVwb3J0ZXIpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiBwcm9ibGVtUGF0dGVyblBhcnNlci5wYXJzZSh2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcHJvYmxlbVBhdHRlcm5QYXJzZXIucGFyc2UodmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYWRkV2F0Y2hpbmdNYXRjaGVyKGV4dGVybmFsOiBDb25maWcuUHJvYmxlbU1hdGNoZXIsIGludGVybmFsOiBQcm9ibGVtTWF0Y2hlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9sZEJlZ2lucyA9IHRoaXMuY3JlYXRlUmVndWxhckV4cHJlc3Npb24oZXh0ZXJuYWwud2F0Y2hlZFRhc2tCZWdpbnNSZWdFeHApO1xuXHRcdGNvbnN0IG9sZEVuZHMgPSB0aGlzLmNyZWF0ZVJlZ3VsYXJFeHByZXNzaW9uKGV4dGVybmFsLndhdGNoZWRUYXNrRW5kc1JlZ0V4cCk7XG5cdFx0aWYgKG9sZEJlZ2lucyAmJiBvbGRFbmRzKSB7XG5cdFx0XHRpbnRlcm5hbC53YXRjaGluZyA9IHtcblx0XHRcdFx0YWN0aXZlT25TdGFydDogZmFsc2UsXG5cdFx0XHRcdGJlZ2luc1BhdHRlcm46IHsgcmVnZXhwOiBvbGRCZWdpbnMgfSxcblx0XHRcdFx0ZW5kc1BhdHRlcm46IHsgcmVnZXhwOiBvbGRFbmRzIH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJhY2tncm91bmRNb25pdG9yID0gZXh0ZXJuYWwuYmFja2dyb3VuZCB8fCBleHRlcm5hbC53YXRjaGluZztcblx0XHRpZiAoVHlwZXMuaXNVbmRlZmluZWRPck51bGwoYmFja2dyb3VuZE1vbml0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJlZ2luczogSVdhdGNoaW5nUGF0dGVybiB8IG51bGwgPSB0aGlzLmNyZWF0ZVdhdGNoaW5nUGF0dGVybihiYWNrZ3JvdW5kTW9uaXRvci5iZWdpbnNQYXR0ZXJuKTtcblx0XHRjb25zdCBlbmRzOiBJV2F0Y2hpbmdQYXR0ZXJuIHwgbnVsbCA9IHRoaXMuY3JlYXRlV2F0Y2hpbmdQYXR0ZXJuKGJhY2tncm91bmRNb25pdG9yLmVuZHNQYXR0ZXJuKTtcblx0XHRpZiAoYmVnaW5zICYmIGVuZHMpIHtcblx0XHRcdGludGVybmFsLndhdGNoaW5nID0ge1xuXHRcdFx0XHRhY3RpdmVPblN0YXJ0OiBUeXBlcy5pc0Jvb2xlYW4oYmFja2dyb3VuZE1vbml0b3IuYWN0aXZlT25TdGFydCkgPyBiYWNrZ3JvdW5kTW9uaXRvci5hY3RpdmVPblN0YXJ0IDogZmFsc2UsXG5cdFx0XHRcdGJlZ2luc1BhdHRlcm46IGJlZ2lucyxcblx0XHRcdFx0ZW5kc1BhdHRlcm46IGVuZHNcblx0XHRcdH07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChiZWdpbnMgfHwgZW5kcykge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJQYXJzZXIucHJvYmxlbVBhdHRlcm4ud2F0Y2hpbmdNYXRjaGVyJywgJ0EgcHJvYmxlbSBtYXRjaGVyIG11c3QgZGVmaW5lIGJvdGggYSBiZWdpbiBwYXR0ZXJuIGFuZCBhbiBlbmQgcGF0dGVybiBmb3Igd2F0Y2hpbmcuJykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV2F0Y2hpbmdQYXR0ZXJuKGV4dGVybmFsOiBzdHJpbmcgfCBDb25maWcuSVdhdGNoaW5nUGF0dGVybiB8IHVuZGVmaW5lZCk6IElXYXRjaGluZ1BhdHRlcm4gfCBudWxsIHtcblx0XHRpZiAoVHlwZXMuaXNVbmRlZmluZWRPck51bGwoZXh0ZXJuYWwpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0bGV0IHJlZ2V4cDogUmVnRXhwIHwgbnVsbDtcblx0XHRsZXQgZmlsZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhleHRlcm5hbCkpIHtcblx0XHRcdHJlZ2V4cCA9IHRoaXMuY3JlYXRlUmVndWxhckV4cHJlc3Npb24oZXh0ZXJuYWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZWdleHAgPSB0aGlzLmNyZWF0ZVJlZ3VsYXJFeHByZXNzaW9uKGV4dGVybmFsLnJlZ2V4cCk7XG5cdFx0XHRpZiAoVHlwZXMuaXNOdW1iZXIoZXh0ZXJuYWwuZmlsZSkpIHtcblx0XHRcdFx0ZmlsZSA9IGV4dGVybmFsLmZpbGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghcmVnZXhwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGZpbGUgPyB7IHJlZ2V4cCwgZmlsZSB9IDogeyByZWdleHAsIGZpbGU6IDEgfTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVndWxhckV4cHJlc3Npb24odmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFJlZ0V4cCB8IG51bGwge1xuXHRcdGxldCByZXN1bHQ6IFJlZ0V4cCB8IG51bGwgPSBudWxsO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBuZXcgUmVnRXhwKHZhbHVlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLmludmFsaWRSZWdleHAnLCAnRXJyb3I6IFRoZSBzdHJpbmcgezB9IGlzIG5vdCBhIHZhbGlkIHJlZ3VsYXIgZXhwcmVzc2lvbi5cXG4nLCB2YWx1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNvbnN0IHByb2JsZW1NYXRjaGVyc0V4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8Q29uZmlnLklOYW1lZFByb2JsZW1NYXRjaGVyW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdwcm9ibGVtTWF0Y2hlcnMnLFxuXHRkZXBzOiBbcHJvYmxlbVBhdHRlcm5FeHRQb2ludF0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyRXh0UG9pbnQnLCAnQ29udHJpYnV0ZXMgcHJvYmxlbSBtYXRjaGVycycpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IFNjaGVtYXMuTmFtZWRQcm9ibGVtTWF0Y2hlclxuXHR9XG59KTtcblxuZXhwb3J0IGludGVyZmFjZSBJUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSB7XG5cdG9uUmVhZHkoKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0KG5hbWU6IHN0cmluZyk6IElOYW1lZFByb2JsZW1NYXRjaGVyO1xuXHRrZXlzKCk6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBvbk1hdGNoZXJDaGFuZ2VkOiBFdmVudDx2b2lkPjtcbn1cblxuY2xhc3MgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeUltcGwgaW1wbGVtZW50cyBJUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSB7XG5cblx0cHJpdmF0ZSBtYXRjaGVyczogSVN0cmluZ0RpY3Rpb25hcnk8SU5hbWVkUHJvYmxlbU1hdGNoZXI+O1xuXHRwcml2YXRlIHJlYWR5UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25NYXRjaGVyc0NoYW5nZWQ6IEVtaXR0ZXI8dm9pZD4gPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25NYXRjaGVyQ2hhbmdlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbk1hdGNoZXJzQ2hhbmdlZC5ldmVudDtcblxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMubWF0Y2hlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuZmlsbERlZmF1bHRzKCk7XG5cdFx0dGhpcy5yZWFkeVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRwcm9ibGVtTWF0Y2hlcnNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGRlbHRhLnJlbW92ZWQuZm9yRWFjaChleHRlbnNpb24gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvYmxlbU1hdGNoZXJzID0gZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBtYXRjaGVyIG9mIHByb2JsZW1NYXRjaGVycykge1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5tYXRjaGVyc1ttYXRjaGVyLm5hbWVdKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMubWF0Y2hlcnNbbWF0Y2hlci5uYW1lXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGRlbHRhLmFkZGVkLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb2JsZW1NYXRjaGVycyA9IGV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlciA9IG5ldyBQcm9ibGVtTWF0Y2hlclBhcnNlcihuZXcgRXh0ZW5zaW9uUmVnaXN0cnlSZXBvcnRlcihleHRlbnNpb24uY29sbGVjdG9yKSk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IG1hdGNoZXIgb2YgcHJvYmxlbU1hdGNoZXJzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZShtYXRjaGVyKTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlc3VsdCAmJiBpc05hbWVkUHJvYmxlbU1hdGNoZXIocmVzdWx0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuYWRkKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoKGRlbHRhLnJlbW92ZWQubGVuZ3RoID4gMCkgfHwgKGRlbHRhLmFkZGVkLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbk1hdGNoZXJzQ2hhbmdlZC5maXJlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXIgPSB0aGlzLmdldCgndHNjLXdhdGNoJyk7XG5cdFx0XHRcdGlmIChtYXRjaGVyKSB7XG5cdFx0XHRcdFx0KG1hdGNoZXIgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikudHNjV2F0Y2ggPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG9uUmVhZHkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0UHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5vblJlYWR5KCk7XG5cdFx0cmV0dXJuIHRoaXMucmVhZHlQcm9taXNlO1xuXHR9XG5cblx0cHVibGljIGFkZChtYXRjaGVyOiBJTmFtZWRQcm9ibGVtTWF0Y2hlcik6IHZvaWQge1xuXHRcdHRoaXMubWF0Y2hlcnNbbWF0Y2hlci5uYW1lXSA9IG1hdGNoZXI7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KG5hbWU6IHN0cmluZyk6IElOYW1lZFByb2JsZW1NYXRjaGVyIHtcblx0XHRyZXR1cm4gdGhpcy5tYXRjaGVyc1tuYW1lXTtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5tYXRjaGVycyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbGxEZWZhdWx0cygpOiB2b2lkIHtcblx0XHR0aGlzLmFkZCh7XG5cdFx0XHRuYW1lOiAnbXNDb21waWxlJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbXNDb21waWxlJywgJ01pY3Jvc29mdCBjb21waWxlciBwcm9ibGVtcycpLFxuXHRcdFx0b3duZXI6ICdtc0NvbXBpbGUnLFxuXHRcdFx0c291cmNlOiAnY3BwJyxcblx0XHRcdGFwcGx5VG86IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cyxcblx0XHRcdGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSxcblx0XHRcdHBhdHRlcm46IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdtc0NvbXBpbGUnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2xlc3NDb21waWxlJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGVzc0NvbXBpbGUnLCAnTGVzcyBwcm9ibGVtcycpLFxuXHRcdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRcdG93bmVyOiAnbGVzc0NvbXBpbGUnLFxuXHRcdFx0c291cmNlOiAnbGVzcycsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnbGVzc0NvbXBpbGUnKSxcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvclxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2d1bHAtdHNjJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ3VscC10c2MnLCAnR3VscCBUU0MgUHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAndHlwZXNjcmlwdCcsXG5cdFx0XHRzb3VyY2U6ICd0cycsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5jbG9zZWREb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmUsXG5cdFx0XHRmaWxlUHJlZml4OiAnJHt3b3Jrc3BhY2VGb2xkZXJ9Jyxcblx0XHRcdHBhdHRlcm46IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdndWxwLXRzYycpXG5cdFx0fSk7XG5cblx0XHR0aGlzLmFkZCh7XG5cdFx0XHRuYW1lOiAnanNoaW50Jyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnanNoaW50JywgJ0pTSGludCBwcm9ibGVtcycpLFxuXHRcdFx0b3duZXI6ICdqc2hpbnQnLFxuXHRcdFx0c291cmNlOiAnanNoaW50Jyxcblx0XHRcdGFwcGx5VG86IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cyxcblx0XHRcdGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSxcblx0XHRcdHBhdHRlcm46IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdqc2hpbnQnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2pzaGludC1zdHlsaXNoJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnanNoaW50LXN0eWxpc2gnLCAnSlNIaW50IHN0eWxpc2ggcHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAnanNoaW50Jyxcblx0XHRcdHNvdXJjZTogJ2pzaGludCcsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnanNoaW50LXN0eWxpc2gnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2VzbGludC1jb21wYWN0Jyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZXNsaW50LWNvbXBhY3QnLCAnRVNMaW50IGNvbXBhY3QgcHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAnZXNsaW50Jyxcblx0XHRcdHNvdXJjZTogJ2VzbGludCcsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRmaWxlUHJlZml4OiAnJHt3b3Jrc3BhY2VGb2xkZXJ9Jyxcblx0XHRcdHBhdHRlcm46IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdlc2xpbnQtY29tcGFjdCcpXG5cdFx0fSk7XG5cblx0XHR0aGlzLmFkZCh7XG5cdFx0XHRuYW1lOiAnZXNsaW50LXN0eWxpc2gnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdlc2xpbnQtc3R5bGlzaCcsICdFU0xpbnQgc3R5bGlzaCBwcm9ibGVtcycpLFxuXHRcdFx0b3duZXI6ICdlc2xpbnQnLFxuXHRcdFx0c291cmNlOiAnZXNsaW50Jyxcblx0XHRcdGFwcGx5VG86IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cyxcblx0XHRcdGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSxcblx0XHRcdHBhdHRlcm46IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdlc2xpbnQtc3R5bGlzaCcpXG5cdFx0fSk7XG5cblx0XHR0aGlzLmFkZCh7XG5cdFx0XHRuYW1lOiAnZ28nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdnbycsICdHbyBwcm9ibGVtcycpLFxuXHRcdFx0b3duZXI6ICdnbycsXG5cdFx0XHRzb3VyY2U6ICdnbycsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmUsXG5cdFx0XHRmaWxlUHJlZml4OiAnJHt3b3Jrc3BhY2VGb2xkZXJ9Jyxcblx0XHRcdHBhdHRlcm46IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdnbycpXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IFByb2JsZW1NYXRjaGVyUmVnaXN0cnk6IElQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5ID0gbmV3IFByb2JsZW1NYXRjaGVyUmVnaXN0cnlJbXBsKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUV6QixZQUFZLGFBQWE7QUFDekIsWUFBWSxhQUFhO0FBQ3pCLFlBQVksWUFBWTtBQUN4QixTQUFTLE1BQU0saUJBQWlCO0FBQ2hDLFlBQVksV0FBVztBQUN2QixZQUFZLFVBQVU7QUFDdEIsWUFBWSxjQUFjO0FBQzFCLE9BQU8sY0FBYztBQUNyQixTQUFTLFdBQVc7QUFFcEIsU0FB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QUFNO0FBQUEsTUFDTixPQUFPLFNBQVMsa0JBQWtCLHlCQUF5QjtBQUFBLE1BQzNELE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLFNBQVMsdUJBQXVCLElBQUksZ0JBQWdCO0FBQUEsSUFDckQsQ0FBQztBQUVELFNBQUssSUFBSTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sT0FBTyxTQUFTLGtCQUFrQix5QkFBeUI7QUFBQSxNQUMzRCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxjQUFjO0FBQUEsTUFDZCxTQUFTLHVCQUF1QixJQUFJLGdCQUFnQjtBQUFBLElBQ3JELENBQUM7QUFFRCxTQUFLLElBQUk7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLE9BQU8sU0FBUyxNQUFNLGFBQWE7QUFBQSxNQUNuQyxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixTQUFTLHVCQUF1QixJQUFJLElBQUk7QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBRU8sTUFBTSx5QkFBa0QsSUFBSSwyQkFBMkI7IiwKICAibmFtZXMiOiBbIkZpbGVMb2NhdGlvbktpbmQiLCAiUHJvYmxlbUxvY2F0aW9uS2luZCIsICJBcHBseVRvS2luZCIsICJDb25maWciLCAiQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIiwgIk5hbWVkUHJvYmxlbVBhdHRlcm4iLCAiTmFtZWRDaGVja2VkUHJvYmxlbVBhdHRlcm4iLCAiTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4iLCAiTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIiwgIk5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIiwgImlzTmFtZWRQcm9ibGVtTWF0Y2hlciIsICJyZXN1bHQiLCAidmFsdWUiLCAiU2NoZW1hcyIsICJraW5kIiwgIm1hdGNoZXIiXQp9Cg==
