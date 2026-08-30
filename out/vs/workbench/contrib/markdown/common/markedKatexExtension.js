import { htmlAttributeEncodeValue } from "../../../../base/common/strings.js";
const mathInlineRegExp = /(?<![a-zA-Z0-9])(?<dollars>\${1,2})(?!\.|\(["'])((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\k<dollars>(?![a-zA-Z0-9])/;
const katexContainerClassName = "vscode-katex-container";
const katexContainerLatexAttributeName = "data-latex";
const inlineRule = new RegExp("^" + mathInlineRegExp.source);
var MarkedKatexExtension;
((MarkedKatexExtension2) => {
  const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;
  function extension(katex, options = {}) {
    return {
      extensions: [
        inlineKatex(options, createRenderer(katex, options, false)),
        blockKatex(options, createRenderer(katex, options, true))
      ]
    };
  }
  MarkedKatexExtension2.extension = extension;
  function createRenderer(katex, options, isBlock) {
    return (token) => {
      let out;
      try {
        const html = katex.renderToString(token.text, {
          ...options,
          throwOnError: true,
          displayMode: token.displayMode
        });
        out = `<span class="${katexContainerClassName}" ${katexContainerLatexAttributeName}="${htmlAttributeEncodeValue(token.text)}">${html}</span>`;
      } catch {
        out = token.raw;
      }
      return out + (isBlock ? "\n" : "");
    };
  }
  function inlineKatex(options, renderer) {
    const ruleReg = inlineRule;
    return {
      name: "inlineKatex",
      level: "inline",
      start(src) {
        let index;
        let indexSrc = src;
        while (indexSrc) {
          index = indexSrc.indexOf("$");
          if (index === -1) {
            return;
          }
          const possibleKatex = indexSrc.substring(index);
          if (possibleKatex.match(ruleReg)) {
            return index;
          }
          indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, "");
        }
        return;
      },
      tokenizer(src, tokens) {
        const match = src.match(ruleReg);
        if (match) {
          return {
            type: "inlineKatex",
            raw: match[0],
            text: match[2].trim(),
            displayMode: match[1].length === 2
          };
        }
        return;
      },
      renderer
    };
  }
  function blockKatex(options, renderer) {
    return {
      name: "blockKatex",
      level: "block",
      start(src) {
        return src.match(new RegExp(blockRule.source, "m"))?.index;
      },
      tokenizer(src, tokens) {
        const match = src.match(blockRule);
        if (match) {
          return {
            type: "blockKatex",
            raw: match[0],
            text: match[2].trim(),
            displayMode: match[1].length === 2
          };
        }
        return;
      },
      renderer
    };
  }
})(MarkedKatexExtension || (MarkedKatexExtension = {}));
export {
  MarkedKatexExtension,
  katexContainerClassName,
  katexContainerLatexAttributeName,
  mathInlineRegExp
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtkb3duXFxjb21tb25cXG1hcmtlZEthdGV4RXh0ZW5zaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB0eXBlICogYXMgbWFya2VkIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsgaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5cbmV4cG9ydCBjb25zdCBtYXRoSW5saW5lUmVnRXhwID0gLyg/PCFbYS16QS1aMC05XSkoPzxkb2xsYXJzPlxcJHsxLDJ9KSg/IVxcLnxcXChbXCInXSkoKD86XFxcXC58W15cXFxcXFxuXSkqPyg/OlxcXFwufFteXFxcXFxcblxcJF0pKVxcazxkb2xsYXJzPig/IVthLXpBLVowLTldKS87IC8vIE5vbi1zdGFuZGFyZCwgYnV0IGVuc3VyZSBvcGVuaW5nICQgaXMgbm90IHByZWNlZGVkIGFuZCBjbG9zaW5nICQgaXMgbm90IGZvbGxvd2VkIGJ5IHdvcmQvbnVtYmVyIGNoYXJhY3RlcnMsIG9wZW5pbmcgJCBub3QgZm9sbG93ZWQgYnkgLiwgKFwiLCAoJ1xuZXhwb3J0IGNvbnN0IGthdGV4Q29udGFpbmVyQ2xhc3NOYW1lID0gJ3ZzY29kZS1rYXRleC1jb250YWluZXInO1xuZXhwb3J0IGNvbnN0IGthdGV4Q29udGFpbmVyTGF0ZXhBdHRyaWJ1dGVOYW1lID0gJ2RhdGEtbGF0ZXgnO1xuXG5jb25zdCBpbmxpbmVSdWxlID0gbmV3IFJlZ0V4cCgnXicgKyBtYXRoSW5saW5lUmVnRXhwLnNvdXJjZSk7XG5cbmV4cG9ydCBuYW1lc3BhY2UgTWFya2VkS2F0ZXhFeHRlbnNpb24ge1xuXHR0eXBlIEthdGV4T3B0aW9ucyA9IGltcG9ydCgna2F0ZXgnKS5LYXRleE9wdGlvbnM7XG5cblx0Ly8gRnJvbSBodHRwczovL2dpdGh1Yi5jb20vVXppVGVjaC9tYXJrZWQta2F0ZXgtZXh0ZW5zaW9uL2Jsb2IvbWFpbi9zcmMvaW5kZXguanNcblx0Ly8gRnJvbSBodHRwczovL2dpdGh1Yi5jb20vVXppVGVjaC9tYXJrZWQta2F0ZXgtZXh0ZW5zaW9uL2Jsb2IvbWFpbi9zcmMvaW5kZXguanNcblx0ZXhwb3J0IGludGVyZmFjZSBNYXJrZWRLYXRleE9wdGlvbnMgZXh0ZW5kcyBLYXRleE9wdGlvbnMgeyB9XG5cblx0Y29uc3QgYmxvY2tSdWxlID0gL14oXFwkezEsMn0pXFxuKCg/OlxcXFxbXl18W15cXFxcXSkrPylcXG5cXDEoPzpcXG58JCkvO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBleHRlbnNpb24oa2F0ZXg6IHR5cGVvZiBpbXBvcnQoJ2thdGV4JykuZGVmYXVsdCwgb3B0aW9uczogTWFya2VkS2F0ZXhPcHRpb25zID0ge30pOiBtYXJrZWQuTWFya2VkRXh0ZW5zaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXh0ZW5zaW9uczogW1xuXHRcdFx0XHRpbmxpbmVLYXRleChvcHRpb25zLCBjcmVhdGVSZW5kZXJlcihrYXRleCwgb3B0aW9ucywgZmFsc2UpKSxcblx0XHRcdFx0YmxvY2tLYXRleChvcHRpb25zLCBjcmVhdGVSZW5kZXJlcihrYXRleCwgb3B0aW9ucywgdHJ1ZSkpLFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlUmVuZGVyZXIoa2F0ZXg6IHR5cGVvZiBpbXBvcnQoJ2thdGV4JykuZGVmYXVsdCwgb3B0aW9uczogTWFya2VkS2F0ZXhPcHRpb25zLCBpc0Jsb2NrOiBib29sZWFuKTogbWFya2VkLlJlbmRlcmVyRXh0ZW5zaW9uRnVuY3Rpb24ge1xuXHRcdHJldHVybiAodG9rZW46IG1hcmtlZC5Ub2tlbnMuR2VuZXJpYykgPT4ge1xuXHRcdFx0bGV0IG91dDogc3RyaW5nO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaHRtbCA9IGthdGV4LnJlbmRlclRvU3RyaW5nKHRva2VuLnRleHQsIHtcblx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdHRocm93T25FcnJvcjogdHJ1ZSxcblx0XHRcdFx0XHRkaXNwbGF5TW9kZTogdG9rZW4uZGlzcGxheU1vZGUsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFdyYXAgaW4gYSBjb250YWluZXIgd2l0aCBhdHRyaWJ1dGUgYXMgYSBmYWxsYmFjayBmb3IgZXh0cmFjdGluZyB0aGUgb3JpZ2luYWwgTGFUZVggc291cmNlXG5cdFx0XHRcdC8vIFRoaXMgZW5zdXJlcyB3ZSBjYW4gYWx3YXlzIHJldHJpZXZlIHRoZSBzb3VyY2UgZXZlbiBpZiB0aGUgYW5ub3RhdGlvbiBlbGVtZW50IGlzIG5vdCBwcmVzZW50XG5cdFx0XHRcdG91dCA9IGA8c3BhbiBjbGFzcz1cIiR7a2F0ZXhDb250YWluZXJDbGFzc05hbWV9XCIgJHtrYXRleENvbnRhaW5lckxhdGV4QXR0cmlidXRlTmFtZX09XCIke2h0bWxBdHRyaWJ1dGVFbmNvZGVWYWx1ZSh0b2tlbi50ZXh0KX1cIj4ke2h0bWx9PC9zcGFuPmA7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gT24gZmFpbHVyZSwganVzdCB1c2UgdGhlIG9yaWdpbmFsIHRleHQgaW5jbHVkaW5nIHRoZSB3cmFwcGluZyAkIG9yICQkXG5cdFx0XHRcdG91dCA9IHRva2VuLnJhdztcblx0XHRcdH1cblx0XHRcdHJldHVybiBvdXQgKyAoaXNCbG9jayA/ICdcXG4nIDogJycpO1xuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBpbmxpbmVLYXRleChvcHRpb25zOiBNYXJrZWRLYXRleE9wdGlvbnMsIHJlbmRlcmVyOiBtYXJrZWQuUmVuZGVyZXJFeHRlbnNpb25GdW5jdGlvbik6IG1hcmtlZC5Ub2tlbml6ZXJBbmRSZW5kZXJlckV4dGVuc2lvbiB7XG5cdFx0Y29uc3QgcnVsZVJlZyA9IGlubGluZVJ1bGU7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6ICdpbmxpbmVLYXRleCcsXG5cdFx0XHRsZXZlbDogJ2lubGluZScsXG5cdFx0XHRzdGFydChzcmM6IHN0cmluZykge1xuXHRcdFx0XHRsZXQgaW5kZXg7XG5cdFx0XHRcdGxldCBpbmRleFNyYyA9IHNyYztcblxuXHRcdFx0XHR3aGlsZSAoaW5kZXhTcmMpIHtcblx0XHRcdFx0XHRpbmRleCA9IGluZGV4U3JjLmluZGV4T2YoJyQnKTtcblx0XHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcG9zc2libGVLYXRleCA9IGluZGV4U3JjLnN1YnN0cmluZyhpbmRleCk7XG5cdFx0XHRcdFx0aWYgKHBvc3NpYmxlS2F0ZXgubWF0Y2gocnVsZVJlZykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBpbmRleDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpbmRleFNyYyA9IGluZGV4U3JjLnN1YnN0cmluZyhpbmRleCArIDEpLnJlcGxhY2UoL15cXCQrLywgJycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0sXG5cdFx0XHR0b2tlbml6ZXIoc3JjOiBzdHJpbmcsIHRva2VuczogbWFya2VkLlRva2VuW10pIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBzcmMubWF0Y2gocnVsZVJlZyk7XG5cdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnaW5saW5lS2F0ZXgnLFxuXHRcdFx0XHRcdFx0cmF3OiBtYXRjaFswXSxcblx0XHRcdFx0XHRcdHRleHQ6IG1hdGNoWzJdLnRyaW0oKSxcblx0XHRcdFx0XHRcdGRpc3BsYXlNb2RlOiBtYXRjaFsxXS5sZW5ndGggPT09IDIsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyZXIsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGJsb2NrS2F0ZXgob3B0aW9uczogTWFya2VkS2F0ZXhPcHRpb25zLCByZW5kZXJlcjogbWFya2VkLlJlbmRlcmVyRXh0ZW5zaW9uRnVuY3Rpb24pOiBtYXJrZWQuVG9rZW5pemVyQW5kUmVuZGVyZXJFeHRlbnNpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiAnYmxvY2tLYXRleCcsXG5cdFx0XHRsZXZlbDogJ2Jsb2NrJyxcblx0XHRcdHN0YXJ0KHNyYzogc3RyaW5nKSB7XG5cdFx0XHRcdHJldHVybiBzcmMubWF0Y2gobmV3IFJlZ0V4cChibG9ja1J1bGUuc291cmNlLCAnbScpKT8uaW5kZXg7XG5cdFx0XHR9LFxuXHRcdFx0dG9rZW5pemVyKHNyYzogc3RyaW5nLCB0b2tlbnM6IG1hcmtlZC5Ub2tlbltdKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gc3JjLm1hdGNoKGJsb2NrUnVsZSk7XG5cdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYmxvY2tLYXRleCcsXG5cdFx0XHRcdFx0XHRyYXc6IG1hdGNoWzBdLFxuXHRcdFx0XHRcdFx0dGV4dDogbWF0Y2hbMl0udHJpbSgpLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU1vZGU6IG1hdGNoWzFdLmxlbmd0aCA9PT0gMixcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0sXG5cdFx0XHRyZW5kZXJlcixcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdDQUFnQztBQUVsQyxNQUFNLG1CQUFtQjtBQUN6QixNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLG1DQUFtQztBQUVoRCxNQUFNLGFBQWEsSUFBSSxPQUFPLE1BQU0saUJBQWlCLE1BQU07QUFFcEQsSUFBVTtBQUFBLENBQVYsQ0FBVUEsMEJBQVY7QUFPTixRQUFNLFlBQVk7QUFFWCxXQUFTLFVBQVUsT0FBdUMsVUFBOEIsQ0FBQyxHQUEyQjtBQUMxSCxXQUFPO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxZQUFZLFNBQVMsZUFBZSxPQUFPLFNBQVMsS0FBSyxDQUFDO0FBQUEsUUFDMUQsV0FBVyxTQUFTLGVBQWUsT0FBTyxTQUFTLElBQUksQ0FBQztBQUFBLE1BQ3pEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxzQkFBUztBQVNoQixXQUFTLGVBQWUsT0FBdUMsU0FBNkIsU0FBb0Q7QUFDL0ksV0FBTyxDQUFDLFVBQWlDO0FBQ3hDLFVBQUk7QUFDSixVQUFJO0FBQ0gsY0FBTSxPQUFPLE1BQU0sZUFBZSxNQUFNLE1BQU07QUFBQSxVQUM3QyxHQUFHO0FBQUEsVUFDSCxjQUFjO0FBQUEsVUFDZCxhQUFhLE1BQU07QUFBQSxRQUNwQixDQUFDO0FBSUQsY0FBTSxnQkFBZ0IsdUJBQXVCLEtBQUssZ0NBQWdDLEtBQUsseUJBQXlCLE1BQU0sSUFBSSxDQUFDLEtBQUssSUFBSTtBQUFBLE1BQ3JJLFFBQVE7QUFFUCxjQUFNLE1BQU07QUFBQSxNQUNiO0FBQ0EsYUFBTyxPQUFPLFVBQVUsT0FBTztBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQUVBLFdBQVMsWUFBWSxTQUE2QixVQUFrRjtBQUNuSSxVQUFNLFVBQVU7QUFDaEIsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsTUFBTSxLQUFhO0FBQ2xCLFlBQUk7QUFDSixZQUFJLFdBQVc7QUFFZixlQUFPLFVBQVU7QUFDaEIsa0JBQVEsU0FBUyxRQUFRLEdBQUc7QUFDNUIsY0FBSSxVQUFVLElBQUk7QUFDakI7QUFBQSxVQUNEO0FBRUEsZ0JBQU0sZ0JBQWdCLFNBQVMsVUFBVSxLQUFLO0FBQzlDLGNBQUksY0FBYyxNQUFNLE9BQU8sR0FBRztBQUNqQyxtQkFBTztBQUFBLFVBQ1I7QUFFQSxxQkFBVyxTQUFTLFVBQVUsUUFBUSxDQUFDLEVBQUUsUUFBUSxRQUFRLEVBQUU7QUFBQSxRQUM1RDtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsVUFBVSxLQUFhLFFBQXdCO0FBQzlDLGNBQU0sUUFBUSxJQUFJLE1BQU0sT0FBTztBQUMvQixZQUFJLE9BQU87QUFDVixpQkFBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sS0FBSyxNQUFNLENBQUM7QUFBQSxZQUNaLE1BQU0sTUFBTSxDQUFDLEVBQUUsS0FBSztBQUFBLFlBQ3BCLGFBQWEsTUFBTSxDQUFDLEVBQUUsV0FBVztBQUFBLFVBQ2xDO0FBQUEsUUFDRDtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsV0FBVyxTQUE2QixVQUFrRjtBQUNsSSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsTUFDUCxNQUFNLEtBQWE7QUFDbEIsZUFBTyxJQUFJLE1BQU0sSUFBSSxPQUFPLFVBQVUsUUFBUSxHQUFHLENBQUMsR0FBRztBQUFBLE1BQ3REO0FBQUEsTUFDQSxVQUFVLEtBQWEsUUFBd0I7QUFDOUMsY0FBTSxRQUFRLElBQUksTUFBTSxTQUFTO0FBQ2pDLFlBQUksT0FBTztBQUNWLGlCQUFPO0FBQUEsWUFDTixNQUFNO0FBQUEsWUFDTixLQUFLLE1BQU0sQ0FBQztBQUFBLFlBQ1osTUFBTSxNQUFNLENBQUMsRUFBRSxLQUFLO0FBQUEsWUFDcEIsYUFBYSxNQUFNLENBQUMsRUFBRSxXQUFXO0FBQUEsVUFDbEM7QUFBQSxRQUNEO0FBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsR0FwR2dCOyIsCiAgIm5hbWVzIjogWyJNYXJrZWRLYXRleEV4dGVuc2lvbiJdCn0K
