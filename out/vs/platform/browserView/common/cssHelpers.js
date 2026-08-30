const inheritableCSSProperties = /* @__PURE__ */ new Set([
  "color",
  "cursor",
  "direction",
  "font",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-size",
  "font-size-adjust",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "orphans",
  "overflow-wrap",
  "quotes",
  "tab-size",
  "text-align",
  "text-align-last",
  "text-indent",
  "text-transform",
  "visibility",
  "white-space",
  "widows",
  "word-break",
  "word-spacing",
  "writing-mode"
]);
const varReferenceRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const keyComputedProperties = /* @__PURE__ */ new Set([
  "display",
  "position",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-size",
  "font-family",
  "color",
  "background-color"
]);
const alwaysResolvedProperties = /* @__PURE__ */ new Set(["display", "height", "width"]);
function collectVarReferences(value, into) {
  for (const m of value.matchAll(varReferenceRegex)) {
    into.add(m[1]);
  }
}
function collectPropertyNames(cssProperties, into, inheritableOnly) {
  for (const prop of cssProperties) {
    if (!prop.name || !prop.value || prop.disabled || prop.name.startsWith("--")) {
      continue;
    }
    if (inheritableOnly && !inheritableCSSProperties.has(prop.name)) {
      continue;
    }
    into.add(prop.name);
  }
}
function filterInheritableDeclarations(cssText) {
  const declarations = cssText.split(";").map((d) => d.trim()).filter(Boolean);
  const filtered = declarations.filter((decl) => {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) {
      return false;
    }
    const propName = decl.substring(0, colonIdx).trim();
    return inheritableCSSProperties.has(propName);
  });
  return filtered.length > 0 ? filtered.join("; ") : void 0;
}
function formatMatchedStyles(matched) {
  const referencedVars = /* @__PURE__ */ new Set();
  const authorPropertyNames = /* @__PURE__ */ new Set();
  const userAgentPropertyNames = /* @__PURE__ */ new Set();
  const seenCssTexts = /* @__PURE__ */ new Set();
  const lines = [];
  if (matched.inlineStyle?.cssText?.trim()) {
    const cssText = matched.inlineStyle.cssText.trim();
    collectVarReferences(cssText, referencedVars);
    collectPropertyNames(matched.inlineStyle.cssProperties, authorPropertyNames);
    lines.push(`element { ${cssText} }`);
  }
  for (const ruleEntry of matched.matchedCSSRules ?? []) {
    if (ruleEntry.rule.origin === "user-agent") {
      collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames);
      continue;
    }
    const cssText = ruleEntry.rule.style.cssText?.trim();
    if (!cssText || seenCssTexts.has(cssText)) {
      continue;
    }
    seenCssTexts.add(cssText);
    collectVarReferences(cssText, referencedVars);
    collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames);
    const selectors = ruleEntry.rule.selectorList.selectors.map((s) => s.text).join(", ");
    lines.push(`${selectors} { ${cssText} }`);
  }
  if (matched.pseudoElements?.length) {
    const pseudoLines = [];
    for (const pseudo of matched.pseudoElements) {
      for (const ruleEntry of pseudo.matches ?? []) {
        if (ruleEntry.rule.origin === "user-agent") {
          collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames);
          continue;
        }
        const cssText = ruleEntry.rule.style.cssText?.trim();
        if (!cssText || seenCssTexts.has(cssText)) {
          continue;
        }
        seenCssTexts.add(cssText);
        collectVarReferences(cssText, referencedVars);
        collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames);
        const selectors = ruleEntry.rule.selectorList.selectors.map((s) => s.text).join(", ");
        pseudoLines.push(`${selectors} { ${cssText} }`);
      }
    }
    if (pseudoLines.length > 0) {
      lines.push("");
      lines.push("/* Pseudo-elements */");
      lines.push(...pseudoLines);
    }
  }
  const inheritedLines = [];
  for (const entry of matched.inherited ?? []) {
    for (const ruleEntry of entry.matchedCSSRules ?? []) {
      if (ruleEntry.rule.origin === "user-agent") {
        collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames, true);
        continue;
      }
      const cssText = ruleEntry.rule.style.cssText?.trim();
      if (!cssText) {
        continue;
      }
      const filtered = filterInheritableDeclarations(cssText);
      if (!filtered || seenCssTexts.has(filtered)) {
        continue;
      }
      seenCssTexts.add(filtered);
      collectVarReferences(filtered, referencedVars);
      collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames, true);
      const selectors = ruleEntry.rule.selectorList.selectors.map((s) => s.text).join(", ");
      inheritedLines.push(`${selectors} { ${filtered} }`);
    }
  }
  if (inheritedLines.length > 0) {
    lines.push("");
    lines.push("/* Inherited */");
    lines.push(...inheritedLines);
  }
  for (const prop of alwaysResolvedProperties) {
    authorPropertyNames.add(prop);
  }
  return { rulesText: lines.join("\n"), referencedVars, authorPropertyNames, userAgentPropertyNames };
}
const boxShorthands = [
  // margin: <margin-top> <margin-right> <margin-bottom> <margin-left>
  { shorthand: "margin", sides: ["margin-top", "margin-right", "margin-bottom", "margin-left"] },
  // padding: <padding-top> <padding-right> <padding-bottom> <padding-left>
  { shorthand: "padding", sides: ["padding-top", "padding-right", "padding-bottom", "padding-left"] },
  // border-radius: <TL> <TR> <BR> <BL>   (clockwise from top-left)
  { shorthand: "border-radius", sides: ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"] }
];
const borderSideGroups = [
  // border-width: initial medium per MDN (but computed is always an absolute length)
  { shorthand: "border-width", sides: ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"] },
  // border-style: initial none per MDN
  { shorthand: "border-style", sides: ["border-top-style", "border-right-style", "border-bottom-style", "border-left-style"] },
  // border-color: initial currentcolor per MDN
  { shorthand: "border-color", sides: ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"] }
];
const dropWhenAllDefault = [
  // border-image  (CSS Backgrounds & Borders 3 section 6.8)
  {
    longhands: {
      "border-image-source": "none",
      "border-image-slice": "100%",
      "border-image-width": "1",
      "border-image-outset": "0",
      "border-image-repeat": "stretch"
    }
  },
  // animation-range  (CSS Scroll-driven Animations section 5.2)  initial: normal
  {
    longhands: {
      "animation-range-start": "normal",
      "animation-range-end": "normal"
    }
  }
];
const backgroundCollapse = {
  colorLonghand: "background-color",
  otherLonghands: {
    // MDN background formal definition initial values:
    "background-image": "none",
    // initial: none
    "background-position-x": "0px",
    // initial: 0% (computed as 0px)
    "background-position-y": "0px",
    // initial: 0%
    "background-size": "auto",
    // initial: auto auto
    "background-repeat": "repeat",
    // initial: repeat
    "background-attachment": "scroll",
    // initial: scroll
    "background-origin": "padding-box",
    // initial: padding-box
    "background-clip": "border-box"
    // initial: border-box
  }
};
const simpleShorthands = [
  // text-decoration (CSS Text Decoration 4 section 3)
  // Constituents: text-decoration-line || text-decoration-style || text-decoration-color || text-decoration-thickness
  {
    shorthand: "text-decoration",
    longhands: [
      { name: "text-decoration-line", initial: "none" },
      { name: "text-decoration-style", initial: "solid" },
      { name: "text-decoration-color", initial: "currentcolor" },
      { name: "text-decoration-thickness", initial: "auto" }
    ]
  }
];
const whiteSpaceKeywords = [
  { collapse: "collapse", wrap: "wrap", keyword: "normal" },
  { collapse: "collapse", wrap: "nowrap", keyword: "nowrap" },
  { collapse: "preserve", wrap: "nowrap", keyword: "pre" },
  { collapse: "preserve", wrap: "wrap", keyword: "pre-wrap" },
  { collapse: "preserve-breaks", wrap: "wrap", keyword: "pre-line" },
  { collapse: "break-spaces", wrap: "wrap", keyword: "break-spaces" }
];
const listShorthands = [
  // transition (CSS Transitions 1 section 2.1)
  // Constituents: transition-property || transition-duration || transition-timing-function || transition-delay || transition-behavior
  {
    shorthand: "transition",
    longhands: [
      { name: "transition-property", initial: "all" },
      { name: "transition-duration", initial: "0s" },
      { name: "transition-timing-function", initial: "ease" },
      { name: "transition-delay", initial: "0s" },
      { name: "transition-behavior", initial: "normal" }
    ]
  },
  // animation (CSS Animations 1 section 3 + Scroll-driven Animations section 5)
  // Constituents: animation-name || animation-duration || animation-timing-function || animation-delay
  //             || animation-iteration-count || animation-direction || animation-fill-mode
  //             || animation-play-state || animation-timeline
  {
    shorthand: "animation",
    longhands: [
      { name: "animation-name", initial: "none" },
      { name: "animation-duration", initial: "0s" },
      { name: "animation-timing-function", initial: "ease" },
      { name: "animation-delay", initial: "0s" },
      { name: "animation-iteration-count", initial: "1" },
      { name: "animation-direction", initial: "normal" },
      { name: "animation-fill-mode", initial: "none" },
      { name: "animation-play-state", initial: "running" },
      { name: "animation-timeline", initial: "auto" }
    ]
  }
];
function collapseBoxValues(entries, sides) {
  const [topKey, rightKey, bottomKey, leftKey] = sides;
  const top = entries.get(topKey);
  const right = entries.get(rightKey);
  const bottom = entries.get(bottomKey);
  const left = entries.get(leftKey);
  if (top === void 0 || right === void 0 || bottom === void 0 || left === void 0) {
    return void 0;
  }
  entries.delete(topKey);
  entries.delete(rightKey);
  entries.delete(bottomKey);
  entries.delete(leftKey);
  if (top === right && right === bottom && bottom === left) {
    return top;
  }
  if (top === bottom && right === left) {
    return `${top} ${right}`;
  }
  if (right === left) {
    return `${top} ${right} ${bottom}`;
  }
  return `${top} ${right} ${bottom} ${left}`;
}
function splitCSSList(value) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === "," && depth === 0) {
      items.push(value.substring(start, i).trim());
      start = i + 1;
    }
  }
  items.push(value.substring(start).trim());
  return items;
}
function collapseListShorthand(entries, output, shorthand, longhands) {
  const values = longhands.map(({ name }) => entries.get(name));
  if (!values.every((v) => v !== void 0)) {
    return;
  }
  const lists = values.map((v) => splitCSSList(v));
  const itemCount = lists[0].length;
  if (!lists.every((l) => l.length === itemCount)) {
    return;
  }
  for (const { name } of longhands) {
    entries.delete(name);
  }
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const parts = [];
    for (let j = 0; j < longhands.length; j++) {
      const val = lists[j][i];
      if (val !== longhands[j].initial) {
        parts.push(val);
      }
    }
    items.push(parts.length > 0 ? parts.join(" ") : longhands[0].initial);
  }
  output.push(`${shorthand}: ${items.join(", ")};`);
}
function collapseToShorthands(entries) {
  const shorthandLines = [];
  for (const { shorthand, sides } of boxShorthands) {
    const collapsed = collapseBoxValues(entries, sides);
    if (collapsed !== void 0) {
      shorthandLines.push(`${shorthand}: ${collapsed};`);
    }
  }
  const borderVals = borderSideGroups.map((g) => g.sides.map((s) => entries.get(s)));
  const hasAllBorderProps = borderVals.every((group) => group.every((v) => v !== void 0));
  if (hasAllBorderProps) {
    const allUniform = borderVals.every((group) => group.every((v) => v === group[0]));
    if (allUniform) {
      for (const group of borderSideGroups) {
        for (const side of group.sides) {
          entries.delete(side);
        }
      }
      shorthandLines.push(`border: ${borderVals[0][0]} ${borderVals[1][0]} ${borderVals[2][0]};`);
    } else {
      for (const group of borderSideGroups) {
        const collapsed = collapseBoxValues(entries, group.sides);
        if (collapsed !== void 0) {
          shorthandLines.push(`${group.shorthand}: ${collapsed};`);
        }
      }
    }
  }
  for (const { longhands } of dropWhenAllDefault) {
    const allDefault = Object.entries(longhands).every(([k, v]) => entries.get(k) === v);
    if (allDefault && Object.keys(longhands).some((k) => entries.has(k))) {
      for (const key of Object.keys(longhands)) {
        entries.delete(key);
      }
    }
  }
  {
    const { colorLonghand, otherLonghands } = backgroundCollapse;
    const bgColor = entries.get(colorLonghand);
    const allOthersDefault = Object.entries(otherLonghands).every(([k, v]) => entries.get(k) === v);
    if (allOthersDefault && bgColor !== void 0) {
      entries.delete(colorLonghand);
      for (const key of Object.keys(otherLonghands)) {
        entries.delete(key);
      }
      shorthandLines.push(`background: ${bgColor};`);
    }
  }
  for (const { shorthand, longhands } of simpleShorthands) {
    const first = entries.get(longhands[0].name);
    if (first === void 0) {
      continue;
    }
    const values = longhands.map(({ name }) => entries.get(name));
    for (const { name } of longhands) {
      entries.delete(name);
    }
    const parts = [];
    for (let i = 0; i < longhands.length; i++) {
      const val = values[i] ?? longhands[i].initial;
      if (val !== longhands[i].initial) {
        parts.push(val);
      }
    }
    shorthandLines.push(`${shorthand}: ${parts.length > 0 ? parts.join(" ") : longhands[0].initial};`);
  }
  {
    const wsCollapse = entries.get("white-space-collapse");
    const textWrap = entries.get("text-wrap-mode");
    if (wsCollapse !== void 0 && textWrap !== void 0) {
      entries.delete("white-space-collapse");
      entries.delete("text-wrap-mode");
      const match = whiteSpaceKeywords.find((k) => k.collapse === wsCollapse && k.wrap === textWrap);
      shorthandLines.push(`white-space: ${match ? match.keyword : `${wsCollapse} ${textWrap}`};`);
    }
  }
  for (const { shorthand, longhands } of listShorthands) {
    collapseListShorthand(entries, shorthandLines, shorthand, longhands);
  }
  const remainingLines = [];
  for (const [name, value] of Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    remainingLines.push(`${name}: ${value};`);
  }
  return [...shorthandLines, ...remainingLines];
}
export {
  collapseToShorthands,
  filterInheritableDeclarations,
  formatMatchedStyles,
  keyComputedProperties
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGNvbW1vblxcY3NzSGVscGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIC0tIENEUCBtYXRjaGVkLXN0eWxlcyB0eXBlcyAoc3Vic2V0IHVzZWQgYnkgZm9ybWF0QXV0aG9yU3R5bGVzKSAtLVxuXG5leHBvcnQgaW50ZXJmYWNlIElDU1NTdHlsZSB7XG5cdGNzc1RleHQ/OiBzdHJpbmc7XG5cdGNzc1Byb3BlcnRpZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nOyBkaXNhYmxlZD86IGJvb2xlYW4gfT47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0b3JMaXN0IHtcblx0c2VsZWN0b3JzOiBBcnJheTx7IHRleHQ6IHN0cmluZyB9Pjtcbn1cblxuaW50ZXJmYWNlIElDU1NSdWxlIHtcblx0c2VsZWN0b3JMaXN0OiBJU2VsZWN0b3JMaXN0O1xuXHRvcmlnaW46IHN0cmluZztcblx0c3R5bGU6IElDU1NTdHlsZTtcbn1cblxuaW50ZXJmYWNlIElSdWxlTWF0Y2gge1xuXHRydWxlOiBJQ1NTUnVsZTtcbn1cblxuaW50ZXJmYWNlIElJbmhlcml0ZWRTdHlsZUVudHJ5IHtcblx0aW5saW5lU3R5bGU/OiBJQ1NTU3R5bGU7XG5cdG1hdGNoZWRDU1NSdWxlczogSVJ1bGVNYXRjaFtdO1xufVxuXG5pbnRlcmZhY2UgSVBzZXVkb0VsZW1lbnRNYXRjaGVzIHtcblx0cHNldWRvVHlwZTogc3RyaW5nO1xuXHRtYXRjaGVzOiBJUnVsZU1hdGNoW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hdGNoZWRTdHlsZXMge1xuXHRpbmxpbmVTdHlsZT86IElDU1NTdHlsZTtcblx0bWF0Y2hlZENTU1J1bGVzPzogSVJ1bGVNYXRjaFtdO1xuXHRpbmhlcml0ZWQ/OiBJSW5oZXJpdGVkU3R5bGVFbnRyeVtdO1xuXHRwc2V1ZG9FbGVtZW50cz86IElQc2V1ZG9FbGVtZW50TWF0Y2hlc1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGb3JtYXR0ZWRTdHlsZXMge1xuXHQvKiogQ29tcGFjdCBDU1MgdGV4dCBmb3IgdGhlIGFnZW50IHByb21wdCAocnVsZXMgb25seSwgd2l0aG91dCByZXNvbHZlZCB2YWx1ZXMpLiAqL1xuXHRydWxlc1RleHQ6IHN0cmluZztcblx0LyoqIFNldCBvZiBDU1MgdmFyaWFibGUgbmFtZXMgcmVmZXJlbmNlZCBieSB0aGUgZWxlbWVudCdzIHJ1bGVzLiAqL1xuXHRyZWZlcmVuY2VkVmFyczogU2V0PHN0cmluZz47XG5cdC8qKiBTZXQgb2YgQ1NTIHByb3BlcnR5IG5hbWVzIHRoYXQgd2VyZSBleHBsaWNpdGx5IHNldCBieSBhdXRob3IgcnVsZXMuICovXG5cdGF1dGhvclByb3BlcnR5TmFtZXM6IFNldDxzdHJpbmc+O1xuXHQvKiogU2V0IG9mIENTUyBwcm9wZXJ0eSBuYW1lcyB0aGF0IHdlcmUgc2V0IGJ5IHVzZXItYWdlbnQgcnVsZXMuICovXG5cdHVzZXJBZ2VudFByb3BlcnR5TmFtZXM6IFNldDxzdHJpbmc+O1xufVxuXG4vLyAtLSBDb25zdGFudHMgLS1cblxuLyoqXG4gKiBDU1MgcHJvcGVydGllcyB0aGF0IGFyZSBpbmhlcml0ZWQgYnkgY2hpbGQgZWxlbWVudHMuXG4gKi9cbmNvbnN0IGluaGVyaXRhYmxlQ1NTUHJvcGVydGllcyA9IG5ldyBTZXQoW1xuXHQnY29sb3InLCAnY3Vyc29yJywgJ2RpcmVjdGlvbicsICdmb250JywgJ2ZvbnQtZmFtaWx5JywgJ2ZvbnQtZmVhdHVyZS1zZXR0aW5ncycsXG5cdCdmb250LWtlcm5pbmcnLCAnZm9udC1zaXplJywgJ2ZvbnQtc2l6ZS1hZGp1c3QnLCAnZm9udC1zdHJldGNoJywgJ2ZvbnQtc3R5bGUnLFxuXHQnZm9udC12YXJpYW50JywgJ2ZvbnQtd2VpZ2h0JywgJ2xldHRlci1zcGFjaW5nJywgJ2xpbmUtaGVpZ2h0JywgJ2xpc3Qtc3R5bGUnLFxuXHQnbGlzdC1zdHlsZS1pbWFnZScsICdsaXN0LXN0eWxlLXBvc2l0aW9uJywgJ2xpc3Qtc3R5bGUtdHlwZScsICdvcnBoYW5zJyxcblx0J292ZXJmbG93LXdyYXAnLCAncXVvdGVzJywgJ3RhYi1zaXplJywgJ3RleHQtYWxpZ24nLCAndGV4dC1hbGlnbi1sYXN0Jyxcblx0J3RleHQtaW5kZW50JywgJ3RleHQtdHJhbnNmb3JtJywgJ3Zpc2liaWxpdHknLCAnd2hpdGUtc3BhY2UnLCAnd2lkb3dzJyxcblx0J3dvcmQtYnJlYWsnLCAnd29yZC1zcGFjaW5nJywgJ3dyaXRpbmctbW9kZScsXG5dKTtcblxuY29uc3QgdmFyUmVmZXJlbmNlUmVnZXggPSAvdmFyXFwoXFxzKigtLVthLXpBLVowLTlfLV0rKS9nO1xuXG4vKipcbiAqIEtleSBjb21wdXRlZCBwcm9wZXJ0aWVzIGluY2x1ZGVkIGZvciBob3ZlciBkaXNwbGF5IGluIHRoZSBVSS5cbiAqL1xuZXhwb3J0IGNvbnN0IGtleUNvbXB1dGVkUHJvcGVydGllcyA9IG5ldyBTZXQoW1xuXHQnZGlzcGxheScsICdwb3NpdGlvbicsICdtYXJnaW4nLCAnbWFyZ2luLXRvcCcsICdtYXJnaW4tcmlnaHQnLCAnbWFyZ2luLWJvdHRvbScsICdtYXJnaW4tbGVmdCcsXG5cdCdwYWRkaW5nJywgJ3BhZGRpbmctdG9wJywgJ3BhZGRpbmctcmlnaHQnLCAncGFkZGluZy1ib3R0b20nLCAncGFkZGluZy1sZWZ0Jyxcblx0J2ZvbnQtc2l6ZScsICdmb250LWZhbWlseScsICdjb2xvcicsICdiYWNrZ3JvdW5kLWNvbG9yJyxcbl0pO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgYWx3YXlzIGluY2x1ZGVkIGluIHJlc29sdmVkIHZhbHVlcyBldmVuIGlmIG9ubHkgc2V0IGJ5IHVzZXItYWdlbnQgcnVsZXMsXG4gKiBtYXRjaGluZyBDaHJvbWUgRGV2VG9vbHMnIGBhbHdheXNTaG93bkNvbXB1dGVkUHJvcGVydGllc2AuXG4gKi9cbmNvbnN0IGFsd2F5c1Jlc29sdmVkUHJvcGVydGllcyA9IG5ldyBTZXQoWydkaXNwbGF5JywgJ2hlaWdodCcsICd3aWR0aCddKTtcblxuLy8gLS0gSGVscGVyIGZ1bmN0aW9ucyAtLVxuXG4vKipcbiAqIENvbGxlY3RzIHZhcigtLW5hbWUpIHJlZmVyZW5jZXMgZnJvbSBhIENTUyB2YWx1ZSBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGNvbGxlY3RWYXJSZWZlcmVuY2VzKHZhbHVlOiBzdHJpbmcsIGludG86IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdGZvciAoY29uc3QgbSBvZiB2YWx1ZS5tYXRjaEFsbCh2YXJSZWZlcmVuY2VSZWdleCkpIHtcblx0XHRpbnRvLmFkZChtWzFdKTtcblx0fVxufVxuXG4vKipcbiAqIENvbGxlY3RzIGxvbmdoYW5kIHByb3BlcnR5IG5hbWVzIGZyb20gdGhlIGBjc3NQcm9wZXJ0aWVzYCBhcnJheSBvZiBhIG1hdGNoZWQgcnVsZS5cbiAqIFNraXBzIHZhcmlhYmxlIGRlZmluaXRpb25zIGFuZCBkaXNhYmxlZCBwcm9wZXJ0aWVzLlxuICovXG5mdW5jdGlvbiBjb2xsZWN0UHJvcGVydHlOYW1lcyhjc3NQcm9wZXJ0aWVzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgdmFsdWU6IHN0cmluZzsgZGlzYWJsZWQ/OiBib29sZWFuIH0+LCBpbnRvOiBTZXQ8c3RyaW5nPiwgaW5oZXJpdGFibGVPbmx5PzogYm9vbGVhbik6IHZvaWQge1xuXHRmb3IgKGNvbnN0IHByb3Agb2YgY3NzUHJvcGVydGllcykge1xuXHRcdGlmICghcHJvcC5uYW1lIHx8ICFwcm9wLnZhbHVlIHx8IHByb3AuZGlzYWJsZWQgfHwgcHJvcC5uYW1lLnN0YXJ0c1dpdGgoJy0tJykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoaW5oZXJpdGFibGVPbmx5ICYmICFpbmhlcml0YWJsZUNTU1Byb3BlcnRpZXMuaGFzKHByb3AubmFtZSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpbnRvLmFkZChwcm9wLm5hbWUpO1xuXHR9XG59XG5cbi8qKlxuICogRmlsdGVycyBDU1MgZGVjbGFyYXRpb25zIHRvIG9ubHkgaW5oZXJpdGFibGUgcHJvcGVydGllcyAobm90IHZhcmlhYmxlIGRlZmluaXRpb25zKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlckluaGVyaXRhYmxlRGVjbGFyYXRpb25zKGNzc1RleHQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGRlY2xhcmF0aW9ucyA9IGNzc1RleHQuc3BsaXQoJzsnKS5tYXAoZCA9PiBkLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pO1xuXHRjb25zdCBmaWx0ZXJlZCA9IGRlY2xhcmF0aW9ucy5maWx0ZXIoZGVjbCA9PiB7XG5cdFx0Y29uc3QgY29sb25JZHggPSBkZWNsLmluZGV4T2YoJzonKTtcblx0XHRpZiAoY29sb25JZHggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3BOYW1lID0gZGVjbC5zdWJzdHJpbmcoMCwgY29sb25JZHgpLnRyaW0oKTtcblx0XHRyZXR1cm4gaW5oZXJpdGFibGVDU1NQcm9wZXJ0aWVzLmhhcyhwcm9wTmFtZSk7XG5cdH0pO1xuXHRyZXR1cm4gZmlsdGVyZWQubGVuZ3RoID4gMCA/IGZpbHRlcmVkLmpvaW4oJzsgJykgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRm9ybWF0cyBtYXRjaGVkIHN0eWxlcyBpbnRvIGEgY29tcGFjdCByZXByZXNlbnRhdGlvbiBmb3IgYWdlbnQgcHJvbXB0cy5cbiAqXG4gKiBPbmx5IGluY2x1ZGVzIGF1dGhvci1vcmlnaW4gcnVsZXMgKG5vdCBicm93c2VyIGRlZmF1bHRzKSwgdXNlcyB0aGUgcmF3XG4gKiBgY3NzVGV4dGAgaW5zdGVhZCBvZiBleHBhbmRlZCBsb25naGFuZCBwcm9wZXJ0aWVzLCBhbmQgZm9yIGluaGVyaXRlZFxuICogcnVsZXMgb25seSBrZWVwcyBpbmhlcml0YWJsZSBDU1MgcHJvcGVydGllcy5cbiAqXG4gKiBBbHNvIGluY2x1ZGVzIHBzZXVkby1lbGVtZW50IHN0eWxlcyAoOjpiZWZvcmUsIDo6YWZ0ZXIsIGV0Yy4pIHdoZW4gcHJlc2VudC5cbiAqXG4gKiBVc2VzIGBjc3NQcm9wZXJ0aWVzYCAodGhlIGxvbmdoYW5kIGFycmF5KSBmcm9tIG1hdGNoZWQgcnVsZXMgdG8gZGV0ZXJtaW5lXG4gKiB3aGljaCBjb21wdXRlZCBwcm9wZXJ0aWVzIGFyZSBhdXRob3ItYWZmZWN0ZWQsIG1hdGNoaW5nIENocm9tZSBEZXZUb29scydcbiAqIGBjb21wdXRlUHJvcGVydHlUcmFjZXNgIGFwcHJvYWNoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyk6IElGb3JtYXR0ZWRTdHlsZXMge1xuXHRjb25zdCByZWZlcmVuY2VkVmFycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBhdXRob3JQcm9wZXJ0eU5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHVzZXJBZ2VudFByb3BlcnR5TmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3Qgc2VlbkNzc1RleHRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdC8vIElubGluZSBzdHlsZXMgb24gdGhlIGVsZW1lbnQgaXRzZWxmXG5cdGlmIChtYXRjaGVkLmlubGluZVN0eWxlPy5jc3NUZXh0Py50cmltKCkpIHtcblx0XHRjb25zdCBjc3NUZXh0ID0gbWF0Y2hlZC5pbmxpbmVTdHlsZS5jc3NUZXh0LnRyaW0oKTtcblx0XHRjb2xsZWN0VmFyUmVmZXJlbmNlcyhjc3NUZXh0LCByZWZlcmVuY2VkVmFycyk7XG5cdFx0Y29sbGVjdFByb3BlcnR5TmFtZXMobWF0Y2hlZC5pbmxpbmVTdHlsZS5jc3NQcm9wZXJ0aWVzLCBhdXRob3JQcm9wZXJ0eU5hbWVzKTtcblx0XHRsaW5lcy5wdXNoKGBlbGVtZW50IHsgJHtjc3NUZXh0fSB9YCk7XG5cdH1cblxuXHQvLyBEaXJlY3QgYXV0aG9yIHJ1bGVzOiB1c2UgY3NzVGV4dCBmb3IgZGlzcGxheSwgY3NzUHJvcGVydGllcyBmb3IgcHJvcGVydHkgdHJhY2tpbmdcblx0Zm9yIChjb25zdCBydWxlRW50cnkgb2YgbWF0Y2hlZC5tYXRjaGVkQ1NTUnVsZXMgPz8gW10pIHtcblx0XHRpZiAocnVsZUVudHJ5LnJ1bGUub3JpZ2luID09PSAndXNlci1hZ2VudCcpIHtcblx0XHRcdGNvbGxlY3RQcm9wZXJ0eU5hbWVzKHJ1bGVFbnRyeS5ydWxlLnN0eWxlLmNzc1Byb3BlcnRpZXMsIHVzZXJBZ2VudFByb3BlcnR5TmFtZXMpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGNzc1RleHQgPSBydWxlRW50cnkucnVsZS5zdHlsZS5jc3NUZXh0Py50cmltKCk7XG5cdFx0aWYgKCFjc3NUZXh0IHx8IHNlZW5Dc3NUZXh0cy5oYXMoY3NzVGV4dCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRzZWVuQ3NzVGV4dHMuYWRkKGNzc1RleHQpO1xuXHRcdGNvbGxlY3RWYXJSZWZlcmVuY2VzKGNzc1RleHQsIHJlZmVyZW5jZWRWYXJzKTtcblx0XHRjb2xsZWN0UHJvcGVydHlOYW1lcyhydWxlRW50cnkucnVsZS5zdHlsZS5jc3NQcm9wZXJ0aWVzLCBhdXRob3JQcm9wZXJ0eU5hbWVzKTtcblx0XHRjb25zdCBzZWxlY3RvcnMgPSBydWxlRW50cnkucnVsZS5zZWxlY3Rvckxpc3Quc2VsZWN0b3JzLm1hcChzID0+IHMudGV4dCkuam9pbignLCAnKTtcblx0XHRsaW5lcy5wdXNoKGAke3NlbGVjdG9yc30geyAke2Nzc1RleHR9IH1gKTtcblx0fVxuXG5cdC8vIFBzZXVkby1lbGVtZW50IHN0eWxlcyAoOjpiZWZvcmUsIDo6YWZ0ZXIsIGV0Yy4pXG5cdGlmIChtYXRjaGVkLnBzZXVkb0VsZW1lbnRzPy5sZW5ndGgpIHtcblx0XHRjb25zdCBwc2V1ZG9MaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHBzZXVkbyBvZiBtYXRjaGVkLnBzZXVkb0VsZW1lbnRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1bGVFbnRyeSBvZiBwc2V1ZG8ubWF0Y2hlcyA/PyBbXSkge1xuXHRcdFx0XHRpZiAocnVsZUVudHJ5LnJ1bGUub3JpZ2luID09PSAndXNlci1hZ2VudCcpIHtcblx0XHRcdFx0XHRjb2xsZWN0UHJvcGVydHlOYW1lcyhydWxlRW50cnkucnVsZS5zdHlsZS5jc3NQcm9wZXJ0aWVzLCB1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjc3NUZXh0ID0gcnVsZUVudHJ5LnJ1bGUuc3R5bGUuY3NzVGV4dD8udHJpbSgpO1xuXHRcdFx0XHRpZiAoIWNzc1RleHQgfHwgc2VlbkNzc1RleHRzLmhhcyhjc3NUZXh0KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW5Dc3NUZXh0cy5hZGQoY3NzVGV4dCk7XG5cdFx0XHRcdGNvbGxlY3RWYXJSZWZlcmVuY2VzKGNzc1RleHQsIHJlZmVyZW5jZWRWYXJzKTtcblx0XHRcdFx0Y29sbGVjdFByb3BlcnR5TmFtZXMocnVsZUVudHJ5LnJ1bGUuc3R5bGUuY3NzUHJvcGVydGllcywgYXV0aG9yUHJvcGVydHlOYW1lcyk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdG9ycyA9IHJ1bGVFbnRyeS5ydWxlLnNlbGVjdG9yTGlzdC5zZWxlY3RvcnMubWFwKHMgPT4gcy50ZXh0KS5qb2luKCcsICcpO1xuXHRcdFx0XHRwc2V1ZG9MaW5lcy5wdXNoKGAke3NlbGVjdG9yc30geyAke2Nzc1RleHR9IH1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBzZXVkb0xpbmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdFx0bGluZXMucHVzaCgnLyogUHNldWRvLWVsZW1lbnRzICovJyk7XG5cdFx0XHRsaW5lcy5wdXNoKC4uLnBzZXVkb0xpbmVzKTtcblx0XHR9XG5cdH1cblxuXHQvLyBJbmhlcml0ZWQgYXV0aG9yIHJ1bGVzIFx1MjAxNCBvbmx5IGluaGVyaXRhYmxlIHByb3BlcnRpZXNcblx0Y29uc3QgaW5oZXJpdGVkTGluZXM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgZW50cnkgb2YgbWF0Y2hlZC5pbmhlcml0ZWQgPz8gW10pIHtcblx0XHRmb3IgKGNvbnN0IHJ1bGVFbnRyeSBvZiBlbnRyeS5tYXRjaGVkQ1NTUnVsZXMgPz8gW10pIHtcblx0XHRcdGlmIChydWxlRW50cnkucnVsZS5vcmlnaW4gPT09ICd1c2VyLWFnZW50Jykge1xuXHRcdFx0XHRjb2xsZWN0UHJvcGVydHlOYW1lcyhydWxlRW50cnkucnVsZS5zdHlsZS5jc3NQcm9wZXJ0aWVzLCB1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzLCB0cnVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjc3NUZXh0ID0gcnVsZUVudHJ5LnJ1bGUuc3R5bGUuY3NzVGV4dD8udHJpbSgpO1xuXHRcdFx0aWYgKCFjc3NUZXh0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRGlzcGxheToga2VlcCBvbmx5IGluaGVyaXRhYmxlIHByb3BlcnRpZXMgZnJvbSBjc3NUZXh0XG5cdFx0XHRjb25zdCBmaWx0ZXJlZCA9IGZpbHRlckluaGVyaXRhYmxlRGVjbGFyYXRpb25zKGNzc1RleHQpO1xuXHRcdFx0aWYgKCFmaWx0ZXJlZCB8fCBzZWVuQ3NzVGV4dHMuaGFzKGZpbHRlcmVkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHNlZW5Dc3NUZXh0cy5hZGQoZmlsdGVyZWQpO1xuXHRcdFx0Ly8gVHJhY2s6IHVzZSBjc3NQcm9wZXJ0aWVzIGxvbmdoYW5kcywgaW5oZXJpdGFibGUgb25seVxuXHRcdFx0Y29sbGVjdFZhclJlZmVyZW5jZXMoZmlsdGVyZWQsIHJlZmVyZW5jZWRWYXJzKTtcblx0XHRcdGNvbGxlY3RQcm9wZXJ0eU5hbWVzKHJ1bGVFbnRyeS5ydWxlLnN0eWxlLmNzc1Byb3BlcnRpZXMsIGF1dGhvclByb3BlcnR5TmFtZXMsIHRydWUpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0b3JzID0gcnVsZUVudHJ5LnJ1bGUuc2VsZWN0b3JMaXN0LnNlbGVjdG9ycy5tYXAocyA9PiBzLnRleHQpLmpvaW4oJywgJyk7XG5cdFx0XHRpbmhlcml0ZWRMaW5lcy5wdXNoKGAke3NlbGVjdG9yc30geyAke2ZpbHRlcmVkfSB9YCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGluaGVyaXRlZExpbmVzLmxlbmd0aCA+IDApIHtcblx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHRsaW5lcy5wdXNoKCcvKiBJbmhlcml0ZWQgKi8nKTtcblx0XHRsaW5lcy5wdXNoKC4uLmluaGVyaXRlZExpbmVzKTtcblx0fVxuXG5cdC8vIEFsd2F5cyBpbmNsdWRlIERldlRvb2xzJyBhbHdheXNTaG93bkNvbXB1dGVkUHJvcGVydGllc1xuXHRmb3IgKGNvbnN0IHByb3Agb2YgYWx3YXlzUmVzb2x2ZWRQcm9wZXJ0aWVzKSB7XG5cdFx0YXV0aG9yUHJvcGVydHlOYW1lcy5hZGQocHJvcCk7XG5cdH1cblxuXHRyZXR1cm4geyBydWxlc1RleHQ6IGxpbmVzLmpvaW4oJ1xcbicpLCByZWZlcmVuY2VkVmFycywgYXV0aG9yUHJvcGVydHlOYW1lcywgdXNlckFnZW50UHJvcGVydHlOYW1lcyB9O1xufVxuXG4vKipcbiAqIC0tIFNob3J0aGFuZCBjb2xsYXBzaW5nIGNvbmZpZ3VyYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICpcbiAqIEVhY2ggY29uc3RhbnQgYmVsb3cgZGVzY3JpYmVzIG9uZSBraW5kIG9mIENTUyBzaG9ydGhhbmQgdGhhdCBjYW4gYmVcbiAqIHJlY29uc3RpdHV0ZWQgZnJvbSBjb21wdXRlZCBsb25naGFuZCB2YWx1ZXMuICBUaGUgYGNvbGxhcHNlVG9TaG9ydGhhbmRzYFxuICogZnVuY3Rpb24gd2Fsa3MgdGhlc2UgbGlzdHMgaW4gZGVjbGFyYXRpb24gb3JkZXIgYW5kIHByb2R1Y2VzIGNvbXBhY3RcbiAqIG91dHB1dCBmb3IgdGhlIGFnZW50IHByb21wdC5cbiAqXG4gKiBTb3VyY2VzOlxuICogIFx1MjAyMiBNRE4gXCJGb3JtYWwgZGVmaW5pdGlvbiBcdTIxOTIgSW5pdGlhbCB2YWx1ZVwiIHRhYmxlc1xuICogIFx1MjAyMiBDU1MgQmFja2dyb3VuZHMgJiBCb3JkZXJzIDMsIENTUyBUcmFuc2l0aW9ucyAxLCBDU1MgQW5pbWF0aW9ucyAxLFxuICogICAgQ1NTIFRleHQgRGVjb3JhdGlvbiA0LCBDU1MgVGV4dCA0XG4gKi9cblxuLy8gLS0gQm94IG1vZGVsIChUIFIgQiBMKSBzaG9ydGhhbmRzIC0tXG4vLyBDb2xsYXBzZWQgd2l0aCAxLTQtdmFsdWUgc3ludGF4IHBlciBDU1Mgc3BlYyBzZWN0aW9uIDguMy5cblxuaW50ZXJmYWNlIElCb3hTaG9ydGhhbmQge1xuXHRzaG9ydGhhbmQ6IHN0cmluZztcblx0c2lkZXM6IFtzdHJpbmcsIHN0cmluZywgc3RyaW5nLCBzdHJpbmddOyAvLyB0b3AvVEwsIHJpZ2h0L1RSLCBib3R0b20vQlIsIGxlZnQvQkxcbn1cblxuY29uc3QgYm94U2hvcnRoYW5kczogSUJveFNob3J0aGFuZFtdID0gW1xuXHQvLyBtYXJnaW46IDxtYXJnaW4tdG9wPiA8bWFyZ2luLXJpZ2h0PiA8bWFyZ2luLWJvdHRvbT4gPG1hcmdpbi1sZWZ0PlxuXHR7IHNob3J0aGFuZDogJ21hcmdpbicsIHNpZGVzOiBbJ21hcmdpbi10b3AnLCAnbWFyZ2luLXJpZ2h0JywgJ21hcmdpbi1ib3R0b20nLCAnbWFyZ2luLWxlZnQnXSB9LFxuXHQvLyBwYWRkaW5nOiA8cGFkZGluZy10b3A+IDxwYWRkaW5nLXJpZ2h0PiA8cGFkZGluZy1ib3R0b20+IDxwYWRkaW5nLWxlZnQ+XG5cdHsgc2hvcnRoYW5kOiAncGFkZGluZycsIHNpZGVzOiBbJ3BhZGRpbmctdG9wJywgJ3BhZGRpbmctcmlnaHQnLCAncGFkZGluZy1ib3R0b20nLCAncGFkZGluZy1sZWZ0J10gfSxcblx0Ly8gYm9yZGVyLXJhZGl1czogPFRMPiA8VFI+IDxCUj4gPEJMPiAgIChjbG9ja3dpc2UgZnJvbSB0b3AtbGVmdClcblx0eyBzaG9ydGhhbmQ6ICdib3JkZXItcmFkaXVzJywgc2lkZXM6IFsnYm9yZGVyLXRvcC1sZWZ0LXJhZGl1cycsICdib3JkZXItdG9wLXJpZ2h0LXJhZGl1cycsICdib3JkZXItYm90dG9tLXJpZ2h0LXJhZGl1cycsICdib3JkZXItYm90dG9tLWxlZnQtcmFkaXVzJ10gfSxcbl07XG5cbi8vIC0tIEJvcmRlciBwZXItc2lkZSBncm91cHMgKGNvbGxhcHNlIHRvIGJvcmRlcjogVyBTIEMgd2hlbiB1bmlmb3JtKSAtLVxuXG5jb25zdCBib3JkZXJTaWRlR3JvdXBzOiBJQm94U2hvcnRoYW5kW10gPSBbXG5cdC8vIGJvcmRlci13aWR0aDogaW5pdGlhbCBtZWRpdW0gcGVyIE1ETiAoYnV0IGNvbXB1dGVkIGlzIGFsd2F5cyBhbiBhYnNvbHV0ZSBsZW5ndGgpXG5cdHsgc2hvcnRoYW5kOiAnYm9yZGVyLXdpZHRoJywgc2lkZXM6IFsnYm9yZGVyLXRvcC13aWR0aCcsICdib3JkZXItcmlnaHQtd2lkdGgnLCAnYm9yZGVyLWJvdHRvbS13aWR0aCcsICdib3JkZXItbGVmdC13aWR0aCddIH0sXG5cdC8vIGJvcmRlci1zdHlsZTogaW5pdGlhbCBub25lIHBlciBNRE5cblx0eyBzaG9ydGhhbmQ6ICdib3JkZXItc3R5bGUnLCBzaWRlczogWydib3JkZXItdG9wLXN0eWxlJywgJ2JvcmRlci1yaWdodC1zdHlsZScsICdib3JkZXItYm90dG9tLXN0eWxlJywgJ2JvcmRlci1sZWZ0LXN0eWxlJ10gfSxcblx0Ly8gYm9yZGVyLWNvbG9yOiBpbml0aWFsIGN1cnJlbnRjb2xvciBwZXIgTUROXG5cdHsgc2hvcnRoYW5kOiAnYm9yZGVyLWNvbG9yJywgc2lkZXM6IFsnYm9yZGVyLXRvcC1jb2xvcicsICdib3JkZXItcmlnaHQtY29sb3InLCAnYm9yZGVyLWJvdHRvbS1jb2xvcicsICdib3JkZXItbGVmdC1jb2xvciddIH0sXG5dO1xuXG4vLyAtLSBMb25naGFuZHMgdGhhdCBhcmUgZHJvcHBlZCBlbnRpcmVseSB3aGVuIGFsbCBhdCB0aGVpciBpbml0aWFsIHZhbHVlcyAtLVxuXG5pbnRlcmZhY2UgSURlZmF1bHRzR3JvdXAge1xuXHQvKiogTG9uZ2hhbmRzIHRvIGNoZWNrIGFuZCByZW1vdmUuICovXG5cdGxvbmdoYW5kczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuY29uc3QgZHJvcFdoZW5BbGxEZWZhdWx0OiBJRGVmYXVsdHNHcm91cFtdID0gW1xuXHQvLyBib3JkZXItaW1hZ2UgIChDU1MgQmFja2dyb3VuZHMgJiBCb3JkZXJzIDMgc2VjdGlvbiA2LjgpXG5cdHtcblx0XHRsb25naGFuZHM6IHtcblx0XHRcdCdib3JkZXItaW1hZ2Utc291cmNlJzogJ25vbmUnLFxuXHRcdFx0J2JvcmRlci1pbWFnZS1zbGljZSc6ICcxMDAlJyxcblx0XHRcdCdib3JkZXItaW1hZ2Utd2lkdGgnOiAnMScsXG5cdFx0XHQnYm9yZGVyLWltYWdlLW91dHNldCc6ICcwJyxcblx0XHRcdCdib3JkZXItaW1hZ2UtcmVwZWF0JzogJ3N0cmV0Y2gnLFxuXHRcdH0sXG5cdH0sXG5cdC8vIGFuaW1hdGlvbi1yYW5nZSAgKENTUyBTY3JvbGwtZHJpdmVuIEFuaW1hdGlvbnMgc2VjdGlvbiA1LjIpICBpbml0aWFsOiBub3JtYWxcblx0e1xuXHRcdGxvbmdoYW5kczoge1xuXHRcdFx0J2FuaW1hdGlvbi1yYW5nZS1zdGFydCc6ICdub3JtYWwnLFxuXHRcdFx0J2FuaW1hdGlvbi1yYW5nZS1lbmQnOiAnbm9ybWFsJyxcblx0XHR9LFxuXHR9LFxuXTtcblxuLy8gLS0gQmFja2dyb3VuZCBjb2xsYXBzZSAoY29sb3Itb25seSBzaG9ydGhhbmQgd2hlbiBpbWFnZXMvcG9zaXRpb24vZXRjLiBkZWZhdWx0KSAtLVxuXG5pbnRlcmZhY2UgSUJhY2tncm91bmRDb2xsYXBzZUdyb3VwIHtcblx0LyoqIGJhY2tncm91bmQtY29sb3IgbG9uZ2hhbmQgICovXG5cdGNvbG9yTG9uZ2hhbmQ6IHN0cmluZztcblx0LyoqIE90aGVyIGJhY2tncm91bmQgbG9uZ2hhbmRzIHRoYXQgbXVzdCBhbGwgYmUgYXQgdGhlaXIgaW5pdGlhbCB2YWx1ZS4gKi9cblx0b3RoZXJMb25naGFuZHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmNvbnN0IGJhY2tncm91bmRDb2xsYXBzZTogSUJhY2tncm91bmRDb2xsYXBzZUdyb3VwID0ge1xuXHRjb2xvckxvbmdoYW5kOiAnYmFja2dyb3VuZC1jb2xvcicsXG5cdG90aGVyTG9uZ2hhbmRzOiB7XG5cdFx0Ly8gTUROIGJhY2tncm91bmQgZm9ybWFsIGRlZmluaXRpb24gaW5pdGlhbCB2YWx1ZXM6XG5cdFx0J2JhY2tncm91bmQtaW1hZ2UnOiAnbm9uZScsICAgICAgICAgICAgLy8gaW5pdGlhbDogbm9uZVxuXHRcdCdiYWNrZ3JvdW5kLXBvc2l0aW9uLXgnOiAnMHB4JywgICAgICAgIC8vIGluaXRpYWw6IDAlIChjb21wdXRlZCBhcyAwcHgpXG5cdFx0J2JhY2tncm91bmQtcG9zaXRpb24teSc6ICcwcHgnLCAgICAgICAgLy8gaW5pdGlhbDogMCVcblx0XHQnYmFja2dyb3VuZC1zaXplJzogJ2F1dG8nLCAgICAgICAgICAgICAvLyBpbml0aWFsOiBhdXRvIGF1dG9cblx0XHQnYmFja2dyb3VuZC1yZXBlYXQnOiAncmVwZWF0JywgICAgICAgICAvLyBpbml0aWFsOiByZXBlYXRcblx0XHQnYmFja2dyb3VuZC1hdHRhY2htZW50JzogJ3Njcm9sbCcsICAgICAvLyBpbml0aWFsOiBzY3JvbGxcblx0XHQnYmFja2dyb3VuZC1vcmlnaW4nOiAncGFkZGluZy1ib3gnLCAgICAvLyBpbml0aWFsOiBwYWRkaW5nLWJveFxuXHRcdCdiYWNrZ3JvdW5kLWNsaXAnOiAnYm9yZGVyLWJveCcsICAgICAgIC8vIGluaXRpYWw6IGJvcmRlci1ib3hcblx0fSxcbn07XG5cbi8vIC0tIFNpbXBsZSBzaG9ydGhhbmQgY29sbGFwc2UgKGxvbmdoYW5kcyBcdTIxOTIgc2luZ2xlIHNob3J0aGFuZCwgb21pdCBkZWZhdWx0cykgLS1cblxuaW50ZXJmYWNlIElTaW1wbGVTaG9ydGhhbmQge1xuXHRzaG9ydGhhbmQ6IHN0cmluZztcblx0bG9uZ2hhbmRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgaW5pdGlhbDogc3RyaW5nIH0+O1xufVxuXG5jb25zdCBzaW1wbGVTaG9ydGhhbmRzOiBJU2ltcGxlU2hvcnRoYW5kW10gPSBbXG5cdC8vIHRleHQtZGVjb3JhdGlvbiAoQ1NTIFRleHQgRGVjb3JhdGlvbiA0IHNlY3Rpb24gMylcblx0Ly8gQ29uc3RpdHVlbnRzOiB0ZXh0LWRlY29yYXRpb24tbGluZSB8fCB0ZXh0LWRlY29yYXRpb24tc3R5bGUgfHwgdGV4dC1kZWNvcmF0aW9uLWNvbG9yIHx8IHRleHQtZGVjb3JhdGlvbi10aGlja25lc3Ncblx0e1xuXHRcdHNob3J0aGFuZDogJ3RleHQtZGVjb3JhdGlvbicsXG5cdFx0bG9uZ2hhbmRzOiBbXG5cdFx0XHR7IG5hbWU6ICd0ZXh0LWRlY29yYXRpb24tbGluZScsIGluaXRpYWw6ICdub25lJyB9LFxuXHRcdFx0eyBuYW1lOiAndGV4dC1kZWNvcmF0aW9uLXN0eWxlJywgaW5pdGlhbDogJ3NvbGlkJyB9LFxuXHRcdFx0eyBuYW1lOiAndGV4dC1kZWNvcmF0aW9uLWNvbG9yJywgaW5pdGlhbDogJ2N1cnJlbnRjb2xvcicgfSxcblx0XHRcdHsgbmFtZTogJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnLCBpbml0aWFsOiAnYXV0bycgfSxcblx0XHRdLFxuXHR9LFxuXTtcblxuLy8gLS0gd2hpdGUtc3BhY2UgKENTUyBUZXh0IDQgc2VjdGlvbiAzKSAtLVxuLy8gU2hvcnRoYW5kIGZvciB3aGl0ZS1zcGFjZS1jb2xsYXBzZSB8fCB0ZXh0LXdyYXAtbW9kZS5cbi8vIE5hbWVkIGtleXdvcmQgbWFwcGluZ3MgZm9yIHRoZSB3ZWxsLWtub3duIGNvbWJpbmF0aW9uczpcblxuY29uc3Qgd2hpdGVTcGFjZUtleXdvcmRzOiBBcnJheTx7IGNvbGxhcHNlOiBzdHJpbmc7IHdyYXA6IHN0cmluZzsga2V5d29yZDogc3RyaW5nIH0+ID0gW1xuXHR7IGNvbGxhcHNlOiAnY29sbGFwc2UnLCB3cmFwOiAnd3JhcCcsIGtleXdvcmQ6ICdub3JtYWwnIH0sXG5cdHsgY29sbGFwc2U6ICdjb2xsYXBzZScsIHdyYXA6ICdub3dyYXAnLCBrZXl3b3JkOiAnbm93cmFwJyB9LFxuXHR7IGNvbGxhcHNlOiAncHJlc2VydmUnLCB3cmFwOiAnbm93cmFwJywga2V5d29yZDogJ3ByZScgfSxcblx0eyBjb2xsYXBzZTogJ3ByZXNlcnZlJywgd3JhcDogJ3dyYXAnLCBrZXl3b3JkOiAncHJlLXdyYXAnIH0sXG5cdHsgY29sbGFwc2U6ICdwcmVzZXJ2ZS1icmVha3MnLCB3cmFwOiAnd3JhcCcsIGtleXdvcmQ6ICdwcmUtbGluZScgfSxcblx0eyBjb2xsYXBzZTogJ2JyZWFrLXNwYWNlcycsIHdyYXA6ICd3cmFwJywga2V5d29yZDogJ2JyZWFrLXNwYWNlcycgfSxcbl07XG5cbi8vIC0tIENvbW1hLXNlcGFyYXRlZCBsaXN0IHNob3J0aGFuZHMgKHRyYW5zaXRpb24sIGFuaW1hdGlvbikgLS1cblxuaW50ZXJmYWNlIElMaXN0U2hvcnRoYW5kIHtcblx0c2hvcnRoYW5kOiBzdHJpbmc7XG5cdGxvbmdoYW5kczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGluaXRpYWw6IHN0cmluZyB9Pjtcbn1cblxuY29uc3QgbGlzdFNob3J0aGFuZHM6IElMaXN0U2hvcnRoYW5kW10gPSBbXG5cdC8vIHRyYW5zaXRpb24gKENTUyBUcmFuc2l0aW9ucyAxIHNlY3Rpb24gMi4xKVxuXHQvLyBDb25zdGl0dWVudHM6IHRyYW5zaXRpb24tcHJvcGVydHkgfHwgdHJhbnNpdGlvbi1kdXJhdGlvbiB8fCB0cmFuc2l0aW9uLXRpbWluZy1mdW5jdGlvbiB8fCB0cmFuc2l0aW9uLWRlbGF5IHx8IHRyYW5zaXRpb24tYmVoYXZpb3Jcblx0e1xuXHRcdHNob3J0aGFuZDogJ3RyYW5zaXRpb24nLFxuXHRcdGxvbmdoYW5kczogW1xuXHRcdFx0eyBuYW1lOiAndHJhbnNpdGlvbi1wcm9wZXJ0eScsIGluaXRpYWw6ICdhbGwnIH0sXG5cdFx0XHR7IG5hbWU6ICd0cmFuc2l0aW9uLWR1cmF0aW9uJywgaW5pdGlhbDogJzBzJyB9LFxuXHRcdFx0eyBuYW1lOiAndHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb24nLCBpbml0aWFsOiAnZWFzZScgfSxcblx0XHRcdHsgbmFtZTogJ3RyYW5zaXRpb24tZGVsYXknLCBpbml0aWFsOiAnMHMnIH0sXG5cdFx0XHR7IG5hbWU6ICd0cmFuc2l0aW9uLWJlaGF2aW9yJywgaW5pdGlhbDogJ25vcm1hbCcgfSxcblx0XHRdLFxuXHR9LFxuXHQvLyBhbmltYXRpb24gKENTUyBBbmltYXRpb25zIDEgc2VjdGlvbiAzICsgU2Nyb2xsLWRyaXZlbiBBbmltYXRpb25zIHNlY3Rpb24gNSlcblx0Ly8gQ29uc3RpdHVlbnRzOiBhbmltYXRpb24tbmFtZSB8fCBhbmltYXRpb24tZHVyYXRpb24gfHwgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbiB8fCBhbmltYXRpb24tZGVsYXlcblx0Ly8gICAgICAgICAgICAgfHwgYW5pbWF0aW9uLWl0ZXJhdGlvbi1jb3VudCB8fCBhbmltYXRpb24tZGlyZWN0aW9uIHx8IGFuaW1hdGlvbi1maWxsLW1vZGVcblx0Ly8gICAgICAgICAgICAgfHwgYW5pbWF0aW9uLXBsYXktc3RhdGUgfHwgYW5pbWF0aW9uLXRpbWVsaW5lXG5cdHtcblx0XHRzaG9ydGhhbmQ6ICdhbmltYXRpb24nLFxuXHRcdGxvbmdoYW5kczogW1xuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLW5hbWUnLCBpbml0aWFsOiAnbm9uZScgfSxcblx0XHRcdHsgbmFtZTogJ2FuaW1hdGlvbi1kdXJhdGlvbicsIGluaXRpYWw6ICcwcycgfSxcblx0XHRcdHsgbmFtZTogJ2FuaW1hdGlvbi10aW1pbmctZnVuY3Rpb24nLCBpbml0aWFsOiAnZWFzZScgfSxcblx0XHRcdHsgbmFtZTogJ2FuaW1hdGlvbi1kZWxheScsIGluaXRpYWw6ICcwcycgfSxcblx0XHRcdHsgbmFtZTogJ2FuaW1hdGlvbi1pdGVyYXRpb24tY291bnQnLCBpbml0aWFsOiAnMScgfSxcblx0XHRcdHsgbmFtZTogJ2FuaW1hdGlvbi1kaXJlY3Rpb24nLCBpbml0aWFsOiAnbm9ybWFsJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLWZpbGwtbW9kZScsIGluaXRpYWw6ICdub25lJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLXBsYXktc3RhdGUnLCBpbml0aWFsOiAncnVubmluZycgfSxcblx0XHRcdHsgbmFtZTogJ2FuaW1hdGlvbi10aW1lbGluZScsIGluaXRpYWw6ICdhdXRvJyB9LFxuXHRcdF0sXG5cdH0sXG5dO1xuXG4vLyAtLSBIZWxwZXIgZnVuY3Rpb25zIC0tXG5cbi8qKlxuICogVHJpZXMgdG8gY29sbGFwc2UgYSBib3ggc2hvcnRoYW5kICg0IHNpZGVzIFx1MjE5MiAxLTQgdmFsdWUgc2hvcnRoYW5kKS5cbiAqIFJldHVybnMgdGhlIGNvbGxhcHNlZCB2YWx1ZSBvciB1bmRlZmluZWQgaWYgbm90IGFsbCBzaWRlcyBhcmUgcHJlc2VudC5cbiAqL1xuZnVuY3Rpb24gY29sbGFwc2VCb3hWYWx1ZXMoZW50cmllczogTWFwPHN0cmluZywgc3RyaW5nPiwgc2lkZXM6IFtzdHJpbmcsIHN0cmluZywgc3RyaW5nLCBzdHJpbmddKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgW3RvcEtleSwgcmlnaHRLZXksIGJvdHRvbUtleSwgbGVmdEtleV0gPSBzaWRlcztcblx0Y29uc3QgdG9wID0gZW50cmllcy5nZXQodG9wS2V5KTtcblx0Y29uc3QgcmlnaHQgPSBlbnRyaWVzLmdldChyaWdodEtleSk7XG5cdGNvbnN0IGJvdHRvbSA9IGVudHJpZXMuZ2V0KGJvdHRvbUtleSk7XG5cdGNvbnN0IGxlZnQgPSBlbnRyaWVzLmdldChsZWZ0S2V5KTtcblxuXHRpZiAodG9wID09PSB1bmRlZmluZWQgfHwgcmlnaHQgPT09IHVuZGVmaW5lZCB8fCBib3R0b20gPT09IHVuZGVmaW5lZCB8fCBsZWZ0ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZW50cmllcy5kZWxldGUodG9wS2V5KTtcblx0ZW50cmllcy5kZWxldGUocmlnaHRLZXkpO1xuXHRlbnRyaWVzLmRlbGV0ZShib3R0b21LZXkpO1xuXHRlbnRyaWVzLmRlbGV0ZShsZWZ0S2V5KTtcblxuXHRpZiAodG9wID09PSByaWdodCAmJiByaWdodCA9PT0gYm90dG9tICYmIGJvdHRvbSA9PT0gbGVmdCkge1xuXHRcdHJldHVybiB0b3A7XG5cdH1cblx0aWYgKHRvcCA9PT0gYm90dG9tICYmIHJpZ2h0ID09PSBsZWZ0KSB7XG5cdFx0cmV0dXJuIGAke3RvcH0gJHtyaWdodH1gO1xuXHR9XG5cdGlmIChyaWdodCA9PT0gbGVmdCkge1xuXHRcdHJldHVybiBgJHt0b3B9ICR7cmlnaHR9ICR7Ym90dG9tfWA7XG5cdH1cblx0cmV0dXJuIGAke3RvcH0gJHtyaWdodH0gJHtib3R0b219ICR7bGVmdH1gO1xufVxuXG4vKipcbiAqIFNwbGl0cyBhIENTUyB2YWx1ZSBieSB0b3AtbGV2ZWwgY29tbWFzLCByZXNwZWN0aW5nIHBhcmVudGhlc2l6ZWQgZ3JvdXBzXG4gKiBsaWtlIGBjdWJpYy1iZXppZXIoMC4xNiwgMSwgMC4zLCAxKWAuXG4gKi9cbmZ1bmN0aW9uIHNwbGl0Q1NTTGlzdCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGRlcHRoID0gMDtcblx0bGV0IHN0YXJ0ID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNoID0gdmFsdWVbaV07XG5cdFx0aWYgKGNoID09PSAnKCcpIHtcblx0XHRcdGRlcHRoKys7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJyknKSB7XG5cdFx0XHRkZXB0aC0tO1xuXHRcdH0gZWxzZSBpZiAoY2ggPT09ICcsJyAmJiBkZXB0aCA9PT0gMCkge1xuXHRcdFx0aXRlbXMucHVzaCh2YWx1ZS5zdWJzdHJpbmcoc3RhcnQsIGkpLnRyaW0oKSk7XG5cdFx0XHRzdGFydCA9IGkgKyAxO1xuXHRcdH1cblx0fVxuXHRpdGVtcy5wdXNoKHZhbHVlLnN1YnN0cmluZyhzdGFydCkudHJpbSgpKTtcblx0cmV0dXJuIGl0ZW1zO1xufVxuXG4vKipcbiAqIENvbGxhcHNlcyBjb21tYS1zZXBhcmF0ZWQgbGlzdCBsb25naGFuZHMgaW50byBhIHNpbmdsZSBzaG9ydGhhbmQgZGVjbGFyYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGNvbGxhcHNlTGlzdFNob3J0aGFuZChcblx0ZW50cmllczogTWFwPHN0cmluZywgc3RyaW5nPixcblx0b3V0cHV0OiBzdHJpbmdbXSxcblx0c2hvcnRoYW5kOiBzdHJpbmcsXG5cdGxvbmdoYW5kczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGluaXRpYWw6IHN0cmluZyB9Pixcbik6IHZvaWQge1xuXHRjb25zdCB2YWx1ZXMgPSBsb25naGFuZHMubWFwKCh7IG5hbWUgfSkgPT4gZW50cmllcy5nZXQobmFtZSkpO1xuXHRpZiAoIXZhbHVlcy5ldmVyeSh2ID0+IHYgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBsaXN0cyA9IHZhbHVlcy5tYXAodiA9PiBzcGxpdENTU0xpc3QodiBhcyBzdHJpbmcpKTtcblx0Y29uc3QgaXRlbUNvdW50ID0gbGlzdHNbMF0ubGVuZ3RoO1xuXHRpZiAoIWxpc3RzLmV2ZXJ5KGwgPT4gbC5sZW5ndGggPT09IGl0ZW1Db3VudCkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRmb3IgKGNvbnN0IHsgbmFtZSB9IG9mIGxvbmdoYW5kcykge1xuXHRcdGVudHJpZXMuZGVsZXRlKG5hbWUpO1xuXHR9XG5cblx0Y29uc3QgaXRlbXM6IHN0cmluZ1tdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbUNvdW50OyBpKyspIHtcblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IGxvbmdoYW5kcy5sZW5ndGg7IGorKykge1xuXHRcdFx0Y29uc3QgdmFsID0gbGlzdHNbal1baV07XG5cdFx0XHRpZiAodmFsICE9PSBsb25naGFuZHNbal0uaW5pdGlhbCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKHZhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGl0ZW1zLnB1c2gocGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJyAnKSA6IGxvbmdoYW5kc1swXS5pbml0aWFsKTtcblx0fVxuXG5cdG91dHB1dC5wdXNoKGAke3Nob3J0aGFuZH06ICR7aXRlbXMuam9pbignLCAnKX07YCk7XG59XG5cbi8vIC0tIE1haW4gZW50cnkgcG9pbnQgLS1cblxuLyoqXG4gKiBDb2xsYXBzZXMgcmVzb2x2ZWQgY29tcHV0ZWQgcHJvcGVydGllcyBpbnRvIHNob3J0aGFuZHMgd2hlcmUgcG9zc2libGUsXG4gKiB0aGVuIHJldHVybnMgc29ydGVkIENTUyBkZWNsYXJhdGlvbiBsaW5lcy4gIERyaXZlbiBlbnRpcmVseSBieSB0aGVcbiAqIGNvbnN0YW50IHNob3J0aGFuZCBjb25maWd1cmF0aW9uIHRhYmxlcyBhYm92ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbGxhcHNlVG9TaG9ydGhhbmRzKGVudHJpZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHNob3J0aGFuZExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdC8vIDEuIEJveCBzaG9ydGhhbmRzIChtYXJnaW4sIHBhZGRpbmcsIGJvcmRlci1yYWRpdXMpXG5cdGZvciAoY29uc3QgeyBzaG9ydGhhbmQsIHNpZGVzIH0gb2YgYm94U2hvcnRoYW5kcykge1xuXHRcdGNvbnN0IGNvbGxhcHNlZCA9IGNvbGxhcHNlQm94VmFsdWVzKGVudHJpZXMsIHNpZGVzKTtcblx0XHRpZiAoY29sbGFwc2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHNob3J0aGFuZExpbmVzLnB1c2goYCR7c2hvcnRoYW5kfTogJHtjb2xsYXBzZWR9O2ApO1xuXHRcdH1cblx0fVxuXG5cdC8vIDIuIEJvcmRlcjogdHJ5IGZ1bGwgYGJvcmRlcjogVyBTIENgIHdoZW4gYWxsIGZvdXIgc2lkZXMgYXJlIHVuaWZvcm0sXG5cdC8vICAgIG90aGVyd2lzZSBjb2xsYXBzZSBlYWNoIGdyb3VwIChib3JkZXItd2lkdGgsIGJvcmRlci1zdHlsZSwgYm9yZGVyLWNvbG9yKS5cblx0Y29uc3QgYm9yZGVyVmFscyA9IGJvcmRlclNpZGVHcm91cHMubWFwKGcgPT4gZy5zaWRlcy5tYXAocyA9PiBlbnRyaWVzLmdldChzKSkpO1xuXHRjb25zdCBoYXNBbGxCb3JkZXJQcm9wcyA9IGJvcmRlclZhbHMuZXZlcnkoZ3JvdXAgPT4gZ3JvdXAuZXZlcnkodiA9PiB2ICE9PSB1bmRlZmluZWQpKTtcblx0aWYgKGhhc0FsbEJvcmRlclByb3BzKSB7XG5cdFx0Y29uc3QgYWxsVW5pZm9ybSA9IGJvcmRlclZhbHMuZXZlcnkoZ3JvdXAgPT4gZ3JvdXAuZXZlcnkodiA9PiB2ID09PSBncm91cFswXSkpO1xuXHRcdGlmIChhbGxVbmlmb3JtKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGJvcmRlclNpZGVHcm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzaWRlIG9mIGdyb3VwLnNpZGVzKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5kZWxldGUoc2lkZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHNob3J0aGFuZExpbmVzLnB1c2goYGJvcmRlcjogJHtib3JkZXJWYWxzWzBdWzBdfSAke2JvcmRlclZhbHNbMV1bMF19ICR7Ym9yZGVyVmFsc1syXVswXX07YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgYm9yZGVyU2lkZUdyb3Vwcykge1xuXHRcdFx0XHRjb25zdCBjb2xsYXBzZWQgPSBjb2xsYXBzZUJveFZhbHVlcyhlbnRyaWVzLCBncm91cC5zaWRlcyk7XG5cdFx0XHRcdGlmIChjb2xsYXBzZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHNob3J0aGFuZExpbmVzLnB1c2goYCR7Z3JvdXAuc2hvcnRoYW5kfTogJHtjb2xsYXBzZWR9O2ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gMy4gRHJvcC13aGVuLWFsbC1kZWZhdWx0IGdyb3VwcyAoYm9yZGVyLWltYWdlLCBldGMuKVxuXHRmb3IgKGNvbnN0IHsgbG9uZ2hhbmRzIH0gb2YgZHJvcFdoZW5BbGxEZWZhdWx0KSB7XG5cdFx0Y29uc3QgYWxsRGVmYXVsdCA9IE9iamVjdC5lbnRyaWVzKGxvbmdoYW5kcykuZXZlcnkoKFtrLCB2XSkgPT4gZW50cmllcy5nZXQoaykgPT09IHYpO1xuXHRcdGlmIChhbGxEZWZhdWx0ICYmIE9iamVjdC5rZXlzKGxvbmdoYW5kcykuc29tZShrID0+IGVudHJpZXMuaGFzKGspKSkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobG9uZ2hhbmRzKSkge1xuXHRcdFx0XHRlbnRyaWVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIDQuIEJhY2tncm91bmQgY29sbGFwc2UgKFx1MjE5MiBgYmFja2dyb3VuZDogPGNvbG9yPmAgd2hlbiBvdGhlciBwcm9wcyBhdCBkZWZhdWx0KVxuXHR7XG5cdFx0Y29uc3QgeyBjb2xvckxvbmdoYW5kLCBvdGhlckxvbmdoYW5kcyB9ID0gYmFja2dyb3VuZENvbGxhcHNlO1xuXHRcdGNvbnN0IGJnQ29sb3IgPSBlbnRyaWVzLmdldChjb2xvckxvbmdoYW5kKTtcblx0XHRjb25zdCBhbGxPdGhlcnNEZWZhdWx0ID0gT2JqZWN0LmVudHJpZXMob3RoZXJMb25naGFuZHMpLmV2ZXJ5KChbaywgdl0pID0+IGVudHJpZXMuZ2V0KGspID09PSB2KTtcblx0XHRpZiAoYWxsT3RoZXJzRGVmYXVsdCAmJiBiZ0NvbG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGVudHJpZXMuZGVsZXRlKGNvbG9yTG9uZ2hhbmQpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMob3RoZXJMb25naGFuZHMpKSB7XG5cdFx0XHRcdGVudHJpZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0XHRzaG9ydGhhbmRMaW5lcy5wdXNoKGBiYWNrZ3JvdW5kOiAke2JnQ29sb3J9O2ApO1xuXHRcdH1cblx0fVxuXG5cdC8vIDUuIFNpbXBsZSBzaG9ydGhhbmRzICh0ZXh0LWRlY29yYXRpb24sIGV0Yy4pIFx1MjAxNCBjb21iaW5lIGxvbmdoYW5kcywgb21pdCBkZWZhdWx0c1xuXHRmb3IgKGNvbnN0IHsgc2hvcnRoYW5kLCBsb25naGFuZHMgfSBvZiBzaW1wbGVTaG9ydGhhbmRzKSB7XG5cdFx0Y29uc3QgZmlyc3QgPSBlbnRyaWVzLmdldChsb25naGFuZHNbMF0ubmFtZSk7XG5cdFx0aWYgKGZpcnN0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBTbmFwc2hvdCB2YWx1ZXMgYmVmb3JlIGRlbGV0aW5nXG5cdFx0Y29uc3QgdmFsdWVzID0gbG9uZ2hhbmRzLm1hcCgoeyBuYW1lIH0pID0+IGVudHJpZXMuZ2V0KG5hbWUpKTtcblx0XHRmb3IgKGNvbnN0IHsgbmFtZSB9IG9mIGxvbmdoYW5kcykge1xuXHRcdFx0ZW50cmllcy5kZWxldGUobmFtZSk7XG5cdFx0fVxuXHRcdC8vIEJ1aWxkIHNob3J0aGFuZCB2YWx1ZSwgb21pdHRpbmcgbG9uZ2hhbmRzIGF0IHRoZWlyIGluaXRpYWwgdmFsdWVcblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxvbmdoYW5kcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgdmFsID0gdmFsdWVzW2ldID8/IGxvbmdoYW5kc1tpXS5pbml0aWFsO1xuXHRcdFx0aWYgKHZhbCAhPT0gbG9uZ2hhbmRzW2ldLmluaXRpYWwpIHtcblx0XHRcdFx0cGFydHMucHVzaCh2YWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzaG9ydGhhbmRMaW5lcy5wdXNoKGAke3Nob3J0aGFuZH06ICR7cGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJyAnKSA6IGxvbmdoYW5kc1swXS5pbml0aWFsfTtgKTtcblx0fVxuXG5cdC8vIDYuIHdoaXRlLXNwYWNlIChDU1MgVGV4dCA0KSBcdTIwMTQgbWFwIGxvbmdoYW5kIHBhaXIgdG8gbmFtZWQga2V5d29yZFxuXHR7XG5cdFx0Y29uc3Qgd3NDb2xsYXBzZSA9IGVudHJpZXMuZ2V0KCd3aGl0ZS1zcGFjZS1jb2xsYXBzZScpO1xuXHRcdGNvbnN0IHRleHRXcmFwID0gZW50cmllcy5nZXQoJ3RleHQtd3JhcC1tb2RlJyk7XG5cdFx0aWYgKHdzQ29sbGFwc2UgIT09IHVuZGVmaW5lZCAmJiB0ZXh0V3JhcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlbnRyaWVzLmRlbGV0ZSgnd2hpdGUtc3BhY2UtY29sbGFwc2UnKTtcblx0XHRcdGVudHJpZXMuZGVsZXRlKCd0ZXh0LXdyYXAtbW9kZScpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB3aGl0ZVNwYWNlS2V5d29yZHMuZmluZChrID0+IGsuY29sbGFwc2UgPT09IHdzQ29sbGFwc2UgJiYgay53cmFwID09PSB0ZXh0V3JhcCk7XG5cdFx0XHRzaG9ydGhhbmRMaW5lcy5wdXNoKGB3aGl0ZS1zcGFjZTogJHttYXRjaCA/IG1hdGNoLmtleXdvcmQgOiBgJHt3c0NvbGxhcHNlfSAke3RleHRXcmFwfWB9O2ApO1xuXHRcdH1cblx0fVxuXG5cdC8vIDcuIENvbW1hLXNlcGFyYXRlZCBsaXN0IHNob3J0aGFuZHMgKHRyYW5zaXRpb24sIGFuaW1hdGlvbilcblx0Zm9yIChjb25zdCB7IHNob3J0aGFuZCwgbG9uZ2hhbmRzIH0gb2YgbGlzdFNob3J0aGFuZHMpIHtcblx0XHRjb2xsYXBzZUxpc3RTaG9ydGhhbmQoZW50cmllcywgc2hvcnRoYW5kTGluZXMsIHNob3J0aGFuZCwgbG9uZ2hhbmRzKTtcblx0fVxuXG5cdC8vIDguIFJlbWFpbmluZyBwcm9wZXJ0aWVzIGFzIGluZGl2aWR1YWwgbGluZXMsIHNvcnRlZFxuXHRjb25zdCByZW1haW5pbmdMaW5lczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIEFycmF5LmZyb20oZW50cmllcy5lbnRyaWVzKCkpLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSB7XG5cdFx0cmVtYWluaW5nTGluZXMucHVzaChgJHtuYW1lfTogJHt2YWx1ZX07YCk7XG5cdH1cblxuXHRyZXR1cm4gWy4uLnNob3J0aGFuZExpbmVzLCAuLi5yZW1haW5pbmdMaW5lc107XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUEyREEsTUFBTSwyQkFBMkIsb0JBQUksSUFBSTtBQUFBLEVBQ3hDO0FBQUEsRUFBUztBQUFBLEVBQVU7QUFBQSxFQUFhO0FBQUEsRUFB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QUMzQyxRQUFJLFVBQVUsUUFBVztBQUN4QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsVUFBVSxJQUFJLENBQUMsRUFBRSxLQUFLLE1BQU0sUUFBUSxJQUFJLElBQUksQ0FBQztBQUM1RCxlQUFXLEVBQUUsS0FBSyxLQUFLLFdBQVc7QUFDakMsY0FBUSxPQUFPLElBQUk7QUFBQSxJQUNwQjtBQUVBLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixhQUFTLElBQUksR0FBRyxJQUFJLFVBQVUsUUFBUSxLQUFLO0FBQzFDLFlBQU0sTUFBTSxPQUFPLENBQUMsS0FBSyxVQUFVLENBQUMsRUFBRTtBQUN0QyxVQUFJLFFBQVEsVUFBVSxDQUFDLEVBQUUsU0FBUztBQUNqQyxjQUFNLEtBQUssR0FBRztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBQ0EsbUJBQWUsS0FBSyxHQUFHLFNBQVMsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLEtBQUssR0FBRyxJQUFJLFVBQVUsQ0FBQyxFQUFFLE9BQU8sR0FBRztBQUFBLEVBQ2xHO0FBR0E7QUFDQyxVQUFNLGFBQWEsUUFBUSxJQUFJLHNCQUFzQjtBQUNyRCxVQUFNLFdBQVcsUUFBUSxJQUFJLGdCQUFnQjtBQUM3QyxRQUFJLGVBQWUsVUFBYSxhQUFhLFFBQVc7QUFDdkQsY0FBUSxPQUFPLHNCQUFzQjtBQUNyQyxjQUFRLE9BQU8sZ0JBQWdCO0FBQy9CLFlBQU0sUUFBUSxtQkFBbUIsS0FBSyxPQUFLLEVBQUUsYUFBYSxjQUFjLEVBQUUsU0FBUyxRQUFRO0FBQzNGLHFCQUFlLEtBQUssZ0JBQWdCLFFBQVEsTUFBTSxVQUFVLEdBQUcsVUFBVSxJQUFJLFFBQVEsRUFBRSxHQUFHO0FBQUEsSUFDM0Y7QUFBQSxFQUNEO0FBR0EsYUFBVyxFQUFFLFdBQVcsVUFBVSxLQUFLLGdCQUFnQjtBQUN0RCwwQkFBc0IsU0FBUyxnQkFBZ0IsV0FBVyxTQUFTO0FBQUEsRUFDcEU7QUFHQSxRQUFNLGlCQUEyQixDQUFDO0FBQ2xDLGFBQVcsQ0FBQyxNQUFNLEtBQUssS0FBSyxNQUFNLEtBQUssUUFBUSxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQyxHQUFHO0FBQ2pHLG1CQUFlLEtBQUssR0FBRyxJQUFJLEtBQUssS0FBSyxHQUFHO0FBQUEsRUFDekM7QUFFQSxTQUFPLENBQUMsR0FBRyxnQkFBZ0IsR0FBRyxjQUFjO0FBQzdDOyIsCiAgIm5hbWVzIjogW10KfQo=
