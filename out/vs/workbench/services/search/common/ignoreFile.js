import * as glob from "../../../../base/common/glob.js";
import { startsWithIgnoreCase } from "../../../../base/common/strings.js";
class IgnoreFile {
  constructor(contents, location, parent, ignoreCase = false) {
    this.location = location;
    this.parent = parent;
    this.ignoreCase = ignoreCase;
    if (location[location.length - 1] === "\\") {
      throw Error("Unexpected path format, do not use trailing backslashes");
    }
    if (location[location.length - 1] !== "/") {
      location += "/";
    }
    this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
  }
  /**
   * Updates the contents of the ignore file. Preserving the location and parent
   * @param contents The new contents of the gitignore file
   */
  updateContents(contents) {
    this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
  }
  /**
   * Returns true if a path in a traversable directory has not been ignored.
   *
   * Note: For performance reasons this does not check if the parent directories have been ignored,
   * so it should always be used in tandem with `shouldTraverseDir` when walking a directory.
   *
   * In cases where a path must be tested in isolation, `isArbitraryPathIncluded` should be used.
   */
  isPathIncludedInTraversal(path, isDir) {
    if (path[0] !== "/" || path[path.length - 1] === "/") {
      throw Error("Unexpected path format, expected to begin with slash and end without. got:" + path);
    }
    const ignored = this.isPathIgnored(path, isDir);
    return !ignored;
  }
  /**
   * Returns true if an arbitrary path has not been ignored.
   * This is an expensive operation and should only be used outside of traversals.
   */
  isArbitraryPathIgnored(path, isDir) {
    if (path[0] !== "/" || path[path.length - 1] === "/") {
      throw Error("Unexpected path format, expected to begin with slash and end without. got:" + path);
    }
    const segments = path.split("/").filter((x) => x);
    let ignored = false;
    let walkingPath = "";
    for (let i = 0; i < segments.length; i++) {
      const isLast = i === segments.length - 1;
      const segment = segments[i];
      walkingPath = walkingPath + "/" + segment;
      if (!this.isPathIncludedInTraversal(walkingPath, isLast ? isDir : true)) {
        ignored = true;
        break;
      }
    }
    return ignored;
  }
  gitignoreLinesToExpression(lines, dirPath, trimForExclusions) {
    const includeLines = lines.map((line) => this.gitignoreLineToGlob(line, dirPath));
    const includeExpression = /* @__PURE__ */ Object.create(null);
    for (const line of includeLines) {
      includeExpression[line] = true;
    }
    return glob.parse(includeExpression, { trimForExclusions, ignoreCase: this.ignoreCase });
  }
  parseIgnoreFile(ignoreContents, dirPath, parent) {
    const contentLines = ignoreContents.split("\n").map((line) => line.trim()).filter((line) => line && line[0] !== "#");
    const fileLines = contentLines.filter((line) => !line.endsWith("/"));
    const fileIgnoreLines = fileLines.filter((line) => !line.includes("!"));
    const isFileIgnored = this.gitignoreLinesToExpression(fileIgnoreLines, dirPath, true);
    const fileIncludeLines = fileLines.filter((line) => line.includes("!")).map((line) => line.replace(/!/g, ""));
    const isFileIncluded = this.gitignoreLinesToExpression(fileIncludeLines, dirPath, false);
    const dirIgnoreLines = contentLines.filter((line) => !line.includes("!"));
    const isDirIgnored = this.gitignoreLinesToExpression(dirIgnoreLines, dirPath, true);
    const dirIncludeLines = contentLines.filter((line) => line.includes("!")).map((line) => line.replace(/!/g, ""));
    const isDirIncluded = this.gitignoreLinesToExpression(dirIncludeLines, dirPath, false);
    const isPathIgnored = (path, isDir) => {
      if (!(this.ignoreCase ? startsWithIgnoreCase(path, dirPath) : path.startsWith(dirPath))) {
        return false;
      }
      const dirIncluded = isDir && isDirIncluded(path);
      if (isDir && isDirIgnored(path) && !dirIncluded) {
        return true;
      }
      const fileIncluded = isFileIncluded(path);
      if (isFileIgnored(path) && !fileIncluded) {
        return true;
      }
      if (dirIncluded || fileIncluded) {
        return false;
      }
      if (parent) {
        return parent.isPathIgnored(path, isDir);
      }
      return false;
    };
    return isPathIgnored;
  }
  gitignoreLineToGlob(line, dirPath) {
    const firstSep = line.indexOf("/");
    if (firstSep === -1 || firstSep === line.length - 1) {
      line = "**/" + line;
    } else {
      if (firstSep === 0) {
        if (dirPath.slice(-1) === "/") {
          line = line.slice(1);
        }
      } else {
        if (dirPath.slice(-1) !== "/") {
          line = "/" + line;
        }
      }
      line = dirPath + line;
    }
    return line;
  }
}
export {
  IgnoreFile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGNvbW1vblxcaWdub3JlRmlsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBzdGFydHNXaXRoSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuXG5leHBvcnQgY2xhc3MgSWdub3JlRmlsZSB7XG5cblx0cHJpdmF0ZSBpc1BhdGhJZ25vcmVkOiAocGF0aDogc3RyaW5nLCBpc0RpcjogYm9vbGVhbiwgcGFyZW50PzogSWdub3JlRmlsZSkgPT4gYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZW50czogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb246IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhcmVudD86IElnbm9yZUZpbGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpZ25vcmVDYXNlID0gZmFsc2UpIHtcblx0XHRpZiAobG9jYXRpb25bbG9jYXRpb24ubGVuZ3RoIC0gMV0gPT09ICdcXFxcJykge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ1VuZXhwZWN0ZWQgcGF0aCBmb3JtYXQsIGRvIG5vdCB1c2UgdHJhaWxpbmcgYmFja3NsYXNoZXMnKTtcblx0XHR9XG5cdFx0aWYgKGxvY2F0aW9uW2xvY2F0aW9uLmxlbmd0aCAtIDFdICE9PSAnLycpIHtcblx0XHRcdGxvY2F0aW9uICs9ICcvJztcblx0XHR9XG5cdFx0dGhpcy5pc1BhdGhJZ25vcmVkID0gdGhpcy5wYXJzZUlnbm9yZUZpbGUoY29udGVudHMsIHRoaXMubG9jYXRpb24sIHRoaXMucGFyZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBjb250ZW50cyBvZiB0aGUgaWdub3JlIGZpbGUuIFByZXNlcnZpbmcgdGhlIGxvY2F0aW9uIGFuZCBwYXJlbnRcblx0ICogQHBhcmFtIGNvbnRlbnRzIFRoZSBuZXcgY29udGVudHMgb2YgdGhlIGdpdGlnbm9yZSBmaWxlXG5cdCAqL1xuXHR1cGRhdGVDb250ZW50cyhjb250ZW50czogc3RyaW5nKSB7XG5cdFx0dGhpcy5pc1BhdGhJZ25vcmVkID0gdGhpcy5wYXJzZUlnbm9yZUZpbGUoY29udGVudHMsIHRoaXMubG9jYXRpb24sIHRoaXMucGFyZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgYSBwYXRoIGluIGEgdHJhdmVyc2FibGUgZGlyZWN0b3J5IGhhcyBub3QgYmVlbiBpZ25vcmVkLlxuXHQgKlxuXHQgKiBOb3RlOiBGb3IgcGVyZm9ybWFuY2UgcmVhc29ucyB0aGlzIGRvZXMgbm90IGNoZWNrIGlmIHRoZSBwYXJlbnQgZGlyZWN0b3JpZXMgaGF2ZSBiZWVuIGlnbm9yZWQsXG5cdCAqIHNvIGl0IHNob3VsZCBhbHdheXMgYmUgdXNlZCBpbiB0YW5kZW0gd2l0aCBgc2hvdWxkVHJhdmVyc2VEaXJgIHdoZW4gd2Fsa2luZyBhIGRpcmVjdG9yeS5cblx0ICpcblx0ICogSW4gY2FzZXMgd2hlcmUgYSBwYXRoIG11c3QgYmUgdGVzdGVkIGluIGlzb2xhdGlvbiwgYGlzQXJiaXRyYXJ5UGF0aEluY2x1ZGVkYCBzaG91bGQgYmUgdXNlZC5cblx0ICovXG5cdGlzUGF0aEluY2x1ZGVkSW5UcmF2ZXJzYWwocGF0aDogc3RyaW5nLCBpc0RpcjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmIChwYXRoWzBdICE9PSAnLycgfHwgcGF0aFtwYXRoLmxlbmd0aCAtIDFdID09PSAnLycpIHtcblx0XHRcdHRocm93IEVycm9yKCdVbmV4cGVjdGVkIHBhdGggZm9ybWF0LCBleHBlY3RlZCB0byBiZWdpbiB3aXRoIHNsYXNoIGFuZCBlbmQgd2l0aG91dC4gZ290OicgKyBwYXRoKTtcblx0XHR9XG5cblx0XHRjb25zdCBpZ25vcmVkID0gdGhpcy5pc1BhdGhJZ25vcmVkKHBhdGgsIGlzRGlyKTtcblxuXHRcdHJldHVybiAhaWdub3JlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgYW4gYXJiaXRyYXJ5IHBhdGggaGFzIG5vdCBiZWVuIGlnbm9yZWQuXG5cdCAqIFRoaXMgaXMgYW4gZXhwZW5zaXZlIG9wZXJhdGlvbiBhbmQgc2hvdWxkIG9ubHkgYmUgdXNlZCBvdXRzaWRlIG9mIHRyYXZlcnNhbHMuXG5cdCAqL1xuXHRpc0FyYml0cmFyeVBhdGhJZ25vcmVkKHBhdGg6IHN0cmluZywgaXNEaXI6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAocGF0aFswXSAhPT0gJy8nIHx8IHBhdGhbcGF0aC5sZW5ndGggLSAxXSA9PT0gJy8nKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignVW5leHBlY3RlZCBwYXRoIGZvcm1hdCwgZXhwZWN0ZWQgdG8gYmVnaW4gd2l0aCBzbGFzaCBhbmQgZW5kIHdpdGhvdXQuIGdvdDonICsgcGF0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VnbWVudHMgPSBwYXRoLnNwbGl0KCcvJykuZmlsdGVyKHggPT4geCk7XG5cdFx0bGV0IGlnbm9yZWQgPSBmYWxzZTtcblxuXHRcdGxldCB3YWxraW5nUGF0aCA9ICcnO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZWdtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaXNMYXN0ID0gaSA9PT0gc2VnbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdGNvbnN0IHNlZ21lbnQgPSBzZWdtZW50c1tpXTtcblxuXHRcdFx0d2Fsa2luZ1BhdGggPSB3YWxraW5nUGF0aCArICcvJyArIHNlZ21lbnQ7XG5cblx0XHRcdGlmICghdGhpcy5pc1BhdGhJbmNsdWRlZEluVHJhdmVyc2FsKHdhbGtpbmdQYXRoLCBpc0xhc3QgPyBpc0RpciA6IHRydWUpKSB7XG5cdFx0XHRcdGlnbm9yZWQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaWdub3JlZDtcblx0fVxuXG5cdHByaXZhdGUgZ2l0aWdub3JlTGluZXNUb0V4cHJlc3Npb24obGluZXM6IHN0cmluZ1tdLCBkaXJQYXRoOiBzdHJpbmcsIHRyaW1Gb3JFeGNsdXNpb25zOiBib29sZWFuKTogZ2xvYi5QYXJzZWRFeHByZXNzaW9uIHtcblx0XHRjb25zdCBpbmNsdWRlTGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiB0aGlzLmdpdGlnbm9yZUxpbmVUb0dsb2IobGluZSwgZGlyUGF0aCkpO1xuXG5cdFx0Y29uc3QgaW5jbHVkZUV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb24gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBpbmNsdWRlTGluZXMpIHtcblx0XHRcdGluY2x1ZGVFeHByZXNzaW9uW2xpbmVdID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2xvYi5wYXJzZShpbmNsdWRlRXhwcmVzc2lvbiwgeyB0cmltRm9yRXhjbHVzaW9ucywgaWdub3JlQ2FzZTogdGhpcy5pZ25vcmVDYXNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZUlnbm9yZUZpbGUoaWdub3JlQ29udGVudHM6IHN0cmluZywgZGlyUGF0aDogc3RyaW5nLCBwYXJlbnQ6IElnbm9yZUZpbGUgfCB1bmRlZmluZWQpOiAocGF0aDogc3RyaW5nLCBpc0RpcjogYm9vbGVhbikgPT4gYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29udGVudExpbmVzID0gaWdub3JlQ29udGVudHNcblx0XHRcdC5zcGxpdCgnXFxuJylcblx0XHRcdC5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSlcblx0XHRcdC5maWx0ZXIobGluZSA9PiBsaW5lICYmIGxpbmVbMF0gIT09ICcjJyk7XG5cblx0XHQvLyBQdWxsIG91dCBhbGwgdGhlIGxpbmVzIHRoYXQgZW5kIHdpdGggYC9gLCB0aG9zZSBvbmx5IGFwcGx5IHRvIGRpcmVjdG9yaWVzXG5cdFx0Y29uc3QgZmlsZUxpbmVzID0gY29udGVudExpbmVzLmZpbHRlcihsaW5lID0+ICFsaW5lLmVuZHNXaXRoKCcvJykpO1xuXG5cdFx0Y29uc3QgZmlsZUlnbm9yZUxpbmVzID0gZmlsZUxpbmVzLmZpbHRlcihsaW5lID0+ICFsaW5lLmluY2x1ZGVzKCchJykpO1xuXHRcdGNvbnN0IGlzRmlsZUlnbm9yZWQgPSB0aGlzLmdpdGlnbm9yZUxpbmVzVG9FeHByZXNzaW9uKGZpbGVJZ25vcmVMaW5lcywgZGlyUGF0aCwgdHJ1ZSk7XG5cblx0XHQvLyBUT0RPOiBTbGlnaHQgaGFjay4uLiB0aGlzIG5haXZlIGFwcHJvYWNoIG1heSByZWludHJvZHVjZSB0b28gbWFueSBmaWxlcyBpbiBjYXNlcyBvZiB3ZWlyZGx5IGNvbXBsZXggLmdpdGlnbm9yZXNcblx0XHRjb25zdCBmaWxlSW5jbHVkZUxpbmVzID0gZmlsZUxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUuaW5jbHVkZXMoJyEnKSkubWFwKGxpbmUgPT4gbGluZS5yZXBsYWNlKC8hL2csICcnKSk7XG5cdFx0Y29uc3QgaXNGaWxlSW5jbHVkZWQgPSB0aGlzLmdpdGlnbm9yZUxpbmVzVG9FeHByZXNzaW9uKGZpbGVJbmNsdWRlTGluZXMsIGRpclBhdGgsIGZhbHNlKTtcblxuXHRcdC8vIFdoZW4gY2hlY2tpbmcgaWYgYSBkaXIgaXMgaWdub3JlZCB3ZSBjYW4gdXNlIGFsbCBsaW5lc1xuXHRcdGNvbnN0IGRpcklnbm9yZUxpbmVzID0gY29udGVudExpbmVzLmZpbHRlcihsaW5lID0+ICFsaW5lLmluY2x1ZGVzKCchJykpO1xuXHRcdGNvbnN0IGlzRGlySWdub3JlZCA9IHRoaXMuZ2l0aWdub3JlTGluZXNUb0V4cHJlc3Npb24oZGlySWdub3JlTGluZXMsIGRpclBhdGgsIHRydWUpO1xuXG5cdFx0Ly8gU2FtZSBoYWNrLlxuXHRcdGNvbnN0IGRpckluY2x1ZGVMaW5lcyA9IGNvbnRlbnRMaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lLmluY2x1ZGVzKCchJykpLm1hcChsaW5lID0+IGxpbmUucmVwbGFjZSgvIS9nLCAnJykpO1xuXHRcdGNvbnN0IGlzRGlySW5jbHVkZWQgPSB0aGlzLmdpdGlnbm9yZUxpbmVzVG9FeHByZXNzaW9uKGRpckluY2x1ZGVMaW5lcywgZGlyUGF0aCwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgaXNQYXRoSWdub3JlZCA9IChwYXRoOiBzdHJpbmcsIGlzRGlyOiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoISh0aGlzLmlnbm9yZUNhc2UgPyBzdGFydHNXaXRoSWdub3JlQ2FzZShwYXRoLCBkaXJQYXRoKSA6IHBhdGguc3RhcnRzV2l0aChkaXJQYXRoKSkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRcdGNvbnN0IGRpckluY2x1ZGVkID0gaXNEaXIgJiYgaXNEaXJJbmNsdWRlZChwYXRoKTtcblx0XHRcdGlmIChpc0RpciAmJiBpc0Rpcklnbm9yZWQocGF0aCkgJiYgIWRpckluY2x1ZGVkKSB7IHJldHVybiB0cnVlOyB9XG5cblx0XHRcdGNvbnN0IGZpbGVJbmNsdWRlZCA9IGlzRmlsZUluY2x1ZGVkKHBhdGgpO1xuXHRcdFx0aWYgKGlzRmlsZUlnbm9yZWQocGF0aCkgJiYgIWZpbGVJbmNsdWRlZCkgeyByZXR1cm4gdHJ1ZTsgfVxuXG5cdFx0XHQvLyBJZiB0aGlzIGZpbGUgZXhwbGljaXRseSB1bi1pZ25vcmVzIGEgcGF0aCB2aWEgYSBuZWdhdGlvbiBwYXR0ZXJuXG5cdFx0XHQvLyAoZS5nLiwgYCEubXljb25maWcvYCksIGRvIG5vdCBkZWxlZ2F0ZSB0byB0aGUgcGFyZW50LiBJbiBnaXQsIGFcblx0XHRcdC8vIG5lZ2F0aW9uIGluIGEgY2hpbGQgLmdpdGlnbm9yZSBvdmVycmlkZXMgYSBwb3NpdGl2ZSBwYXR0ZXJuIGluIGFcblx0XHRcdC8vIHBhcmVudCBvciBnbG9iYWwgLmdpdGlnbm9yZS5cblx0XHRcdGlmIChkaXJJbmNsdWRlZCB8fCBmaWxlSW5jbHVkZWQpIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRcdGlmIChwYXJlbnQpIHsgcmV0dXJuIHBhcmVudC5pc1BhdGhJZ25vcmVkKHBhdGgsIGlzRGlyKTsgfVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdHJldHVybiBpc1BhdGhJZ25vcmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnaXRpZ25vcmVMaW5lVG9HbG9iKGxpbmU6IHN0cmluZywgZGlyUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBmaXJzdFNlcCA9IGxpbmUuaW5kZXhPZignLycpO1xuXHRcdGlmIChmaXJzdFNlcCA9PT0gLTEgfHwgZmlyc3RTZXAgPT09IGxpbmUubGVuZ3RoIC0gMSkge1xuXHRcdFx0bGluZSA9ICcqKi8nICsgbGluZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGZpcnN0U2VwID09PSAwKSB7XG5cdFx0XHRcdGlmIChkaXJQYXRoLnNsaWNlKC0xKSA9PT0gJy8nKSB7XG5cdFx0XHRcdFx0bGluZSA9IGxpbmUuc2xpY2UoMSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChkaXJQYXRoLnNsaWNlKC0xKSAhPT0gJy8nKSB7XG5cdFx0XHRcdFx0bGluZSA9ICcvJyArIGxpbmU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxpbmUgPSBkaXJQYXRoICsgbGluZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGluZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsNEJBQTRCO0FBRTlCLE1BQU0sV0FBVztBQUFBLEVBSXZCLFlBQ0MsVUFDaUIsVUFDQSxRQUNBLGFBQWEsT0FBTztBQUZwQjtBQUNBO0FBQ0E7QUFDakIsUUFBSSxTQUFTLFNBQVMsU0FBUyxDQUFDLE1BQU0sTUFBTTtBQUMzQyxZQUFNLE1BQU0seURBQXlEO0FBQUEsSUFDdEU7QUFDQSxRQUFJLFNBQVMsU0FBUyxTQUFTLENBQUMsTUFBTSxLQUFLO0FBQzFDLGtCQUFZO0FBQUEsSUFDYjtBQUNBLFNBQUssZ0JBQWdCLEtBQUssZ0JBQWdCLFVBQVUsS0FBSyxVQUFVLEtBQUssTUFBTTtBQUFBLEVBQy9FO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGVBQWUsVUFBa0I7QUFDaEMsU0FBSyxnQkFBZ0IsS0FBSyxnQkFBZ0IsVUFBVSxLQUFLLFVBQVUsS0FBSyxNQUFNO0FBQUEsRUFDL0U7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSwwQkFBMEIsTUFBYyxPQUF5QjtBQUNoRSxRQUFJLEtBQUssQ0FBQyxNQUFNLE9BQU8sS0FBSyxLQUFLLFNBQVMsQ0FBQyxNQUFNLEtBQUs7QUFDckQsWUFBTSxNQUFNLCtFQUErRSxJQUFJO0FBQUEsSUFDaEc7QUFFQSxVQUFNLFVBQVUsS0FBSyxjQUFjLE1BQU0sS0FBSztBQUU5QyxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLHVCQUF1QixNQUFjLE9BQXlCO0FBQzdELFFBQUksS0FBSyxDQUFDLE1BQU0sT0FBTyxLQUFLLEtBQUssU0FBUyxDQUFDLE1BQU0sS0FBSztBQUNyRCxZQUFNLE1BQU0sK0VBQStF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
