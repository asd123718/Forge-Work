import * as markedKatexExtension from "../../../markdown/common/markedKatexExtension.js";
const r = String.raw;
const linkPattern = r`(?<!\\)` + // Must not start with escape
// text
r`(!?\[` + // open prefix match -->
/**/
r`(?:` + /*****/
r`[^\[\]\\]|` + // Non-bracket chars, or...
/*****/
r`\\.|` + // Escaped char, or...
/*****/
r`\[[^\[\]]*\]` + // Matched bracket pair
/**/
r`)*` + r`\])` + // <-- close prefix match
// Destination
r`(\(\s*)` + // Pre href
/**/
r`(` + /*****/
r`[^\s\(\)<](?:[^\s\(\)]|\([^\s\(\)]*?\))*|` + // Link without whitespace, or...
/*****/
r`<(?:\\[<>]|[^<>])+>` + // In angle brackets
/**/
r`)` + // Title
/**/
r`\s*(?:"[^"]*"|'[^']*'|\([^\(\)]*\))?\s*` + r`\)`;
function getNWords(str, numWordsToCount) {
  const backtick = "`";
  const wordRegExp = new RegExp("(?:" + linkPattern + ")|(?:" + markedKatexExtension.mathInlineRegExp.source + r`)|\p{sc=Han}|=+|\++|-+|[^\s\|\p{sc=Han}|=|\+|\-|${backtick}]+`, "gu");
  const allWordMatches = Array.from(str.matchAll(wordRegExp));
  const targetWords = allWordMatches.slice(0, numWordsToCount);
  const endIndex = numWordsToCount >= allWordMatches.length ? str.length : targetWords.length ? targetWords.at(-1).index + targetWords.at(-1)[0].length : 0;
  const value = str.substring(0, endIndex);
  return {
    value,
    returnedWordCount: targetWords.length === 0 ? value.length ? 1 : 0 : targetWords.length,
    isFullString: endIndex >= str.length,
    totalWordCount: allWordMatches.length
  };
}
function countWords(str) {
  const result = getNWords(str, Number.MAX_SAFE_INTEGER);
  return result.returnedWordCount;
}
export {
  countWords,
  getNWords
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbW9kZWxcXGNoYXRXb3JkQ291bnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG1hcmtlZEthdGV4RXh0ZW5zaW9uIGZyb20gJy4uLy4uLy4uL21hcmtkb3duL2NvbW1vbi9tYXJrZWRLYXRleEV4dGVuc2lvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmRDb3VudFJlc3VsdCB7XG5cdHZhbHVlOiBzdHJpbmc7XG5cdHJldHVybmVkV29yZENvdW50OiBudW1iZXI7XG5cdHRvdGFsV29yZENvdW50OiBudW1iZXI7XG5cdGlzRnVsbFN0cmluZzogYm9vbGVhbjtcbn1cblxuY29uc3QgciA9IFN0cmluZy5yYXc7XG5cbi8qKlxuICogTWF0Y2hlcyBgW3RleHRdKGxpbmsgdGl0bGU/KWAgb3IgYFt0ZXh0XSg8bGluaz4gdGl0bGU/KWBcbiAqXG4gKiBUYWtlbiBmcm9tIHZzY29kZS1tYXJrZG93bi1sYW5ndWFnZXNlcnZpY2VcbiAqL1xuY29uc3QgbGlua1BhdHRlcm4gPVxuXHRyYCg/PCFcXFxcKWAgKyAvLyBNdXN0IG5vdCBzdGFydCB3aXRoIGVzY2FwZVxuXG5cdC8vIHRleHRcblx0cmAoIT9cXFtgICsgLy8gb3BlbiBwcmVmaXggbWF0Y2ggLS0+XG5cdC8qKi9yYCg/OmAgK1xuXHQvKioqKiovcmBbXlxcW1xcXVxcXFxdfGAgKyAvLyBOb24tYnJhY2tldCBjaGFycywgb3IuLi5cblx0LyoqKioqL3JgXFxcXC58YCArIC8vIEVzY2FwZWQgY2hhciwgb3IuLi5cblx0LyoqKioqL3JgXFxbW15cXFtcXF1dKlxcXWAgKyAvLyBNYXRjaGVkIGJyYWNrZXQgcGFpclxuXHQvKiovcmApKmAgK1xuXHRyYFxcXSlgICsgLy8gPC0tIGNsb3NlIHByZWZpeCBtYXRjaFxuXG5cdC8vIERlc3RpbmF0aW9uXG5cdHJgKFxcKFxccyopYCArIC8vIFByZSBocmVmXG5cdC8qKi9yYChgICtcblx0LyoqKioqL3JgW15cXHNcXChcXCk8XSg/OlteXFxzXFwoXFwpXXxcXChbXlxcc1xcKFxcKV0qP1xcKSkqfGAgKyAvLyBMaW5rIHdpdGhvdXQgd2hpdGVzcGFjZSwgb3IuLi5cblx0LyoqKioqL3JgPCg/OlxcXFxbPD5dfFtePD5dKSs+YCArIC8vIEluIGFuZ2xlIGJyYWNrZXRzXG5cdC8qKi9yYClgICtcblxuXHQvLyBUaXRsZVxuXHQvKiovcmBcXHMqKD86XCJbXlwiXSpcInwnW14nXSonfFxcKFteXFwoXFwpXSpcXCkpP1xccypgICtcblx0cmBcXClgO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TldvcmRzKHN0cjogc3RyaW5nLCBudW1Xb3Jkc1RvQ291bnQ6IG51bWJlcik6IElXb3JkQ291bnRSZXN1bHQge1xuXHQvLyBUaGlzIHJlZ2V4IG1hdGNoZXMgZWFjaCB3b3JkIGFuZCBza2lwcyBvdmVyIHdoaXRlc3BhY2UgYW5kIHNlcGFyYXRvcnMuIEEgd29yZCBpczpcblx0Ly8gQSBtYXJrZG93biBsaW5rXG5cdC8vIElubGluZSBtYXRoXG5cdC8vIE9uZSBjaGluZXNlIGNoYXJhY3RlclxuXHQvLyBPbmUgb3IgbW9yZSArIC0gPSwgaGFuZGxlZCBzbyB0aGF0IGNvZGUgbGlrZSBcImE9MSsyLTNcIiBpcyBicm9rZW4gdXAgYmV0dGVyXG5cdC8vIE9uZSBvciBtb3JlIGNoYXJhY3RlcnMgdGhhdCBhcmVuJ3Qgd2hpdGVwYWNlIG9yIGFueSBvZiB0aGUgYWJvdmVcblx0Y29uc3QgYmFja3RpY2sgPSAnYCc7XG5cblx0Y29uc3Qgd29yZFJlZ0V4cCA9IG5ldyBSZWdFeHAoJyg/OicgKyBsaW5rUGF0dGVybiArICcpfCg/OicgKyBtYXJrZWRLYXRleEV4dGVuc2lvbi5tYXRoSW5saW5lUmVnRXhwLnNvdXJjZSArIHJgKXxcXHB7c2M9SGFufXw9K3xcXCsrfC0rfFteXFxzXFx8XFxwe3NjPUhhbn18PXxcXCt8XFwtfCR7YmFja3RpY2t9XStgLCAnZ3UnKTtcblx0Y29uc3QgYWxsV29yZE1hdGNoZXMgPSBBcnJheS5mcm9tKHN0ci5tYXRjaEFsbCh3b3JkUmVnRXhwKSk7XG5cblx0Y29uc3QgdGFyZ2V0V29yZHMgPSBhbGxXb3JkTWF0Y2hlcy5zbGljZSgwLCBudW1Xb3Jkc1RvQ291bnQpO1xuXG5cdGNvbnN0IGVuZEluZGV4ID0gbnVtV29yZHNUb0NvdW50ID49IGFsbFdvcmRNYXRjaGVzLmxlbmd0aFxuXHRcdD8gc3RyLmxlbmd0aCAvLyBSZWFjaGVkIGVuZCBvZiBzdHJpbmdcblx0XHQ6IHRhcmdldFdvcmRzLmxlbmd0aCA/IHRhcmdldFdvcmRzLmF0KC0xKSEuaW5kZXggKyB0YXJnZXRXb3Jkcy5hdCgtMSkhWzBdLmxlbmd0aCA6IDA7XG5cblx0Y29uc3QgdmFsdWUgPSBzdHIuc3Vic3RyaW5nKDAsIGVuZEluZGV4KTtcblx0cmV0dXJuIHtcblx0XHR2YWx1ZSxcblx0XHRyZXR1cm5lZFdvcmRDb3VudDogdGFyZ2V0V29yZHMubGVuZ3RoID09PSAwID8gKHZhbHVlLmxlbmd0aCA/IDEgOiAwKSA6IHRhcmdldFdvcmRzLmxlbmd0aCxcblx0XHRpc0Z1bGxTdHJpbmc6IGVuZEluZGV4ID49IHN0ci5sZW5ndGgsXG5cdFx0dG90YWxXb3JkQ291bnQ6IGFsbFdvcmRNYXRjaGVzLmxlbmd0aFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY291bnRXb3JkcyhzdHI6IHN0cmluZyk6IG51bWJlciB7XG5cdGNvbnN0IHJlc3VsdCA9IGdldE5Xb3JkcyhzdHIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKTtcblx0cmV0dXJuIHJlc3VsdC5yZXR1cm5lZFdvcmRDb3VudDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksMEJBQTBCO0FBU3RDLE1BQU0sSUFBSSxPQUFPO0FBT2pCLE1BQU0sY0FDTDtBQUFBO0FBR0E7QUFBQTtBQUNJO0FBQ0c7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0gsUUFDSjtBQUFBO0FBR0E7QUFBQTtBQUNJO0FBQ0c7QUFBQTtBQUNBO0FBQUE7QUFDSDtBQUFBO0FBR0EsNkNBQ0o7QUFFTSxTQUFTLFVBQVUsS0FBYSxpQkFBMkM7QUFPakYsUUFBTSxXQUFXO0FBRWpCLFFBQU0sYUFBYSxJQUFJLE9BQU8sUUFBUSxjQUFjLFVBQVUscUJBQXFCLGlCQUFpQixTQUFTLG9EQUFvRCxRQUFRLE1BQU0sSUFBSTtBQUNuTCxRQUFNLGlCQUFpQixNQUFNLEtBQUssSUFBSSxTQUFTLFVBQVUsQ0FBQztBQUUxRCxRQUFNLGNBQWMsZUFBZSxNQUFNLEdBQUcsZUFBZTtBQUUzRCxRQUFNLFdBQVcsbUJBQW1CLGVBQWUsU0FDaEQsSUFBSSxTQUNKLFlBQVksU0FBUyxZQUFZLEdBQUcsRUFBRSxFQUFHLFFBQVEsWUFBWSxHQUFHLEVBQUUsRUFBRyxDQUFDLEVBQUUsU0FBUztBQUVwRixRQUFNLFFBQVEsSUFBSSxVQUFVLEdBQUcsUUFBUTtBQUN2QyxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsbUJBQW1CLFlBQVksV0FBVyxJQUFLLE1BQU0sU0FBUyxJQUFJLElBQUssWUFBWTtBQUFBLElBQ25GLGNBQWMsWUFBWSxJQUFJO0FBQUEsSUFDOUIsZ0JBQWdCLGVBQWU7QUFBQSxFQUNoQztBQUNEO0FBRU8sU0FBUyxXQUFXLEtBQXFCO0FBQy9DLFFBQU0sU0FBUyxVQUFVLEtBQUssT0FBTyxnQkFBZ0I7QUFDckQsU0FBTyxPQUFPO0FBQ2Y7IiwKICAibmFtZXMiOiBbXQp9Cg==
