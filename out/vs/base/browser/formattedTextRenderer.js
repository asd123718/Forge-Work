import * as DOM from "./dom.js";
function renderText(text, _options, target) {
  const element = target ?? document.createElement("div");
  element.textContent = text;
  return element;
}
function renderFormattedText(formattedText, options, target) {
  const element = target ?? document.createElement("div");
  element.textContent = "";
  _renderFormattedText(element, parseFormattedText(formattedText, !!options?.renderCodeSegments), options?.actionHandler, options?.renderCodeSegments);
  return element;
}
class StringStream {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }
  eos() {
    return this.index >= this.source.length;
  }
  next() {
    const next = this.peek();
    this.advance();
    return next;
  }
  peek() {
    return this.source[this.index];
  }
  advance() {
    this.index++;
  }
}
var FormatType = /* @__PURE__ */ ((FormatType2) => {
  FormatType2[FormatType2["Invalid"] = 0] = "Invalid";
  FormatType2[FormatType2["Root"] = 1] = "Root";
  FormatType2[FormatType2["Text"] = 2] = "Text";
  FormatType2[FormatType2["Bold"] = 3] = "Bold";
  FormatType2[FormatType2["Italics"] = 4] = "Italics";
  FormatType2[FormatType2["Action"] = 5] = "Action";
  FormatType2[FormatType2["ActionClose"] = 6] = "ActionClose";
  FormatType2[FormatType2["Code"] = 7] = "Code";
  FormatType2[FormatType2["NewLine"] = 8] = "NewLine";
  return FormatType2;
})(FormatType || {});
function _renderFormattedText(element, treeNode, actionHandler, renderCodeSegments) {
  let child;
  if (treeNode.type === 2 /* Text */) {
    child = document.createTextNode(treeNode.content || "");
  } else if (treeNode.type === 3 /* Bold */) {
    child = document.createElement("b");
  } else if (treeNode.type === 4 /* Italics */) {
    child = document.createElement("i");
  } else if (treeNode.type === 7 /* Code */ && renderCodeSegments) {
    child = document.createElement("code");
  } else if (treeNode.type === 5 /* Action */ && actionHandler) {
    const a = document.createElement("a");
    actionHandler.disposables.add(DOM.addStandardDisposableListener(a, "click", (event) => {
      actionHandler.callback(String(treeNode.index), event);
    }));
    child = a;
  } else if (treeNode.type === 8 /* NewLine */) {
    child = document.createElement("br");
  } else if (treeNode.type === 1 /* Root */) {
    child = element;
  }
  if (child && element !== child) {
    element.appendChild(child);
  }
  if (child && Array.isArray(treeNode.children)) {
    treeNode.children.forEach((nodeChild) => {
      _renderFormattedText(child, nodeChild, actionHandler, renderCodeSegments);
    });
  }
}
function parseFormattedText(content, parseCodeSegments) {
  const root = {
    type: 1 /* Root */,
    children: []
  };
  let actionViewItemIndex = 0;
  let current = root;
  const stack = [];
  const stream = new StringStream(content);
  while (!stream.eos()) {
    let next = stream.next();
    const isEscapedFormatType = next === "\\" && formatTagType(stream.peek(), parseCodeSegments) !== 0 /* Invalid */;
    if (isEscapedFormatType) {
      next = stream.next();
    }
    if (!isEscapedFormatType && isFormatTag(next, parseCodeSegments) && next === stream.peek()) {
      stream.advance();
      if (current.type === 2 /* Text */) {
        current = stack.pop();
      }
      const type = formatTagType(next, parseCodeSegments);
      if (current.type === type || current.type === 5 /* Action */ && type === 6 /* ActionClose */) {
        current = stack.pop();
      } else {
        const newCurrent = {
          type,
          children: []
        };
        if (type === 5 /* Action */) {
          newCurrent.index = actionViewItemIndex;
          actionViewItemIndex++;
        }
        current.children.push(newCurrent);
        stack.push(current);
        current = newCurrent;
      }
    } else if (next === "\n") {
      if (current.type === 2 /* Text */) {
        current = stack.pop();
      }
      current.children.push({
        type: 8 /* NewLine */
      });
    } else {
      if (current.type !== 2 /* Text */) {
        const textCurrent = {
          type: 2 /* Text */,
          content: next
        };
        current.children.push(textCurrent);
        stack.push(current);
        current = textCurrent;
      } else {
        current.content += next;
      }
    }
  }
  if (current.type === 2 /* Text */) {
    current = stack.pop();
  }
  if (stack.length) {
  }
  return root;
}
function isFormatTag(char, supportCodeSegments) {
  return formatTagType(char, supportCodeSegments) !== 0 /* Invalid */;
}
function formatTagType(char, supportCodeSegments) {
  switch (char) {
    case "*":
      return 3 /* Bold */;
    case "_":
      return 4 /* Italics */;
    case "[":
      return 5 /* Action */;
    case "]":
      return 6 /* ActionClose */;
    case "`":
      return supportCodeSegments ? 7 /* Code */ : 0 /* Invalid */;
    default:
      return 0 /* Invalid */;
  }
}
export {
  renderFormattedText,
  renderText
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFxmb3JtYXR0ZWRUZXh0UmVuZGVyZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlRXZlbnQgfSBmcm9tICcuL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRlbnRBY3Rpb25IYW5kbGVyIHtcblx0cmVhZG9ubHkgY2FsbGJhY2s6IChjb250ZW50OiBzdHJpbmcsIGV2ZW50OiBJTW91c2VFdmVudCB8IElLZXlib2FyZEV2ZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvcm1hdHRlZFRleHRSZW5kZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgYWN0aW9uSGFuZGxlcj86IElDb250ZW50QWN0aW9uSGFuZGxlcjtcblx0cmVhZG9ubHkgcmVuZGVyQ29kZVNlZ21lbnRzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRleHQodGV4dDogc3RyaW5nLCBfb3B0aW9ucz86IEZvcm1hdHRlZFRleHRSZW5kZXJPcHRpb25zLCB0YXJnZXQ/OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgZWxlbWVudCA9IHRhcmdldCA/PyBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0ZWxlbWVudC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdHJldHVybiBlbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyRm9ybWF0dGVkVGV4dChmb3JtYXR0ZWRUZXh0OiBzdHJpbmcsIG9wdGlvbnM/OiBGb3JtYXR0ZWRUZXh0UmVuZGVyT3B0aW9ucywgdGFyZ2V0PzogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdGNvbnN0IGVsZW1lbnQgPSB0YXJnZXQgPz8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0X3JlbmRlckZvcm1hdHRlZFRleHQoZWxlbWVudCwgcGFyc2VGb3JtYXR0ZWRUZXh0KGZvcm1hdHRlZFRleHQsICEhb3B0aW9ucz8ucmVuZGVyQ29kZVNlZ21lbnRzKSwgb3B0aW9ucz8uYWN0aW9uSGFuZGxlciwgb3B0aW9ucz8ucmVuZGVyQ29kZVNlZ21lbnRzKTtcblx0cmV0dXJuIGVsZW1lbnQ7XG59XG5cbmNsYXNzIFN0cmluZ1N0cmVhbSB7XG5cdHByaXZhdGUgc291cmNlOiBzdHJpbmc7XG5cdHByaXZhdGUgaW5kZXg6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZykge1xuXHRcdHRoaXMuc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuaW5kZXggPSAwO1xuXHR9XG5cblx0cHVibGljIGVvcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleCA+PSB0aGlzLnNvdXJjZS5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgbmV4dCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLnBlZWsoKTtcblx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHRyZXR1cm4gbmV4dDtcblx0fVxuXG5cdHB1YmxpYyBwZWVrKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc291cmNlW3RoaXMuaW5kZXhdO1xuXHR9XG5cblx0cHVibGljIGFkdmFuY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5pbmRleCsrO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gRm9ybWF0VHlwZSB7XG5cdEludmFsaWQsXG5cdFJvb3QsXG5cdFRleHQsXG5cdEJvbGQsXG5cdEl0YWxpY3MsXG5cdEFjdGlvbixcblx0QWN0aW9uQ2xvc2UsXG5cdENvZGUsXG5cdE5ld0xpbmVcbn1cblxuaW50ZXJmYWNlIElGb3JtYXRQYXJzZVRyZWUge1xuXHR0eXBlOiBGb3JtYXRUeXBlO1xuXHRjb250ZW50Pzogc3RyaW5nO1xuXHRpbmRleD86IG51bWJlcjtcblx0Y2hpbGRyZW4/OiBJRm9ybWF0UGFyc2VUcmVlW107XG59XG5cbmZ1bmN0aW9uIF9yZW5kZXJGb3JtYXR0ZWRUZXh0KGVsZW1lbnQ6IE5vZGUsIHRyZWVOb2RlOiBJRm9ybWF0UGFyc2VUcmVlLCBhY3Rpb25IYW5kbGVyPzogSUNvbnRlbnRBY3Rpb25IYW5kbGVyLCByZW5kZXJDb2RlU2VnbWVudHM/OiBib29sZWFuKSB7XG5cdGxldCBjaGlsZDogTm9kZSB8IHVuZGVmaW5lZDtcblxuXHRpZiAodHJlZU5vZGUudHlwZSA9PT0gRm9ybWF0VHlwZS5UZXh0KSB7XG5cdFx0Y2hpbGQgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0cmVlTm9kZS5jb250ZW50IHx8ICcnKTtcblx0fSBlbHNlIGlmICh0cmVlTm9kZS50eXBlID09PSBGb3JtYXRUeXBlLkJvbGQpIHtcblx0XHRjaGlsZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2InKTtcblx0fSBlbHNlIGlmICh0cmVlTm9kZS50eXBlID09PSBGb3JtYXRUeXBlLkl0YWxpY3MpIHtcblx0XHRjaGlsZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2knKTtcblx0fSBlbHNlIGlmICh0cmVlTm9kZS50eXBlID09PSBGb3JtYXRUeXBlLkNvZGUgJiYgcmVuZGVyQ29kZVNlZ21lbnRzKSB7XG5cdFx0Y2hpbGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb2RlJyk7XG5cdH0gZWxzZSBpZiAodHJlZU5vZGUudHlwZSA9PT0gRm9ybWF0VHlwZS5BY3Rpb24gJiYgYWN0aW9uSGFuZGxlcikge1xuXHRcdGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0YWN0aW9uSGFuZGxlci5kaXNwb3NhYmxlcy5hZGQoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGEsICdjbGljaycsIChldmVudCkgPT4ge1xuXHRcdFx0YWN0aW9uSGFuZGxlci5jYWxsYmFjayhTdHJpbmcodHJlZU5vZGUuaW5kZXgpLCBldmVudCk7XG5cdFx0fSkpO1xuXG5cdFx0Y2hpbGQgPSBhO1xuXHR9IGVsc2UgaWYgKHRyZWVOb2RlLnR5cGUgPT09IEZvcm1hdFR5cGUuTmV3TGluZSkge1xuXHRcdGNoaWxkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnInKTtcblx0fSBlbHNlIGlmICh0cmVlTm9kZS50eXBlID09PSBGb3JtYXRUeXBlLlJvb3QpIHtcblx0XHRjaGlsZCA9IGVsZW1lbnQ7XG5cdH1cblxuXHRpZiAoY2hpbGQgJiYgZWxlbWVudCAhPT0gY2hpbGQpIHtcblx0XHRlbGVtZW50LmFwcGVuZENoaWxkKGNoaWxkKTtcblx0fVxuXG5cdGlmIChjaGlsZCAmJiBBcnJheS5pc0FycmF5KHRyZWVOb2RlLmNoaWxkcmVuKSkge1xuXHRcdHRyZWVOb2RlLmNoaWxkcmVuLmZvckVhY2goKG5vZGVDaGlsZCkgPT4ge1xuXHRcdFx0X3JlbmRlckZvcm1hdHRlZFRleHQoY2hpbGQsIG5vZGVDaGlsZCwgYWN0aW9uSGFuZGxlciwgcmVuZGVyQ29kZVNlZ21lbnRzKTtcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBwYXJzZUZvcm1hdHRlZFRleHQoY29udGVudDogc3RyaW5nLCBwYXJzZUNvZGVTZWdtZW50czogYm9vbGVhbik6IElGb3JtYXRQYXJzZVRyZWUge1xuXG5cdGNvbnN0IHJvb3Q6IElGb3JtYXRQYXJzZVRyZWUgPSB7XG5cdFx0dHlwZTogRm9ybWF0VHlwZS5Sb290LFxuXHRcdGNoaWxkcmVuOiBbXVxuXHR9O1xuXG5cdGxldCBhY3Rpb25WaWV3SXRlbUluZGV4ID0gMDtcblx0bGV0IGN1cnJlbnQgPSByb290O1xuXHRjb25zdCBzdGFjazogSUZvcm1hdFBhcnNlVHJlZVtdID0gW107XG5cdGNvbnN0IHN0cmVhbSA9IG5ldyBTdHJpbmdTdHJlYW0oY29udGVudCk7XG5cblx0d2hpbGUgKCFzdHJlYW0uZW9zKCkpIHtcblx0XHRsZXQgbmV4dCA9IHN0cmVhbS5uZXh0KCk7XG5cblx0XHRjb25zdCBpc0VzY2FwZWRGb3JtYXRUeXBlID0gKG5leHQgPT09ICdcXFxcJyAmJiBmb3JtYXRUYWdUeXBlKHN0cmVhbS5wZWVrKCksIHBhcnNlQ29kZVNlZ21lbnRzKSAhPT0gRm9ybWF0VHlwZS5JbnZhbGlkKTtcblx0XHRpZiAoaXNFc2NhcGVkRm9ybWF0VHlwZSkge1xuXHRcdFx0bmV4dCA9IHN0cmVhbS5uZXh0KCk7IC8vIHVucmVhZCB0aGUgYmFja3NsYXNoIGlmIGl0IGVzY2FwZXMgYSBmb3JtYXQgdGFnIHR5cGVcblx0XHR9XG5cblx0XHRpZiAoIWlzRXNjYXBlZEZvcm1hdFR5cGUgJiYgaXNGb3JtYXRUYWcobmV4dCwgcGFyc2VDb2RlU2VnbWVudHMpICYmIG5leHQgPT09IHN0cmVhbS5wZWVrKCkpIHtcblx0XHRcdHN0cmVhbS5hZHZhbmNlKCk7XG5cblx0XHRcdGlmIChjdXJyZW50LnR5cGUgPT09IEZvcm1hdFR5cGUuVGV4dCkge1xuXHRcdFx0XHRjdXJyZW50ID0gc3RhY2sucG9wKCkhO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0eXBlID0gZm9ybWF0VGFnVHlwZShuZXh0LCBwYXJzZUNvZGVTZWdtZW50cyk7XG5cdFx0XHRpZiAoY3VycmVudC50eXBlID09PSB0eXBlIHx8IChjdXJyZW50LnR5cGUgPT09IEZvcm1hdFR5cGUuQWN0aW9uICYmIHR5cGUgPT09IEZvcm1hdFR5cGUuQWN0aW9uQ2xvc2UpKSB7XG5cdFx0XHRcdGN1cnJlbnQgPSBzdGFjay5wb3AoKSE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdDdXJyZW50OiBJRm9ybWF0UGFyc2VUcmVlID0ge1xuXHRcdFx0XHRcdHR5cGU6IHR5cGUsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IFtdXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKHR5cGUgPT09IEZvcm1hdFR5cGUuQWN0aW9uKSB7XG5cdFx0XHRcdFx0bmV3Q3VycmVudC5pbmRleCA9IGFjdGlvblZpZXdJdGVtSW5kZXg7XG5cdFx0XHRcdFx0YWN0aW9uVmlld0l0ZW1JbmRleCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y3VycmVudC5jaGlsZHJlbiEucHVzaChuZXdDdXJyZW50KTtcblx0XHRcdFx0c3RhY2sucHVzaChjdXJyZW50KTtcblx0XHRcdFx0Y3VycmVudCA9IG5ld0N1cnJlbnQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChuZXh0ID09PSAnXFxuJykge1xuXHRcdFx0aWYgKGN1cnJlbnQudHlwZSA9PT0gRm9ybWF0VHlwZS5UZXh0KSB7XG5cdFx0XHRcdGN1cnJlbnQgPSBzdGFjay5wb3AoKSE7XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnQuY2hpbGRyZW4hLnB1c2goe1xuXHRcdFx0XHR0eXBlOiBGb3JtYXRUeXBlLk5ld0xpbmVcblx0XHRcdH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChjdXJyZW50LnR5cGUgIT09IEZvcm1hdFR5cGUuVGV4dCkge1xuXHRcdFx0XHRjb25zdCB0ZXh0Q3VycmVudDogSUZvcm1hdFBhcnNlVHJlZSA9IHtcblx0XHRcdFx0XHR0eXBlOiBGb3JtYXRUeXBlLlRleHQsXG5cdFx0XHRcdFx0Y29udGVudDogbmV4dFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjdXJyZW50LmNoaWxkcmVuIS5wdXNoKHRleHRDdXJyZW50KTtcblx0XHRcdFx0c3RhY2sucHVzaChjdXJyZW50KTtcblx0XHRcdFx0Y3VycmVudCA9IHRleHRDdXJyZW50O1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50LmNvbnRlbnQgKz0gbmV4dDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoY3VycmVudC50eXBlID09PSBGb3JtYXRUeXBlLlRleHQpIHtcblx0XHRjdXJyZW50ID0gc3RhY2sucG9wKCkhO1xuXHR9XG5cblx0aWYgKHN0YWNrLmxlbmd0aCkge1xuXHRcdC8vIGluY29ycmVjdGx5IGZvcm1hdHRlZCBzdHJpbmcgbGl0ZXJhbFxuXHR9XG5cblx0cmV0dXJuIHJvb3Q7XG59XG5cbmZ1bmN0aW9uIGlzRm9ybWF0VGFnKGNoYXI6IHN0cmluZywgc3VwcG9ydENvZGVTZWdtZW50czogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZm9ybWF0VGFnVHlwZShjaGFyLCBzdXBwb3J0Q29kZVNlZ21lbnRzKSAhPT0gRm9ybWF0VHlwZS5JbnZhbGlkO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRUYWdUeXBlKGNoYXI6IHN0cmluZywgc3VwcG9ydENvZGVTZWdtZW50czogYm9vbGVhbik6IEZvcm1hdFR5cGUge1xuXHRzd2l0Y2ggKGNoYXIpIHtcblx0XHRjYXNlICcqJzpcblx0XHRcdHJldHVybiBGb3JtYXRUeXBlLkJvbGQ7XG5cdFx0Y2FzZSAnXyc6XG5cdFx0XHRyZXR1cm4gRm9ybWF0VHlwZS5JdGFsaWNzO1xuXHRcdGNhc2UgJ1snOlxuXHRcdFx0cmV0dXJuIEZvcm1hdFR5cGUuQWN0aW9uO1xuXHRcdGNhc2UgJ10nOlxuXHRcdFx0cmV0dXJuIEZvcm1hdFR5cGUuQWN0aW9uQ2xvc2U7XG5cdFx0Y2FzZSAnYCc6XG5cdFx0XHRyZXR1cm4gc3VwcG9ydENvZGVTZWdtZW50cyA/IEZvcm1hdFR5cGUuQ29kZSA6IEZvcm1hdFR5cGUuSW52YWxpZDtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIEZvcm1hdFR5cGUuSW52YWxpZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBZWQsU0FBUyxXQUFXLE1BQWMsVUFBdUMsUUFBbUM7QUFDbEgsUUFBTSxVQUFVLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDdEQsVUFBUSxjQUFjO0FBQ3RCLFNBQU87QUFDUjtBQUVPLFNBQVMsb0JBQW9CLGVBQXVCLFNBQXNDLFFBQW1DO0FBQ25JLFFBQU0sVUFBVSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQ3RELFVBQVEsY0FBYztBQUN0Qix1QkFBcUIsU0FBUyxtQkFBbUIsZUFBZSxDQUFDLENBQUMsU0FBUyxrQkFBa0IsR0FBRyxTQUFTLGVBQWUsU0FBUyxrQkFBa0I7QUFDbkosU0FBTztBQUNSO0FBRUEsTUFBTSxhQUFhO0FBQUEsRUFJbEIsWUFBWSxRQUFnQjtBQUMzQixTQUFLLFNBQVM7QUFDZCxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFTyxNQUFlO0FBQ3JCLFdBQU8sS0FBSyxTQUFTLEtBQUssT0FBTztBQUFBLEVBQ2xDO0FBQUEsRUFFTyxPQUFlO0FBQ3JCLFVBQU0sT0FBTyxLQUFLLEtBQUs7QUFDdkIsU0FBSyxRQUFRO0FBQ2IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLE9BQWU7QUFDckIsV0FBTyxLQUFLLE9BQU8sS0FBSyxLQUFLO0FBQUEsRUFDOUI7QUFBQSxFQUVPLFVBQWdCO0FBQ3RCLFNBQUs7QUFBQSxFQUNOO0FBQ0Q7QUFFQSxJQUFXLGFBQVgsa0JBQVdBLGdCQUFYO0FBQ0MsRUFBQUEsd0JBQUE7QUFDQSxFQUFB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
