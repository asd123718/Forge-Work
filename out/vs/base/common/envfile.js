function parseEnvFile(src) {
  const result = /* @__PURE__ */ new Map();
  const normalizedSrc = src.replace(/\r\n?/g, "\n");
  const lines = normalizedSrc.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [key, value] = parseLine(line);
    if (key) {
      result.set(key, value);
    }
  }
  return result;
  function parseLine(line) {
    if (line.startsWith("export ")) {
      line = line.substring(7).trim();
    }
    const separatorIndex = findIndexOutsideQuotes(line, (c) => c === "=" || c === ":");
    if (separatorIndex === -1) {
      return [null, null];
    }
    const key = line.substring(0, separatorIndex).trim();
    let value = line.substring(separatorIndex + 1).trim();
    const commentIndex = findIndexOutsideQuotes(value, (c) => c === "#");
    if (commentIndex !== -1) {
      value = value.substring(0, commentIndex).trim();
    }
    if (value.length >= 2) {
      const firstChar = value[0];
      const lastChar = value[value.length - 1];
      if (firstChar === '"' && lastChar === '"' || firstChar === "'" && lastChar === "'" || firstChar === "`" && lastChar === "`") {
        value = value.substring(1, value.length - 1);
        if (firstChar === '"') {
          value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
        }
      }
    }
    return [key, value];
  }
  function findIndexOutsideQuotes(text, predicate) {
    let inQuote = false;
    let quoteChar = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuote) {
        if (char === quoteChar && text[i - 1] !== "\\") {
          inQuote = false;
        }
      } else if (char === '"' || char === "'" || char === "`") {
        inQuote = true;
        quoteChar = char;
      } else if (predicate(char)) {
        return i;
      }
    }
    return -1;
  }
}
export {
  parseEnvFile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGVudmZpbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFBhcnNlcyBhIHN0YW5kYXJkIC5lbnYvLmVudnJjIGZpbGUgaW50byBhIG1hcCBvZiB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gKiBpdCBkZWZpbmVzLlxuICpcbiAqIHRvZG9AY29ubm9yNDMxMjogdGhpcyBjYW4gZ28gYXdheSAoaWYgb25seSB1c2VkIGluIE5vZGUuanMgdGFyZ2V0cykgYW5kIGJlXG4gKiByZXBsYWNlZCB3aXRoIGB1dGlsLnBhcnNlRW52YC4gSG93ZXZlciwgY3VycmVudGx5IGNhbGxpbmcgdGhhdCBtYWtlcyB0aGVcbiAqIGV4dGVuc2lvbiBob3N0IGNyYXNoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VFbnZGaWxlKHNyYzogc3RyaW5nKSB7XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Ly8gTm9ybWFsaXplIGxpbmUgYnJlYWtzXG5cdGNvbnN0IG5vcm1hbGl6ZWRTcmMgPSBzcmMucmVwbGFjZSgvXFxyXFxuPy9nLCAnXFxuJyk7XG5cdGNvbnN0IGxpbmVzID0gbm9ybWFsaXplZFNyYy5zcGxpdCgnXFxuJyk7XG5cblx0Zm9yIChsZXQgbGluZSBvZiBsaW5lcykge1xuXHRcdC8vIFNraXAgZW1wdHkgbGluZXMgYW5kIGNvbW1lbnRzXG5cdFx0bGluZSA9IGxpbmUudHJpbSgpO1xuXHRcdGlmICghbGluZSB8fCBsaW5lLnN0YXJ0c1dpdGgoJyMnKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gUGFyc2UgdGhlIGxpbmUgaW50byBrZXkgYW5kIHZhbHVlXG5cdFx0Y29uc3QgW2tleSwgdmFsdWVdID0gcGFyc2VMaW5lKGxpbmUpO1xuXHRcdGlmIChrZXkpIHtcblx0XHRcdHJlc3VsdC5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcblxuXHRmdW5jdGlvbiBwYXJzZUxpbmUobGluZTogc3RyaW5nKTogW3N0cmluZywgc3RyaW5nXSB8IFtudWxsLCBudWxsXSB7XG5cdFx0Ly8gSGFuZGxlIGV4cG9ydCBwcmVmaXhcblx0XHRpZiAobGluZS5zdGFydHNXaXRoKCdleHBvcnQgJykpIHtcblx0XHRcdGxpbmUgPSBsaW5lLnN1YnN0cmluZyg3KS50cmltKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUga2V5LXZhbHVlIHNlcGFyYXRvclxuXHRcdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gZmluZEluZGV4T3V0c2lkZVF1b3RlcyhsaW5lLCBjID0+IGMgPT09ICc9JyB8fCBjID09PSAnOicpO1xuXHRcdGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gbGluZS5zdWJzdHJpbmcoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKTtcblx0XHRsZXQgdmFsdWUgPSBsaW5lLnN1YnN0cmluZyhzZXBhcmF0b3JJbmRleCArIDEpLnRyaW0oKTtcblxuXHRcdC8vIEhhbmRsZSBjb21tZW50cyBhbmQgcmVtb3ZlIHRoZW1cblx0XHRjb25zdCBjb21tZW50SW5kZXggPSBmaW5kSW5kZXhPdXRzaWRlUXVvdGVzKHZhbHVlLCBjID0+IGMgPT09ICcjJyk7XG5cdFx0aWYgKGNvbW1lbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKDAsIGNvbW1lbnRJbmRleCkudHJpbSgpO1xuXHRcdH1cblxuXHRcdC8vIFByb2Nlc3MgcXVvdGVkIHZhbHVlc1xuXHRcdGlmICh2YWx1ZS5sZW5ndGggPj0gMikge1xuXHRcdFx0Y29uc3QgZmlyc3RDaGFyID0gdmFsdWVbMF07XG5cdFx0XHRjb25zdCBsYXN0Q2hhciA9IHZhbHVlW3ZhbHVlLmxlbmd0aCAtIDFdO1xuXG5cdFx0XHRpZiAoKGZpcnN0Q2hhciA9PT0gJ1wiJyAmJiBsYXN0Q2hhciA9PT0gJ1wiJykgfHxcblx0XHRcdFx0KGZpcnN0Q2hhciA9PT0gJ1xcJycgJiYgbGFzdENoYXIgPT09ICdcXCcnKSB8fFxuXHRcdFx0XHQoZmlyc3RDaGFyID09PSAnYCcgJiYgbGFzdENoYXIgPT09ICdgJykpIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIHN1cnJvdW5kaW5nIHF1b3Rlc1xuXHRcdFx0XHR2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZygxLCB2YWx1ZS5sZW5ndGggLSAxKTtcblxuXHRcdFx0XHQvLyBIYW5kbGUgZXNjYXBlZCBjaGFyYWN0ZXJzIGluIGRvdWJsZSBxdW90ZXNcblx0XHRcdFx0aWYgKGZpcnN0Q2hhciA9PT0gJ1wiJykge1xuXHRcdFx0XHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZSgvXFxcXG4vZywgJ1xcbicpLnJlcGxhY2UoL1xcXFxyL2csICdcXHInKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBba2V5LCB2YWx1ZV07XG5cdH1cblxuXHRmdW5jdGlvbiBmaW5kSW5kZXhPdXRzaWRlUXVvdGVzKHRleHQ6IHN0cmluZywgcHJlZGljYXRlOiAoY2hhcjogc3RyaW5nKSA9PiBib29sZWFuKTogbnVtYmVyIHtcblx0XHRsZXQgaW5RdW90ZSA9IGZhbHNlO1xuXHRcdGxldCBxdW90ZUNoYXIgPSAnJztcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hhciA9IHRleHRbaV07XG5cblx0XHRcdGlmIChpblF1b3RlKSB7XG5cdFx0XHRcdGlmIChjaGFyID09PSBxdW90ZUNoYXIgJiYgdGV4dFtpIC0gMV0gIT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGluUXVvdGUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjaGFyID09PSAnXCInIHx8IGNoYXIgPT09ICdcXCcnIHx8IGNoYXIgPT09ICdgJykge1xuXHRcdFx0XHRpblF1b3RlID0gdHJ1ZTtcblx0XHRcdFx0cXVvdGVDaGFyID0gY2hhcjtcblx0XHRcdH0gZWxzZSBpZiAocHJlZGljYXRlKGNoYXIpKSB7XG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBYU8sU0FBUyxhQUFhLEtBQWE7QUFDekMsUUFBTSxTQUFTLG9CQUFJLElBQW9CO0FBR3ZDLFFBQU0sZ0JBQWdCLElBQUksUUFBUSxVQUFVLElBQUk7QUFDaEQsUUFBTSxRQUFRLGNBQWMsTUFBTSxJQUFJO0FBRXRDLFdBQVMsUUFBUSxPQUFPO0FBRXZCLFdBQU8sS0FBSyxLQUFLO0FBQ2pCLFFBQUksQ0FBQyxRQUFRLEtBQUssV0FBVyxHQUFHLEdBQUc7QUFDbEM7QUFBQSxJQUNEO0FBR0EsVUFBTSxDQUFDLEtBQUssS0FBSyxJQUFJLFVBQVUsSUFBSTtBQUNuQyxRQUFJLEtBQUs7QUFDUixhQUFPLElBQUksS0FBSyxLQUFLO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUVQLFdBQVMsVUFBVSxNQUErQztBQUVqRSxRQUFJLEtBQUssV0FBVyxTQUFTLEdBQUc7QUFDL0IsYUFBTyxLQUFLLFVBQVUsQ0FBQyxFQUFFLEtBQUs7QUFBQSxJQUMvQjtBQUdBLFVBQU0saUJBQWlCLHVCQUF1QixNQUFNLE9BQUssTUFBTSxPQUFPLE1BQU0sR0FBRztBQUMvRSxRQUFJLG1CQUFtQixJQUFJO0FBQzFCLGFBQU8sQ0FBQyxNQUFNLElBQUk7QUFBQSxJQUNuQjtBQUVBLFVBQU0sTUFBTSxLQUFLLFVBQVUsR0FBRyxjQUFjLEVBQUUsS0FBSztBQUNuRCxRQUFJLFFBQVEsS0FBSyxVQUFVLGlCQUFpQixDQUFDLEVBQUUsS0FBSztBQUdwRCxVQUFNLGVBQWUsdUJBQXVCLE9BQU8sT0FBSyxNQUFNLEdBQUc7QUFDakUsUUFBSSxpQkFBaUIsSUFBSTtBQUN4QixjQUFRLE1BQU0sVUFBVSxHQUFHLFlBQVksRUFBRSxLQUFLO0FBQUEsSUFDL0M7QUFHQSxRQUFJLE1BQU0sVUFBVSxHQUFHO0FBQ3RCLFlBQU0sWUFBWSxNQUFNLENBQUM7QUFDekIsWUFBTSxXQUFXLE1BQU0sTUFBTSxTQUFTLENBQUM7QUFFdkMsVUFBSyxjQUFjLE9BQU8sYUFBYSxPQUNyQyxjQUFjLE9BQVEsYUFBYSxPQUNuQyxjQUFjLE9BQU8sYUFBYSxLQUFNO0FBRXpDLGdCQUFRLE1BQU0sVUFBVSxHQUFHLE1BQU0sU0FBUyxDQUFDO0FBRzNDLFlBQUksY0FBYyxLQUFLO0FBQ3RCLGtCQUFRLE1BQU0sUUFBUSxRQUFRLElBQUksRUFBRSxRQUFRLFFBQVEsSUFBSTtBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLENBQUMsS0FBSyxLQUFLO0FBQUEsRUFDbkI7QUFFQSxXQUFTLHVCQUF1QixNQUFjLFdBQThDO0FBQzNGLFFBQUksVUFBVTtBQUNkLFFBQUksWUFBWTtBQUVoQixhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssUUFBUSxLQUFLO0FBQ3JDLFlBQU0sT0FBTyxLQUFLLENBQUM7QUFFbkIsVUFBSSxTQUFTO0FBQ1osWUFBSSxTQUFTLGFBQWEsS0FBSyxJQUFJLENBQUMsTUFBTSxNQUFNO0FBQy9DLG9CQUFVO0FBQUEsUUFDWDtBQUFBLE1BQ0QsV0FBVyxTQUFTLE9BQU8sU0FBUyxPQUFRLFNBQVMsS0FBSztBQUN6RCxrQkFBVTtBQUNWLG9CQUFZO0FBQUEsTUFDYixXQUFXLFVBQVUsSUFBSSxHQUFHO0FBQzNCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
