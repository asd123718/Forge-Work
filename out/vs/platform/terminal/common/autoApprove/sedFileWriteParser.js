class SedFileWriteParser {
  constructor() {
    this.commandName = "sed";
  }
  canHandle(commandText) {
    if (!commandText.match(/^sed\s+/)) {
      return false;
    }
    const inPlaceRegex = /(?:^|\s)(-[a-zA-Z]*[iI][a-zA-Z]*\S*|--in-place(?:=\S*)?|(-i|-I)\s*'[^']*'|(-i|-I)\s*"[^"]*")(?:\s|$)/;
    return inPlaceRegex.test(commandText);
  }
  extractFileWrites(commandText) {
    const tokens = this._tokenizeCommand(commandText);
    return this._extractFileTargets(tokens);
  }
  /**
   * Tokenizes a command into individual arguments, handling quotes and escapes.
   */
  _tokenizeCommand(commandText) {
    const tokens = [];
    let current = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;
    for (let i = 0; i < commandText.length; i++) {
      const char = commandText[i];
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\" && !inSingleQuote) {
        escaped = true;
        current += char;
        continue;
      }
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        current += char;
        continue;
      }
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
        continue;
      }
      if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }
    if (current) {
      tokens.push(current);
    }
    return tokens;
  }
  /**
   * Extracts file targets from tokenized sed command arguments.
   * Files are generally the last non-option, non-script arguments.
   */
  _extractFileTargets(tokens) {
    if (tokens.length === 0 || tokens[0] !== "sed") {
      return [];
    }
    const files = [];
    let i = 1;
    let foundScript = false;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.startsWith("--")) {
        if (token === "--in-place" || token.startsWith("--in-place=")) {
          i++;
          continue;
        }
        if (token === "--expression" || token === "--file") {
          i += 2;
          foundScript = true;
          continue;
        }
        if (token.startsWith("--expression=") || token.startsWith("--file=")) {
          i++;
          foundScript = true;
          continue;
        }
        i++;
        continue;
      }
      if (token.startsWith("-") && token.length > 1 && token[1] !== "-") {
        const flags = token.slice(1);
        const iIndex = flags.indexOf("i");
        const IIndex = flags.indexOf("I");
        const inPlaceIndex = iIndex >= 0 ? iIndex : IIndex;
        if (inPlaceIndex >= 0 && inPlaceIndex < flags.length - 1) {
          i++;
          continue;
        }
        if ((flags.endsWith("i") || flags.endsWith("I")) && i + 1 < tokens.length) {
          const nextToken = tokens[i + 1];
          if (nextToken === "''" || nextToken === '""') {
            i += 2;
            continue;
          }
          if (nextToken.startsWith("'") && nextToken.endsWith("'") || nextToken.startsWith('"') && nextToken.endsWith('"')) {
            const unquoted = nextToken.slice(1, -1);
            if (unquoted.startsWith(".") && unquoted.length <= 10 && !unquoted.includes("/")) {
              i += 2;
              continue;
            }
          }
        }
        if (flags.includes("e") || flags.includes("f")) {
          const eIndex = flags.indexOf("e");
          const fIndex = flags.indexOf("f");
          const optIndex = eIndex >= 0 ? eIndex : fIndex;
          if (optIndex < flags.length - 1) {
            foundScript = true;
            i++;
            continue;
          }
          foundScript = true;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (!foundScript) {
        foundScript = true;
        i++;
        continue;
      }
      let file = token;
      if (file.startsWith("'") && file.endsWith("'") || file.startsWith('"') && file.endsWith('"')) {
        file = file.slice(1, -1);
      }
      files.push(file);
      i++;
    }
    return files;
  }
}
export {
  SedFileWriteParser
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcYXV0b0FwcHJvdmVcXHNlZEZpbGVXcml0ZVBhcnNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogUGFyc2VyIGZvciBkZXRlY3RpbmcgZmlsZSB3cml0ZXMgZnJvbSBgc2VkYCBjb21tYW5kcyB1c2luZyBpbi1wbGFjZSBlZGl0aW5nLlxuICpcbiAqIEhhbmRsZXM6XG4gKiAtIGBzZWQgLWkgJ3MvZm9vL2Jhci8nIGZpbGUudHh0YCAoR05VKVxuICogLSBgc2VkIC1pLmJhayAncy9mb28vYmFyLycgZmlsZS50eHRgIChHTlUgd2l0aCBiYWNrdXAgc3VmZml4KVxuICogLSBgc2VkIC1pICcnICdzL2Zvby9iYXIvJyBmaWxlLnR4dGAgKG1hY09TL0JTRCB3aXRoIGVtcHR5IGJhY2t1cCBzdWZmaXgpXG4gKiAtIGBzZWQgLS1pbi1wbGFjZSAncy9mb28vYmFyLycgZmlsZS50eHRgIChHTlUgbG9uZyBmb3JtKVxuICogLSBgc2VkIC0taW4tcGxhY2U9LmJhayAncy9mb28vYmFyLycgZmlsZS50eHRgIChHTlUgbG9uZyBmb3JtIHdpdGggYmFja3VwKVxuICogLSBgc2VkIC1JICdzL2Zvby9iYXIvJyBmaWxlLnR4dGAgKEJTRCBjYXNlLWluc2Vuc2l0aXZlIHZhcmlhbnQpXG4gKi9cbmV4cG9ydCBjbGFzcyBTZWRGaWxlV3JpdGVQYXJzZXIge1xuXHRyZWFkb25seSBjb21tYW5kTmFtZSA9ICdzZWQnO1xuXG5cdGNhbkhhbmRsZShjb21tYW5kVGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIHNlZCBjb21tYW5kXG5cdFx0aWYgKCFjb21tYW5kVGV4dC5tYXRjaCgvXnNlZFxccysvKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciAtaSwgLUksIG9yIC0taW4tcGxhY2UgZmxhZ1xuXHRcdGNvbnN0IGluUGxhY2VSZWdleCA9IC8oPzpefFxccykoLVthLXpBLVpdKltpSV1bYS16QS1aXSpcXFMqfC0taW4tcGxhY2UoPzo9XFxTKik/fCgtaXwtSSlcXHMqJ1teJ10qJ3woLWl8LUkpXFxzKlwiW15cIl0qXCIpKD86XFxzfCQpLztcblx0XHRyZXR1cm4gaW5QbGFjZVJlZ2V4LnRlc3QoY29tbWFuZFRleHQpO1xuXHR9XG5cblx0ZXh0cmFjdEZpbGVXcml0ZXMoY29tbWFuZFRleHQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl90b2tlbml6ZUNvbW1hbmQoY29tbWFuZFRleHQpO1xuXHRcdHJldHVybiB0aGlzLl9leHRyYWN0RmlsZVRhcmdldHModG9rZW5zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2tlbml6ZXMgYSBjb21tYW5kIGludG8gaW5kaXZpZHVhbCBhcmd1bWVudHMsIGhhbmRsaW5nIHF1b3RlcyBhbmQgZXNjYXBlcy5cblx0ICovXG5cdHByaXZhdGUgX3Rva2VuaXplQ29tbWFuZChjb21tYW5kVGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHRva2Vuczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgY3VycmVudCA9ICcnO1xuXHRcdGxldCBpblNpbmdsZVF1b3RlID0gZmFsc2U7XG5cdFx0bGV0IGluRG91YmxlUXVvdGUgPSBmYWxzZTtcblx0XHRsZXQgZXNjYXBlZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb21tYW5kVGV4dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hhciA9IGNvbW1hbmRUZXh0W2ldO1xuXG5cdFx0XHRpZiAoZXNjYXBlZCkge1xuXHRcdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0XHRcdGVzY2FwZWQgPSBmYWxzZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFyID09PSAnXFxcXCcgJiYgIWluU2luZ2xlUXVvdGUpIHtcblx0XHRcdFx0ZXNjYXBlZCA9IHRydWU7XG5cdFx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFyID09PSAnXFwnJyAmJiAhaW5Eb3VibGVRdW90ZSkge1xuXHRcdFx0XHRpblNpbmdsZVF1b3RlID0gIWluU2luZ2xlUXVvdGU7XG5cdFx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFyID09PSAnXCInICYmICFpblNpbmdsZVF1b3RlKSB7XG5cdFx0XHRcdGluRG91YmxlUXVvdGUgPSAhaW5Eb3VibGVRdW90ZTtcblx0XHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKC9cXHMvLnRlc3QoY2hhcikgJiYgIWluU2luZ2xlUXVvdGUgJiYgIWluRG91YmxlUXVvdGUpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnQpIHtcblx0XHRcdFx0XHR0b2tlbnMucHVzaChjdXJyZW50KTtcblx0XHRcdFx0XHRjdXJyZW50ID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0dG9rZW5zLnB1c2goY3VycmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRva2Vucztcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHRyYWN0cyBmaWxlIHRhcmdldHMgZnJvbSB0b2tlbml6ZWQgc2VkIGNvbW1hbmQgYXJndW1lbnRzLlxuXHQgKiBGaWxlcyBhcmUgZ2VuZXJhbGx5IHRoZSBsYXN0IG5vbi1vcHRpb24sIG5vbi1zY3JpcHQgYXJndW1lbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZXh0cmFjdEZpbGVUYXJnZXRzKHRva2Vuczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0aWYgKHRva2Vucy5sZW5ndGggPT09IDAgfHwgdG9rZW5zWzBdICE9PSAnc2VkJykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBpID0gMTsgLy8gU2tpcCAnc2VkJ1xuXHRcdGxldCBmb3VuZFNjcmlwdCA9IGZhbHNlO1xuXG5cdFx0d2hpbGUgKGkgPCB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1tpXTtcblxuXHRcdFx0Ly8gTG9uZyBvcHRpb25zXG5cdFx0XHRpZiAodG9rZW4uc3RhcnRzV2l0aCgnLS0nKSkge1xuXHRcdFx0XHRpZiAodG9rZW4gPT09ICctLWluLXBsYWNlJyB8fCB0b2tlbi5zdGFydHNXaXRoKCctLWluLXBsYWNlPScpKSB7XG5cdFx0XHRcdFx0Ly8gSW4tcGxhY2UgZmxhZyAoYWxyZWFkeSB2ZXJpZmllZCB3ZSBoYXZlIG9uZSlcblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRva2VuID09PSAnLS1leHByZXNzaW9uJyB8fCB0b2tlbiA9PT0gJy0tZmlsZScpIHtcblx0XHRcdFx0XHQvLyBTa2lwIHRoZSBvcHRpb24gYW5kIGl0cyBhcmd1bWVudFxuXHRcdFx0XHRcdGkgKz0gMjtcblx0XHRcdFx0XHRmb3VuZFNjcmlwdCA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRva2VuLnN0YXJ0c1dpdGgoJy0tZXhwcmVzc2lvbj0nKSB8fCB0b2tlbi5zdGFydHNXaXRoKCctLWZpbGU9JykpIHtcblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0Zm91bmRTY3JpcHQgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE90aGVyIGxvbmcgb3B0aW9ucyBsaWtlIC0tc2FuZGJveCwgLS1kZWJ1ZywgZXRjLlxuXHRcdFx0XHRpKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG9ydCBvcHRpb25zXG5cdFx0XHRpZiAodG9rZW4uc3RhcnRzV2l0aCgnLScpICYmIHRva2VuLmxlbmd0aCA+IDEgJiYgdG9rZW5bMV0gIT09ICctJykge1xuXHRcdFx0XHQvLyBDb3VsZCBiZSBjb21iaW5lZCBmbGFncyBsaWtlIC1uaSBvciAtaS5iYWtcblx0XHRcdFx0Y29uc3QgZmxhZ3MgPSB0b2tlbi5zbGljZSgxKTtcblxuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIC1pIHdpdGggYmFja3VwIHN1ZmZpeCBhdHRhY2hlZCAoZS5nLiwgLWkuYmFrKVxuXHRcdFx0XHRjb25zdCBpSW5kZXggPSBmbGFncy5pbmRleE9mKCdpJyk7XG5cdFx0XHRcdGNvbnN0IElJbmRleCA9IGZsYWdzLmluZGV4T2YoJ0knKTtcblx0XHRcdFx0Y29uc3QgaW5QbGFjZUluZGV4ID0gaUluZGV4ID49IDAgPyBpSW5kZXggOiBJSW5kZXg7XG5cblx0XHRcdFx0aWYgKGluUGxhY2VJbmRleCA+PSAwICYmIGluUGxhY2VJbmRleCA8IGZsYWdzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHQvLyAtaS5iYWsgc3R5bGUgLSBiYWNrdXAgc3VmZml4IGlzIGF0dGFjaGVkXG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgLWkgb3IgLUkgaXMgdGhlIGxhc3QgZmxhZyBhbmQgbmV4dCB0b2tlbiBjb3VsZCBiZSBiYWNrdXAgc3VmZml4XG5cdFx0XHRcdGlmICgoZmxhZ3MuZW5kc1dpdGgoJ2knKSB8fCBmbGFncy5lbmRzV2l0aCgnSScpKSAmJiBpICsgMSA8IHRva2Vucy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBuZXh0VG9rZW4gPSB0b2tlbnNbaSArIDFdO1xuXHRcdFx0XHRcdC8vIG1hY09TL0JTRCBzdHlsZTogLWkgJycgb3IgLWkgXCJcIiAoZW1wdHkgc3RyaW5nIGJhY2t1cCBzdWZmaXgpXG5cdFx0XHRcdFx0Ly8gT25seSB0cmVhdCBpdCBhcyBhIGJhY2t1cCBzdWZmaXggaWYgaXQncyBlbXB0eSBvciBsb29rcyBsaWtlIGEgYmFja3VwXG5cdFx0XHRcdFx0Ly8gZXh0ZW5zaW9uIChzdGFydHMgd2l0aCAnLicgYW5kIGlzIHNob3J0KS4gRG9uJ3QgbWF0Y2ggc2VkIHNjcmlwdHMgbGlrZSAncy9mb28vYmFyLycuXG5cdFx0XHRcdFx0aWYgKG5leHRUb2tlbiA9PT0gJ1xcJ1xcJycgfHwgbmV4dFRva2VuID09PSAnXCJcIicpIHtcblx0XHRcdFx0XHRcdGkgKz0gMjtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDaGVjayBmb3IgcXVvdGVkIGJhY2t1cCBzdWZmaXhlcyBsaWtlICcuYmFrJyBvciBcIi5iYWNrdXBcIlxuXHRcdFx0XHRcdGlmICgobmV4dFRva2VuLnN0YXJ0c1dpdGgoJ1xcJycpICYmIG5leHRUb2tlbi5lbmRzV2l0aCgnXFwnJykpIHx8IChuZXh0VG9rZW4uc3RhcnRzV2l0aCgnXCInKSAmJiBuZXh0VG9rZW4uZW5kc1dpdGgoJ1wiJykpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1bnF1b3RlZCA9IG5leHRUb2tlbi5zbGljZSgxLCAtMSk7XG5cdFx0XHRcdFx0XHQvLyBCYWNrdXAgc3VmZml4ZXMgdHlwaWNhbGx5IHN0YXJ0IHdpdGggJy4nIGFuZCBhcmUgc2hvcnQgZXh0ZW5zaW9uc1xuXHRcdFx0XHRcdFx0aWYgKHVucXVvdGVkLnN0YXJ0c1dpdGgoJy4nKSAmJiB1bnF1b3RlZC5sZW5ndGggPD0gMTAgJiYgIXVucXVvdGVkLmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdFx0XHRcdFx0aSArPSAyO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDaGVjayBmb3IgLWUgb3IgLWYgd2hpY2ggdGFrZSBhcmd1bWVudHNcblx0XHRcdFx0aWYgKGZsYWdzLmluY2x1ZGVzKCdlJykgfHwgZmxhZ3MuaW5jbHVkZXMoJ2YnKSkge1xuXHRcdFx0XHRcdGNvbnN0IGVJbmRleCA9IGZsYWdzLmluZGV4T2YoJ2UnKTtcblx0XHRcdFx0XHRjb25zdCBmSW5kZXggPSBmbGFncy5pbmRleE9mKCdmJyk7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0SW5kZXggPSBlSW5kZXggPj0gMCA/IGVJbmRleCA6IGZJbmRleDtcblxuXHRcdFx0XHRcdC8vIElmIC1lIG9yIC1mIGlzIG5vdCB0aGUgbGFzdCBjaGFyYWN0ZXIsIHRoZSByZXN0IG9mIHRoZSB0b2tlbiBpcyB0aGUgYXJndW1lbnRcblx0XHRcdFx0XHRpZiAob3B0SW5kZXggPCBmbGFncy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0XHRmb3VuZFNjcmlwdCA9IHRydWU7XG5cdFx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBPdGhlcndpc2UsIHRoZSBuZXh0IHRva2VuIGlzIHRoZSBhcmd1bWVudFxuXHRcdFx0XHRcdGZvdW5kU2NyaXB0ID0gdHJ1ZTtcblx0XHRcdFx0XHRpICs9IDI7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOb24tb3B0aW9uIGFyZ3VtZW50XG5cdFx0XHRpZiAoIWZvdW5kU2NyaXB0KSB7XG5cdFx0XHRcdC8vIEZpcnN0IG5vbi1vcHRpb24gaXMgdGhlIHNjcmlwdCAodW5sZXNzIC1lLy1mIHdhcyB1c2VkKVxuXHRcdFx0XHRmb3VuZFNjcmlwdCA9IHRydWU7XG5cdFx0XHRcdGkrKztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1YnNlcXVlbnQgbm9uLW9wdGlvbiBhcmd1bWVudHMgYXJlIGZpbGVzXG5cdFx0XHQvLyBTdHJpcCBzdXJyb3VuZGluZyBxdW90ZXMgZnJvbSBmaWxlIHBhdGhcblx0XHRcdGxldCBmaWxlID0gdG9rZW47XG5cdFx0XHRpZiAoKGZpbGUuc3RhcnRzV2l0aCgnXFwnJykgJiYgZmlsZS5lbmRzV2l0aCgnXFwnJykpIHx8IChmaWxlLnN0YXJ0c1dpdGgoJ1wiJykgJiYgZmlsZS5lbmRzV2l0aCgnXCInKSkpIHtcblx0XHRcdFx0ZmlsZSA9IGZpbGUuc2xpY2UoMSwgLTEpO1xuXHRcdFx0fVxuXHRcdFx0ZmlsZXMucHVzaChmaWxlKTtcblx0XHRcdGkrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZXM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQWdCTyxNQUFNLG1CQUFtQjtBQUFBLEVBQXpCO0FBQ04sU0FBUyxjQUFjO0FBQUE7QUFBQSxFQUV2QixVQUFVLGFBQThCO0FBRXZDLFFBQUksQ0FBQyxZQUFZLE1BQU0sU0FBUyxHQUFHO0FBQ2xDLGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxlQUFlO0FBQ3JCLFdBQU8sYUFBYSxLQUFLLFdBQVc7QUFBQSxFQUNyQztBQUFBLEVBRUEsa0JBQWtCLGFBQStCO0FBQ2hELFVBQU0sU0FBUyxLQUFLLGlCQUFpQixXQUFXO0FBQ2hELFdBQU8sS0FBSyxvQkFBb0IsTUFBTTtBQUFBLEVBQ3ZDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxpQkFBaUIsYUFBK0I7QUFDdkQsVUFBTSxTQUFtQixDQUFDO0FBQzFCLFFBQUksVUFBVTtBQUNkLFFBQUksZ0JBQWdCO0FBQ3BCLFFBQUksZ0JBQWdCO0FBQ3BCLFFBQUksVUFBVTtBQUVkLGFBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxRQUFRLEtBQUs7QUFDNUMsWUFBTSxPQUFPLFlBQVksQ0FBQztBQUUxQixVQUFJLFNBQVM7QUFDWixtQkFBVztBQUNYLGtCQUFVO0FBQ1Y7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTLFFBQVEsQ0FBQyxlQUFlO0FBQ3BDLGtCQUFVO0FBQ1YsbUJBQVc7QUFDWDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFNBQVMsT0FBUSxDQUFDLGVBQWU7QUFDcEMsd0JBQWdCLENBQUM7QUFDakIsbUJBQVc7QUFDWDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFNBQVMsT0FBTyxDQUFDLGVBQWU7QUFDbkMsd0JBQWdCLENBQUM7QUFDakIsbUJBQVc7QUFDWDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlO0FBQ3hELFlBQUksU0FBUztBQUNaLGlCQUFPLEtBQUssT0FBTztBQUNuQixvQkFBVTtBQUFBLFFBQ1g7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVztBQUFBLElBQ1o7QUFFQSxRQUFJLFNBQVM7QUFDWixhQUFPLEtBQUssT0FBTztBQUFBLElBQ3BCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsb0JBQW9CLFFBQTRCO0FBQ3ZELFFBQUksT0FBTyxXQUFXLEtBQUssT0FBTyxDQUFDLE1BQU0sT0FBTztBQUMvQyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFFBQUksSUFBSTtBQUNSLFFBQUksY0FBYztBQUVsQixXQUFPLElBQUksT0FBTyxRQUFRO0FBQ3pCLFlBQU0sUUFBUSxPQUFPLENBQUM7QUFHdEIsVUFBSSxNQUFNLFdBQVcsSUFBSSxHQUFHO0FBQzNCLFlBQUksVUFBVSxnQkFBZ0IsTUFBTSxXQUFXLGFBQWEsR0FBRztBQUU5RDtBQUNBO0FBQUEsUUFDRDtBQUNBLFlBQUksVUFBVSxrQkFBa0IsVUFBVSxVQUFVO0FBRW5ELGVBQUs7QUFDTCx3QkFBYztBQUNkO0FBQUEsUUFDRDtBQUNBLFlBQUksTUFBTSxXQUFXLGVBQWUsS0FBSyxNQUFNLFdBQVcsU0FBUyxHQUFHO0FBQ3JFO0FBQ0Esd0JBQWM7QUFDZDtBQUFBLFFBQ0Q7QUFFQTtBQUNBO0FBQUEsTUFDRDtBQUdBLFVBQUksTUFBTSxXQUFXLEdBQUcsS0FBSyxNQUFNLFNBQVMsS0FBSyxNQUFNLENBQUMsTUFBTSxLQUFLO0FBRWxFLGNBQU0sUUFBUSxNQUFNLE1BQU0sQ0FBQztBQUczQixjQUFNLFNBQVMsTUFBTSxRQUFRLEdBQUc7QUFDaEMsY0FBTSxTQUFTLE1BQU0sUUFBUSxHQUFHO0FBQ2hDLGNBQU0sZUFBZSxVQUFVLElBQUksU0FBUztBQUU1QyxZQUFJLGdCQUFnQixLQUFLLGVBQWUsTUFBTSxTQUFTLEdBQUc7QUFFekQ7QUFDQTtBQUFBLFFBQ0Q7QUFHQSxhQUFLLE1BQU0sU0FBUyxHQUFHLEtBQUssTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLElBQUksT0FBTyxRQUFRO0FBQzFFLGdCQUFNLFlBQVksT0FBTyxJQUFJLENBQUM7QUFJOUIsY0FBSSxjQUFjLFFBQVUsY0FBYyxNQUFNO0FBQy9DLGlCQUFLO0FBQ0w7QUFBQSxVQUNEO0FBRUEsY0FBSyxVQUFVLFdBQVcsR0FBSSxLQUFLLFVBQVUsU0FBUyxHQUFJLEtBQU8sVUFBVSxXQUFXLEdBQUcsS0FBSyxVQUFVLFNBQVMsR0FBRyxHQUFJO0FBQ3ZILGtCQUFNLFdBQVcsVUFBVSxNQUFNLEdBQUcsRUFBRTtBQUV0QyxnQkFBSSxTQUFTLFdBQVcsR0FBRyxLQUFLLFNBQVMsVUFBVSxNQUFNLENBQUMsU0FBUyxTQUFTLEdBQUcsR0FBRztBQUNqRixtQkFBSztBQUNMO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBR0EsWUFBSSxNQUFNLFNBQVMsR0FBRyxLQUFLLE1BQU0sU0FBUyxHQUFHLEdBQUc7QUFDL0MsZ0JBQU0sU0FBUyxNQUFNLFFBQVEsR0FBRztBQUNoQyxnQkFBTSxTQUFTLE1BQU0sUUFBUSxHQUFHO0FBQ2hDLGdCQUFNLFdBQVcsVUFBVSxJQUFJLFNBQVM7QUFHeEMsY0FBSSxXQUFXLE1BQU0sU0FBUyxHQUFHO0FBQ2hDLDBCQUFjO0FBQ2Q7QUFDQTtBQUFBLFVBQ0Q7QUFHQSx3QkFBYztBQUNkLGVBQUs7QUFDTDtBQUFBLFFBQ0Q7QUFFQTtBQUNBO0FBQUEsTUFDRDtBQUdBLFVBQUksQ0FBQyxhQUFhO0FBRWpCLHNCQUFjO0FBQ2Q7QUFDQTtBQUFBLE1BQ0Q7QUFJQSxVQUFJLE9BQU87QUFDWCxVQUFLLEtBQUssV0FBVyxHQUFJLEtBQUssS0FBSyxTQUFTLEdBQUksS0FBTyxLQUFLLFdBQVcsR0FBRyxLQUFLLEtBQUssU0FBUyxHQUFHLEdBQUk7QUFDbkcsZUFBTyxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQUEsTUFDeEI7QUFDQSxZQUFNLEtBQUssSUFBSTtBQUNmO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
