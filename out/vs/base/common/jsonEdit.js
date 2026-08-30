import { findNodeAtLocation, parseTree } from "./json.js";
import { format, isEOL } from "./jsonFormatter.js";
function removeProperty(text, path, formattingOptions) {
  return setProperty(text, path, void 0, formattingOptions);
}
function setProperty(text, originalPath, value, formattingOptions, getInsertionIndex) {
  const path = originalPath.slice();
  const errors = [];
  const root = parseTree(text, errors);
  let parent = void 0;
  let lastSegment = void 0;
  while (path.length > 0) {
    lastSegment = path.pop();
    parent = findNodeAtLocation(root, path);
    if (parent === void 0 && value !== void 0) {
      if (typeof lastSegment === "string") {
        value = { [lastSegment]: value };
      } else {
        value = [value];
      }
    } else {
      break;
    }
  }
  if (!parent) {
    if (value === void 0) {
      return [];
    }
    return withFormatting(text, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, formattingOptions);
  } else if (parent.type === "object" && typeof lastSegment === "string" && Array.isArray(parent.children)) {
    const existing = findNodeAtLocation(parent, [lastSegment]);
    if (existing !== void 0) {
      if (value === void 0) {
        if (!existing.parent) {
          throw new Error("Malformed AST");
        }
        const propertyIndex = parent.children.indexOf(existing.parent);
        let removeBegin;
        let removeEnd = existing.parent.offset + existing.parent.length;
        if (propertyIndex > 0) {
          const previous = parent.children[propertyIndex - 1];
          removeBegin = previous.offset + previous.length;
        } else {
          removeBegin = parent.offset + 1;
          if (parent.children.length > 1) {
            const next = parent.children[1];
            removeEnd = next.offset;
          }
        }
        return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, formattingOptions);
      } else {
        return withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, formattingOptions);
      }
    } else {
      if (value === void 0) {
        return [];
      }
      const newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
      const index = getInsertionIndex ? getInsertionIndex(parent.children.map((p) => p.children[0].value)) : parent.children.length;
      let edit;
      if (index > 0) {
        const previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      } else if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty + "," };
      }
      return withFormatting(text, edit, formattingOptions);
    }
  } else if (parent.type === "array" && typeof lastSegment === "number" && Array.isArray(parent.children)) {
    if (value !== void 0) {
      const newProperty = `${JSON.stringify(value)}`;
      let edit;
      if (parent.children.length === 0 || lastSegment === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: parent.children.length === 0 ? newProperty : newProperty + "," };
      } else {
        const index = lastSegment === -1 || lastSegment > parent.children.length ? parent.children.length : lastSegment;
        const previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text, edit, formattingOptions);
    } else {
      const removalIndex = lastSegment;
      const toRemove = parent.children[removalIndex];
      let edit;
      if (parent.children.length === 1) {
        edit = { offset: parent.offset + 1, length: parent.length - 2, content: "" };
      } else if (parent.children.length - 1 === removalIndex) {
        const previous = parent.children[removalIndex - 1];
        const offset = previous.offset + previous.length;
        const parentEndOffset = parent.offset + parent.length;
        edit = { offset, length: parentEndOffset - 2 - offset, content: "" };
      } else {
        edit = { offset: toRemove.offset, length: parent.children[removalIndex + 1].offset - toRemove.offset, content: "" };
      }
      return withFormatting(text, edit, formattingOptions);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text, edit, formattingOptions) {
  let newText = applyEdit(text, edit);
  let begin = edit.offset;
  let end = edit.offset + edit.content.length;
  if (edit.length === 0 || edit.content.length === 0) {
    while (begin > 0 && !isEOL(newText, begin - 1)) {
      begin--;
    }
    while (end < newText.length && !isEOL(newText, end)) {
      end++;
    }
  }
  const edits = format(newText, { offset: begin, length: end - begin }, formattingOptions);
  for (let i = edits.length - 1; i >= 0; i--) {
    const curr = edits[i];
    newText = applyEdit(newText, curr);
    begin = Math.min(begin, curr.offset);
    end = Math.max(end, curr.offset + curr.length);
    end += curr.content.length - curr.length;
  }
  const editLength = text.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text, edit) {
  return text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);
}
function applyEdits(text, edits) {
  const sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    const e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text = applyEdit(text, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text;
}
export {
  applyEdit,
  applyEdits,
  removeProperty,
  setProperty,
  withFormatting
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGpzb25FZGl0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZmluZE5vZGVBdExvY2F0aW9uLCBKU09OUGF0aCwgTm9kZSwgUGFyc2VFcnJvciwgcGFyc2VUcmVlLCBTZWdtZW50IH0gZnJvbSAnLi9qc29uLmpzJztcbmltcG9ydCB7IEVkaXQsIGZvcm1hdCwgRm9ybWF0dGluZ09wdGlvbnMsIGlzRU9MIH0gZnJvbSAnLi9qc29uRm9ybWF0dGVyLmpzJztcblxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlUHJvcGVydHkodGV4dDogc3RyaW5nLCBwYXRoOiBKU09OUGF0aCwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogRWRpdFtdIHtcblx0cmV0dXJuIHNldFByb3BlcnR5KHRleHQsIHBhdGgsIHVuZGVmaW5lZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0UHJvcGVydHkodGV4dDogc3RyaW5nLCBvcmlnaW5hbFBhdGg6IEpTT05QYXRoLCB2YWx1ZTogdW5rbm93biwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zLCBnZXRJbnNlcnRpb25JbmRleD86IChwcm9wZXJ0aWVzOiBzdHJpbmdbXSkgPT4gbnVtYmVyKTogRWRpdFtdIHtcblx0Y29uc3QgcGF0aCA9IG9yaWdpbmFsUGF0aC5zbGljZSgpO1xuXHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRjb25zdCByb290ID0gcGFyc2VUcmVlKHRleHQsIGVycm9ycyk7XG5cdGxldCBwYXJlbnQ6IE5vZGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0bGV0IGxhc3RTZWdtZW50OiBTZWdtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHR3aGlsZSAocGF0aC5sZW5ndGggPiAwKSB7XG5cdFx0bGFzdFNlZ21lbnQgPSBwYXRoLnBvcCgpO1xuXHRcdHBhcmVudCA9IGZpbmROb2RlQXRMb2NhdGlvbihyb290LCBwYXRoKTtcblx0XHRpZiAocGFyZW50ID09PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHR5cGVvZiBsYXN0U2VnbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dmFsdWUgPSB7IFtsYXN0U2VnbWVudF06IHZhbHVlIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YWx1ZSA9IFt2YWx1ZV07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGlmICghcGFyZW50KSB7XG5cdFx0Ly8gZW1wdHkgZG9jdW1lbnRcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgeyAvLyBkZWxldGVcblx0XHRcdHJldHVybiBbXTsgLy8gcHJvcGVydHkgZG9lcyBub3QgZXhpc3QsIG5vdGhpbmcgdG8gZG9cblx0XHR9XG5cdFx0cmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIHsgb2Zmc2V0OiByb290ID8gcm9vdC5vZmZzZXQgOiAwLCBsZW5ndGg6IHJvb3QgPyByb290Lmxlbmd0aCA6IDAsIGNvbnRlbnQ6IEpTT04uc3RyaW5naWZ5KHZhbHVlKSB9LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdH0gZWxzZSBpZiAocGFyZW50LnR5cGUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBsYXN0U2VnbWVudCA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShwYXJlbnQuY2hpbGRyZW4pKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBmaW5kTm9kZUF0TG9jYXRpb24ocGFyZW50LCBbbGFzdFNlZ21lbnRdKTtcblx0XHRpZiAoZXhpc3RpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHsgLy8gZGVsZXRlXG5cdFx0XHRcdGlmICghZXhpc3RpbmcucGFyZW50KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNYWxmb3JtZWQgQVNUJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcHJvcGVydHlJbmRleCA9IHBhcmVudC5jaGlsZHJlbi5pbmRleE9mKGV4aXN0aW5nLnBhcmVudCk7XG5cdFx0XHRcdGxldCByZW1vdmVCZWdpbjogbnVtYmVyO1xuXHRcdFx0XHRsZXQgcmVtb3ZlRW5kID0gZXhpc3RpbmcucGFyZW50Lm9mZnNldCArIGV4aXN0aW5nLnBhcmVudC5sZW5ndGg7XG5cdFx0XHRcdGlmIChwcm9wZXJ0eUluZGV4ID4gMCkge1xuXHRcdFx0XHRcdC8vIHJlbW92ZSB0aGUgY29tbWEgb2YgdGhlIHByZXZpb3VzIG5vZGVcblx0XHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHBhcmVudC5jaGlsZHJlbltwcm9wZXJ0eUluZGV4IC0gMV07XG5cdFx0XHRcdFx0cmVtb3ZlQmVnaW4gPSBwcmV2aW91cy5vZmZzZXQgKyBwcmV2aW91cy5sZW5ndGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVtb3ZlQmVnaW4gPSBwYXJlbnQub2Zmc2V0ICsgMTtcblx0XHRcdFx0XHRpZiAocGFyZW50LmNoaWxkcmVuLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdC8vIHJlbW92ZSB0aGUgY29tbWEgb2YgdGhlIG5leHQgbm9kZVxuXHRcdFx0XHRcdFx0Y29uc3QgbmV4dCA9IHBhcmVudC5jaGlsZHJlblsxXTtcblx0XHRcdFx0XHRcdHJlbW92ZUVuZCA9IG5leHQub2Zmc2V0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gd2l0aEZvcm1hdHRpbmcodGV4dCwgeyBvZmZzZXQ6IHJlbW92ZUJlZ2luLCBsZW5ndGg6IHJlbW92ZUVuZCAtIHJlbW92ZUJlZ2luLCBjb250ZW50OiAnJyB9LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBzZXQgdmFsdWUgb2YgZXhpc3RpbmcgcHJvcGVydHlcblx0XHRcdFx0cmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIHsgb2Zmc2V0OiBleGlzdGluZy5vZmZzZXQsIGxlbmd0aDogZXhpc3RpbmcubGVuZ3RoLCBjb250ZW50OiBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgfSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgeyAvLyBkZWxldGVcblx0XHRcdFx0cmV0dXJuIFtdOyAvLyBwcm9wZXJ0eSBkb2VzIG5vdCBleGlzdCwgbm90aGluZyB0byBkb1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3UHJvcGVydHkgPSBgJHtKU09OLnN0cmluZ2lmeShsYXN0U2VnbWVudCl9OiAke0pTT04uc3RyaW5naWZ5KHZhbHVlKX1gO1xuXHRcdFx0Y29uc3QgaW5kZXggPSBnZXRJbnNlcnRpb25JbmRleCA/IGdldEluc2VydGlvbkluZGV4KHBhcmVudC5jaGlsZHJlbi5tYXAocCA9PiBwLmNoaWxkcmVuIVswXS52YWx1ZSkpIDogcGFyZW50LmNoaWxkcmVuLmxlbmd0aDtcblx0XHRcdGxldCBlZGl0OiBFZGl0O1xuXHRcdFx0aWYgKGluZGV4ID4gMCkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHBhcmVudC5jaGlsZHJlbltpbmRleCAtIDFdO1xuXHRcdFx0XHRlZGl0ID0geyBvZmZzZXQ6IHByZXZpb3VzLm9mZnNldCArIHByZXZpb3VzLmxlbmd0aCwgbGVuZ3RoOiAwLCBjb250ZW50OiAnLCcgKyBuZXdQcm9wZXJ0eSB9O1xuXHRcdFx0fSBlbHNlIGlmIChwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGVkaXQgPSB7IG9mZnNldDogcGFyZW50Lm9mZnNldCArIDEsIGxlbmd0aDogMCwgY29udGVudDogbmV3UHJvcGVydHkgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVkaXQgPSB7IG9mZnNldDogcGFyZW50Lm9mZnNldCArIDEsIGxlbmd0aDogMCwgY29udGVudDogbmV3UHJvcGVydHkgKyAnLCcgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB3aXRoRm9ybWF0dGluZyh0ZXh0LCBlZGl0LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKHBhcmVudC50eXBlID09PSAnYXJyYXknICYmIHR5cGVvZiBsYXN0U2VnbWVudCA9PT0gJ251bWJlcicgJiYgQXJyYXkuaXNBcnJheShwYXJlbnQuY2hpbGRyZW4pKSB7XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIEluc2VydFxuXHRcdFx0Y29uc3QgbmV3UHJvcGVydHkgPSBgJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9YDtcblx0XHRcdGxldCBlZGl0OiBFZGl0O1xuXHRcdFx0aWYgKHBhcmVudC5jaGlsZHJlbi5sZW5ndGggPT09IDAgfHwgbGFzdFNlZ21lbnQgPT09IDApIHtcblx0XHRcdFx0ZWRpdCA9IHsgb2Zmc2V0OiBwYXJlbnQub2Zmc2V0ICsgMSwgbGVuZ3RoOiAwLCBjb250ZW50OiBwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAwID8gbmV3UHJvcGVydHkgOiBuZXdQcm9wZXJ0eSArICcsJyB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBsYXN0U2VnbWVudCA9PT0gLTEgfHwgbGFzdFNlZ21lbnQgPiBwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID8gcGFyZW50LmNoaWxkcmVuLmxlbmd0aCA6IGxhc3RTZWdtZW50O1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHBhcmVudC5jaGlsZHJlbltpbmRleCAtIDFdO1xuXHRcdFx0XHRlZGl0ID0geyBvZmZzZXQ6IHByZXZpb3VzLm9mZnNldCArIHByZXZpb3VzLmxlbmd0aCwgbGVuZ3RoOiAwLCBjb250ZW50OiAnLCcgKyBuZXdQcm9wZXJ0eSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIGVkaXQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly9SZW1vdmFsXG5cdFx0XHRjb25zdCByZW1vdmFsSW5kZXggPSBsYXN0U2VnbWVudDtcblx0XHRcdGNvbnN0IHRvUmVtb3ZlID0gcGFyZW50LmNoaWxkcmVuW3JlbW92YWxJbmRleF07XG5cdFx0XHRsZXQgZWRpdDogRWRpdDtcblx0XHRcdGlmIChwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdC8vIG9ubHkgaXRlbVxuXHRcdFx0XHRlZGl0ID0geyBvZmZzZXQ6IHBhcmVudC5vZmZzZXQgKyAxLCBsZW5ndGg6IHBhcmVudC5sZW5ndGggLSAyLCBjb250ZW50OiAnJyB9O1xuXHRcdFx0fSBlbHNlIGlmIChwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoIC0gMSA9PT0gcmVtb3ZhbEluZGV4KSB7XG5cdFx0XHRcdC8vIGxhc3QgaXRlbVxuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHBhcmVudC5jaGlsZHJlbltyZW1vdmFsSW5kZXggLSAxXTtcblx0XHRcdFx0Y29uc3Qgb2Zmc2V0ID0gcHJldmlvdXMub2Zmc2V0ICsgcHJldmlvdXMubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRFbmRPZmZzZXQgPSBwYXJlbnQub2Zmc2V0ICsgcGFyZW50Lmxlbmd0aDtcblx0XHRcdFx0ZWRpdCA9IHsgb2Zmc2V0LCBsZW5ndGg6IHBhcmVudEVuZE9mZnNldCAtIDIgLSBvZmZzZXQsIGNvbnRlbnQ6ICcnIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlZGl0ID0geyBvZmZzZXQ6IHRvUmVtb3ZlLm9mZnNldCwgbGVuZ3RoOiBwYXJlbnQuY2hpbGRyZW5bcmVtb3ZhbEluZGV4ICsgMV0ub2Zmc2V0IC0gdG9SZW1vdmUub2Zmc2V0LCBjb250ZW50OiAnJyB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIGVkaXQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW4gbm90IGFkZCAke3R5cGVvZiBsYXN0U2VnbWVudCAhPT0gJ251bWJlcicgPyAnaW5kZXgnIDogJ3Byb3BlcnR5J30gdG8gcGFyZW50IG9mIHR5cGUgJHtwYXJlbnQudHlwZX1gKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd2l0aEZvcm1hdHRpbmcodGV4dDogc3RyaW5nLCBlZGl0OiBFZGl0LCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBFZGl0W10ge1xuXHQvLyBhcHBseSB0aGUgZWRpdFxuXHRsZXQgbmV3VGV4dCA9IGFwcGx5RWRpdCh0ZXh0LCBlZGl0KTtcblxuXHQvLyBmb3JtYXQgdGhlIG5ldyB0ZXh0XG5cdGxldCBiZWdpbiA9IGVkaXQub2Zmc2V0O1xuXHRsZXQgZW5kID0gZWRpdC5vZmZzZXQgKyBlZGl0LmNvbnRlbnQubGVuZ3RoO1xuXHRpZiAoZWRpdC5sZW5ndGggPT09IDAgfHwgZWRpdC5jb250ZW50Lmxlbmd0aCA9PT0gMCkgeyAvLyBpbnNlcnQgb3IgcmVtb3ZlXG5cdFx0d2hpbGUgKGJlZ2luID4gMCAmJiAhaXNFT0wobmV3VGV4dCwgYmVnaW4gLSAxKSkge1xuXHRcdFx0YmVnaW4tLTtcblx0XHR9XG5cdFx0d2hpbGUgKGVuZCA8IG5ld1RleHQubGVuZ3RoICYmICFpc0VPTChuZXdUZXh0LCBlbmQpKSB7XG5cdFx0XHRlbmQrKztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBlZGl0cyA9IGZvcm1hdChuZXdUZXh0LCB7IG9mZnNldDogYmVnaW4sIGxlbmd0aDogZW5kIC0gYmVnaW4gfSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdC8vIGFwcGx5IHRoZSBmb3JtYXR0aW5nIGVkaXRzIGFuZCB0cmFjayB0aGUgYmVnaW4gYW5kIGVuZCBvZmZzZXRzIG9mIHRoZSBjaGFuZ2VzXG5cdGZvciAobGV0IGkgPSBlZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGNvbnN0IGN1cnIgPSBlZGl0c1tpXTtcblx0XHRuZXdUZXh0ID0gYXBwbHlFZGl0KG5ld1RleHQsIGN1cnIpO1xuXHRcdGJlZ2luID0gTWF0aC5taW4oYmVnaW4sIGN1cnIub2Zmc2V0KTtcblx0XHRlbmQgPSBNYXRoLm1heChlbmQsIGN1cnIub2Zmc2V0ICsgY3Vyci5sZW5ndGgpO1xuXHRcdGVuZCArPSBjdXJyLmNvbnRlbnQubGVuZ3RoIC0gY3Vyci5sZW5ndGg7XG5cdH1cblx0Ly8gY3JlYXRlIGEgc2luZ2xlIGVkaXQgd2l0aCBhbGwgY2hhbmdlc1xuXHRjb25zdCBlZGl0TGVuZ3RoID0gdGV4dC5sZW5ndGggLSAobmV3VGV4dC5sZW5ndGggLSBlbmQpIC0gYmVnaW47XG5cdHJldHVybiBbeyBvZmZzZXQ6IGJlZ2luLCBsZW5ndGg6IGVkaXRMZW5ndGgsIGNvbnRlbnQ6IG5ld1RleHQuc3Vic3RyaW5nKGJlZ2luLCBlbmQpIH1dO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlFZGl0KHRleHQ6IHN0cmluZywgZWRpdDogRWRpdCk6IHN0cmluZyB7XG5cdHJldHVybiB0ZXh0LnN1YnN0cmluZygwLCBlZGl0Lm9mZnNldCkgKyBlZGl0LmNvbnRlbnQgKyB0ZXh0LnN1YnN0cmluZyhlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5RWRpdHModGV4dDogc3RyaW5nLCBlZGl0czogRWRpdFtdKTogc3RyaW5nIHtcblx0Y29uc3Qgc29ydGVkRWRpdHMgPSBlZGl0cy5zbGljZSgwKS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGEub2Zmc2V0IC0gYi5vZmZzZXQ7XG5cdFx0aWYgKGRpZmYgPT09IDApIHtcblx0XHRcdHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlmZjtcblx0fSk7XG5cdGxldCBsYXN0TW9kaWZpZWRPZmZzZXQgPSB0ZXh0Lmxlbmd0aDtcblx0Zm9yIChsZXQgaSA9IHNvcnRlZEVkaXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgZSA9IHNvcnRlZEVkaXRzW2ldO1xuXHRcdGlmIChlLm9mZnNldCArIGUubGVuZ3RoIDw9IGxhc3RNb2RpZmllZE9mZnNldCkge1xuXHRcdFx0dGV4dCA9IGFwcGx5RWRpdCh0ZXh0LCBlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdPdmVybGFwcGluZyBlZGl0Jyk7XG5cdFx0fVxuXHRcdGxhc3RNb2RpZmllZE9mZnNldCA9IGUub2Zmc2V0O1xuXHR9XG5cdHJldHVybiB0ZXh0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBZ0QsaUJBQTBCO0FBQ25GLFNBQWUsUUFBMkIsYUFBYTtBQUdoRCxTQUFTLGVBQWUsTUFBYyxNQUFnQixtQkFBOEM7QUFDMUcsU0FBTyxZQUFZLE1BQU0sTUFBTSxRQUFXLGlCQUFpQjtBQUM1RDtBQUVPLFNBQVMsWUFBWSxNQUFjLGNBQXdCLE9BQWdCLG1CQUFzQyxtQkFBOEQ7QUFDckwsUUFBTSxPQUFPLGFBQWEsTUFBTTtBQUNoQyxRQUFNLFNBQXVCLENBQUM7QUFDOUIsUUFBTSxPQUFPLFVBQVUsTUFB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
