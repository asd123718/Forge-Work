import { Iterable } from "../../../../../base/common/iterator.js";
import { dirname, joinPath } from "../../../../../base/common/resources.js";
import { splitLinesIncludeSeparators } from "../../../../../base/common/strings.js";
import { URI } from "../../../../../base/common/uri.js";
import { parse } from "../../../../../base/common/yaml.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { PositionOffsetTransformer } from "../../../../../editor/common/core/text/positionToOffsetImpl.js";
class PromptFileParser {
  constructor() {
  }
  parse(uri, content) {
    const linesWithEOL = splitLinesIncludeSeparators(content);
    if (linesWithEOL.length === 0) {
      return new ParsedPromptFile(uri, void 0, void 0);
    }
    let header = void 0;
    let body = void 0;
    let bodyStartLine = 0;
    if (linesWithEOL[0].match(/^---[\s\r\n]*$/)) {
      let headerEndLine = linesWithEOL.findIndex((line, index) => index > 0 && line.match(/^---[\s\r\n]*$/));
      if (headerEndLine === -1) {
        headerEndLine = linesWithEOL.length;
        bodyStartLine = linesWithEOL.length;
      } else {
        bodyStartLine = headerEndLine + 1;
      }
      const range = new Range(2, 1, headerEndLine + 1, 1);
      header = new PromptHeader(range, uri, linesWithEOL);
    }
    if (bodyStartLine < linesWithEOL.length) {
      const range = new Range(bodyStartLine + 1, 1, linesWithEOL.length + 1, 1);
      body = new PromptBody(range, linesWithEOL, uri);
    }
    return new ParsedPromptFile(uri, header, body);
  }
}
class ParsedPromptFile {
  constructor(uri, header, body) {
    this.uri = uri;
    this.header = header;
    this.body = body;
  }
}
var PromptHeaderAttributes;
((PromptHeaderAttributes2) => {
  PromptHeaderAttributes2.name = "name";
  PromptHeaderAttributes2.description = "description";
  PromptHeaderAttributes2.agent = "agent";
  PromptHeaderAttributes2.mode = "mode";
  PromptHeaderAttributes2.model = "model";
  PromptHeaderAttributes2.applyTo = "applyTo";
  PromptHeaderAttributes2.paths = "paths";
  PromptHeaderAttributes2.tools = "tools";
  PromptHeaderAttributes2.handOffs = "handoffs";
  PromptHeaderAttributes2.advancedOptions = "advancedOptions";
  PromptHeaderAttributes2.argumentHint = "argument-hint";
  PromptHeaderAttributes2.excludeAgent = "excludeAgent";
  PromptHeaderAttributes2.target = "target";
  PromptHeaderAttributes2.infer = "infer";
  PromptHeaderAttributes2.license = "license";
  PromptHeaderAttributes2.compatibility = "compatibility";
  PromptHeaderAttributes2.metadata = "metadata";
  PromptHeaderAttributes2.agents = "agents";
  PromptHeaderAttributes2.userInvocable = "user-invocable";
  PromptHeaderAttributes2.disableModelInvocation = "disable-model-invocation";
  PromptHeaderAttributes2.hooks = "hooks";
  PromptHeaderAttributes2.context = "context";
})(PromptHeaderAttributes || (PromptHeaderAttributes = {}));
class PromptHeader {
  constructor(range, uri, linesWithEOL) {
    this.range = range;
    this.uri = uri;
    this.linesWithEOL = linesWithEOL;
  }
  get _parsedHeader() {
    if (this._parsed === void 0) {
      const yamlErrors = [];
      const headerContent = this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join("");
      const node = parse(headerContent, yamlErrors);
      const transformer = new PositionOffsetTransformer(headerContent);
      const asRange = ({ startOffset, endOffset }) => {
        const startPos = transformer.getPosition(startOffset), endPos = transformer.getPosition(endOffset);
        const headerDelta = this.range.startLineNumber - 1;
        return new Range(startPos.lineNumber + headerDelta, startPos.column, endPos.lineNumber + headerDelta, endPos.column);
      };
      const asValue = (node2) => {
        switch (node2.type) {
          case "scalar":
            return { type: "scalar", value: node2.value, range: asRange(node2), format: node2.format };
          case "sequence":
            return { type: "sequence", items: node2.items.map((item) => asValue(item)), range: asRange(node2) };
          case "map": {
            const properties = node2.properties.map((property) => ({ key: asValue(property.key), value: asValue(property.value) }));
            return { type: "map", properties, range: asRange(node2) };
          }
        }
      };
      const attributes = [];
      const errors = yamlErrors.map((err) => ({ message: err.message, range: asRange(err), code: err.code }));
      if (node) {
        if (node.type !== "map") {
          errors.push({ message: "Invalid header, expecting <key: value> pairs", range: this.range, code: "INVALID_YAML" });
        } else {
          for (const property of node.properties) {
            attributes.push({
              key: property.key.value,
              range: asRange({ startOffset: property.key.startOffset, endOffset: property.value.endOffset }),
              value: asValue(property.value)
            });
          }
        }
      }
      this._parsed = { node, attributes, errors };
    }
    return this._parsed;
  }
  get attributes() {
    return this._parsedHeader.attributes;
  }
  getAttribute(key) {
    return this._parsedHeader.attributes.find((attr) => attr.key === key);
  }
  get errors() {
    return this._parsedHeader.errors;
  }
  getStringAttribute(key) {
    const attribute = this._parsedHeader.attributes.find((attr) => attr.key === key);
    if (attribute?.value.type === "scalar") {
      return attribute.value.value;
    }
    return void 0;
  }
  get name() {
    return this.getStringAttribute(PromptHeaderAttributes.name);
  }
  get description() {
    return this.getStringAttribute(PromptHeaderAttributes.description);
  }
  get agent() {
    return this.getStringAttribute(PromptHeaderAttributes.agent) ?? this.getStringAttribute(PromptHeaderAttributes.mode);
  }
  get model() {
    return this.getStringOrStringArrayAttribute(PromptHeaderAttributes.model);
  }
  get applyTo() {
    return this.getStringAttribute(PromptHeaderAttributes.applyTo);
  }
  /**
   * Gets the 'paths' attribute from the header.
   * The `paths` field supports a list of glob patterns that scope the instruction
   * to specific files (used by Claude rules). Returns a string array or undefined.
   */
  get paths() {
    return this.getStringOrStringArrayAttribute(PromptHeaderAttributes.paths);
  }
  get argumentHint() {
    return this.getStringAttribute(PromptHeaderAttributes.argumentHint);
  }
  get target() {
    return this.getStringAttribute(PromptHeaderAttributes.target);
  }
  get infer() {
    return this.getBooleanAttribute(PromptHeaderAttributes.infer);
  }
  get tools() {
    const toolsAttribute = this._parsedHeader.attributes.find((attr) => attr.key === PromptHeaderAttributes.tools);
    if (!toolsAttribute) {
      return void 0;
    }
    let value = toolsAttribute.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type === "sequence") {
      const tools = [];
      for (const item of value.items) {
        if (item.type === "scalar" && item.value) {
          tools.push(item.value);
        }
      }
      return tools;
    }
    return void 0;
  }
  get handOffs() {
    const handoffsAttribute = this._parsedHeader.attributes.find((attr) => attr.key === PromptHeaderAttributes.handOffs);
    if (!handoffsAttribute) {
      return void 0;
    }
    if (handoffsAttribute.value.type === "sequence") {
      const handoffs = [];
      for (const item of handoffsAttribute.value.items) {
        if (item.type === "map") {
          let agent;
          let label;
          let prompt;
          let send;
          let showContinueOn;
          let model;
          for (const prop of item.properties) {
            if (prop.key.value === "agent" && prop.value.type === "scalar") {
              agent = prop.value.value;
            } else if (prop.key.value === "label" && prop.value.type === "scalar") {
              label = prop.value.value;
            } else if (prop.key.value === "prompt" && prop.value.type === "scalar") {
              prompt = prop.value.value;
            } else if (prop.key.value === "send" && prop.value.type === "scalar") {
              send = parseBoolean(prop.value);
            } else if (prop.key.value === "showContinueOn" && prop.value.type === "scalar") {
              showContinueOn = parseBoolean(prop.value);
            } else if (prop.key.value === "model" && prop.value.type === "scalar") {
              model = prop.value.value;
            }
          }
          if (agent && label?.trim() && prompt !== void 0) {
            const handoff = {
              agent,
              label,
              prompt,
              ...send !== void 0 ? { send } : {},
              ...showContinueOn !== void 0 ? { showContinueOn } : {},
              ...model !== void 0 ? { model } : {}
            };
            handoffs.push(handoff);
          }
        }
      }
      return handoffs;
    }
    return void 0;
  }
  getStringArrayAttribute(key) {
    const attribute = this._parsedHeader.attributes.find((attr) => attr.key === key);
    if (!attribute) {
      return void 0;
    }
    if (attribute.value.type === "sequence") {
      const result = [];
      for (const item of attribute.value.items) {
        if (item.type === "scalar" && item.value) {
          result.push(item.value);
        }
      }
      return result;
    }
    return void 0;
  }
  getStringOrStringArrayAttribute(key) {
    const attribute = this._parsedHeader.attributes.find((attr) => attr.key === key);
    if (!attribute) {
      return void 0;
    }
    if (attribute.value.type === "scalar") {
      return [attribute.value.value];
    }
    if (attribute.value.type === "sequence") {
      const result = [];
      for (const item of attribute.value.items) {
        if (item.type === "scalar") {
          result.push(item.value);
        }
      }
      return result;
    }
    return void 0;
  }
  get agents() {
    return this.getStringArrayAttribute(PromptHeaderAttributes.agents);
  }
  get userInvocable() {
    return this.getBooleanAttribute(PromptHeaderAttributes.userInvocable);
  }
  get disableModelInvocation() {
    return this.getBooleanAttribute(PromptHeaderAttributes.disableModelInvocation);
  }
  get context() {
    return this.getStringAttribute(PromptHeaderAttributes.context);
  }
  /**
   * Gets the raw 'hooks' attribute value from the header.
   * Returns the YAML map value if present, or undefined. The caller is
   * responsible for converting this to `ChatRequestHooks` via
   * {@link parseSubagentHooksFromYaml}.
   */
  get hooksRaw() {
    const attr = this._parsedHeader.attributes.find((a) => a.key === PromptHeaderAttributes.hooks);
    if (attr?.value.type === "map") {
      return attr.value;
    }
    return void 0;
  }
  getBooleanAttribute(key) {
    const attribute = this._parsedHeader.attributes.find((attr) => attr.key === key);
    if (attribute?.value.type === "scalar") {
      return parseBoolean(attribute.value);
    }
    return void 0;
  }
}
function parseBoolean(stringValue) {
  if (stringValue.value === "true") {
    return true;
  } else if (stringValue.value === "false") {
    return false;
  }
  return void 0;
}
class PromptBody {
  constructor(range, linesWithEOL, uri) {
    this.range = range;
    this.linesWithEOL = linesWithEOL;
    this.uri = uri;
  }
  get fileReferences() {
    return this.getParsedBody().fileReferences;
  }
  get variableReferences() {
    return this.getParsedBody().variableReferences;
  }
  get offset() {
    return this.getParsedBody().bodyOffset;
  }
  getParsedBody() {
    if (this._parsed === void 0) {
      const markdownLinkRanges = [];
      const fileReferences = [];
      const variableReferences = [];
      const bodyOffset = Iterable.reduce(Iterable.slice(this.linesWithEOL, 0, this.range.startLineNumber - 1), (len, line) => line.length + len, 0);
      let inFencedCodeBlock = false;
      let fencedCodeBlockFenceChar;
      let fencedCodeBlockFenceLength = 0;
      for (let i = this.range.startLineNumber - 1, lineStartOffset = bodyOffset; i < this.range.endLineNumber - 1; i++) {
        const line = this.linesWithEOL[i];
        const trimmedLine = line.trimStart();
        const fenceMatch = /^(?<fence>(`{3,}|~{3,}))/u.exec(trimmedLine);
        if (fenceMatch) {
          const fence = fenceMatch.groups.fence;
          const fenceChar = fence[0];
          const fenceLength = fence.length;
          const restOfLine = trimmedLine.slice(fence.length);
          if (!inFencedCodeBlock) {
            inFencedCodeBlock = true;
            fencedCodeBlockFenceChar = fenceChar;
            fencedCodeBlockFenceLength = fenceLength;
            lineStartOffset += line.length;
            continue;
          }
          if (fencedCodeBlockFenceChar === fenceChar && fenceLength >= fencedCodeBlockFenceLength && /^\s*$/.test(restOfLine)) {
            inFencedCodeBlock = false;
            fencedCodeBlockFenceChar = void 0;
            fencedCodeBlockFenceLength = 0;
            lineStartOffset += line.length;
            continue;
          }
        }
        if (inFencedCodeBlock) {
          lineStartOffset += line.length;
          continue;
        }
        const inlineCodeRanges = [];
        for (const inlineMatch of line.matchAll(/`[^`]+`/g)) {
          inlineCodeRanges.push({ start: inlineMatch.index, end: inlineMatch.index + inlineMatch[0].length });
        }
        const isInsideInlineCode = (offset) => {
          return inlineCodeRanges.some((r) => offset >= r.start && offset < r.end);
        };
        const linkMatch = line.matchAll(/\[(.*?)\]\((.+?)\)/g);
        for (const match of linkMatch) {
          if (match.index > 0 && line[match.index - 1] === "!") {
            continue;
          }
          if (isInsideInlineCode(match.index)) {
            continue;
          }
          const linkEndOffset = match.index + match[0].length - 1;
          const linkStartOffset = match.index + match[0].length - match[2].length - 1;
          const range = new Range(i + 1, linkStartOffset + 1, i + 1, linkEndOffset + 1);
          fileReferences.push({ content: match[2], range, isMarkdownLink: true });
          markdownLinkRanges.push(new Range(i + 1, match.index + 1, i + 1, match.index + match[0].length + 1));
        }
        const reg = /#file:(?<filePath>[^\s#]+)|#tool:(?<toolName>[\w_\-\.\/]+)/gi;
        const matches = line.matchAll(reg);
        for (const match of matches) {
          const fullMatch = match[0];
          const fullRange = new Range(i + 1, match.index + 1, i + 1, match.index + fullMatch.length + 1);
          if (markdownLinkRanges.some((mdRange) => Range.areIntersectingOrTouching(mdRange, fullRange))) {
            continue;
          }
          if (isInsideInlineCode(match.index)) {
            continue;
          }
          const contentMatch = match.groups?.["filePath"] || match.groups?.["toolName"];
          if (!contentMatch) {
            continue;
          }
          const startOffset = match.index + fullMatch.length - contentMatch.length;
          const endOffset = match.index + fullMatch.length;
          const range = new Range(i + 1, startOffset + 1, i + 1, endOffset + 1);
          if (match.groups?.["filePath"]) {
            fileReferences.push({ content: match.groups?.["filePath"], range, isMarkdownLink: false });
          } else if (match.groups?.["toolName"]) {
            variableReferences.push({ name: match.groups?.["toolName"], range, offset: lineStartOffset + match.index, fullLength: fullMatch.length });
          }
        }
        lineStartOffset += line.length;
      }
      this._parsed = { fileReferences: fileReferences.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)), variableReferences, bodyOffset };
    }
    return this._parsed;
  }
  getContent() {
    return this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join("");
  }
  resolveFilePath(path) {
    try {
      if (path.startsWith("/")) {
        return this.uri.with({ path });
      } else if (path.match(/^[a-zA-Z]+:\//)) {
        return URI.parse(path);
      } else {
        const dirName = dirname(this.uri);
        return joinPath(dirName, path);
      }
    } catch {
      return void 0;
    }
  }
}
function parseCommaSeparatedList(stringValue) {
  const result = [];
  const input = stringValue.value;
  const positionOffset = stringValue.range.getStartPosition();
  let pos = 0;
  const isWhitespace = (char) => char === " " || char === "	";
  while (pos < input.length) {
    while (pos < input.length && isWhitespace(input[pos])) {
      pos++;
    }
    if (pos >= input.length) {
      break;
    }
    const startPos = pos;
    let value = "";
    let endPos;
    let quoteStyle;
    const char = input[pos];
    if (char === '"' || char === `'`) {
      const quote = char;
      pos++;
      while (pos < input.length && input[pos] !== quote) {
        value += input[pos];
        pos++;
      }
      endPos = pos + 1;
      if (pos < input.length) {
        pos++;
      }
      quoteStyle = quote === '"' ? "double" : "single";
    } else {
      const startPos2 = pos;
      while (pos < input.length && input[pos] !== ",") {
        value += input[pos];
        pos++;
      }
      value = value.trimEnd();
      endPos = startPos2 + value.length;
      quoteStyle = "none";
    }
    result.push({ type: "scalar", value, range: new Range(positionOffset.lineNumber, positionOffset.column + startPos, positionOffset.lineNumber, positionOffset.column + endPos), format: quoteStyle });
    while (pos < input.length && isWhitespace(input[pos])) {
      pos++;
    }
    if (pos < input.length && input[pos] === ",") {
      pos++;
    }
  }
  return { type: "sequence", items: result, range: stringValue.range };
}
function evaluateApplyToPattern(header, isClaudeRules) {
  if (isClaudeRules) {
    return header?.paths?.join(", ") ?? "**";
  }
  return header?.applyTo;
}
export {
  ParsedPromptFile,
  PromptBody,
  PromptFileParser,
  PromptHeader,
  PromptHeaderAttributes,
  evaluateApplyToPattern,
  parseCommaSeparatedList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxwcm9tcHRGaWxlUGFyc2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzSW5jbHVkZVNlcGFyYXRvcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBwYXJzZSwgWWFtbE5vZGUsIFlhbWxQYXJzZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24veWFtbC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3RleHQvcG9zaXRpb25Ub09mZnNldEltcGwuanMnO1xuXG5leHBvcnQgY2xhc3MgUHJvbXB0RmlsZVBhcnNlciB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHR9XG5cblx0cHVibGljIHBhcnNlKHVyaTogVVJJLCBjb250ZW50OiBzdHJpbmcpOiBQYXJzZWRQcm9tcHRGaWxlIHtcblx0XHRjb25zdCBsaW5lc1dpdGhFT0wgPSBzcGxpdExpbmVzSW5jbHVkZVNlcGFyYXRvcnMoY29udGVudCk7XG5cdFx0aWYgKGxpbmVzV2l0aEVPTC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBuZXcgUGFyc2VkUHJvbXB0RmlsZSh1cmksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0bGV0IGhlYWRlcjogUHJvbXB0SGVhZGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBib2R5OiBQcm9tcHRCb2R5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBib2R5U3RhcnRMaW5lID0gMDtcblx0XHRpZiAobGluZXNXaXRoRU9MWzBdLm1hdGNoKC9eLS0tW1xcc1xcclxcbl0qJC8pKSB7XG5cdFx0XHRsZXQgaGVhZGVyRW5kTGluZSA9IGxpbmVzV2l0aEVPTC5maW5kSW5kZXgoKGxpbmUsIGluZGV4KSA9PiBpbmRleCA+IDAgJiYgbGluZS5tYXRjaCgvXi0tLVtcXHNcXHJcXG5dKiQvKSk7XG5cdFx0XHRpZiAoaGVhZGVyRW5kTGluZSA9PT0gLTEpIHtcblx0XHRcdFx0aGVhZGVyRW5kTGluZSA9IGxpbmVzV2l0aEVPTC5sZW5ndGg7XG5cdFx0XHRcdGJvZHlTdGFydExpbmUgPSBsaW5lc1dpdGhFT0wubGVuZ3RoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ym9keVN0YXJ0TGluZSA9IGhlYWRlckVuZExpbmUgKyAxO1xuXHRcdFx0fVxuXHRcdFx0Ly8gcmFuZ2Ugc3RhcnRzIG9uIHRoZSBsaW5lIGFmdGVyIHRoZSAtLS0sIGFuZCBlbmRzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmUgdGhhdCBoYXMgdGhlIGNsb3NpbmcgLS0tXG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZSgyLCAxLCBoZWFkZXJFbmRMaW5lICsgMSwgMSk7XG5cdFx0XHRoZWFkZXIgPSBuZXcgUHJvbXB0SGVhZGVyKHJhbmdlLCB1cmksIGxpbmVzV2l0aEVPTCk7XG5cdFx0fVxuXHRcdGlmIChib2R5U3RhcnRMaW5lIDwgbGluZXNXaXRoRU9MLmxlbmd0aCkge1xuXHRcdFx0Ly8gcmFuZ2Ugc3RhcnRzICBvbiB0aGUgbGluZSBhZnRlciB0aGUgLS0tLCBhbmQgZW5kcyBhdCB0aGUgYmVnaW5uaW5nIG9mIGxpbmUgYWZ0ZXIgdGhlIGxhc3QgbGluZVxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoYm9keVN0YXJ0TGluZSArIDEsIDEsIGxpbmVzV2l0aEVPTC5sZW5ndGggKyAxLCAxKTtcblx0XHRcdGJvZHkgPSBuZXcgUHJvbXB0Qm9keShyYW5nZSwgbGluZXNXaXRoRU9MLCB1cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFBhcnNlZFByb21wdEZpbGUodXJpLCBoZWFkZXIsIGJvZHkpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFBhcnNlZFByb21wdEZpbGUge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkksIHB1YmxpYyByZWFkb25seSBoZWFkZXI/OiBQcm9tcHRIZWFkZXIsIHB1YmxpYyByZWFkb25seSBib2R5PzogUHJvbXB0Qm9keSkge1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VFcnJvciB7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xuXHRyZWFkb25seSBjb2RlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBQYXJzZWRIZWFkZXIge1xuXHRyZWFkb25seSBub2RlOiBZYW1sTm9kZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXJyb3JzOiBQYXJzZUVycm9yW107XG5cdHJlYWRvbmx5IGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIHtcblx0ZXhwb3J0IGNvbnN0IG5hbWUgPSAnbmFtZSc7XG5cdGV4cG9ydCBjb25zdCBkZXNjcmlwdGlvbiA9ICdkZXNjcmlwdGlvbic7XG5cdGV4cG9ydCBjb25zdCBhZ2VudCA9ICdhZ2VudCc7XG5cdGV4cG9ydCBjb25zdCBtb2RlID0gJ21vZGUnO1xuXHRleHBvcnQgY29uc3QgbW9kZWwgPSAnbW9kZWwnO1xuXHRleHBvcnQgY29uc3QgYXBwbHlUbyA9ICdhcHBseVRvJztcblx0ZXhwb3J0IGNvbnN0IHBhdGhzID0gJ3BhdGhzJztcblx0ZXhwb3J0IGNvbnN0IHRvb2xzID0gJ3Rvb2xzJztcblx0ZXhwb3J0IGNvbnN0IGhhbmRPZmZzID0gJ2hhbmRvZmZzJztcblx0ZXhwb3J0IGNvbnN0IGFkdmFuY2VkT3B0aW9ucyA9ICdhZHZhbmNlZE9wdGlvbnMnO1xuXHRleHBvcnQgY29uc3QgYXJndW1lbnRIaW50ID0gJ2FyZ3VtZW50LWhpbnQnO1xuXHRleHBvcnQgY29uc3QgZXhjbHVkZUFnZW50ID0gJ2V4Y2x1ZGVBZ2VudCc7XG5cdGV4cG9ydCBjb25zdCB0YXJnZXQgPSAndGFyZ2V0Jztcblx0ZXhwb3J0IGNvbnN0IGluZmVyID0gJ2luZmVyJztcblx0ZXhwb3J0IGNvbnN0IGxpY2Vuc2UgPSAnbGljZW5zZSc7XG5cdGV4cG9ydCBjb25zdCBjb21wYXRpYmlsaXR5ID0gJ2NvbXBhdGliaWxpdHknO1xuXHRleHBvcnQgY29uc3QgbWV0YWRhdGEgPSAnbWV0YWRhdGEnO1xuXHRleHBvcnQgY29uc3QgYWdlbnRzID0gJ2FnZW50cyc7XG5cdGV4cG9ydCBjb25zdCB1c2VySW52b2NhYmxlID0gJ3VzZXItaW52b2NhYmxlJztcblx0ZXhwb3J0IGNvbnN0IGRpc2FibGVNb2RlbEludm9jYXRpb24gPSAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJztcblx0ZXhwb3J0IGNvbnN0IGhvb2tzID0gJ2hvb2tzJztcblx0ZXhwb3J0IGNvbnN0IGNvbnRleHQgPSAnY29udGV4dCc7XG59XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRIZWFkZXIge1xuXHRwcml2YXRlIF9wYXJzZWQ6IFBhcnNlZEhlYWRlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLCBwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkksIHByaXZhdGUgcmVhZG9ubHkgbGluZXNXaXRoRU9MOiBzdHJpbmdbXSkge1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX3BhcnNlZEhlYWRlcigpOiBQYXJzZWRIZWFkZXIge1xuXHRcdGlmICh0aGlzLl9wYXJzZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgeWFtbEVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaGVhZGVyQ29udGVudCA9IHRoaXMubGluZXNXaXRoRU9MLnNsaWNlKHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgdGhpcy5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSkuam9pbignJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaGVhZGVyQ29udGVudCwgeWFtbEVycm9ycyk7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm1lciA9IG5ldyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyKGhlYWRlckNvbnRlbnQpO1xuXHRcdFx0Y29uc3QgYXNSYW5nZSA9ICh7IHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQgfTogeyBzdGFydE9mZnNldDogbnVtYmVyOyBlbmRPZmZzZXQ6IG51bWJlciB9KTogUmFuZ2UgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGFydFBvcyA9IHRyYW5zZm9ybWVyLmdldFBvc2l0aW9uKHN0YXJ0T2Zmc2V0KSwgZW5kUG9zID0gdHJhbnNmb3JtZXIuZ2V0UG9zaXRpb24oZW5kT2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgaGVhZGVyRGVsdGEgPSB0aGlzLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDE7XG5cdFx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRQb3MubGluZU51bWJlciArIGhlYWRlckRlbHRhLCBzdGFydFBvcy5jb2x1bW4sIGVuZFBvcy5saW5lTnVtYmVyICsgaGVhZGVyRGVsdGEsIGVuZFBvcy5jb2x1bW4pO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFzVmFsdWUgPSAobm9kZTogWWFtbE5vZGUpOiBJVmFsdWUgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKG5vZGUudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ3NjYWxhcic6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6IG5vZGUudmFsdWUsIHJhbmdlOiBhc1JhbmdlKG5vZGUpLCBmb3JtYXQ6IG5vZGUuZm9ybWF0IH07XG5cdFx0XHRcdFx0Y2FzZSAnc2VxdWVuY2UnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ3NlcXVlbmNlJywgaXRlbXM6IG5vZGUuaXRlbXMubWFwKGl0ZW0gPT4gYXNWYWx1ZShpdGVtKSksIHJhbmdlOiBhc1JhbmdlKG5vZGUpIH07XG5cdFx0XHRcdFx0Y2FzZSAnbWFwJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvcGVydGllcyA9IG5vZGUucHJvcGVydGllcy5tYXAocHJvcGVydHkgPT4gKHsga2V5OiBhc1ZhbHVlKHByb3BlcnR5LmtleSkgYXMgSVNjYWxhclZhbHVlLCB2YWx1ZTogYXNWYWx1ZShwcm9wZXJ0eS52YWx1ZSkgfSkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ21hcCcsIHByb3BlcnRpZXMsIHJhbmdlOiBhc1JhbmdlKG5vZGUpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gW107XG5cdFx0XHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IHlhbWxFcnJvcnMubWFwKGVyciA9PiAoeyBtZXNzYWdlOiBlcnIubWVzc2FnZSwgcmFuZ2U6IGFzUmFuZ2UoZXJyKSwgY29kZTogZXJyLmNvZGUgfSkpO1xuXHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0aWYgKG5vZGUudHlwZSAhPT0gJ21hcCcpIHtcblx0XHRcdFx0XHRlcnJvcnMucHVzaCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGhlYWRlciwgZXhwZWN0aW5nIDxrZXk6IHZhbHVlPiBwYWlycycsIHJhbmdlOiB0aGlzLnJhbmdlLCBjb2RlOiAnSU5WQUxJRF9ZQU1MJyB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIG5vZGUucHJvcGVydGllcykge1xuXHRcdFx0XHRcdFx0YXR0cmlidXRlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2V5OiBwcm9wZXJ0eS5rZXkudmFsdWUsXG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBhc1JhbmdlKHsgc3RhcnRPZmZzZXQ6IHByb3BlcnR5LmtleS5zdGFydE9mZnNldCwgZW5kT2Zmc2V0OiBwcm9wZXJ0eS52YWx1ZS5lbmRPZmZzZXQgfSksXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBhc1ZhbHVlKHByb3BlcnR5LnZhbHVlKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wYXJzZWQgPSB7IG5vZGUsIGF0dHJpYnV0ZXMsIGVycm9ycyB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGFyc2VkO1xuXHR9XG5cblx0cHVibGljIGdldCBhdHRyaWJ1dGVzKCk6IElIZWFkZXJBdHRyaWJ1dGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhcnNlZEhlYWRlci5hdHRyaWJ1dGVzO1xuXHR9XG5cblx0cHVibGljIGdldEF0dHJpYnV0ZShrZXk6IHN0cmluZyk6IElIZWFkZXJBdHRyaWJ1dGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wYXJzZWRIZWFkZXIuYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IGtleSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGVycm9ycygpOiBQYXJzZUVycm9yW10ge1xuXHRcdHJldHVybiB0aGlzLl9wYXJzZWRIZWFkZXIuZXJyb3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdHJpbmdBdHRyaWJ1dGUoa2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IHRoaXMuX3BhcnNlZEhlYWRlci5hdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0ga2V5KTtcblx0XHRpZiAoYXR0cmlidXRlPy52YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0cmV0dXJuIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZ0F0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWUpO1xuXHR9XG5cblx0cHVibGljIGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZ0F0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYWdlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdHJpbmdBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudCkgPz8gdGhpcy5nZXRTdHJpbmdBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbW9kZWwoKTogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZ09yU3RyaW5nQXJyYXlBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGFwcGx5VG8oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdHJpbmdBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcHBseVRvKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSAncGF0aHMnIGF0dHJpYnV0ZSBmcm9tIHRoZSBoZWFkZXIuXG5cdCAqIFRoZSBgcGF0aHNgIGZpZWxkIHN1cHBvcnRzIGEgbGlzdCBvZiBnbG9iIHBhdHRlcm5zIHRoYXQgc2NvcGUgdGhlIGluc3RydWN0aW9uXG5cdCAqIHRvIHNwZWNpZmljIGZpbGVzICh1c2VkIGJ5IENsYXVkZSBydWxlcykuIFJldHVybnMgYSBzdHJpbmcgYXJyYXkgb3IgdW5kZWZpbmVkLlxuXHQgKi9cblx0cHVibGljIGdldCBwYXRocygpOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RyaW5nT3JTdHJpbmdBcnJheUF0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnBhdGhzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYXJndW1lbnRIaW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RyaW5nQXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGFyZ2V0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RyaW5nQXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMudGFyZ2V0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaW5mZXIoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Qm9vbGVhbkF0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdG9vbHMoKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRvb2xzQXR0cmlidXRlID0gdGhpcy5fcGFyc2VkSGVhZGVyLmF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzKTtcblx0XHRpZiAoIXRvb2xzQXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgdmFsdWUgPSB0b29sc0F0dHJpYnV0ZS52YWx1ZTtcblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdHZhbHVlID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QodmFsdWUpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0Y29uc3QgdG9vbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdmFsdWUuaXRlbXMpIHtcblx0XHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3NjYWxhcicgJiYgaXRlbS52YWx1ZSkge1xuXHRcdFx0XHRcdHRvb2xzLnB1c2goaXRlbS52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0b29scztcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaGFuZE9mZnMoKTogSUhhbmRPZmZbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaGFuZG9mZnNBdHRyaWJ1dGUgPSB0aGlzLl9wYXJzZWRIZWFkZXIuYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnMpO1xuXHRcdGlmICghaGFuZG9mZnNBdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChoYW5kb2Zmc0F0dHJpYnV0ZS52YWx1ZS50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHQvLyBBcnJheSBmb3JtYXQ6IGxpc3Qgb2Ygb2JqZWN0czogeyBhZ2VudCwgbGFiZWwsIHByb21wdCwgc2VuZD8sIHNob3dDb250aW51ZU9uPywgbW9kZWw/IH1cblx0XHRcdGNvbnN0IGhhbmRvZmZzOiBJSGFuZE9mZltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaGFuZG9mZnNBdHRyaWJ1dGUudmFsdWUuaXRlbXMpIHtcblx0XHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ21hcCcpIHtcblx0XHRcdFx0XHRsZXQgYWdlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRsZXQgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRsZXQgcHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bGV0IHNlbmQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bGV0IHNob3dDb250aW51ZU9uOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGxldCBtb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcHJvcCBvZiBpdGVtLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRcdGlmIChwcm9wLmtleS52YWx1ZSA9PT0gJ2FnZW50JyAmJiBwcm9wLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0XHRcdGFnZW50ID0gcHJvcC52YWx1ZS52YWx1ZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocHJvcC5rZXkudmFsdWUgPT09ICdsYWJlbCcgJiYgcHJvcC52YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IHByb3AudmFsdWUudmFsdWU7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHByb3Aua2V5LnZhbHVlID09PSAncHJvbXB0JyAmJiBwcm9wLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0XHRcdHByb21wdCA9IHByb3AudmFsdWUudmFsdWU7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHByb3Aua2V5LnZhbHVlID09PSAnc2VuZCcgJiYgcHJvcC52YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdFx0XHRzZW5kID0gcGFyc2VCb29sZWFuKHByb3AudmFsdWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwcm9wLmtleS52YWx1ZSA9PT0gJ3Nob3dDb250aW51ZU9uJyAmJiBwcm9wLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0XHRcdHNob3dDb250aW51ZU9uID0gcGFyc2VCb29sZWFuKHByb3AudmFsdWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwcm9wLmtleS52YWx1ZSA9PT0gJ21vZGVsJyAmJiBwcm9wLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0XHRcdG1vZGVsID0gcHJvcC52YWx1ZS52YWx1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGFnZW50ICYmIGxhYmVsPy50cmltKCkgJiYgcHJvbXB0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGhhbmRvZmY6IElIYW5kT2ZmID0ge1xuXHRcdFx0XHRcdFx0XHRhZ2VudCxcblx0XHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHRcdHByb21wdCxcblx0XHRcdFx0XHRcdFx0Li4uKHNlbmQgIT09IHVuZGVmaW5lZCA/IHsgc2VuZCB9IDoge30pLFxuXHRcdFx0XHRcdFx0XHQuLi4oc2hvd0NvbnRpbnVlT24gIT09IHVuZGVmaW5lZCA/IHsgc2hvd0NvbnRpbnVlT24gfSA6IHt9KSxcblx0XHRcdFx0XHRcdFx0Li4uKG1vZGVsICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsIH0gOiB7fSlcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRoYW5kb2Zmcy5wdXNoKGhhbmRvZmYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGhhbmRvZmZzO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdHJpbmdBcnJheUF0dHJpYnV0ZShrZXk6IHN0cmluZyk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSB0aGlzLl9wYXJzZWRIZWFkZXIuYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IGtleSk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGF0dHJpYnV0ZS52YWx1ZS5pdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS50eXBlID09PSAnc2NhbGFyJyAmJiBpdGVtLnZhbHVlKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbS52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0cmluZ09yU3RyaW5nQXJyYXlBdHRyaWJ1dGUoa2V5OiBzdHJpbmcpOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gdGhpcy5fcGFyc2VkSGVhZGVyLmF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBrZXkpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXR1cm4gW2F0dHJpYnV0ZS52YWx1ZS52YWx1ZV07XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGF0dHJpYnV0ZS52YWx1ZS5pdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0udmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldCBhZ2VudHMoKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZ0FycmF5QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnRzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdXNlckludm9jYWJsZSgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRCb29sZWFuQXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGRpc2FibGVNb2RlbEludm9jYXRpb24oKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Qm9vbGVhbkF0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb24pO1xuXHR9XG5cblx0cHVibGljIGdldCBjb250ZXh0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RyaW5nQXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuY29udGV4dCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgcmF3ICdob29rcycgYXR0cmlidXRlIHZhbHVlIGZyb20gdGhlIGhlYWRlci5cblx0ICogUmV0dXJucyB0aGUgWUFNTCBtYXAgdmFsdWUgaWYgcHJlc2VudCwgb3IgdW5kZWZpbmVkLiBUaGUgY2FsbGVyIGlzXG5cdCAqIHJlc3BvbnNpYmxlIGZvciBjb252ZXJ0aW5nIHRoaXMgdG8gYENoYXRSZXF1ZXN0SG9va3NgIHZpYVxuXHQgKiB7QGxpbmsgcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWx9LlxuXHQgKi9cblx0cHVibGljIGdldCBob29rc1JhdygpOiBJTWFwVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHIgPSB0aGlzLl9wYXJzZWRIZWFkZXIuYXR0cmlidXRlcy5maW5kKGEgPT4gYS5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3MpO1xuXHRcdGlmIChhdHRyPy52YWx1ZS50eXBlID09PSAnbWFwJykge1xuXHRcdFx0cmV0dXJuIGF0dHIudmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEJvb2xlYW5BdHRyaWJ1dGUoa2V5OiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSB0aGlzLl9wYXJzZWRIZWFkZXIuYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IGtleSk7XG5cdFx0aWYgKGF0dHJpYnV0ZT8udmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdHJldHVybiBwYXJzZUJvb2xlYW4oYXR0cmlidXRlLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBwYXJzZUJvb2xlYW4oc3RyaW5nVmFsdWU6IElTY2FsYXJWYWx1ZSk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRpZiAoc3RyaW5nVmFsdWUudmFsdWUgPT09ICd0cnVlJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGVsc2UgaWYgKHN0cmluZ1ZhbHVlLnZhbHVlID09PSAnZmFsc2UnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhhbmRPZmYge1xuXHRyZWFkb25seSBhZ2VudDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2VuZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dDb250aW51ZU9uPzogYm9vbGVhbjsgLy8gdHJlYXRlZCBleGFjdGx5IGxpa2Ugc2VuZCAob3B0aW9uYWwgYm9vbGVhbilcblx0cmVhZG9ubHkgbW9kZWw/OiBzdHJpbmc7IC8vIHF1YWxpZmllZCBtb2RlbCBuYW1lIHRvIHN3aXRjaCB0byAoZS5nLiwgXCJHUFQtNSAoY29waWxvdClcIilcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSGVhZGVyQXR0cmlidXRlIHtcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xuXHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0cmVhZG9ubHkgdmFsdWU6IElWYWx1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2NhbGFyVmFsdWUge1xuXHRyZWFkb25seSB0eXBlOiAnc2NhbGFyJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xuXHRyZWFkb25seSBmb3JtYXQ6ICdzaW5nbGUnIHwgJ2RvdWJsZScgfCAnbm9uZScgfCAnbGl0ZXJhbCcgfCAnZm9sZGVkJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VxdWVuY2VWYWx1ZSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdzZXF1ZW5jZSc7XG5cdHJlYWRvbmx5IGl0ZW1zOiByZWFkb25seSBJVmFsdWVbXTtcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNYXBWYWx1ZSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdtYXAnO1xuXHRyZWFkb25seSBwcm9wZXJ0aWVzOiB7IGtleTogSVNjYWxhclZhbHVlOyB2YWx1ZTogSVZhbHVlIH1bXTtcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xufVxuXG5leHBvcnQgdHlwZSBJVmFsdWUgPSBJU2NhbGFyVmFsdWUgfCBJU2VxdWVuY2VWYWx1ZSB8IElNYXBWYWx1ZTtcblxuXG5pbnRlcmZhY2UgUGFyc2VkQm9keSB7XG5cdHJlYWRvbmx5IGZpbGVSZWZlcmVuY2VzOiByZWFkb25seSBJQm9keUZpbGVSZWZlcmVuY2VbXTtcblx0cmVhZG9ubHkgdmFyaWFibGVSZWZlcmVuY2VzOiByZWFkb25seSBJQm9keVZhcmlhYmxlUmVmZXJlbmNlW107XG5cdHJlYWRvbmx5IGJvZHlPZmZzZXQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFByb21wdEJvZHkge1xuXHRwcml2YXRlIF9wYXJzZWQ6IFBhcnNlZEJvZHkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHJhbmdlOiBSYW5nZSwgcHJpdmF0ZSByZWFkb25seSBsaW5lc1dpdGhFT0w6IHN0cmluZ1tdLCBwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkkpIHtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZmlsZVJlZmVyZW5jZXMoKTogcmVhZG9ubHkgSUJvZHlGaWxlUmVmZXJlbmNlW10ge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnNlZEJvZHkoKS5maWxlUmVmZXJlbmNlcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgdmFyaWFibGVSZWZlcmVuY2VzKCk6IHJlYWRvbmx5IElCb2R5VmFyaWFibGVSZWZlcmVuY2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFyc2VkQm9keSgpLnZhcmlhYmxlUmVmZXJlbmNlcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgb2Zmc2V0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFyc2VkQm9keSgpLmJvZHlPZmZzZXQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFBhcnNlZEJvZHkoKTogUGFyc2VkQm9keSB7XG5cdFx0aWYgKHRoaXMuX3BhcnNlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBtYXJrZG93bkxpbmtSYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRcdGNvbnN0IGZpbGVSZWZlcmVuY2VzOiBJQm9keUZpbGVSZWZlcmVuY2VbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdmFyaWFibGVSZWZlcmVuY2VzOiBJQm9keVZhcmlhYmxlUmVmZXJlbmNlW10gPSBbXTtcblx0XHRcdGNvbnN0IGJvZHlPZmZzZXQgPSBJdGVyYWJsZS5yZWR1Y2UoSXRlcmFibGUuc2xpY2UodGhpcy5saW5lc1dpdGhFT0wsIDAsIHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSksIChsZW4sIGxpbmUpID0+IGxpbmUubGVuZ3RoICsgbGVuLCAwKTtcblx0XHRcdGxldCBpbkZlbmNlZENvZGVCbG9jayA9IGZhbHNlO1xuXHRcdFx0bGV0IGZlbmNlZENvZGVCbG9ja0ZlbmNlQ2hhcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGZlbmNlZENvZGVCbG9ja0ZlbmNlTGVuZ3RoID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSB0aGlzLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGxpbmVTdGFydE9mZnNldCA9IGJvZHlPZmZzZXQ7IGkgPCB0aGlzLnJhbmdlLmVuZExpbmVOdW1iZXIgLSAxOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMubGluZXNXaXRoRU9MW2ldO1xuXHRcdFx0XHRjb25zdCB0cmltbWVkTGluZSA9IGxpbmUudHJpbVN0YXJ0KCk7XG5cblx0XHRcdFx0Ly8gRGV0ZWN0IGZlbmNlZCBjb2RlIGJsb2NrIGxpbmVzIChgYGAgb3Igfn5+LCAzIG9yIG1vcmUgY2hhcnMpXG5cdFx0XHRcdGNvbnN0IGZlbmNlTWF0Y2ggPSAvXig/PGZlbmNlPihgezMsfXx+ezMsfSkpL3UuZXhlYyh0cmltbWVkTGluZSk7XG5cdFx0XHRcdGlmIChmZW5jZU1hdGNoKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmVuY2UgPSBmZW5jZU1hdGNoLmdyb3VwcyEuZmVuY2U7XG5cdFx0XHRcdFx0Y29uc3QgZmVuY2VDaGFyID0gZmVuY2VbMF07XG5cdFx0XHRcdFx0Y29uc3QgZmVuY2VMZW5ndGggPSBmZW5jZS5sZW5ndGg7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdE9mTGluZSA9IHRyaW1tZWRMaW5lLnNsaWNlKGZlbmNlLmxlbmd0aCk7XG5cblx0XHRcdFx0XHRpZiAoIWluRmVuY2VkQ29kZUJsb2NrKSB7XG5cdFx0XHRcdFx0XHQvLyBPcGVuaW5nIGZlbmNlOiByZWNvcmQgZmVuY2UgY2hhci9sZW5ndGggYW5kIGVudGVyIGZlbmNlZCBjb2RlIGJsb2NrXG5cdFx0XHRcdFx0XHRpbkZlbmNlZENvZGVCbG9jayA9IHRydWU7XG5cdFx0XHRcdFx0XHRmZW5jZWRDb2RlQmxvY2tGZW5jZUNoYXIgPSBmZW5jZUNoYXI7XG5cdFx0XHRcdFx0XHRmZW5jZWRDb2RlQmxvY2tGZW5jZUxlbmd0aCA9IGZlbmNlTGVuZ3RoO1xuXHRcdFx0XHRcdFx0bGluZVN0YXJ0T2Zmc2V0ICs9IGxpbmUubGVuZ3RoO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUG90ZW50aWFsIGNsb3NpbmcgZmVuY2U6IG11c3QgbWF0Y2ggZmVuY2UgY2hhciBhbmQgaGF2ZSBhdCBsZWFzdCB0aGUgc2FtZSBsZW5ndGgsXG5cdFx0XHRcdFx0Ly8gYW5kIG9ubHkgd2hpdGVzcGFjZSBpcyBhbGxvd2VkIGFmdGVyIHRoZSBmZW5jZS5cblx0XHRcdFx0XHRpZiAoZmVuY2VkQ29kZUJsb2NrRmVuY2VDaGFyID09PSBmZW5jZUNoYXIgJiYgZmVuY2VMZW5ndGggPj0gZmVuY2VkQ29kZUJsb2NrRmVuY2VMZW5ndGggJiYgL15cXHMqJC8udGVzdChyZXN0T2ZMaW5lKSkge1xuXHRcdFx0XHRcdFx0aW5GZW5jZWRDb2RlQmxvY2sgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGZlbmNlZENvZGVCbG9ja0ZlbmNlQ2hhciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGZlbmNlZENvZGVCbG9ja0ZlbmNlTGVuZ3RoID0gMDtcblx0XHRcdFx0XHRcdGxpbmVTdGFydE9mZnNldCArPSBsaW5lLmxlbmd0aDtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNraXAgYWxsIGxpbmVzIGluc2lkZSBmZW5jZWQgY29kZSBibG9ja3Ncblx0XHRcdFx0aWYgKGluRmVuY2VkQ29kZUJsb2NrKSB7XG5cdFx0XHRcdFx0bGluZVN0YXJ0T2Zmc2V0ICs9IGxpbmUubGVuZ3RoO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ29sbGVjdCBpbmxpbmUgY29kZSBzcGFucyAoYmFja3RpY2stZGVsaW1pdGVkKSB0byBleGNsdWRlIGZyb20gbWF0Y2hpbmdcblx0XHRcdFx0Y29uc3QgaW5saW5lQ29kZVJhbmdlczogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBpbmxpbmVNYXRjaCBvZiBsaW5lLm1hdGNoQWxsKC9gW15gXStgL2cpKSB7XG5cdFx0XHRcdFx0aW5saW5lQ29kZVJhbmdlcy5wdXNoKHsgc3RhcnQ6IGlubGluZU1hdGNoLmluZGV4LCBlbmQ6IGlubGluZU1hdGNoLmluZGV4ICsgaW5saW5lTWF0Y2hbMF0ubGVuZ3RoIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXNJbnNpZGVJbmxpbmVDb2RlID0gKG9mZnNldDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGlubGluZUNvZGVSYW5nZXMuc29tZShyID0+IG9mZnNldCA+PSByLnN0YXJ0ICYmIG9mZnNldCA8IHIuZW5kKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBNYXRjaCBtYXJrZG93biBsaW5rczogW3RleHRdKGxpbmspXG5cdFx0XHRcdGNvbnN0IGxpbmtNYXRjaCA9IGxpbmUubWF0Y2hBbGwoL1xcWyguKj8pXFxdXFwoKC4rPylcXCkvZyk7XG5cdFx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgbGlua01hdGNoKSB7XG5cdFx0XHRcdFx0aWYgKG1hdGNoLmluZGV4ID4gMCAmJiBsaW5lW21hdGNoLmluZGV4IC0gMV0gPT09ICchJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgaW1hZ2UgbGlua3Ncblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzSW5zaWRlSW5saW5lQ29kZShtYXRjaC5pbmRleCkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBza2lwIG1hdGNoZXMgaW5zaWRlIGlubGluZSBjb2RlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGxpbmtFbmRPZmZzZXQgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCAtIDE7IC8vIGJlZm9yZSB0aGUgcGFyZW50aGVzaXNcblx0XHRcdFx0XHRjb25zdCBsaW5rU3RhcnRPZmZzZXQgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCAtIG1hdGNoWzJdLmxlbmd0aCAtIDE7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoaSArIDEsIGxpbmtTdGFydE9mZnNldCArIDEsIGkgKyAxLCBsaW5rRW5kT2Zmc2V0ICsgMSk7XG5cdFx0XHRcdFx0ZmlsZVJlZmVyZW5jZXMucHVzaCh7IGNvbnRlbnQ6IG1hdGNoWzJdLCByYW5nZSwgaXNNYXJrZG93bkxpbms6IHRydWUgfSk7XG5cdFx0XHRcdFx0bWFya2Rvd25MaW5rUmFuZ2VzLnB1c2gobmV3IFJhbmdlKGkgKyAxLCBtYXRjaC5pbmRleCArIDEsIGkgKyAxLCBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBNYXRjaCAjZmlsZTo8ZmlsZVBhdGg+IGFuZCAjdG9vbDo8dG9vbE5hbWU+XG5cdFx0XHRcdC8vIFJlZ2FyZGluZyB0aGUgPHRvb2xOYW1lPiBwYXR0ZXJuIGJlbG93LCBzZWUgYWxzbyB0aGUgdmFyaWFibGVSZWcgcmVnZXggaW4gY2hhdFJlcXVlc3RQYXJzZXIudHMuXG5cdFx0XHRcdGNvbnN0IHJlZyA9IC8jZmlsZTooPzxmaWxlUGF0aD5bXlxccyNdKyl8I3Rvb2w6KD88dG9vbE5hbWU+W1xcd19cXC1cXC5cXC9dKykvZ2k7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBsaW5lLm1hdGNoQWxsKHJlZyk7XG5cdFx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdFx0XHRcdGNvbnN0IGZ1bGxNYXRjaCA9IG1hdGNoWzBdO1xuXHRcdFx0XHRcdGNvbnN0IGZ1bGxSYW5nZSA9IG5ldyBSYW5nZShpICsgMSwgbWF0Y2guaW5kZXggKyAxLCBpICsgMSwgbWF0Y2guaW5kZXggKyBmdWxsTWF0Y2gubGVuZ3RoICsgMSk7XG5cdFx0XHRcdFx0aWYgKG1hcmtkb3duTGlua1Jhbmdlcy5zb21lKG1kUmFuZ2UgPT4gUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyhtZFJhbmdlLCBmdWxsUmFuZ2UpKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc0luc2lkZUlubGluZUNvZGUobWF0Y2guaW5kZXgpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gc2tpcCBtYXRjaGVzIGluc2lkZSBpbmxpbmUgY29kZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjb250ZW50TWF0Y2ggPSBtYXRjaC5ncm91cHM/LlsnZmlsZVBhdGgnXSB8fCBtYXRjaC5ncm91cHM/LlsndG9vbE5hbWUnXTtcblx0XHRcdFx0XHRpZiAoIWNvbnRlbnRNYXRjaCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gbWF0Y2guaW5kZXggKyBmdWxsTWF0Y2gubGVuZ3RoIC0gY29udGVudE1hdGNoLmxlbmd0aDtcblx0XHRcdFx0XHRjb25zdCBlbmRPZmZzZXQgPSBtYXRjaC5pbmRleCArIGZ1bGxNYXRjaC5sZW5ndGg7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoaSArIDEsIHN0YXJ0T2Zmc2V0ICsgMSwgaSArIDEsIGVuZE9mZnNldCArIDEpO1xuXHRcdFx0XHRcdGlmIChtYXRjaC5ncm91cHM/LlsnZmlsZVBhdGgnXSkge1xuXHRcdFx0XHRcdFx0ZmlsZVJlZmVyZW5jZXMucHVzaCh7IGNvbnRlbnQ6IG1hdGNoLmdyb3Vwcz8uWydmaWxlUGF0aCddLCByYW5nZSwgaXNNYXJrZG93bkxpbms6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobWF0Y2guZ3JvdXBzPy5bJ3Rvb2xOYW1lJ10pIHtcblx0XHRcdFx0XHRcdHZhcmlhYmxlUmVmZXJlbmNlcy5wdXNoKHsgbmFtZTogbWF0Y2guZ3JvdXBzPy5bJ3Rvb2xOYW1lJ10sIHJhbmdlLCBvZmZzZXQ6IGxpbmVTdGFydE9mZnNldCArIG1hdGNoLmluZGV4LCBmdWxsTGVuZ3RoOiBmdWxsTWF0Y2gubGVuZ3RoIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRsaW5lU3RhcnRPZmZzZXQgKz0gbGluZS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wYXJzZWQgPSB7IGZpbGVSZWZlcmVuY2VzOiBmaWxlUmVmZXJlbmNlcy5zb3J0KChhLCBiKSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5yYW5nZSwgYi5yYW5nZSkpLCB2YXJpYWJsZVJlZmVyZW5jZXMsIGJvZHlPZmZzZXQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BhcnNlZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubGluZXNXaXRoRU9MLnNsaWNlKHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgdGhpcy5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSkuam9pbignJyk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUZpbGVQYXRoKHBhdGg6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChwYXRoLnN0YXJ0c1dpdGgoJy8nKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy51cmkud2l0aCh7IHBhdGggfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGgubWF0Y2goL15bYS16QS1aXSs6XFwvLykpIHtcblx0XHRcdFx0cmV0dXJuIFVSSS5wYXJzZShwYXRoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRpck5hbWUgPSBkaXJuYW1lKHRoaXMudXJpKTtcblx0XHRcdFx0cmV0dXJuIGpvaW5QYXRoKGRpck5hbWUsIHBhdGgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQm9keUZpbGVSZWZlcmVuY2Uge1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJhbmdlOiBSYW5nZTtcblx0cmVhZG9ubHkgaXNNYXJrZG93bkxpbms6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJvZHlWYXJpYWJsZVJlZmVyZW5jZSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xuXHRyZWFkb25seSBvZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZnVsbExlbmd0aDogbnVtYmVyO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIGNvbW1hLXNlcGFyYXRlZCBsaXN0IG9mIHZhbHVlcyBpbnRvIGFuIGFycmF5IG9mIHN0cmluZ3MuXG4gKiBWYWx1ZXMgY2FuIGJlIHVucXVvdGVkIG9yIHF1b3RlZCAoc2luZ2xlIG9yIGRvdWJsZSBxdW90ZXMpLlxuICpcbiAqIEBwYXJhbSBpbnB1dCBBIHN0cmluZyBjb250YWluaW5nIGNvbW1hLXNlcGFyYXRlZCB2YWx1ZXNcbiAqIEByZXR1cm5zIEFuIElTZXF1ZW5jZVZhbHVlIGNvbnRhaW5pbmcgdGhlIHBhcnNlZCB2YWx1ZXMgYW5kIHRoZWlyIHJhbmdlc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb21tYVNlcGFyYXRlZExpc3Qoc3RyaW5nVmFsdWU6IElTY2FsYXJWYWx1ZSk6IElTZXF1ZW5jZVZhbHVlIHtcblx0Y29uc3QgcmVzdWx0OiBJU2NhbGFyVmFsdWVbXSA9IFtdO1xuXHRjb25zdCBpbnB1dCA9IHN0cmluZ1ZhbHVlLnZhbHVlO1xuXHRjb25zdCBwb3NpdGlvbk9mZnNldCA9IHN0cmluZ1ZhbHVlLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0bGV0IHBvcyA9IDA7XG5cdGNvbnN0IGlzV2hpdGVzcGFjZSA9IChjaGFyOiBzdHJpbmcpOiBib29sZWFuID0+IGNoYXIgPT09ICcgJyB8fCBjaGFyID09PSAnXFx0JztcblxuXHR3aGlsZSAocG9zIDwgaW5wdXQubGVuZ3RoKSB7XG5cdFx0Ly8gU2tpcCBsZWFkaW5nIHdoaXRlc3BhY2Vcblx0XHR3aGlsZSAocG9zIDwgaW5wdXQubGVuZ3RoICYmIGlzV2hpdGVzcGFjZShpbnB1dFtwb3NdKSkge1xuXHRcdFx0cG9zKys7XG5cdFx0fVxuXG5cdFx0aWYgKHBvcyA+PSBpbnB1dC5sZW5ndGgpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0UG9zID0gcG9zO1xuXHRcdGxldCB2YWx1ZSA9ICcnO1xuXHRcdGxldCBlbmRQb3M6IG51bWJlcjtcblx0XHRsZXQgcXVvdGVTdHlsZTogJ3NpbmdsZScgfCAnZG91YmxlJyB8ICdub25lJztcblxuXHRcdGNvbnN0IGNoYXIgPSBpbnB1dFtwb3NdO1xuXHRcdGlmIChjaGFyID09PSAnXCInIHx8IGNoYXIgPT09IGAnYCkge1xuXHRcdFx0Ly8gUXVvdGVkIHN0cmluZ1xuXHRcdFx0Y29uc3QgcXVvdGUgPSBjaGFyO1xuXHRcdFx0cG9zKys7IC8vIFNraXAgb3BlbmluZyBxdW90ZVxuXG5cdFx0XHR3aGlsZSAocG9zIDwgaW5wdXQubGVuZ3RoICYmIGlucHV0W3Bvc10gIT09IHF1b3RlKSB7XG5cdFx0XHRcdHZhbHVlICs9IGlucHV0W3Bvc107XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0fVxuXHRcdFx0ZW5kUG9zID0gcG9zICsgMTsgLy8gSW5jbHVkZSBjbG9zaW5nIHF1b3RlIGluIHRoZSByYW5nZVxuXG5cdFx0XHRpZiAocG9zIDwgaW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0fVxuXHRcdFx0cXVvdGVTdHlsZSA9IHF1b3RlID09PSAnXCInID8gJ2RvdWJsZScgOiAnc2luZ2xlJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVW5xdW90ZWQgc3RyaW5nIC0gcmVhZCB1bnRpbCBjb21tYSBvciBlbmRcblx0XHRcdGNvbnN0IHN0YXJ0UG9zID0gcG9zO1xuXHRcdFx0d2hpbGUgKHBvcyA8IGlucHV0Lmxlbmd0aCAmJiBpbnB1dFtwb3NdICE9PSAnLCcpIHtcblx0XHRcdFx0dmFsdWUgKz0gaW5wdXRbcG9zXTtcblx0XHRcdFx0cG9zKys7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZSA9IHZhbHVlLnRyaW1FbmQoKTtcblx0XHRcdGVuZFBvcyA9IHN0YXJ0UG9zICsgdmFsdWUubGVuZ3RoO1xuXHRcdFx0cXVvdGVTdHlsZSA9ICdub25lJztcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaCh7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogdmFsdWUsIHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb25PZmZzZXQubGluZU51bWJlciwgcG9zaXRpb25PZmZzZXQuY29sdW1uICsgc3RhcnRQb3MsIHBvc2l0aW9uT2Zmc2V0LmxpbmVOdW1iZXIsIHBvc2l0aW9uT2Zmc2V0LmNvbHVtbiArIGVuZFBvcyksIGZvcm1hdDogcXVvdGVTdHlsZSB9KTtcblxuXHRcdC8vIFNraXAgd2hpdGVzcGFjZSBhZnRlciB2YWx1ZVxuXHRcdHdoaWxlIChwb3MgPCBpbnB1dC5sZW5ndGggJiYgaXNXaGl0ZXNwYWNlKGlucHV0W3Bvc10pKSB7XG5cdFx0XHRwb3MrKztcblx0XHR9XG5cblx0XHQvLyBTa2lwIGNvbW1hIGlmIHByZXNlbnRcblx0XHRpZiAocG9zIDwgaW5wdXQubGVuZ3RoICYmIGlucHV0W3Bvc10gPT09ICcsJykge1xuXHRcdFx0cG9zKys7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgdHlwZTogJ3NlcXVlbmNlJywgaXRlbXM6IHJlc3VsdCwgcmFuZ2U6IHN0cmluZ1ZhbHVlLnJhbmdlIH07XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZWZmZWN0aXZlIGBhcHBseVRvYCBwYXR0ZXJuIGZvciBhbiBpbnN0cnVjdGlvbiBmaWxlLlxuICogQ2xhdWRlIHJ1bGVzIHVzZSBgcGF0aHNgIChkZWZhdWx0aW5nIHRvIGAqKmApLCB3aGlsZSByZWd1bGFyIGluc3RydWN0aW9ucyB1c2UgYGFwcGx5VG9gLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXZhbHVhdGVBcHBseVRvUGF0dGVybihoZWFkZXI6IFByb21wdEhlYWRlciB8IHVuZGVmaW5lZCwgaXNDbGF1ZGVSdWxlczogYm9vbGVhbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc0NsYXVkZVJ1bGVzKSB7XG5cdFx0cmV0dXJuIGhlYWRlcj8ucGF0aHM/LmpvaW4oJywgJykgPz8gJyoqJztcblx0fVxuXHRyZXR1cm4gaGVhZGVyPy5hcHBseVRvO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxTQUFTLG1DQUFt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QUFBLE1BQ0Q7QUFDQSxtQkFBYSxVQUFVLE1BQU0sV0FBVztBQUFBLElBQ3pDLE9BQU87QUFFTixZQUFNQyxZQUFXO0FBQ2pCLGFBQU8sTUFBTSxNQUFNLFVBQVUsTUFBTSxHQUFHLE1BQU0sS0FBSztBQUNoRCxpQkFBUyxNQUFNLEdBQUc7QUFDbEI7QUFBQSxNQUNEO0FBQ0EsY0FBUSxNQUFNLFFBQVE7QUFDdEIsZUFBU0EsWUFBVyxNQUFNO0FBQzFCLG1CQUFhO0FBQUEsSUFDZDtBQUVBLFdBQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxPQUFjLE9BQU8sSUFBSSxNQUFNLGVBQWUsWUFBWSxlQUFlLFNBQVMsVUFBVSxlQUFlLFlBQVksZUFBZSxTQUFTLE1BQU0sR0FBRyxRQUFRLFdBQVcsQ0FBQztBQUcxTSxXQUFPLE1BQU0sTUFBTSxVQUFVLGFBQWEsTUFBTSxHQUFHLENBQUMsR0FBRztBQUN0RDtBQUFBLElBQ0Q7QUFHQSxRQUFJLE1BQU0sTUFBTSxVQUFVLE1BQU0sR0FBRyxNQUFNLEtBQUs7QUFDN0M7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFNBQU8sRUFBRSxNQUFNLFlBQVksT0FBTyxRQUFRLE9BQU8sWUFBWSxNQUFNO0FBQ3BFO0FBTU8sU0FBUyx1QkFBdUIsUUFBa0MsZUFBNEM7QUFDcEgsTUFBSSxlQUFlO0FBQ2xCLFdBQU8sUUFBUSxPQUFPLEtBQUssSUFBSSxLQUFLO0FBQUEsRUFDckM7QUFDQSxTQUFPLFFBQVE7QUFDaEI7IiwKICAibmFtZXMiOiBbIlByb21wdEhlYWRlckF0dHJpYnV0ZXMiLCAibm9kZSIsICJzdGFydFBvcyJdCn0K
