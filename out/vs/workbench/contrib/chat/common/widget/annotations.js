import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { appendMarkdownString, canMergeMarkdownStrings } from "../model/chatModel.js";
const contentRefUrl = "http://_vscodecontentref_";
function annotateSpecialMarkdownContentWithSource(response) {
  let refIdPool = 0;
  const result = [];
  let sourceIndex = 0;
  for (const item of response) {
    const currentSourceIndex = sourceIndex++;
    const previousItemIndex = result.findLastIndex((p) => p.content.kind !== "textEditGroup" && p.content.kind !== "undoStop");
    const previousEntry = result[previousItemIndex];
    const previousItem = previousEntry?.content;
    if (item.kind === "inlineReference") {
      let label = item.name;
      if (!label) {
        if (URI.isUri(item.inlineReference)) {
          label = basename(item.inlineReference);
        } else if (isLocation(item.inlineReference)) {
          label = basename(item.inlineReference.uri);
        } else {
          label = item.inlineReference.name;
        }
      }
      const previousText = previousItem?.kind === "markdownContent" ? previousItem.content.value : "";
      if (isInsideCodeContext(previousText)) {
        if (previousItem?.kind === "markdownContent") {
          const merged = appendMarkdownString(previousItem.content, new MarkdownString(label));
          result[previousItemIndex] = {
            content: { ...previousItem, content: merged },
            sourceIndexes: [...previousEntry.sourceIndexes, currentSourceIndex]
          };
        } else {
          result.push({
            content: { content: new MarkdownString(label), kind: "markdownContent" },
            sourceIndexes: [currentSourceIndex]
          });
        }
      } else {
        const refId = refIdPool++;
        const printUri = URI.parse(contentRefUrl).with({ path: String(refId) });
        const markdownText = `[${label}](${printUri.toString()})`;
        const annotationMetadata = { [refId]: item };
        if (previousItem?.kind === "markdownContent") {
          const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
          result[previousItemIndex] = {
            content: { ...previousItem, content: merged, inlineReferences: { ...annotationMetadata, ...previousItem.inlineReferences || {} } },
            sourceIndexes: [...previousEntry.sourceIndexes, currentSourceIndex]
          };
        } else {
          result.push({
            content: { content: new MarkdownString(markdownText), inlineReferences: annotationMetadata, kind: "markdownContent" },
            sourceIndexes: [currentSourceIndex]
          });
        }
      }
    } else if (item.kind === "markdownContent" && previousItem?.kind === "markdownContent") {
      if (canMergeMarkdownStrings(previousItem.content, item.content)) {
        const merged = appendMarkdownString(previousItem.content, item.content);
        result[previousItemIndex] = {
          content: { ...previousItem, content: merged },
          sourceIndexes: [...previousEntry.sourceIndexes, currentSourceIndex]
        };
      } else if (previousItem.inlineReferences && isContentRefOnly(previousItem.content.value)) {
        result[previousItemIndex] = {
          content: {
            ...previousItem,
            content: {
              ...item.content,
              value: previousItem.content.value + item.content.value
            }
          },
          sourceIndexes: [...previousEntry.sourceIndexes, currentSourceIndex]
        };
      } else {
        result.push({ content: item, sourceIndexes: [currentSourceIndex] });
      }
    } else if (item.kind === "markdownVuln") {
      const vulnText = encodeURIComponent(JSON.stringify(item.vulnerabilities));
      const markdownText = `<vscode_annotation details='${vulnText}'>${item.content.value}</vscode_annotation>`;
      if (previousItem?.kind === "markdownContent") {
        const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
        result[previousItemIndex] = {
          content: { ...previousItem, content: merged },
          sourceIndexes: [...previousEntry.sourceIndexes, currentSourceIndex]
        };
      } else {
        result.push({
          content: { content: new MarkdownString(markdownText), kind: "markdownContent" },
          sourceIndexes: [currentSourceIndex]
        });
      }
    } else if (item.kind === "codeblockUri") {
      if (previousItem?.kind === "markdownContent") {
        const isEditText = item.isEdit ? ` isEdit` : "";
        const subAgentText = item.subAgentInvocationId ? ` subAgentInvocationId="${encodeURIComponent(item.subAgentInvocationId)}"` : "";
        const markdownText = `<vscode_codeblock_uri${isEditText}${subAgentText}>${item.uri.toString()}</vscode_codeblock_uri>`;
        const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
        result.splice(previousItemIndex, 1);
        result.push({
          content: { ...previousItem, content: merged },
          sourceIndexes: [...previousEntry.sourceIndexes, currentSourceIndex]
        });
      }
    } else if (item.kind === "voiceProgress") {
      continue;
    } else {
      result.push({ content: item, sourceIndexes: [currentSourceIndex] });
    }
  }
  return result;
}
function annotateSpecialMarkdownContent(response) {
  return annotateSpecialMarkdownContentWithSource(response).map((entry) => entry.content);
}
const contentRefPattern = new RegExp(`^(\\[.*?\\]\\(${contentRefUrl}/\\d+\\))+$`);
function isContentRefOnly(text) {
  return contentRefPattern.test(text);
}
function isInsideCodeContext(text) {
  const lines = text.split("\n");
  let inFencedBlock = false;
  let fenceChar = "";
  let fenceLength = 0;
  const unfencedLines = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (inFencedBlock) {
      const closeLength = countLeadingChar(trimmed, fenceChar);
      if (closeLength >= fenceLength && trimmed.substring(closeLength).trim() === "") {
        inFencedBlock = false;
        unfencedLines.length = 0;
      }
      continue;
    }
    const firstChar = trimmed[0];
    if (firstChar === "`" || firstChar === "~") {
      const openLength = countLeadingChar(trimmed, firstChar);
      if (openLength >= 3 && (firstChar === "~" || !trimmed.substring(openLength).includes("`"))) {
        inFencedBlock = true;
        fenceChar = firstChar;
        fenceLength = openLength;
        unfencedLines.length = 0;
        continue;
      }
    }
    unfencedLines.push(line);
  }
  return inFencedBlock || hasUnclosedInlineCode(unfencedLines.join("\n"));
}
function countLeadingChar(text, char) {
  let count = 0;
  while (count < text.length && text[count] === char) {
    count++;
  }
  return count;
}
function hasUnclosedInlineCode(text) {
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    const openLen = countLeadingChar(text.substring(i), "`");
    i += openLen;
    let found = false;
    while (i < text.length) {
      if (text[i] !== "`") {
        i++;
        continue;
      }
      const closeLen = countLeadingChar(text.substring(i), "`");
      i += closeLen;
      if (closeLen === openLen) {
        found = true;
        break;
      }
    }
    if (!found) {
      return true;
    }
  }
  return false;
}
function extractCodeblockUrisFromText(text) {
  const match = /<vscode_codeblock_uri( isEdit)?( subAgentInvocationId="([^"]*)")?>([\s\S]*?)<\/vscode_codeblock_uri>/ms.exec(text);
  if (match) {
    const [all, isEdit, , encodedSubAgentId, uriString] = match;
    if (uriString) {
      let result;
      try {
        result = URI.parse(uriString);
      } catch {
        return void 0;
      }
      const textWithoutResult = text.substring(0, match.index) + text.substring(match.index + all.length);
      let subAgentInvocationId;
      if (encodedSubAgentId) {
        try {
          subAgentInvocationId = decodeURIComponent(encodedSubAgentId);
        } catch {
          subAgentInvocationId = encodedSubAgentId;
        }
      }
      return { uri: result, textWithoutResult, isEdit: !!isEdit, subAgentInvocationId };
    }
  }
  return void 0;
}
function extractSubAgentInvocationIdFromText(text) {
  const match = /<vscode_codeblock_uri[^>]* subAgentInvocationId="([^"]*)"/ms.exec(text);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return void 0;
}
function hasCodeblockUriTag(text) {
  return text.includes("<vscode_codeblock_uri");
}
function hasEditCodeblockUriTag(text) {
  return text.includes("<vscode_codeblock_uri isEdit");
}
function extractVulnerabilitiesFromText(text) {
  const vulnerabilities = [];
  let newText = text;
  let match;
  while ((match = /<vscode_annotation details='(.*?)'>(.*?)<\/vscode_annotation>/ms.exec(newText)) !== null) {
    const [full, details, content] = match;
    const start = match.index;
    const textBefore = newText.substring(0, start);
    const linesBefore = textBefore.split("\n").length - 1;
    const linesInside = content.split("\n").length - 1;
    const previousNewlineIdx = textBefore.lastIndexOf("\n");
    const startColumn = start - (previousNewlineIdx + 1) + 1;
    const endPreviousNewlineIdx = (textBefore + content).lastIndexOf("\n");
    const endColumn = start + content.length - (endPreviousNewlineIdx + 1) + 1;
    try {
      const vulnDetails = JSON.parse(decodeURIComponent(details));
      vulnDetails.forEach(({ title, description }) => vulnerabilities.push({
        title,
        description,
        range: { startLineNumber: linesBefore + 1, startColumn, endLineNumber: linesBefore + linesInside + 1, endColumn }
      }));
    } catch (err) {
    }
    newText = newText.substring(0, start) + content + newText.substring(start + full.length);
  }
  return { newText, vulnerabilities };
}
export {
  annotateSpecialMarkdownContent,
  annotateSpecialMarkdownContentWithSource,
  contentRefUrl,
  extractCodeblockUrisFromText,
  extractSubAgentInvocationIdFromText,
  extractVulnerabilitiesFromText,
  hasCodeblockUriTag,
  hasEditCodeblockUriTag,
  isInsideCodeContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcd2lkZ2V0XFxhbm5vdGF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3NSZW5kZXJhYmxlUmVzcG9uc2VDb250ZW50LCBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50LCBhcHBlbmRNYXJrZG93blN0cmluZywgY2FuTWVyZ2VNYXJrZG93blN0cmluZ3MgfSBmcm9tICcuLi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFZ1bG5lcmFiaWxpdHlEZXRhaWxzIH0gZnJvbSAnLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgY29udGVudFJlZlVybCA9ICdodHRwOi8vX3ZzY29kZWNvbnRlbnRyZWZfJzsgLy8gbXVzdCBiZSBsb3dlcmNhc2UgZm9yIFVSSVxuXG5leHBvcnQgaW50ZXJmYWNlIElBbm5vdGF0ZWRDaGF0Q29udGVudCB7XG5cdHJlYWRvbmx5IGNvbnRlbnQ6IElDaGF0UHJvZ3Jlc3NSZW5kZXJhYmxlUmVzcG9uc2VDb250ZW50O1xuXHRyZWFkb25seSBzb3VyY2VJbmRleGVzOiByZWFkb25seSBudW1iZXJbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudFdpdGhTb3VyY2UocmVzcG9uc2U6IEl0ZXJhYmxlPElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQ+KTogSUFubm90YXRlZENoYXRDb250ZW50W10ge1xuXHRsZXQgcmVmSWRQb29sID0gMDtcblxuXHRjb25zdCByZXN1bHQ6IElBbm5vdGF0ZWRDaGF0Q29udGVudFtdID0gW107XG5cdGxldCBzb3VyY2VJbmRleCA9IDA7XG5cdGZvciAoY29uc3QgaXRlbSBvZiByZXNwb25zZSkge1xuXHRcdGNvbnN0IGN1cnJlbnRTb3VyY2VJbmRleCA9IHNvdXJjZUluZGV4Kys7XG5cdFx0Y29uc3QgcHJldmlvdXNJdGVtSW5kZXggPSByZXN1bHQuZmluZExhc3RJbmRleChwID0+IHAuY29udGVudC5raW5kICE9PSAndGV4dEVkaXRHcm91cCcgJiYgcC5jb250ZW50LmtpbmQgIT09ICd1bmRvU3RvcCcpO1xuXHRcdGNvbnN0IHByZXZpb3VzRW50cnkgPSByZXN1bHRbcHJldmlvdXNJdGVtSW5kZXhdO1xuXHRcdGNvbnN0IHByZXZpb3VzSXRlbSA9IHByZXZpb3VzRW50cnk/LmNvbnRlbnQ7XG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ2lubGluZVJlZmVyZW5jZScpIHtcblx0XHRcdGxldCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gaXRlbS5uYW1lO1xuXHRcdFx0aWYgKCFsYWJlbCkge1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKGl0ZW0uaW5saW5lUmVmZXJlbmNlKSkge1xuXHRcdFx0XHRcdGxhYmVsID0gYmFzZW5hbWUoaXRlbS5pbmxpbmVSZWZlcmVuY2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzTG9jYXRpb24oaXRlbS5pbmxpbmVSZWZlcmVuY2UpKSB7XG5cdFx0XHRcdFx0bGFiZWwgPSBiYXNlbmFtZShpdGVtLmlubGluZVJlZmVyZW5jZS51cmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhYmVsID0gaXRlbS5pbmxpbmVSZWZlcmVuY2UubmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaGVuIHRoZSBwcmVjZWRpbmcgbWFya2Rvd24gZW5kcyBpbnNpZGUgYSBjb2RlIGNvbnRleHQgKGlubGluZSBjb2RlIHNwYW5cblx0XHRcdC8vIG9yIGZlbmNlZCBjb2RlIGJsb2NrKSwgbWFya2Rvd24gbGlua3Mgd29uJ3QgYmUgcGFyc2VkLCB0aGV5IHJlbmRlciBhc1xuXHRcdFx0Ly8gbGl0ZXJhbCB0ZXh0IGxpa2UgW2ZpbGVdKGh0dHA6Ly9fdnNjb2RlY29udGVudHJlZl8vMSkuIEluIHRoYXQgY2FzZSwgZW1pdFxuXHRcdFx0Ly8ganVzdCB0aGUgcGxhaW4gbGFiZWwgc28gdGhlIG91dHB1dCBzdGF5cyByZWFkYWJsZS5cblx0XHRcdGNvbnN0IHByZXZpb3VzVGV4dCA9IHByZXZpb3VzSXRlbT8ua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgPyBwcmV2aW91c0l0ZW0uY29udGVudC52YWx1ZSA6ICcnO1xuXHRcdFx0aWYgKGlzSW5zaWRlQ29kZUNvbnRleHQocHJldmlvdXNUZXh0KSkge1xuXHRcdFx0XHRpZiAocHJldmlvdXNJdGVtPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZCA9IGFwcGVuZE1hcmtkb3duU3RyaW5nKHByZXZpb3VzSXRlbS5jb250ZW50LCBuZXcgTWFya2Rvd25TdHJpbmcobGFiZWwpKTtcblx0XHRcdFx0XHRyZXN1bHRbcHJldmlvdXNJdGVtSW5kZXhdID0ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogeyAuLi5wcmV2aW91c0l0ZW0sIGNvbnRlbnQ6IG1lcmdlZCB9LFxuXHRcdFx0XHRcdFx0c291cmNlSW5kZXhlczogWy4uLnByZXZpb3VzRW50cnkuc291cmNlSW5kZXhlcywgY3VycmVudFNvdXJjZUluZGV4XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxhYmVsKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSxcblx0XHRcdFx0XHRcdHNvdXJjZUluZGV4ZXM6IFtjdXJyZW50U291cmNlSW5kZXhdLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZWZJZCA9IHJlZklkUG9vbCsrO1xuXHRcdFx0XHRjb25zdCBwcmludFVyaSA9IFVSSS5wYXJzZShjb250ZW50UmVmVXJsKS53aXRoKHsgcGF0aDogU3RyaW5nKHJlZklkKSB9KTtcblx0XHRcdFx0Y29uc3QgbWFya2Rvd25UZXh0ID0gYFske2xhYmVsfV0oJHtwcmludFVyaS50b1N0cmluZygpfSlgO1xuXG5cdFx0XHRcdGNvbnN0IGFubm90YXRpb25NZXRhZGF0YSA9IHsgW3JlZklkXTogaXRlbSB9O1xuXG5cdFx0XHRcdGlmIChwcmV2aW91c0l0ZW0/LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVyZ2VkID0gYXBwZW5kTWFya2Rvd25TdHJpbmcocHJldmlvdXNJdGVtLmNvbnRlbnQsIG5ldyBNYXJrZG93blN0cmluZyhtYXJrZG93blRleHQpKTtcblx0XHRcdFx0XHRyZXN1bHRbcHJldmlvdXNJdGVtSW5kZXhdID0ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogeyAuLi5wcmV2aW91c0l0ZW0sIGNvbnRlbnQ6IG1lcmdlZCwgaW5saW5lUmVmZXJlbmNlczogeyAuLi5hbm5vdGF0aW9uTWV0YWRhdGEsIC4uLihwcmV2aW91c0l0ZW0uaW5saW5lUmVmZXJlbmNlcyB8fCB7fSkgfSB9LFxuXHRcdFx0XHRcdFx0c291cmNlSW5kZXhlczogWy4uLnByZXZpb3VzRW50cnkuc291cmNlSW5kZXhlcywgY3VycmVudFNvdXJjZUluZGV4XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKG1hcmtkb3duVGV4dCksIGlubGluZVJlZmVyZW5jZXM6IGFubm90YXRpb25NZXRhZGF0YSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSxcblx0XHRcdFx0XHRcdHNvdXJjZUluZGV4ZXM6IFtjdXJyZW50U291cmNlSW5kZXhdLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpdGVtLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnICYmIHByZXZpb3VzSXRlbT8ua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpIHtcblx0XHRcdGlmIChjYW5NZXJnZU1hcmtkb3duU3RyaW5ncyhwcmV2aW91c0l0ZW0uY29udGVudCwgaXRlbS5jb250ZW50KSkge1xuXHRcdFx0XHRjb25zdCBtZXJnZWQgPSBhcHBlbmRNYXJrZG93blN0cmluZyhwcmV2aW91c0l0ZW0uY29udGVudCwgaXRlbS5jb250ZW50KTtcblx0XHRcdFx0cmVzdWx0W3ByZXZpb3VzSXRlbUluZGV4XSA9IHtcblx0XHRcdFx0XHRjb250ZW50OiB7IC4uLnByZXZpb3VzSXRlbSwgY29udGVudDogbWVyZ2VkIH0sXG5cdFx0XHRcdFx0c291cmNlSW5kZXhlczogWy4uLnByZXZpb3VzRW50cnkuc291cmNlSW5kZXhlcywgY3VycmVudFNvdXJjZUluZGV4XSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAocHJldmlvdXNJdGVtLmlubGluZVJlZmVyZW5jZXMgJiYgaXNDb250ZW50UmVmT25seShwcmV2aW91c0l0ZW0uY29udGVudC52YWx1ZSkpIHtcblx0XHRcdFx0Ly8gVGhlIHByZXZpb3VzIGl0ZW0gaXMgYSBzdGFuZGFsb25lIGlubGluZSByZWZlcmVuY2Ugd2hvc2UgTWFya2Rvd25TdHJpbmdcblx0XHRcdFx0Ly8gd2FzIHN5bnRoZXNpemVkIHdpdGggZGVmYXVsdCBwcm9wZXJ0aWVzIHRoYXQgZG9uJ3QgbWF0Y2ggdGhlIGluY29taW5nXG5cdFx0XHRcdC8vIG1hcmtkb3duIChlLmcuLCBkaWZmZXJlbnQgaXNUcnVzdGVkKS4gUHJlcGVuZCB0aGUgcmVmZXJlbmNlIHRleHQgYW5kXG5cdFx0XHRcdC8vIGFkb3B0IHRoZSBpbmNvbWluZyBpdGVtJ3MgcHJvcGVydGllcyBzbyB0aGV5IHJlbmRlciB0b2dldGhlciBpbiBvbmUgYmxvY2suXG5cdFx0XHRcdHJlc3VsdFtwcmV2aW91c0l0ZW1JbmRleF0gPSB7XG5cdFx0XHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHRcdFx0Li4ucHJldmlvdXNJdGVtLFxuXHRcdFx0XHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHRcdFx0XHQuLi5pdGVtLmNvbnRlbnQsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBwcmV2aW91c0l0ZW0uY29udGVudC52YWx1ZSArIGl0ZW0uY29udGVudC52YWx1ZSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzb3VyY2VJbmRleGVzOiBbLi4ucHJldmlvdXNFbnRyeS5zb3VyY2VJbmRleGVzLCBjdXJyZW50U291cmNlSW5kZXhdLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBjb250ZW50OiBpdGVtLCBzb3VyY2VJbmRleGVzOiBbY3VycmVudFNvdXJjZUluZGV4XSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gJ21hcmtkb3duVnVsbicpIHtcblx0XHRcdGNvbnN0IHZ1bG5UZXh0ID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGl0ZW0udnVsbmVyYWJpbGl0aWVzKSk7XG5cdFx0XHRjb25zdCBtYXJrZG93blRleHQgPSBgPHZzY29kZV9hbm5vdGF0aW9uIGRldGFpbHM9JyR7dnVsblRleHR9Jz4ke2l0ZW0uY29udGVudC52YWx1ZX08L3ZzY29kZV9hbm5vdGF0aW9uPmA7XG5cdFx0XHRpZiAocHJldmlvdXNJdGVtPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0XHQvLyBTaW5jZSB0aGlzIGlzIGluc2lkZSBhIGNvZGVibG9jaywgaXQgbmVlZHMgdG8gYmUgbWVyZ2VkIGludG8gdGhlIHByZXZpb3VzIG1hcmtkb3duIGNvbnRlbnQuXG5cdFx0XHRcdGNvbnN0IG1lcmdlZCA9IGFwcGVuZE1hcmtkb3duU3RyaW5nKHByZXZpb3VzSXRlbS5jb250ZW50LCBuZXcgTWFya2Rvd25TdHJpbmcobWFya2Rvd25UZXh0KSk7XG5cdFx0XHRcdHJlc3VsdFtwcmV2aW91c0l0ZW1JbmRleF0gPSB7XG5cdFx0XHRcdFx0Y29udGVudDogeyAuLi5wcmV2aW91c0l0ZW0sIGNvbnRlbnQ6IG1lcmdlZCB9LFxuXHRcdFx0XHRcdHNvdXJjZUluZGV4ZXM6IFsuLi5wcmV2aW91c0VudHJ5LnNvdXJjZUluZGV4ZXMsIGN1cnJlbnRTb3VyY2VJbmRleF0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0Y29udGVudDogeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobWFya2Rvd25UZXh0KSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSxcblx0XHRcdFx0XHRzb3VyY2VJbmRleGVzOiBbY3VycmVudFNvdXJjZUluZGV4XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpdGVtLmtpbmQgPT09ICdjb2RlYmxvY2tVcmknKSB7XG5cdFx0XHRpZiAocHJldmlvdXNJdGVtPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0XHRjb25zdCBpc0VkaXRUZXh0ID0gaXRlbS5pc0VkaXQgPyBgIGlzRWRpdGAgOiAnJztcblx0XHRcdFx0Y29uc3Qgc3ViQWdlbnRUZXh0ID0gaXRlbS5zdWJBZ2VudEludm9jYXRpb25JZCA/IGAgc3ViQWdlbnRJbnZvY2F0aW9uSWQ9XCIke2VuY29kZVVSSUNvbXBvbmVudChpdGVtLnN1YkFnZW50SW52b2NhdGlvbklkKX1cImAgOiAnJztcblx0XHRcdFx0Y29uc3QgbWFya2Rvd25UZXh0ID0gYDx2c2NvZGVfY29kZWJsb2NrX3VyaSR7aXNFZGl0VGV4dH0ke3N1YkFnZW50VGV4dH0+JHtpdGVtLnVyaS50b1N0cmluZygpfTwvdnNjb2RlX2NvZGVibG9ja191cmk+YDtcblx0XHRcdFx0Y29uc3QgbWVyZ2VkID0gYXBwZW5kTWFya2Rvd25TdHJpbmcocHJldmlvdXNJdGVtLmNvbnRlbnQsIG5ldyBNYXJrZG93blN0cmluZyhtYXJrZG93blRleHQpKTtcblx0XHRcdFx0Ly8gZGVsZXRlIHRoZSBwcmV2aW91cyBhbmQgYXBwZW5kIHRvIGVuc3VyZSB0aGF0IHdlIGRvbid0IHJlb3JkZXIgdGhlIGVkaXQgYmVmb3JlIHRoZSB1bmRvIHN0b3AgY29udGFpbmluZyBpdFxuXHRcdFx0XHRyZXN1bHQuc3BsaWNlKHByZXZpb3VzSXRlbUluZGV4LCAxKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdGNvbnRlbnQ6IHsgLi4ucHJldmlvdXNJdGVtLCBjb250ZW50OiBtZXJnZWQgfSxcblx0XHRcdFx0XHRzb3VyY2VJbmRleGVzOiBbLi4ucHJldmlvdXNFbnRyeS5zb3VyY2VJbmRleGVzLCBjdXJyZW50U291cmNlSW5kZXhdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gJ3ZvaWNlUHJvZ3Jlc3MnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBjb250ZW50OiBpdGVtLCBzb3VyY2VJbmRleGVzOiBbY3VycmVudFNvdXJjZUluZGV4XSB9KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KHJlc3BvbnNlOiBJdGVyYWJsZTxJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50Pik6IElDaGF0UHJvZ3Jlc3NSZW5kZXJhYmxlUmVzcG9uc2VDb250ZW50W10ge1xuXHRyZXR1cm4gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50V2l0aFNvdXJjZShyZXNwb25zZSkubWFwKGVudHJ5ID0+IGVudHJ5LmNvbnRlbnQpO1xufVxuXG5jb25zdCBjb250ZW50UmVmUGF0dGVybiA9IG5ldyBSZWdFeHAoYF4oXFxcXFsuKj9cXFxcXVxcXFwoJHtjb250ZW50UmVmVXJsfS9cXFxcZCtcXFxcKSkrJGApO1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSB3aGVuIHRoZSB0ZXh0IGNvbnNpc3RzIGVudGlyZWx5IG9mIHN5bnRoZXNpemVkIGNvbnRlbnQtcmVmXG4gKiBsaW5rcyAoZS5nLiBgW2ZpbGUudHNdKGh0dHA6Ly9fdnNjb2RlY29udGVudHJlZl8vMClgKSwgd2l0aCBubyBvdGhlclxuICogbWFya2Rvd24gdGV4dCBtaXhlZCBpbi4gVXNlZCB0byBkZWNpZGUgd2hldGhlciB0aGUgTWFya2Rvd25TdHJpbmdcbiAqIHByb3BlcnRpZXMgYXJlIFwic3ludGhldGljIGRlZmF1bHRzXCIgdGhhdCBjYW4gc2FmZWx5IGJlIHJlcGxhY2VkLlxuICovXG5mdW5jdGlvbiBpc0NvbnRlbnRSZWZPbmx5KHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY29udGVudFJlZlBhdHRlcm4udGVzdCh0ZXh0KTtcbn1cblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciB0aGUgZW5kIG9mIGEgbWFya2Rvd24gc3RyaW5nIGlzIGluc2lkZSBhIGNvZGUgY29udGV4dFxuICogKGZlbmNlZCBjb2RlIGJsb2NrIG9yIGlubGluZSBjb2RlIHNwYW4pIHdoZXJlIG1hcmtkb3duIGxpbmsgc3ludGF4XG4gKiB3b3VsZCBiZSByZW5kZXJlZCBhcyBsaXRlcmFsIHRleHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0luc2lkZUNvZGVDb250ZXh0KHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRsZXQgaW5GZW5jZWRCbG9jayA9IGZhbHNlO1xuXHRsZXQgZmVuY2VDaGFyID0gJyc7XG5cdGxldCBmZW5jZUxlbmd0aCA9IDA7XG5cdGNvbnN0IHVuZmVuY2VkTGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbVN0YXJ0KCk7XG5cblx0XHRpZiAoaW5GZW5jZWRCbG9jaykge1xuXHRcdFx0Ly8gQ2hlY2sgZm9yIGNsb3NpbmcgZmVuY2U6IHNhbWUgY2hhciwgYXQgbGVhc3Qgc2FtZSBsZW5ndGgsIG9ubHkgd2hpdGVzcGFjZSBhZnRlclxuXHRcdFx0Y29uc3QgY2xvc2VMZW5ndGggPSBjb3VudExlYWRpbmdDaGFyKHRyaW1tZWQsIGZlbmNlQ2hhcik7XG5cdFx0XHRpZiAoY2xvc2VMZW5ndGggPj0gZmVuY2VMZW5ndGggJiYgdHJpbW1lZC5zdWJzdHJpbmcoY2xvc2VMZW5ndGgpLnRyaW0oKSA9PT0gJycpIHtcblx0XHRcdFx0aW5GZW5jZWRCbG9jayA9IGZhbHNlO1xuXHRcdFx0XHR1bmZlbmNlZExpbmVzLmxlbmd0aCA9IDA7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3Igb3BlbmluZyBmZW5jZSAoMysgYmFja3RpY2tzIG9yIHRpbGRlcyBhdCBzdGFydCBvZiBsaW5lKVxuXHRcdGNvbnN0IGZpcnN0Q2hhciA9IHRyaW1tZWRbMF07XG5cdFx0aWYgKGZpcnN0Q2hhciA9PT0gJ2AnIHx8IGZpcnN0Q2hhciA9PT0gJ34nKSB7XG5cdFx0XHRjb25zdCBvcGVuTGVuZ3RoID0gY291bnRMZWFkaW5nQ2hhcih0cmltbWVkLCBmaXJzdENoYXIpO1xuXHRcdFx0Ly8gQmFja3RpY2sgZmVuY2VzOiBpbmZvIHN0cmluZyBtdXN0IG5vdCBjb250YWluIGJhY2t0aWNrc1xuXHRcdFx0aWYgKG9wZW5MZW5ndGggPj0gMyAmJiAoZmlyc3RDaGFyID09PSAnficgfHwgIXRyaW1tZWQuc3Vic3RyaW5nKG9wZW5MZW5ndGgpLmluY2x1ZGVzKCdgJykpKSB7XG5cdFx0XHRcdGluRmVuY2VkQmxvY2sgPSB0cnVlO1xuXHRcdFx0XHRmZW5jZUNoYXIgPSBmaXJzdENoYXI7XG5cdFx0XHRcdGZlbmNlTGVuZ3RoID0gb3Blbkxlbmd0aDtcblx0XHRcdFx0dW5mZW5jZWRMaW5lcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR1bmZlbmNlZExpbmVzLnB1c2gobGluZSk7XG5cdH1cblxuXHRyZXR1cm4gaW5GZW5jZWRCbG9jayB8fCBoYXNVbmNsb3NlZElubGluZUNvZGUodW5mZW5jZWRMaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbmZ1bmN0aW9uIGNvdW50TGVhZGluZ0NoYXIodGV4dDogc3RyaW5nLCBjaGFyOiBzdHJpbmcpOiBudW1iZXIge1xuXHRsZXQgY291bnQgPSAwO1xuXHR3aGlsZSAoY291bnQgPCB0ZXh0Lmxlbmd0aCAmJiB0ZXh0W2NvdW50XSA9PT0gY2hhcikge1xuXHRcdGNvdW50Kys7XG5cdH1cblx0cmV0dXJuIGNvdW50O1xufVxuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIHRoZSB0ZXh0IGhhcyBhbiB1bmNsb3NlZCBpbmxpbmUgY29kZSBzcGFuLlxuICogSW4gQ29tbW9uTWFyaywgYSBjb2RlIHNwYW4gb3BlbnMgd2l0aCBhIGJhY2t0aWNrIHNlcXVlbmNlIG9mIGxlbmd0aCBOXG4gKiBhbmQgY2xvc2VzIHdpdGggdGhlIG5leHQgYmFja3RpY2sgc2VxdWVuY2Ugb2YgdGhlIHNhbWUgbGVuZ3RoIE4uXG4gKi9cbmZ1bmN0aW9uIGhhc1VuY2xvc2VkSW5saW5lQ29kZSh0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IHRleHQubGVuZ3RoKSB7XG5cdFx0aWYgKHRleHRbaV0gIT09ICdgJykge1xuXHRcdFx0aSsrO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlbkxlbiA9IGNvdW50TGVhZGluZ0NoYXIodGV4dC5zdWJzdHJpbmcoaSksICdgJyk7XG5cdFx0aSArPSBvcGVuTGVuO1xuXG5cdFx0Ly8gU2VhcmNoIGZvciBhIG1hdGNoaW5nIGNsb3NpbmcgYmFja3RpY2sgc2VxdWVuY2Ugb2YgdGhlIHNhbWUgbGVuZ3RoXG5cdFx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdFx0d2hpbGUgKGkgPCB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0aWYgKHRleHRbaV0gIT09ICdgJykge1xuXHRcdFx0XHRpKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2xvc2VMZW4gPSBjb3VudExlYWRpbmdDaGFyKHRleHQuc3Vic3RyaW5nKGkpLCAnYCcpO1xuXHRcdFx0aSArPSBjbG9zZUxlbjtcblx0XHRcdGlmIChjbG9zZUxlbiA9PT0gb3Blbkxlbikge1xuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZm91bmQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWFya2Rvd25WdWxuZXJhYmlsaXR5IHtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IElSYW5nZTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0KHRleHQ6IHN0cmluZyk6IHsgdXJpOiBVUkk7IGlzRWRpdD86IGJvb2xlYW47IHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nOyB0ZXh0V2l0aG91dFJlc3VsdDogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRjb25zdCBtYXRjaCA9IC88dnNjb2RlX2NvZGVibG9ja191cmkoIGlzRWRpdCk/KCBzdWJBZ2VudEludm9jYXRpb25JZD1cIihbXlwiXSopXCIpPz4oW1xcc1xcU10qPyk8XFwvdnNjb2RlX2NvZGVibG9ja191cmk+L21zLmV4ZWModGV4dCk7XG5cdGlmIChtYXRjaCkge1xuXHRcdGNvbnN0IFthbGwsIGlzRWRpdCwgLCBlbmNvZGVkU3ViQWdlbnRJZCwgdXJpU3RyaW5nXSA9IG1hdGNoO1xuXHRcdGlmICh1cmlTdHJpbmcpIHtcblx0XHRcdGxldCByZXN1bHQ6IFVSSTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc3VsdCA9IFVSSS5wYXJzZSh1cmlTdHJpbmcpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0V2l0aG91dFJlc3VsdCA9IHRleHQuc3Vic3RyaW5nKDAsIG1hdGNoLmluZGV4KSArIHRleHQuc3Vic3RyaW5nKG1hdGNoLmluZGV4ICsgYWxsLmxlbmd0aCk7XG5cdFx0XHRsZXQgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChlbmNvZGVkU3ViQWdlbnRJZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkID0gZGVjb2RlVVJJQ29tcG9uZW50KGVuY29kZWRTdWJBZ2VudElkKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBlbmNvZGVkU3ViQWdlbnRJZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdXJpOiByZXN1bHQsIHRleHRXaXRob3V0UmVzdWx0LCBpc0VkaXQ6ICEhaXNFZGl0LCBzdWJBZ2VudEludm9jYXRpb25JZCB9O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWF0Y2ggPSAvPHZzY29kZV9jb2RlYmxvY2tfdXJpW14+XSogc3ViQWdlbnRJbnZvY2F0aW9uSWQ9XCIoW15cIl0qKVwiL21zLmV4ZWModGV4dCk7XG5cdGlmIChtYXRjaCkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBtYXRjaFsxXTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0NvZGVibG9ja1VyaVRhZyh0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHRleHQuaW5jbHVkZXMoJzx2c2NvZGVfY29kZWJsb2NrX3VyaScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRWRpdENvZGVibG9ja1VyaVRhZyh0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHRleHQuaW5jbHVkZXMoJzx2c2NvZGVfY29kZWJsb2NrX3VyaSBpc0VkaXQnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dCh0ZXh0OiBzdHJpbmcpOiB7IG5ld1RleHQ6IHN0cmluZzsgdnVsbmVyYWJpbGl0aWVzOiBJTWFya2Rvd25WdWxuZXJhYmlsaXR5W10gfSB7XG5cdGNvbnN0IHZ1bG5lcmFiaWxpdGllczogSU1hcmtkb3duVnVsbmVyYWJpbGl0eVtdID0gW107XG5cdGxldCBuZXdUZXh0ID0gdGV4dDtcblx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHR3aGlsZSAoKG1hdGNoID0gLzx2c2NvZGVfYW5ub3RhdGlvbiBkZXRhaWxzPScoLio/KSc+KC4qPyk8XFwvdnNjb2RlX2Fubm90YXRpb24+L21zLmV4ZWMobmV3VGV4dCkpICE9PSBudWxsKSB7XG5cdFx0Y29uc3QgW2Z1bGwsIGRldGFpbHMsIGNvbnRlbnRdID0gbWF0Y2g7XG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcblx0XHRjb25zdCB0ZXh0QmVmb3JlID0gbmV3VGV4dC5zdWJzdHJpbmcoMCwgc3RhcnQpO1xuXHRcdGNvbnN0IGxpbmVzQmVmb3JlID0gdGV4dEJlZm9yZS5zcGxpdCgnXFxuJykubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBsaW5lc0luc2lkZSA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpLmxlbmd0aCAtIDE7XG5cblx0XHRjb25zdCBwcmV2aW91c05ld2xpbmVJZHggPSB0ZXh0QmVmb3JlLmxhc3RJbmRleE9mKCdcXG4nKTtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IHN0YXJ0IC0gKHByZXZpb3VzTmV3bGluZUlkeCArIDEpICsgMTtcblx0XHRjb25zdCBlbmRQcmV2aW91c05ld2xpbmVJZHggPSAodGV4dEJlZm9yZSArIGNvbnRlbnQpLmxhc3RJbmRleE9mKCdcXG4nKTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBzdGFydCArIGNvbnRlbnQubGVuZ3RoIC0gKGVuZFByZXZpb3VzTmV3bGluZUlkeCArIDEpICsgMTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2dWxuRGV0YWlsczogSUNoYXRBZ2VudFZ1bG5lcmFiaWxpdHlEZXRhaWxzW10gPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChkZXRhaWxzKSk7XG5cdFx0XHR2dWxuRGV0YWlscy5mb3JFYWNoKCh7IHRpdGxlLCBkZXNjcmlwdGlvbiB9KSA9PiB2dWxuZXJhYmlsaXRpZXMucHVzaCh7XG5cdFx0XHRcdHRpdGxlLCBkZXNjcmlwdGlvbiwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lc0JlZm9yZSArIDEsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiBsaW5lc0JlZm9yZSArIGxpbmVzSW5zaWRlICsgMSwgZW5kQ29sdW1uIH1cblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFNvbWV0aGluZyB3ZW50IHdyb25nIHdpdGggZW5jb2RpbmcgdGhpcyB0ZXh0LCBqdXN0IGlnbm9yZSBpdFxuXHRcdH1cblx0XHRuZXdUZXh0ID0gbmV3VGV4dC5zdWJzdHJpbmcoMCwgc3RhcnQpICsgY29udGVudCArIG5ld1RleHQuc3Vic3RyaW5nKHN0YXJ0ICsgZnVsbC5sZW5ndGgpO1xuXHR9XG5cblx0cmV0dXJuIHsgbmV3VGV4dCwgdnVsbmVyYWJpbGl0aWVzIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFFcEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBK0Usc0JBQXNCLCtCQUErQjtBQUc3SCxNQUFNLGdCQUFnQjtBQU90QixTQUFTLHlDQUF5QyxVQUEyRTtBQUNuSSxNQUFJLFlBQVk7QUFFaEIsUUFBTSxTQUFrQyxDQUFDO0FBQ3pDLE1BQUksY0FBYztBQUNsQixhQUFXLFFBQVEsVUFBVTtBQUM1QixVQUFNLHFCQUFxQjtBQUMzQixVQUFNLG9CQUFvQixPQUFPLGNBQWMsT0FBSyxFQUFFLFFBQVEsU0FBUyxtQkFBbUIsRUFBRSxRQUFRLFNBQVMsVUFBVTtBQUN2SCxVQUFNLGdCQUFnQixPQUFPLGlCQUFpQjtBQUM5QyxVQUFNLGVBQWUsZUFBZTtBQUNwQyxRQUFJLEtBQUssU0FBUyxtQkFBbUI7QUFDcEMsVUFBSSxRQUE0QixLQUFLO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBSSxJQUFJLE1BQU0sS0FBSyxlQUFlLEdBQUc7QUFDcEMsa0JBQVEsU0FBUyxLQUFLLGVBQWU7QUFBQSxRQUN0QyxXQUFXLFdBQVcsS0FBSyxlQUFlLEdBQUc7QUFDNUMsa0JBQVEsU0FBUyxLQUFLLGdCQUFnQixHQUFHO0FBQUEsUUFDMUMsT0FBTztBQUNOLGtCQUFRLEtBQUssZ0JBQWdCO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBTUEsWUFBTSxlQUFlLGNBQWMsU0FBUyxvQkFBb0IsYUFBYSxRQUFRLFFBQVE7QUFDN0YsVUFBSSxvQkFBb0IsWUFBWSxHQUFHO0FBQ3RDLFlBQUksY0FBYyxTQUFTLG1CQUFtQjtBQUM3QyxnQkFBTSxTQUFTLHFCQUFxQixhQUFhLFNBQVMsSUFBSSxlQUFlLEtBQUssQ0FBQztBQUNuRixpQkFBTyxpQkFBaUIsSUFBSTtBQUFBLFlBQzNCLFNBQVMsRUFBRSxHQUFHLGNBQWMsU0FBUyxPQUFPO0FBQUEsWUFDNUMsZUFBZSxDQUFDLEdBQUcsY0FBYyxlQUFlLGtCQUFrQjtBQUFBLFVBQ25FO0FBQUEsUUFDRCxPQUFPO0FBQ04saUJBQU8sS0FBSztBQUFBLFlBQ1gsU0FBUyxFQUFFLFNBQVMsSUFBSSxlQUFlLEtBQUssR0FBRyxNQUFNLGtCQUFrQjtBQUFBLFlBQ3ZFLGVBQWUsQ0FBQyxrQkFBa0I7QUFBQSxVQUNuQyxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0QsT0FBTztBQUNOLGNBQU0sUUFBUTtBQUNkLGNBQU0sV0FBVyxJQUFJLE1BQU0sYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLE9BQU8sS0FBSyxFQUFFLENBQUM7QUFDdEUsY0FBTSxlQUFlLElBQUksS0FBSyxLQUFLLFNBQVMsU0FBUyxDQUFDO0FBRXRELGNBQU0scUJBQXFCLEVBQUUsQ0FBQyxLQUFLLEdBQUcsS0FBSztBQUUzQyxZQUFJLGNBQWMsU0FBUyxtQkFBbUI7QUFDN0MsZ0JBQU0sU0FBUyxxQkFBcUIsYUFBYSxTQUFTLElBQUksZUFBZSxZQUFZLENBQUM7QUFDMUYsaUJBQU8saUJBQWlCLElBQUk7QUFBQSxZQUMzQixTQUFTLEVBQUUsR0FBRyxjQUFjLFNBQVMsUUFBUSxrQkFBa0IsRUFBRSxHQUFHLG9CQUFvQixHQUFJLGFBQWEsb0JBQW9CLENBQUMsRUFBRyxFQUFFO0FBQUEsWUFDbkksZUFBZSxDQUFDLEdBQUcsY0FBYyxlQUFlLGtCQUFrQjtBQUFBLFVBQ25FO0FBQUEsUUFDRCxPQUFPO0FBQ04saUJBQU8sS0FBSztBQUFBLFlBQ1gsU0FBUyxFQUFFLFNBQVMsSUFBSSxlQUFlLFlBQVksR0FBRyxrQkFBa0Isb0JBQW9CLE1BQU0sa0JBQWtCO0FBQUEsWUFDcEgsZUFBZSxDQUFDLGtCQUFrQjtBQUFBLFVBQ25DLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FBVyxLQUFLLFNBQVMscUJBQXFCLGNBQWMsU0FBUyxtQkFBbUI7QUFDdkYsVUFBSSx3QkFBd0IsYUFBYSxTQUFTLEtBQUssT0FBTyxHQUFHO0FBQ2hFLGNBQU0sU0FBUyxxQkFBcUIsYUFBYSxTQUFTLEtBQUssT0FBTztBQUN0RSxlQUFPLGlCQUFpQixJQUFJO0FBQUEsVUFDM0IsU0FBUyxFQUFFLEdBQUcsY0FBYyxTQUFTLE9BQU87QUFBQSxVQUM1QyxlQUFlLENBQUMsR0FBRyxjQUFjLGVBQWUsa0JBQWtCO0FBQUEsUUFDbkU7QUFBQSxNQUNELFdBQVcsYUFBYSxvQkFBb0IsaUJBQWlCLGFBQWEsUUFBUSxLQUFLLEdBQUc7QUFLekYsZUFBTyxpQkFBaUIsSUFBSTtBQUFBLFVBQzNCLFNBQVM7QUFBQSxZQUNSLEdBQUc7QUFBQSxZQUNILFNBQVM7QUFBQSxjQUNSLEdBQUcsS0FBSztBQUFBLGNBQ1IsT0FBTyxhQUFhLFFBQVEsUUFBUSxLQUFLLFFBQVE7QUFBQSxZQUNsRDtBQUFBLFVBQ0Q7QUFBQSxVQUNBLGVBQWUsQ0FBQyxHQUFHLGNBQWMsZUFBZSxrQkFBa0I7QUFBQSxRQUNuRTtBQUFBLE1BQ0QsT0FBTztBQUNOLGVBQU8sS0FBSyxFQUFFLFNBQVMsTUFBTSxlQUFlLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztBQUFBLE1BQ25FO0FBQUEsSUFDRCxXQUFXLEtBQUssU0FBUyxnQkFBZ0I7QUFDeEMsWUFBTSxXQUFXLG1CQUFtQixLQUFLLFVBQVUsS0FBSyxlQUFlLENBQUM7QUFDeEUsWUFBTSxlQUFlLCtCQUErQixRQUFRLEtBQUssS0FBSyxRQUFRLEtBQUs7QUFDbkYsVUFBSSxjQUFjLFNBQVMsbUJBQW1CO0FBRTdDLGNBQU0sU0FBUyxxQkFBcUIsYUFBYSxTQUFTLElBQUksZUFBZSxZQUFZLENBQUM7QUFDMUYsZUFBTyxpQkFBaUIsSUFBSTtBQUFBLFVBQzNCLFNBQVMsRUFBRSxHQUFHLGNBQWMsU0FBUyxPQUFPO0FBQUEsVUFDNUMsZUFBZSxDQUFDLEdBQUcsY0FBYyxlQUFlLGtCQUFrQjtBQUFBLFFBQ25FO0FBQUEsTUFDRCxPQUFPO0FBQ04sZUFBTyxLQUFLO0FBQUEsVUFDWCxTQUFTLEVBQUUsU0FBUyxJQUFJLGVBQWUsWUFBWSxHQUFHLE1BQU0sa0JBQWtCO0FBQUEsVUFDOUUsZUFBZSxDQUFDLGtCQUFrQjtBQUFBLFFBQ25DLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxXQUFXLEtBQUssU0FBUyxnQkFBZ0I7QUFDeEMsVUFBSSxjQUFjLFNBQVMsbUJBQW1CO0FBQzdDLGNBQU0sYUFBYSxLQUFLLFNBQVMsWUFBWTtBQUM3QyxjQUFNLGVBQWUsS0FBSyx1QkFBdUIsMEJBQTBCLG1CQUFtQixLQUFLLG9CQUFvQixDQUFDLE1BQU07QUFDOUgsY0FBTSxlQUFlLHdCQUF3QixVQUFVLEdBQUcsWUFBWSxJQUFJLEtBQUssSUFBSSxTQUFTLENBQUM7QUFDN0YsY0FBTSxTQUFTLHFCQUFxQixhQUFhLFNBQVMsSUFBSSxlQUFlLFlBQVksQ0FBQztBQUUxRixlQUFPLE9BQU8sbUJBQW1CLENBQUM7QUFDbEMsZUFBTyxLQUFLO0FBQUEsVUFDWCxTQUFTLEVBQUUsR0FBRyxjQUFjLFNBQVMsT0FBTztBQUFBLFVBQzVDLGVBQWUsQ0FBQyxHQUFHLGNBQWMsZUFBZSxrQkFBa0I7QUFBQSxRQUNuRSxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsV0FBVyxLQUFLLFNBQVMsaUJBQWlCO0FBQ3pDO0FBQUEsSUFDRCxPQUFPO0FBQ04sYUFBTyxLQUFLLEVBQUUsU0FBUyxNQUFNLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0FBQUEsSUFDbkU7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FBRU8sU0FBUywrQkFBK0IsVUFBNEY7QUFDMUksU0FBTyx5Q0FBeUMsUUFBUSxFQUFFLElBQUksV0FBUyxNQUFNLE9BQU87QUFDckY7QUFFQSxNQUFNLG9CQUFvQixJQUFJLE9BQU8saUJBQWlCLGFBQWEsYUFBYTtBQVFoRixTQUFTLGlCQUFpQixNQUF1QjtBQUNoRCxTQUFPLGtCQUFrQixLQUFLLElBQUk7QUFDbkM7QUFPTyxTQUFTLG9CQUFvQixNQUF1QjtBQUMxRCxRQUFNLFFBQVEsS0FBSyxNQUFNLElBQUk7QUFDN0IsTUFBSSxnQkFBZ0I7QUFDcEIsTUFBSSxZQUFZO0FBQ2hCLE1BQUksY0FBYztBQUNsQixRQUFNLGdCQUEwQixDQUFDO0FBRWpDLGFBQVcsUUFBUSxPQUFPO0FBQ3pCLFVBQU0sVUFBVSxLQUFLLFVBQVU7QUFFL0IsUUFBSSxlQUFlO0FBRWxCLFlBQU0sY0FBYyxpQkFBaUIsU0FBUyxTQUFTO0FBQ3ZELFVBQUksZUFBZSxlQUFlLFFBQVEsVUFBVSxXQUFXLEVBQUUsS0FBSyxNQUFNLElBQUk7QUFDL0Usd0JBQWdCO0FBQ2hCLHNCQUFjLFNBQVM7QUFBQSxNQUN4QjtBQUNBO0FBQUEsSUFDRDtBQUdBLFVBQU0sWUFBWSxRQUFRLENBQUM7QUFDM0IsUUFBSSxjQUFjLE9BQU8sY0FBYyxLQUFLO0FBQzNDLFlBQU0sYUFBYSxpQkFBaUIsU0FBUyxTQUFTO0FBRXRELFVBQUksY0FBYyxNQUFNLGNBQWMsT0FBTyxDQUFDLFFBQVEsVUFBVSxVQUFVLEVBQUUsU0FBUyxHQUFHLElBQUk7QUFDM0Ysd0JBQWdCO0FBQ2hCLG9CQUFZO0FBQ1osc0JBQWM7QUFDZCxzQkFBYyxTQUFTO0FBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxrQkFBYyxLQUFLLElBQUk7QUFBQSxFQUN4QjtBQUVBLFNBQU8saUJBQWlCLHNCQUFzQixjQUFjLEtBQUssSUFBSSxDQUFDO0FBQ3ZFO0FBRUEsU0FBUyxpQkFBaUIsTUFBYyxNQUFzQjtBQUM3RCxNQUFJLFFBQVE7QUFDWixTQUFPLFFBQVEsS0FBSyxVQUFVLEtBQUssS0FBSyxNQUFNLE1BQU07QUFDbkQ7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBT0EsU0FBUyxzQkFBc0IsTUFBdUI7QUFDckQsTUFBSSxJQUFJO0FBQ1IsU0FBTyxJQUFJLEtBQUssUUFBUTtBQUN2QixRQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUs7QUFDcEI7QUFDQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQVUsaUJBQWlCLEtBQUssVUFBVSxDQUFDLEdBQUcsR0FBRztBQUN2RCxTQUFLO0FBR0wsUUFBSSxRQUFRO0FBQ1osV0FBTyxJQUFJLEtBQUssUUFBUTtBQUN2QixVQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUs7QUFDcEI7QUFDQTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFdBQVcsaUJBQWlCLEtBQUssVUFBVSxDQUFDLEdBQUcsR0FBRztBQUN4RCxXQUFLO0FBQ0wsVUFBSSxhQUFhLFNBQVM7QUFDekIsZ0JBQVE7QUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFPTyxTQUFTLDZCQUE2QixNQUFvSDtBQUNoSyxRQUFNLFFBQVEseUdBQXlHLEtBQUssSUFBSTtBQUNoSSxNQUFJLE9BQU87QUFDVixVQUFNLENBQUMsS0FBSyxRQUFRLEVBQUUsbUJBQW1CLFNBQVMsSUFBSTtBQUN0RCxRQUFJLFdBQVc7QUFDZCxVQUFJO0FBQ0osVUFBSTtBQUNILGlCQUFTLElBQUksTUFBTSxTQUFTO0FBQUEsTUFDN0IsUUFBUTtBQUNQLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxvQkFBb0IsS0FBSyxVQUFVLEdBQUcsTUFBTSxLQUFLLElBQUksS0FBSyxVQUFVLE1BQU0sUUFBUSxJQUFJLE1BQU07QUFDbEcsVUFBSTtBQUNKLFVBQUksbUJBQW1CO0FBQ3RCLFlBQUk7QUFDSCxpQ0FBdUIsbUJBQW1CLGlCQUFpQjtBQUFBLFFBQzVELFFBQVE7QUFDUCxpQ0FBdUI7QUFBQSxRQUN4QjtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEVBQUUsS0FBSyxRQUFRLG1CQUFtQixRQUFRLENBQUMsQ0FBQyxRQUFRLHFCQUFxQjtBQUFBLElBQ2pGO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsb0NBQW9DLE1BQWtDO0FBQ3JGLFFBQU0sUUFBUSw4REFBOEQsS0FBSyxJQUFJO0FBQ3JGLE1BQUksT0FBTztBQUNWLFFBQUk7QUFDSCxhQUFPLG1CQUFtQixNQUFNLENBQUMsQ0FBQztBQUFBLElBQ25DLFFBQVE7QUFDUCxhQUFPLE1BQU0sQ0FBQztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRU8sU0FBUyxtQkFBbUIsTUFBdUI7QUFDekQsU0FBTyxLQUFLLFNBQVMsdUJBQXVCO0FBQzdDO0FBRU8sU0FBUyx1QkFBdUIsTUFBdUI7QUFDN0QsU0FBTyxLQUFLLFNBQVMsOEJBQThCO0FBQ3BEO0FBRU8sU0FBUywrQkFBK0IsTUFBOEU7QUFDNUgsUUFBTSxrQkFBNEMsQ0FBQztBQUNuRCxNQUFJLFVBQVU7QUFDZCxNQUFJO0FBQ0osVUFBUSxRQUFRLGtFQUFrRSxLQUFLLE9BQU8sT0FBTyxNQUFNO0FBQzFHLFVBQU0sQ0FBQyxNQUFNLFNBQVMsT0FBTyxJQUFJO0FBQ2pDLFVBQU0sUUFBUSxNQUFNO0FBQ3BCLFVBQU0sYUFBYSxRQUFRLFVBQVUsR0FBRyxLQUFLO0FBQzdDLFVBQU0sY0FBYyxXQUFXLE1BQU0sSUFBSSxFQUFFLFNBQVM7QUFDcEQsVUFBTSxjQUFjLFFBQVEsTUFBTSxJQUFJLEVBQUUsU0FBUztBQUVqRCxVQUFNLHFCQUFxQixXQUFXLFlBQVksSUFBSTtBQUN0RCxVQUFNLGNBQWMsU0FBUyxxQkFBcUIsS0FBSztBQUN2RCxVQUFNLHlCQUF5QixhQUFhLFNBQVMsWUFBWSxJQUFJO0FBQ3JFLFVBQU0sWUFBWSxRQUFRLFFBQVEsVUFBVSx3QkFBd0IsS0FBSztBQUV6RSxRQUFJO0FBQ0gsWUFBTSxjQUFnRCxLQUFLLE1BQU0sbUJBQW1CLE9BQU8sQ0FBQztBQUM1RixrQkFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLFlBQVksTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFFBQ3BFO0FBQUEsUUFBTztBQUFBLFFBQWEsT0FBTyxFQUFFLGlCQUFpQixjQUFjLEdBQUcsYUFBYSxlQUFlLGNBQWMsY0FBYyxHQUFHLFVBQVU7QUFBQSxNQUNySSxDQUFDLENBQUM7QUFBQSxJQUNILFNBQVMsS0FBSztBQUFBLElBRWQ7QUFDQSxjQUFVLFFBQVEsVUFBVSxHQUFHLEtBQUssSUFBSSxVQUFVLFFBQVEsVUFBVSxRQUFRLEtBQUssTUFBTTtBQUFBLEVBQ3hGO0FBRUEsU0FBTyxFQUFFLFNBQVMsZ0JBQWdCO0FBQ25DOyIsCiAgIm5hbWVzIjogW10KfQo=
