import { URI } from "../../../base/common/uri.js";
function createNodeTrees(nodes) {
  if (nodes.length === 0) {
    return [];
  }
  const nodeLookup = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    nodeLookup.set(node.nodeId, node);
  }
  function getNonIgnoredDescendants(nodeId) {
    const node = nodeLookup.get(nodeId);
    if (!node || !node.childIds) {
      return [];
    }
    const result = [];
    for (const childId of node.childIds) {
      const childNode = nodeLookup.get(childId);
      if (!childNode) {
        continue;
      }
      if (childNode.ignored) {
        result.push(...getNonIgnoredDescendants(childId));
      } else {
        result.push(childId);
      }
    }
    return result;
  }
  const nodeMap = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (!node.ignored) {
      nodeMap.set(node.nodeId, { node, children: [], parent: null });
    }
  }
  for (const node of nodes) {
    if (node.ignored) {
      continue;
    }
    const treeNode = nodeMap.get(node.nodeId);
    if (node.childIds) {
      for (const childId of node.childIds) {
        const childNode = nodeLookup.get(childId);
        if (!childNode) {
          continue;
        }
        if (childNode.ignored) {
          const nonIgnoredDescendants = getNonIgnoredDescendants(childId);
          for (const descendantId of nonIgnoredDescendants) {
            const descendantTreeNode = nodeMap.get(descendantId);
            if (descendantTreeNode) {
              descendantTreeNode.parent = treeNode;
              treeNode.children.push(descendantTreeNode);
            }
          }
        } else {
          const childTreeNode = nodeMap.get(childId);
          if (childTreeNode) {
            childTreeNode.parent = treeNode;
            treeNode.children.push(childTreeNode);
          }
        }
      }
    }
  }
  const roots = [];
  for (const node of nodeMap.values()) {
    if (!node.parent) {
      roots.push(node);
    }
  }
  return roots;
}
const LINE_MAX_LENGTH = 80;
function convertAXTreeToMarkdown(uri, axNodes) {
  const trees = createNodeTrees(axNodes);
  if (trees.length === 0) {
    return "";
  }
  const allMainContent = [];
  const allNavLinks = [];
  for (const tree of trees) {
    const mainContent = extractMainContent(uri, tree);
    const navLinks = collectNavigationLinks(tree);
    if (mainContent.trim().length > 0) {
      allMainContent.push(mainContent);
    }
    allNavLinks.push(...navLinks);
  }
  const combinedMainContent = allMainContent.join("\n\n");
  return combinedMainContent + (allNavLinks.length > 0 ? "\n\n## Additional Links\n" + allNavLinks.join("\n") : "");
}
function extractMainContent(uri, tree) {
  const contentBuffer = [];
  processNode(uri, tree, contentBuffer, 0, true);
  return contentBuffer.join("");
}
function processNode(uri, node, buffer, depth, allowWrap) {
  const role = getNodeRole(node.node);
  switch (role) {
    case "navigation":
      return;
    // Skip navigation nodes
    case "heading":
      processHeadingNode(uri, node, buffer, depth);
      return;
    case "paragraph":
      processParagraphNode(uri, node, buffer, depth, allowWrap);
      return;
    case "list":
      buffer.push("\n");
      for (const descChild of node.children) {
        processNode(uri, descChild, buffer, depth + 1, true);
      }
      buffer.push("\n");
      return;
    case "ListMarker":
      buffer.push(getNodeText(node.node, allowWrap));
      return;
    case "listitem": {
      const tempBuffer = [];
      for (const descChild of node.children) {
        processNode(uri, descChild, tempBuffer, depth + 1, true);
      }
      const indent = getLevel(node.node) > 1 ? " ".repeat(getLevel(node.node)) : "";
      buffer.push(`${indent}${tempBuffer.join("").trim()}
`);
      return;
    }
    case "link":
      if (!isNavigationLink(node)) {
        const linkText = getNodeText(node.node, allowWrap);
        const url = getLinkUrl(node.node);
        if (!isSameUriIgnoringQueryAndFragment(uri, node.node)) {
          buffer.push(`[${linkText}](${url})`);
        } else {
          buffer.push(linkText);
        }
      }
      return;
    case "StaticText": {
      const staticText = getNodeText(node.node, allowWrap);
      if (staticText) {
        buffer.push(staticText);
      }
      break;
    }
    case "image": {
      const altText = getNodeText(node.node, allowWrap) || "Image";
      const imageUrl = getImageUrl(node.node);
      if (imageUrl) {
        buffer.push(`![${altText}](${imageUrl})

`);
      } else {
        buffer.push(`[Image: ${altText}]

`);
      }
      break;
    }
    case "DescriptionList":
      processDescriptionListNode(uri, node, buffer, depth);
      return;
    case "blockquote":
      buffer.push("> " + getNodeText(node.node, allowWrap).replace(/\n/g, "\n> ") + "\n\n");
      break;
    // TODO: Is this the correct way to handle the generic role?
    case "generic":
      buffer.push(" ");
      break;
    case "code": {
      processCodeNode(uri, node, buffer, depth);
      return;
    }
    case "pre":
      buffer.push("```\n" + getNodeText(node.node, false) + "\n```\n\n");
      break;
    case "table":
      processTableNode(node, buffer);
      return;
  }
  for (const child of node.children) {
    processNode(uri, child, buffer, depth + 1, allowWrap);
  }
}
function getNodeRole(node) {
  return node.role?.value || "";
}
function getNodeText(node, allowWrap) {
  const text = node.name?.value || node.value?.value || "";
  if (!allowWrap) {
    return text;
  }
  if (text.length <= LINE_MAX_LENGTH) {
    return text;
  }
  const chars = text.split("");
  let lastSpaceIndex = -1;
  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === " ") {
      lastSpaceIndex = i;
    }
    if (i % LINE_MAX_LENGTH === 0 && lastSpaceIndex !== -1) {
      chars[lastSpaceIndex] = "\n";
      lastSpaceIndex = i;
    }
  }
  return chars.join("");
}
function getLevel(node) {
  const levelProp = node.properties?.find((p) => p.name === "level");
  return levelProp ? Math.min(Number(levelProp.value.value) || 1, 6) : 1;
}
function getLinkUrl(node) {
  const urlProp = node.properties?.find((p) => p.name === "url");
  return urlProp?.value.value || "#";
}
function getImageUrl(node) {
  const urlProp = node.properties?.find((p) => p.name === "url");
  return urlProp?.value.value || null;
}
function isNavigationLink(node) {
  let current = node;
  while (current) {
    const role = getNodeRole(current.node);
    if (["navigation", "menu", "menubar"].includes(role)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
function isSameUriIgnoringQueryAndFragment(uri, node) {
  const link = getLinkUrl(node);
  try {
    const parsed = URI.parse(link);
    return parsed.scheme === uri.scheme && parsed.authority === uri.authority && parsed.path === uri.path;
  } catch (e) {
    return false;
  }
}
function processParagraphNode(uri, node, buffer, depth, allowWrap) {
  buffer.push("\n");
  for (const child of node.children) {
    processNode(uri, child, buffer, depth + 1, allowWrap);
  }
  buffer.push("\n\n");
}
function processHeadingNode(uri, node, buffer, depth) {
  buffer.push("\n");
  const level = getLevel(node.node);
  buffer.push(`${"#".repeat(level)} `);
  for (const child of node.children) {
    if (getNodeRole(child.node) === "StaticText") {
      buffer.push(getNodeText(child.node, false));
    } else {
      processNode(uri, child, buffer, depth + 1, false);
    }
  }
  buffer.push("\n\n");
}
function processDescriptionListNode(uri, node, buffer, depth) {
  buffer.push("\n");
  for (const child of node.children) {
    if (getNodeRole(child.node) === "term") {
      buffer.push("- **");
      for (const termChild of child.children) {
        processNode(uri, termChild, buffer, depth + 1, true);
      }
      buffer.push("** ");
    } else if (getNodeRole(child.node) === "definition") {
      for (const descChild of child.children) {
        processNode(uri, descChild, buffer, depth + 1, true);
      }
      buffer.push("\n");
    }
  }
  buffer.push("\n");
}
function isTableCell(role) {
  return role === "cell" || role === "gridcell" || role === "columnheader" || role === "rowheader";
}
function processTableNode(node, buffer) {
  buffer.push("\n");
  const rows = node.children.filter((child) => getNodeRole(child.node).includes("row"));
  if (rows.length > 0) {
    const headerCells = rows[0].children.filter((cell) => isTableCell(getNodeRole(cell.node)));
    const headerContent = headerCells.map((cell) => getNodeText(cell.node, false) || " ");
    buffer.push("| " + headerContent.join(" | ") + " |\n");
    buffer.push("| " + headerCells.map(() => "---").join(" | ") + " |\n");
    for (let i = 1; i < rows.length; i++) {
      const dataCells = rows[i].children.filter((cell) => isTableCell(getNodeRole(cell.node)));
      const rowContent = dataCells.map((cell) => getNodeText(cell.node, false) || " ");
      buffer.push("| " + rowContent.join(" | ") + " |\n");
    }
  }
  buffer.push("\n");
}
function processCodeNode(uri, node, buffer, depth) {
  const tempBuffer = [];
  for (const child of node.children) {
    processNode(uri, child, tempBuffer, depth + 1, false);
  }
  const isCodeblock = tempBuffer.some((text) => text.includes("\n"));
  if (isCodeblock) {
    buffer.push("\n```\n");
    buffer.push(tempBuffer.join(""));
    buffer.push("\n```\n");
  } else {
    buffer.push("`");
    let characterCount = 0;
    for (const tempItem of tempBuffer) {
      characterCount += tempItem.length;
      if (characterCount > LINE_MAX_LENGTH) {
        buffer.push("\n");
        characterCount = 0;
      }
      buffer.push(tempItem);
      buffer.push("`");
    }
  }
}
function collectNavigationLinks(tree) {
  const links = [];
  collectLinks(tree, links);
  return links;
}
function collectLinks(node, links) {
  const role = getNodeRole(node.node);
  if (role === "link" && isNavigationLink(node)) {
    const linkText = getNodeText(node.node, true);
    const url = getLinkUrl(node.node);
    const description = node.node.description?.value || "";
    links.push(`- [${linkText}](${url})${description ? " - " + description : ""}`);
  }
  for (const child of node.children) {
    collectLinks(child, links);
  }
}
export {
  convertAXTreeToMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2ViQ29udGVudEV4dHJhY3RvclxcZWxlY3Ryb24tbWFpblxcY2RwQWNjZXNzaWJpbGl0eURvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vI3JlZ2lvbiBUeXBlc1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFYVmFsdWUge1xuXHR0eXBlOiBBWFZhbHVlVHlwZTtcblx0dmFsdWU/OiB1bmtub3duO1xuXHRyZWxhdGVkTm9kZXM/OiBBWE5vZGVbXTtcblx0c291cmNlcz86IEFYVmFsdWVTb3VyY2VbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBWFZhbHVlU291cmNlIHtcblx0dHlwZTogQVhWYWx1ZVNvdXJjZVR5cGU7XG5cdHZhbHVlPzogQVhWYWx1ZTtcblx0YXR0cmlidXRlPzogc3RyaW5nO1xuXHRhdHRyaWJ1dGVWYWx1ZT86IHN0cmluZztcblx0c3VwZXJzZWRlZD86IGJvb2xlYW47XG5cdG5hdGl2ZVNvdXJjZT86IEFYVmFsdWVOYXRpdmVTb3VyY2VUeXBlO1xuXHRuYXRpdmVTb3VyY2VWYWx1ZT86IHN0cmluZztcblx0aW52YWxpZD86IGJvb2xlYW47XG5cdGludmFsaWRSZWFzb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQVhOb2RlIHtcblx0bm9kZUlkOiBzdHJpbmc7XG5cdGlnbm9yZWQ6IGJvb2xlYW47XG5cdGlnbm9yZWRSZWFzb25zPzogQVhQcm9wZXJ0eVtdO1xuXHRyb2xlPzogQVhWYWx1ZTtcblx0Y2hyb21lUm9sZT86IEFYVmFsdWU7XG5cdG5hbWU/OiBBWFZhbHVlO1xuXHRkZXNjcmlwdGlvbj86IEFYVmFsdWU7XG5cdHZhbHVlPzogQVhWYWx1ZTtcblx0cHJvcGVydGllcz86IEFYUHJvcGVydHlbXTtcblx0Y2hpbGRJZHM/OiBzdHJpbmdbXTtcblx0YmFja2VuZERPTU5vZGVJZD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBWFByb3BlcnR5IHtcblx0bmFtZTogQVhQcm9wZXJ0eU5hbWU7XG5cdHZhbHVlOiBBWFZhbHVlO1xufVxuXG5leHBvcnQgdHlwZSBBWFZhbHVlVHlwZSA9ICdib29sZWFuJyB8ICd0cmlzdGF0ZScgfCAnYm9vbGVhbk9yVW5kZWZpbmVkJyB8ICdpZHJlZicgfCAnaWRyZWZMaXN0JyB8ICdpbnRlZ2VyJyB8ICdub2RlJyB8ICdub2RlTGlzdCcgfCAnbnVtYmVyJyB8ICdzdHJpbmcnIHwgJ2NvbXB1dGVkU3RyaW5nJyB8ICd0b2tlbicgfCAndG9rZW5MaXN0JyB8ICdkb21SZWxhdGlvbicgfCAncm9sZScgfCAnaW50ZXJuYWxSb2xlJyB8ICd2YWx1ZVVuZGVmaW5lZCc7XG5cbmV4cG9ydCB0eXBlIEFYVmFsdWVTb3VyY2VUeXBlID0gJ2F0dHJpYnV0ZScgfCAnaW1wbGljaXQnIHwgJ3N0eWxlJyB8ICdjb250ZW50cycgfCAncGxhY2Vob2xkZXInIHwgJ3JlbGF0ZWRFbGVtZW50JztcblxuZXhwb3J0IHR5cGUgQVhWYWx1ZU5hdGl2ZVNvdXJjZVR5cGUgPSAnZGVzY3JpcHRpb24nIHwgJ2ZpZ2NhcHRpb24nIHwgJ2xhYmVsJyB8ICdsYWJlbGZvcicgfCAnbGFiZWx3cmFwcGVkJyB8ICdsZWdlbmQnIHwgJ3J1Ynlhbm5vdGF0aW9uJyB8ICd0YWJsZWNhcHRpb24nIHwgJ3RpdGxlJyB8ICdvdGhlcic7XG5cbmV4cG9ydCB0eXBlIEFYUHJvcGVydHlOYW1lID0gJ3VybCcgfCAnYnVzeScgfCAnZGlzYWJsZWQnIHwgJ2VkaXRhYmxlJyB8ICdmb2N1c2FibGUnIHwgJ2ZvY3VzZWQnIHwgJ2hpZGRlbicgfCAnaGlkZGVuUm9vdCcgfCAnaW52YWxpZCcgfCAna2V5c2hvcnRjdXRzJyB8ICdzZXR0YWJsZScgfCAncm9sZWRlc2NyaXB0aW9uJyB8ICdsaXZlJyB8ICdhdG9taWMnIHwgJ3JlbGV2YW50JyB8ICdyb290JyB8ICdhdXRvY29tcGxldGUnIHwgJ2hhc1BvcHVwJyB8ICdsZXZlbCcgfCAnbXVsdGlzZWxlY3RhYmxlJyB8ICdvcmllbnRhdGlvbicgfCAnbXVsdGlsaW5lJyB8ICdyZWFkb25seScgfCAncmVxdWlyZWQnIHwgJ3ZhbHVlbWluJyB8ICd2YWx1ZW1heCcgfCAndmFsdWV0ZXh0JyB8ICdjaGVja2VkJyB8ICdleHBhbmRlZCcgfCAncHJlc3NlZCcgfCAnc2VsZWN0ZWQnIHwgJ2FjdGl2ZWRlc2NlbmRhbnQnIHwgJ2NvbnRyb2xzJyB8ICdkZXNjcmliZWRieScgfCAnZGV0YWlscycgfCAnZXJyb3JtZXNzYWdlJyB8ICdmbG93dG8nIHwgJ2xhYmVsbGVkYnknIHwgJ293bnMnO1xuXG4vLyNlbmRyZWdpb25cblxuaW50ZXJmYWNlIEFYTm9kZVRyZWUge1xuXHRyZWFkb25seSBub2RlOiBBWE5vZGU7XG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBBWE5vZGVUcmVlW107XG5cdHBhcmVudDogQVhOb2RlVHJlZSB8IG51bGw7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZvcmVzdCBvZiBub2RlIHRyZWVzIGZyb20gdGhlIGdpdmVuIEFYTm9kZXMuXG4gKiBXaGVuIG5vZGVzIGNvbWUgZnJvbSBtdWx0aXBsZSBmcmFtZXMgKGUuZy4sIG1haW4gZnJhbWUgKyBpZnJhbWVzKSxcbiAqIGVhY2ggZnJhbWUgaGFzIGl0cyBvd24gUm9vdFdlYkFyZWEsIHJlc3VsdGluZyBpbiBtdWx0aXBsZSB0cmVlcy5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTm9kZVRyZWVzKG5vZGVzOiBBWE5vZGVbXSk6IEFYTm9kZVRyZWVbXSB7XG5cdGlmIChub2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHQvLyBDcmVhdGUgYSBtYXAgb2Ygbm9kZSBJRHMgdG8gdGhlaXIgY29ycmVzcG9uZGluZyBub2RlcyBmb3IgcXVpY2sgbG9va3VwXG5cdGNvbnN0IG5vZGVMb29rdXAgPSBuZXcgTWFwPHN0cmluZywgQVhOb2RlPigpO1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRub2RlTG9va3VwLnNldChub2RlLm5vZGVJZCwgbm9kZSk7XG5cdH1cblxuXHQvLyBIZWxwZXIgZnVuY3Rpb24gdG8gZ2V0IGFsbCBub24taWdub3JlZCBkZXNjZW5kYW50cyBvZiBhIG5vZGVcblx0ZnVuY3Rpb24gZ2V0Tm9uSWdub3JlZERlc2NlbmRhbnRzKG5vZGVJZDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IG5vZGUgPSBub2RlTG9va3VwLmdldChub2RlSWQpO1xuXHRcdGlmICghbm9kZSB8fCAhbm9kZS5jaGlsZElkcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkSWQgb2Ygbm9kZS5jaGlsZElkcykge1xuXHRcdFx0Y29uc3QgY2hpbGROb2RlID0gbm9kZUxvb2t1cC5nZXQoY2hpbGRJZCk7XG5cdFx0XHRpZiAoIWNoaWxkTm9kZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoaWxkTm9kZS5pZ25vcmVkKSB7XG5cdFx0XHRcdC8vIElmIGNoaWxkIGlzIGlnbm9yZWQsIGFkZCBpdHMgbm9uLWlnbm9yZWQgZGVzY2VuZGFudHMgaW5zdGVhZFxuXHRcdFx0XHRyZXN1bHQucHVzaCguLi5nZXROb25JZ25vcmVkRGVzY2VuZGFudHMoY2hpbGRJZCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gT3RoZXJ3aXNlLCBhZGQgdGhlIGNoaWxkIGl0c2VsZlxuXHRcdFx0XHRyZXN1bHQucHVzaChjaGlsZElkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vIENyZWF0ZSB0cmVlIG5vZGVzIG9ubHkgZm9yIG5vbi1pZ25vcmVkIG5vZGVzXG5cdGNvbnN0IG5vZGVNYXAgPSBuZXcgTWFwPHN0cmluZywgQVhOb2RlVHJlZT4oKTtcblx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0aWYgKCFub2RlLmlnbm9yZWQpIHtcblx0XHRcdG5vZGVNYXAuc2V0KG5vZGUubm9kZUlkLCB7IG5vZGUsIGNoaWxkcmVuOiBbXSwgcGFyZW50OiBudWxsIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vIEVzdGFibGlzaCBwYXJlbnQtY2hpbGQgcmVsYXRpb25zaGlwcywgYnlwYXNzaW5nIGlnbm9yZWQgbm9kZXNcblx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0aWYgKG5vZGUuaWdub3JlZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZU5vZGUgPSBub2RlTWFwLmdldChub2RlLm5vZGVJZCkhO1xuXHRcdGlmIChub2RlLmNoaWxkSWRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkSWQgb2Ygbm9kZS5jaGlsZElkcykge1xuXHRcdFx0XHRjb25zdCBjaGlsZE5vZGUgPSBub2RlTG9va3VwLmdldChjaGlsZElkKTtcblx0XHRcdFx0aWYgKCFjaGlsZE5vZGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaGlsZE5vZGUuaWdub3JlZCkge1xuXHRcdFx0XHRcdC8vIElmIGNoaWxkIGlzIGlnbm9yZWQsIGNvbm5lY3QgaXRzIG5vbi1pZ25vcmVkIGRlc2NlbmRhbnRzIHRvIHRoaXMgbm9kZVxuXHRcdFx0XHRcdGNvbnN0IG5vbklnbm9yZWREZXNjZW5kYW50cyA9IGdldE5vbklnbm9yZWREZXNjZW5kYW50cyhjaGlsZElkKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRlc2NlbmRhbnRJZCBvZiBub25JZ25vcmVkRGVzY2VuZGFudHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRlc2NlbmRhbnRUcmVlTm9kZSA9IG5vZGVNYXAuZ2V0KGRlc2NlbmRhbnRJZCk7XG5cdFx0XHRcdFx0XHRpZiAoZGVzY2VuZGFudFRyZWVOb2RlKSB7XG5cdFx0XHRcdFx0XHRcdGRlc2NlbmRhbnRUcmVlTm9kZS5wYXJlbnQgPSB0cmVlTm9kZTtcblx0XHRcdFx0XHRcdFx0dHJlZU5vZGUuY2hpbGRyZW4ucHVzaChkZXNjZW5kYW50VHJlZU5vZGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBOb3JtYWwgY2FzZTogYWRkIG5vbi1pZ25vcmVkIGNoaWxkIGRpcmVjdGx5XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRUcmVlTm9kZSA9IG5vZGVNYXAuZ2V0KGNoaWxkSWQpO1xuXHRcdFx0XHRcdGlmIChjaGlsZFRyZWVOb2RlKSB7XG5cdFx0XHRcdFx0XHRjaGlsZFRyZWVOb2RlLnBhcmVudCA9IHRyZWVOb2RlO1xuXHRcdFx0XHRcdFx0dHJlZU5vZGUuY2hpbGRyZW4ucHVzaChjaGlsZFRyZWVOb2RlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBGaW5kIGFsbCByb290IG5vZGVzIChub2RlcyB3aXRob3V0IGEgcGFyZW50KVxuXHQvLyBXaGVuIG5vZGVzIGNvbWUgZnJvbSBtdWx0aXBsZSBmcmFtZXMsIGVhY2ggZnJhbWUgaGFzIGl0cyBvd24gcm9vdFxuXHRjb25zdCByb290czogQVhOb2RlVHJlZVtdID0gW107XG5cdGZvciAoY29uc3Qgbm9kZSBvZiBub2RlTWFwLnZhbHVlcygpKSB7XG5cdFx0aWYgKCFub2RlLnBhcmVudCkge1xuXHRcdFx0cm9vdHMucHVzaChub2RlKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcm9vdHM7XG59XG5cbi8qKlxuICogV2hlbiBwb3NzaWJsZSwgd2Ugd2lsbCBtYWtlIHN1cmUgbGluZXMgYXJlIG5vIGxvbmdlciB0aGFuIDgwLiBUaGlzIGlzIHRvIGhlbHBcbiAqIGNlcnRhaW4gcGllY2VzIG9mIHNvZnR3YXJlIHRoYXQgY2FuJ3QgaGFuZGxlIGxvbmcgbGluZXMuXG4gKi9cbmNvbnN0IExJTkVfTUFYX0xFTkdUSCA9IDgwO1xuXG4vKipcbiAqIENvbnZlcnRzIGFuIGFjY2Vzc2liaWxpdHkgdHJlZSByZXByZXNlbnRlZCBieSBBWE5vZGUgb2JqZWN0cyBpbnRvIGEgbWFya2Rvd24gc3RyaW5nLlxuICogSGFuZGxlcyBtdWx0aXBsZSByb290IG5vZGVzIChlLmcuLCBmcm9tIG1haW4gZnJhbWUgKyBpZnJhbWVzKSBieSBwcm9jZXNzaW5nIGVhY2ggdHJlZVxuICogYW5kIGNvbWJpbmluZyB0aGUgcmVzdWx0cy5cbiAqXG4gKiBAcGFyYW0gdXJpIFRoZSBVUkkgb2YgdGhlIGRvY3VtZW50XG4gKiBAcGFyYW0gYXhOb2RlcyBUaGUgYXJyYXkgb2YgQVhOb2RlIG9iamVjdHMgcmVwcmVzZW50aW5nIHRoZSBhY2Nlc3NpYmlsaXR5IHRyZWVcbiAqIEByZXR1cm5zIEEgbWFya2Rvd24gcmVwcmVzZW50YXRpb24gb2YgdGhlIGFjY2Vzc2liaWxpdHkgdHJlZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29udmVydEFYVHJlZVRvTWFya2Rvd24odXJpOiBVUkksIGF4Tm9kZXM6IEFYTm9kZVtdKTogc3RyaW5nIHtcblx0Y29uc3QgdHJlZXMgPSBjcmVhdGVOb2RlVHJlZXMoYXhOb2Rlcyk7XG5cdGlmICh0cmVlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gJyc7IC8vIFJldHVybiBlbXB0eSBzdHJpbmcgZm9yIGVtcHR5IHRyZWVcblx0fVxuXG5cdC8vIFByb2Nlc3MgZWFjaCB0cmVlIGFuZCBjb2xsZWN0IG1haW4gY29udGVudCBhbmQgbmF2aWdhdGlvbiBsaW5rc1xuXHRjb25zdCBhbGxNYWluQ29udGVudDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgYWxsTmF2TGlua3M6IHN0cmluZ1tdID0gW107XG5cblx0Zm9yIChjb25zdCB0cmVlIG9mIHRyZWVzKSB7XG5cdFx0Y29uc3QgbWFpbkNvbnRlbnQgPSBleHRyYWN0TWFpbkNvbnRlbnQodXJpLCB0cmVlKTtcblx0XHRjb25zdCBuYXZMaW5rcyA9IGNvbGxlY3ROYXZpZ2F0aW9uTGlua3ModHJlZSk7XG5cblx0XHRpZiAobWFpbkNvbnRlbnQudHJpbSgpLmxlbmd0aCA+IDApIHtcblx0XHRcdGFsbE1haW5Db250ZW50LnB1c2gobWFpbkNvbnRlbnQpO1xuXHRcdH1cblx0XHRhbGxOYXZMaW5rcy5wdXNoKC4uLm5hdkxpbmtzKTtcblx0fVxuXG5cdC8vIENvbWJpbmUgYWxsIG1haW4gY29udGVudCBmcm9tIGFsbCB0cmVlc1xuXHRjb25zdCBjb21iaW5lZE1haW5Db250ZW50ID0gYWxsTWFpbkNvbnRlbnQuam9pbignXFxuXFxuJyk7XG5cblx0Ly8gQ29tYmluZSBtYWluIGNvbnRlbnQgYW5kIG5hdmlnYXRpb24gbGlua3Ncblx0cmV0dXJuIGNvbWJpbmVkTWFpbkNvbnRlbnQgKyAoYWxsTmF2TGlua3MubGVuZ3RoID4gMCA/ICdcXG5cXG4jIyBBZGRpdGlvbmFsIExpbmtzXFxuJyArIGFsbE5hdkxpbmtzLmpvaW4oJ1xcbicpIDogJycpO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0TWFpbkNvbnRlbnQodXJpOiBVUkksIHRyZWU6IEFYTm9kZVRyZWUpOiBzdHJpbmcge1xuXHRjb25zdCBjb250ZW50QnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuXHRwcm9jZXNzTm9kZSh1cmksIHRyZWUsIGNvbnRlbnRCdWZmZXIsIDAsIHRydWUpO1xuXHRyZXR1cm4gY29udGVudEJ1ZmZlci5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc05vZGUodXJpOiBVUkksIG5vZGU6IEFYTm9kZVRyZWUsIGJ1ZmZlcjogc3RyaW5nW10sIGRlcHRoOiBudW1iZXIsIGFsbG93V3JhcDogYm9vbGVhbik6IHZvaWQge1xuXHRjb25zdCByb2xlID0gZ2V0Tm9kZVJvbGUobm9kZS5ub2RlKTtcblxuXHRzd2l0Y2ggKHJvbGUpIHtcblx0XHRjYXNlICduYXZpZ2F0aW9uJzpcblx0XHRcdHJldHVybjsgLy8gU2tpcCBuYXZpZ2F0aW9uIG5vZGVzXG5cblx0XHRjYXNlICdoZWFkaW5nJzpcblx0XHRcdHByb2Nlc3NIZWFkaW5nTm9kZSh1cmksIG5vZGUsIGJ1ZmZlciwgZGVwdGgpO1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Y2FzZSAncGFyYWdyYXBoJzpcblx0XHRcdHByb2Nlc3NQYXJhZ3JhcGhOb2RlKHVyaSwgbm9kZSwgYnVmZmVyLCBkZXB0aCwgYWxsb3dXcmFwKTtcblx0XHRcdHJldHVybjtcblxuXHRcdGNhc2UgJ2xpc3QnOlxuXHRcdFx0YnVmZmVyLnB1c2goJ1xcbicpO1xuXHRcdFx0Zm9yIChjb25zdCBkZXNjQ2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRwcm9jZXNzTm9kZSh1cmksIGRlc2NDaGlsZCwgYnVmZmVyLCBkZXB0aCArIDEsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0YnVmZmVyLnB1c2goJ1xcbicpO1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Y2FzZSAnTGlzdE1hcmtlcic6XG5cdFx0XHQvLyBUT0RPOiBTaG91bGQgd2Ugbm9ybWFsaXplIHRoZXNlIExpc3RNYXJrZXJzIHRvIGAtYCBhbmQgbm9ybWFsIGxpc3RzP1xuXHRcdFx0YnVmZmVyLnB1c2goZ2V0Tm9kZVRleHQobm9kZS5ub2RlLCBhbGxvd1dyYXApKTtcblx0XHRcdHJldHVybjtcblxuXHRcdGNhc2UgJ2xpc3RpdGVtJzoge1xuXHRcdFx0Y29uc3QgdGVtcEJ1ZmZlcjogc3RyaW5nW10gPSBbXTtcblx0XHRcdC8vIFByb2Nlc3MgdGhlIGNoaWxkcmVuIG9mIHRoZSBsaXN0IGl0ZW1cblx0XHRcdGZvciAoY29uc3QgZGVzY0NoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0cHJvY2Vzc05vZGUodXJpLCBkZXNjQ2hpbGQsIHRlbXBCdWZmZXIsIGRlcHRoICsgMSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmRlbnQgPSBnZXRMZXZlbChub2RlLm5vZGUpID4gMSA/ICcgJy5yZXBlYXQoZ2V0TGV2ZWwobm9kZS5ub2RlKSkgOiAnJztcblx0XHRcdGJ1ZmZlci5wdXNoKGAke2luZGVudH0ke3RlbXBCdWZmZXIuam9pbignJykudHJpbSgpfVxcbmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNhc2UgJ2xpbmsnOlxuXHRcdFx0aWYgKCFpc05hdmlnYXRpb25MaW5rKG5vZGUpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmtUZXh0ID0gZ2V0Tm9kZVRleHQobm9kZS5ub2RlLCBhbGxvd1dyYXApO1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRMaW5rVXJsKG5vZGUubm9kZSk7XG5cdFx0XHRcdGlmICghaXNTYW1lVXJpSWdub3JpbmdRdWVyeUFuZEZyYWdtZW50KHVyaSwgbm9kZS5ub2RlKSkge1xuXHRcdFx0XHRcdGJ1ZmZlci5wdXNoKGBbJHtsaW5rVGV4dH1dKCR7dXJsfSlgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRidWZmZXIucHVzaChsaW5rVGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHRjYXNlICdTdGF0aWNUZXh0Jzoge1xuXHRcdFx0Y29uc3Qgc3RhdGljVGV4dCA9IGdldE5vZGVUZXh0KG5vZGUubm9kZSwgYWxsb3dXcmFwKTtcblx0XHRcdGlmIChzdGF0aWNUZXh0KSB7XG5cdFx0XHRcdGJ1ZmZlci5wdXNoKHN0YXRpY1RleHQpO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ2ltYWdlJzoge1xuXHRcdFx0Y29uc3QgYWx0VGV4dCA9IGdldE5vZGVUZXh0KG5vZGUubm9kZSwgYWxsb3dXcmFwKSB8fCAnSW1hZ2UnO1xuXHRcdFx0Y29uc3QgaW1hZ2VVcmwgPSBnZXRJbWFnZVVybChub2RlLm5vZGUpO1xuXHRcdFx0aWYgKGltYWdlVXJsKSB7XG5cdFx0XHRcdGJ1ZmZlci5wdXNoKGAhWyR7YWx0VGV4dH1dKCR7aW1hZ2VVcmx9KVxcblxcbmApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goYFtJbWFnZTogJHthbHRUZXh0fV1cXG5cXG5gKTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNhc2UgJ0Rlc2NyaXB0aW9uTGlzdCc6XG5cdFx0XHRwcm9jZXNzRGVzY3JpcHRpb25MaXN0Tm9kZSh1cmksIG5vZGUsIGJ1ZmZlciwgZGVwdGgpO1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Y2FzZSAnYmxvY2txdW90ZSc6XG5cdFx0XHRidWZmZXIucHVzaCgnPiAnICsgZ2V0Tm9kZVRleHQobm9kZS5ub2RlLCBhbGxvd1dyYXApLnJlcGxhY2UoL1xcbi9nLCAnXFxuPiAnKSArICdcXG5cXG4nKTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Ly8gVE9ETzogSXMgdGhpcyB0aGUgY29ycmVjdCB3YXkgdG8gaGFuZGxlIHRoZSBnZW5lcmljIHJvbGU/XG5cdFx0Y2FzZSAnZ2VuZXJpYyc6XG5cdFx0XHRidWZmZXIucHVzaCgnICcpO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlICdjb2RlJzoge1xuXHRcdFx0cHJvY2Vzc0NvZGVOb2RlKHVyaSwgbm9kZSwgYnVmZmVyLCBkZXB0aCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2FzZSAncHJlJzpcblx0XHRcdGJ1ZmZlci5wdXNoKCdgYGBcXG4nICsgZ2V0Tm9kZVRleHQobm9kZS5ub2RlLCBmYWxzZSkgKyAnXFxuYGBgXFxuXFxuJyk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgJ3RhYmxlJzpcblx0XHRcdHByb2Nlc3NUYWJsZU5vZGUobm9kZSwgYnVmZmVyKTtcblx0XHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFByb2Nlc3MgY2hpbGRyZW4gaWYgbm90IGFscmVhZHkgaGFuZGxlZCBpbiBzcGVjaWZpYyBjYXNlc1xuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRwcm9jZXNzTm9kZSh1cmksIGNoaWxkLCBidWZmZXIsIGRlcHRoICsgMSwgYWxsb3dXcmFwKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXROb2RlUm9sZShub2RlOiBBWE5vZGUpOiBzdHJpbmcge1xuXHRyZXR1cm4gbm9kZS5yb2xlPy52YWx1ZSBhcyBzdHJpbmcgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVUZXh0KG5vZGU6IEFYTm9kZSwgYWxsb3dXcmFwOiBib29sZWFuKTogc3RyaW5nIHtcblx0Y29uc3QgdGV4dCA9IG5vZGUubmFtZT8udmFsdWUgYXMgc3RyaW5nIHx8IG5vZGUudmFsdWU/LnZhbHVlIGFzIHN0cmluZyB8fCAnJztcblx0aWYgKCFhbGxvd1dyYXApIHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdGlmICh0ZXh0Lmxlbmd0aCA8PSBMSU5FX01BWF9MRU5HVEgpIHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdGNvbnN0IGNoYXJzID0gdGV4dC5zcGxpdCgnJyk7XG5cdGxldCBsYXN0U3BhY2VJbmRleCA9IC0xO1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IGNoYXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGNoYXJzW2ldID09PSAnICcpIHtcblx0XHRcdGxhc3RTcGFjZUluZGV4ID0gaTtcblx0XHR9XG5cdFx0Ly8gQ2hlY2sgaWYgd2UgcmVhY2hlZCB0aGUgbGluZSBtYXggbGVuZ3RoLCB0cnkgdG8gYnJlYWsgYXQgdGhlIGxhc3Qgc3BhY2Vcblx0XHQvLyBiZWZvcmUgdGhlIGxpbmUgbWF4IGxlbmd0aFxuXHRcdGlmIChpICUgTElORV9NQVhfTEVOR1RIID09PSAwICYmIGxhc3RTcGFjZUluZGV4ICE9PSAtMSkge1xuXHRcdFx0Ly8gcmVwbGFjZSB0aGUgc3BhY2Ugd2l0aCBhIG5ldyBsaW5lXG5cdFx0XHRjaGFyc1tsYXN0U3BhY2VJbmRleF0gPSAnXFxuJztcblx0XHRcdGxhc3RTcGFjZUluZGV4ID0gaTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNoYXJzLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBnZXRMZXZlbChub2RlOiBBWE5vZGUpOiBudW1iZXIge1xuXHRjb25zdCBsZXZlbFByb3AgPSBub2RlLnByb3BlcnRpZXM/LmZpbmQocCA9PiBwLm5hbWUgPT09ICdsZXZlbCcpO1xuXHRyZXR1cm4gbGV2ZWxQcm9wID8gTWF0aC5taW4oTnVtYmVyKGxldmVsUHJvcC52YWx1ZS52YWx1ZSkgfHwgMSwgNikgOiAxO1xufVxuXG5mdW5jdGlvbiBnZXRMaW5rVXJsKG5vZGU6IEFYTm9kZSk6IHN0cmluZyB7XG5cdC8vIEZpbmQgVVJMIGluIHByb3BlcnRpZXNcblx0Y29uc3QgdXJsUHJvcCA9IG5vZGUucHJvcGVydGllcz8uZmluZChwID0+IHAubmFtZSA9PT0gJ3VybCcpO1xuXHRyZXR1cm4gdXJsUHJvcD8udmFsdWUudmFsdWUgYXMgc3RyaW5nIHx8ICcjJztcbn1cblxuZnVuY3Rpb24gZ2V0SW1hZ2VVcmwobm9kZTogQVhOb2RlKTogc3RyaW5nIHwgbnVsbCB7XG5cdC8vIEZpbmQgVVJMIGluIHByb3BlcnRpZXNcblx0Y29uc3QgdXJsUHJvcCA9IG5vZGUucHJvcGVydGllcz8uZmluZChwID0+IHAubmFtZSA9PT0gJ3VybCcpO1xuXHRyZXR1cm4gdXJsUHJvcD8udmFsdWUudmFsdWUgYXMgc3RyaW5nIHx8IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzTmF2aWdhdGlvbkxpbmsobm9kZTogQVhOb2RlVHJlZSk6IGJvb2xlYW4ge1xuXHQvLyBDaGVjayBpZiB0aGlzIGxpbmsgaXMgcGFydCBvZiBuYXZpZ2F0aW9uXG5cdGxldCBjdXJyZW50OiBBWE5vZGVUcmVlIHwgbnVsbCA9IG5vZGU7XG5cdHdoaWxlIChjdXJyZW50KSB7XG5cdFx0Y29uc3Qgcm9sZSA9IGdldE5vZGVSb2xlKGN1cnJlbnQubm9kZSk7XG5cdFx0aWYgKFsnbmF2aWdhdGlvbicsICdtZW51JywgJ21lbnViYXInXS5pbmNsdWRlcyhyb2xlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudDtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzU2FtZVVyaUlnbm9yaW5nUXVlcnlBbmRGcmFnbWVudCh1cmk6IFVSSSwgbm9kZTogQVhOb2RlKTogYm9vbGVhbiB7XG5cdC8vIENoZWNrIGlmIHRoaXMgbGluayBpcyBhbiBhbmNob3IgbGlua1xuXHRjb25zdCBsaW5rID0gZ2V0TGlua1VybChub2RlKTtcblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UobGluayk7XG5cdFx0cmV0dXJuIHBhcnNlZC5zY2hlbWUgPT09IHVyaS5zY2hlbWUgJiYgcGFyc2VkLmF1dGhvcml0eSA9PT0gdXJpLmF1dGhvcml0eSAmJiBwYXJzZWQucGF0aCA9PT0gdXJpLnBhdGg7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1BhcmFncmFwaE5vZGUodXJpOiBVUkksIG5vZGU6IEFYTm9kZVRyZWUsIGJ1ZmZlcjogc3RyaW5nW10sIGRlcHRoOiBudW1iZXIsIGFsbG93V3JhcDogYm9vbGVhbik6IHZvaWQge1xuXHRidWZmZXIucHVzaCgnXFxuJyk7XG5cdC8vIFByb2Nlc3MgdGhlIGNoaWxkcmVuIG9mIHRoZSBwYXJhZ3JhcGhcblx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0cHJvY2Vzc05vZGUodXJpLCBjaGlsZCwgYnVmZmVyLCBkZXB0aCArIDEsIGFsbG93V3JhcCk7XG5cdH1cblx0YnVmZmVyLnB1c2goJ1xcblxcbicpO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzSGVhZGluZ05vZGUodXJpOiBVUkksIG5vZGU6IEFYTm9kZVRyZWUsIGJ1ZmZlcjogc3RyaW5nW10sIGRlcHRoOiBudW1iZXIpOiB2b2lkIHtcblx0YnVmZmVyLnB1c2goJ1xcbicpO1xuXHRjb25zdCBsZXZlbCA9IGdldExldmVsKG5vZGUubm9kZSk7XG5cdGJ1ZmZlci5wdXNoKGAkeycjJy5yZXBlYXQobGV2ZWwpfSBgKTtcblx0Ly8gUHJvY2VzcyBjaGlsZHJlbiBub2RlcyBvZiB0aGUgaGVhZGluZ1xuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRpZiAoZ2V0Tm9kZVJvbGUoY2hpbGQubm9kZSkgPT09ICdTdGF0aWNUZXh0Jykge1xuXHRcdFx0YnVmZmVyLnB1c2goZ2V0Tm9kZVRleHQoY2hpbGQubm9kZSwgZmFsc2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvY2Vzc05vZGUodXJpLCBjaGlsZCwgYnVmZmVyLCBkZXB0aCArIDEsIGZhbHNlKTtcblx0XHR9XG5cdH1cblx0YnVmZmVyLnB1c2goJ1xcblxcbicpO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzRGVzY3JpcHRpb25MaXN0Tm9kZSh1cmk6IFVSSSwgbm9kZTogQVhOb2RlVHJlZSwgYnVmZmVyOiBzdHJpbmdbXSwgZGVwdGg6IG51bWJlcik6IHZvaWQge1xuXHRidWZmZXIucHVzaCgnXFxuJyk7XG5cblx0Ly8gUHJvY2VzcyBlYWNoIGNoaWxkIG9mIHRoZSBkZXNjcmlwdGlvbiBsaXN0XG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdGlmIChnZXROb2RlUm9sZShjaGlsZC5ub2RlKSA9PT0gJ3Rlcm0nKSB7XG5cdFx0XHRidWZmZXIucHVzaCgnLSAqKicpO1xuXHRcdFx0Ly8gUHJvY2VzcyB0ZXJtIG5vZGVzXG5cdFx0XHRmb3IgKGNvbnN0IHRlcm1DaGlsZCBvZiBjaGlsZC5jaGlsZHJlbikge1xuXHRcdFx0XHRwcm9jZXNzTm9kZSh1cmksIHRlcm1DaGlsZCwgYnVmZmVyLCBkZXB0aCArIDEsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0YnVmZmVyLnB1c2goJyoqICcpO1xuXHRcdH0gZWxzZSBpZiAoZ2V0Tm9kZVJvbGUoY2hpbGQubm9kZSkgPT09ICdkZWZpbml0aW9uJykge1xuXHRcdFx0Ly8gUHJvY2VzcyBkZXNjcmlwdGlvbiBub2Rlc1xuXHRcdFx0Zm9yIChjb25zdCBkZXNjQ2hpbGQgb2YgY2hpbGQuY2hpbGRyZW4pIHtcblx0XHRcdFx0cHJvY2Vzc05vZGUodXJpLCBkZXNjQ2hpbGQsIGJ1ZmZlciwgZGVwdGggKyAxLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGJ1ZmZlci5wdXNoKCdcXG4nKTtcblx0XHR9XG5cdH1cblxuXHRidWZmZXIucHVzaCgnXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGlzVGFibGVDZWxsKHJvbGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHQvLyBNYXRjaCBjZWxsLCBncmlkY2VsbCwgY29sdW1uaGVhZGVyLCByb3doZWFkZXIgcm9sZXNcblx0cmV0dXJuIHJvbGUgPT09ICdjZWxsJyB8fCByb2xlID09PSAnZ3JpZGNlbGwnIHx8IHJvbGUgPT09ICdjb2x1bW5oZWFkZXInIHx8IHJvbGUgPT09ICdyb3doZWFkZXInO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzVGFibGVOb2RlKG5vZGU6IEFYTm9kZVRyZWUsIGJ1ZmZlcjogc3RyaW5nW10pOiB2b2lkIHtcblx0YnVmZmVyLnB1c2goJ1xcbicpO1xuXG5cdC8vIEZpbmQgcm93c1xuXHRjb25zdCByb3dzID0gbm9kZS5jaGlsZHJlbi5maWx0ZXIoY2hpbGQgPT4gZ2V0Tm9kZVJvbGUoY2hpbGQubm9kZSkuaW5jbHVkZXMoJ3JvdycpKTtcblxuXHRpZiAocm93cy5sZW5ndGggPiAwKSB7XG5cdFx0Ly8gRmlyc3Qgcm93IGFzIGhlYWRlclxuXHRcdGNvbnN0IGhlYWRlckNlbGxzID0gcm93c1swXS5jaGlsZHJlbi5maWx0ZXIoY2VsbCA9PiBpc1RhYmxlQ2VsbChnZXROb2RlUm9sZShjZWxsLm5vZGUpKSk7XG5cblx0XHQvLyBHZW5lcmF0ZSBoZWFkZXIgcm93XG5cdFx0Y29uc3QgaGVhZGVyQ29udGVudCA9IGhlYWRlckNlbGxzLm1hcChjZWxsID0+IGdldE5vZGVUZXh0KGNlbGwubm9kZSwgZmFsc2UpIHx8ICcgJyk7XG5cdFx0YnVmZmVyLnB1c2goJ3wgJyArIGhlYWRlckNvbnRlbnQuam9pbignIHwgJykgKyAnIHxcXG4nKTtcblxuXHRcdC8vIEdlbmVyYXRlIHNlcGFyYXRvciByb3dcblx0XHRidWZmZXIucHVzaCgnfCAnICsgaGVhZGVyQ2VsbHMubWFwKCgpID0+ICctLS0nKS5qb2luKCcgfCAnKSArICcgfFxcbicpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgZGF0YSByb3dzXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCByb3dzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkYXRhQ2VsbHMgPSByb3dzW2ldLmNoaWxkcmVuLmZpbHRlcihjZWxsID0+IGlzVGFibGVDZWxsKGdldE5vZGVSb2xlKGNlbGwubm9kZSkpKTtcblx0XHRcdGNvbnN0IHJvd0NvbnRlbnQgPSBkYXRhQ2VsbHMubWFwKGNlbGwgPT4gZ2V0Tm9kZVRleHQoY2VsbC5ub2RlLCBmYWxzZSkgfHwgJyAnKTtcblx0XHRcdGJ1ZmZlci5wdXNoKCd8ICcgKyByb3dDb250ZW50LmpvaW4oJyB8ICcpICsgJyB8XFxuJyk7XG5cdFx0fVxuXHR9XG5cblx0YnVmZmVyLnB1c2goJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzQ29kZU5vZGUodXJpOiBVUkksIG5vZGU6IEFYTm9kZVRyZWUsIGJ1ZmZlcjogc3RyaW5nW10sIGRlcHRoOiBudW1iZXIpOiB2b2lkIHtcblx0Y29uc3QgdGVtcEJ1ZmZlcjogc3RyaW5nW10gPSBbXTtcblx0Ly8gUHJvY2VzcyB0aGUgY2hpbGRyZW4gb2YgdGhlIGNvZGUgbm9kZVxuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRwcm9jZXNzTm9kZSh1cmksIGNoaWxkLCB0ZW1wQnVmZmVyLCBkZXB0aCArIDEsIGZhbHNlKTtcblx0fVxuXHRjb25zdCBpc0NvZGVibG9jayA9IHRlbXBCdWZmZXIuc29tZSh0ZXh0ID0+IHRleHQuaW5jbHVkZXMoJ1xcbicpKTtcblx0aWYgKGlzQ29kZWJsb2NrKSB7XG5cdFx0YnVmZmVyLnB1c2goJ1xcbmBgYFxcbicpO1xuXHRcdC8vIEFwcGVuZCB0aGUgcHJvY2Vzc2VkIHRleHQgdG8gdGhlIGJ1ZmZlclxuXHRcdGJ1ZmZlci5wdXNoKHRlbXBCdWZmZXIuam9pbignJykpO1xuXHRcdGJ1ZmZlci5wdXNoKCdcXG5gYGBcXG4nKTtcblx0fSBlbHNlIHtcblx0XHRidWZmZXIucHVzaCgnYCcpO1xuXHRcdGxldCBjaGFyYWN0ZXJDb3VudCA9IDA7XG5cdFx0Ly8gQXBwZW5kIHRoZSBwcm9jZXNzZWQgdGV4dCB0byB0aGUgYnVmZmVyXG5cdFx0Zm9yIChjb25zdCB0ZW1wSXRlbSBvZiB0ZW1wQnVmZmVyKSB7XG5cdFx0XHRjaGFyYWN0ZXJDb3VudCArPSB0ZW1wSXRlbS5sZW5ndGg7XG5cdFx0XHRpZiAoY2hhcmFjdGVyQ291bnQgPiBMSU5FX01BWF9MRU5HVEgpIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goJ1xcbicpO1xuXHRcdFx0XHRjaGFyYWN0ZXJDb3VudCA9IDA7XG5cdFx0XHR9XG5cdFx0XHRidWZmZXIucHVzaCh0ZW1wSXRlbSk7XG5cdFx0XHRidWZmZXIucHVzaCgnYCcpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjb2xsZWN0TmF2aWdhdGlvbkxpbmtzKHRyZWU6IEFYTm9kZVRyZWUpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGxpbmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb2xsZWN0TGlua3ModHJlZSwgbGlua3MpO1xuXHRyZXR1cm4gbGlua3M7XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3RMaW5rcyhub2RlOiBBWE5vZGVUcmVlLCBsaW5rczogc3RyaW5nW10pOiB2b2lkIHtcblx0Y29uc3Qgcm9sZSA9IGdldE5vZGVSb2xlKG5vZGUubm9kZSk7XG5cblx0aWYgKHJvbGUgPT09ICdsaW5rJyAmJiBpc05hdmlnYXRpb25MaW5rKG5vZGUpKSB7XG5cdFx0Y29uc3QgbGlua1RleHQgPSBnZXROb2RlVGV4dChub2RlLm5vZGUsIHRydWUpO1xuXHRcdGNvbnN0IHVybCA9IGdldExpbmtVcmwobm9kZS5ub2RlKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG5vZGUubm9kZS5kZXNjcmlwdGlvbj8udmFsdWUgYXMgc3RyaW5nIHx8ICcnO1xuXG5cdFx0bGlua3MucHVzaChgLSBbJHtsaW5rVGV4dH1dKCR7dXJsfSkke2Rlc2NyaXB0aW9uID8gJyAtICcgKyBkZXNjcmlwdGlvbiA6ICcnfWApO1xuXHR9XG5cblx0Ly8gUHJvY2VzcyBjaGlsZHJlblxuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRjb2xsZWN0TGlua3MoY2hpbGQsIGxpbmtzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyxXQUFXO0FBNkRwQixTQUFTLGdCQUFnQixPQUErQjtBQUN2RCxNQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFHQSxRQUFNLGFBQWEsb0JBQUksSUFBb0I7QUFDM0MsYUFBVyxRQUFRLE9BQU87QUFDekIsZUFBVyxJQUFJLEtBQUssUUFBUSxJQUFJO0FBQUEsRUFDakM7QUFHQSxXQUFTLHlCQUF5QixRQUEwQjtBQUMzRCxVQUFNLE9BQU8sV0FBVyxJQUFJLE1BQU07QUFDbEMsUUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLFVBQVU7QUFDNUIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sU0FB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
