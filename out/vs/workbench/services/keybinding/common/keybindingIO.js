import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
class KeybindingIO {
  static writeKeybindingItem(out, item) {
    if (!item.resolvedKeybinding) {
      return;
    }
    const quotedSerializedKeybinding = JSON.stringify(item.resolvedKeybinding.getUserSettingsLabel());
    out.write(`{ "key": ${rightPaddedString(quotedSerializedKeybinding + ",", 25)} "command": `);
    const quotedSerializedWhen = item.when ? JSON.stringify(item.when.serialize()) : "";
    const quotedSerializeCommand = JSON.stringify(item.command);
    if (quotedSerializedWhen.length > 0) {
      out.write(`${quotedSerializeCommand},`);
      out.writeLine();
      out.write(`                                     "when": ${quotedSerializedWhen}`);
    } else {
      out.write(`${quotedSerializeCommand}`);
    }
    if (item.commandArgs) {
      out.write(",");
      out.writeLine();
      out.write(`                                     "args": ${JSON.stringify(item.commandArgs)}`);
    }
    if (item.systemWide) {
      out.write(",");
      out.writeLine();
      out.write(`                                     "systemWide": true`);
    }
    out.write(" }");
  }
  static readUserKeybindingItem(input) {
    const keybinding = "key" in input && typeof input.key === "string" ? KeybindingParser.parseKeybinding(input.key) : null;
    const when = "when" in input && typeof input.when === "string" ? ContextKeyExpr.deserialize(input.when) : void 0;
    const command = "command" in input && typeof input.command === "string" ? input.command : null;
    const commandArgs = "args" in input && typeof input.args !== "undefined" ? input.args : void 0;
    const systemWide = "systemWide" in input && typeof input.systemWide === "boolean" ? input.systemWide : false;
    return {
      keybinding,
      command,
      commandArgs,
      when,
      systemWide,
      _sourceKey: "key" in input && typeof input.key === "string" ? input.key : void 0
    };
  }
}
function rightPaddedString(str, minChars) {
  if (str.length < minChars) {
    return str + new Array(minChars - str.length).join(" ");
  }
  return str;
}
class OutputBuilder {
  constructor() {
    this._lines = [];
    this._currentLine = "";
  }
  write(str) {
    this._currentLine += str;
  }
  writeLine(str = "") {
    this._lines.push(this._currentLine + str);
    this._currentLine = "";
  }
  toString() {
    this.writeLine();
    return this._lines.join("\n");
  }
}
export {
  KeybindingIO,
  OutputBuilder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFxjb21tb25cXGtleWJpbmRpbmdJTy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleWJpbmRpbmdQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nUGFyc2VyLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVXNlcktleWJpbmRpbmdJdGVtIHtcblx0a2V5YmluZGluZzogS2V5YmluZGluZyB8IG51bGw7XG5cdGNvbW1hbmQ6IHN0cmluZyB8IG51bGw7XG5cdGNvbW1hbmRBcmdzPzogdW5rbm93bjtcblx0d2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cdHN5c3RlbVdpZGU6IGJvb2xlYW47XG5cdF9zb3VyY2VLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDsgLyoqIGNhcHR1cmVzIGBrZXlgIGZpZWxkIGZyb20gYGtleWJpbmRpbmdzLmpzb25gOyBgdGhpcy5rZXliaW5kaW5nICE9PSBudWxsYCBpbXBsaWVzIGBfc291cmNlS2V5ICE9PSBudWxsYCAqL1xufVxuXG5leHBvcnQgY2xhc3MgS2V5YmluZGluZ0lPIHtcblxuXHRwdWJsaWMgc3RhdGljIHdyaXRlS2V5YmluZGluZ0l0ZW0ob3V0OiBPdXRwdXRCdWlsZGVyLCBpdGVtOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKTogdm9pZCB7XG5cdFx0aWYgKCFpdGVtLnJlc29sdmVkS2V5YmluZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBxdW90ZWRTZXJpYWxpemVkS2V5YmluZGluZyA9IEpTT04uc3RyaW5naWZ5KGl0ZW0ucmVzb2x2ZWRLZXliaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkpO1xuXHRcdG91dC53cml0ZShgeyBcImtleVwiOiAke3JpZ2h0UGFkZGVkU3RyaW5nKHF1b3RlZFNlcmlhbGl6ZWRLZXliaW5kaW5nICsgJywnLCAyNSl9IFwiY29tbWFuZFwiOiBgKTtcblxuXHRcdGNvbnN0IHF1b3RlZFNlcmlhbGl6ZWRXaGVuID0gaXRlbS53aGVuID8gSlNPTi5zdHJpbmdpZnkoaXRlbS53aGVuLnNlcmlhbGl6ZSgpKSA6ICcnO1xuXHRcdGNvbnN0IHF1b3RlZFNlcmlhbGl6ZUNvbW1hbmQgPSBKU09OLnN0cmluZ2lmeShpdGVtLmNvbW1hbmQpO1xuXHRcdGlmIChxdW90ZWRTZXJpYWxpemVkV2hlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRvdXQud3JpdGUoYCR7cXVvdGVkU2VyaWFsaXplQ29tbWFuZH0sYCk7XG5cdFx0XHRvdXQud3JpdGVMaW5lKCk7XG5cdFx0XHRvdXQud3JpdGUoYCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIndoZW5cIjogJHtxdW90ZWRTZXJpYWxpemVkV2hlbn1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3V0LndyaXRlKGAke3F1b3RlZFNlcmlhbGl6ZUNvbW1hbmR9YCk7XG5cdFx0fVxuXHRcdGlmIChpdGVtLmNvbW1hbmRBcmdzKSB7XG5cdFx0XHRvdXQud3JpdGUoJywnKTtcblx0XHRcdG91dC53cml0ZUxpbmUoKTtcblx0XHRcdG91dC53cml0ZShgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYXJnc1wiOiAke0pTT04uc3RyaW5naWZ5KGl0ZW0uY29tbWFuZEFyZ3MpfWApO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5zeXN0ZW1XaWRlKSB7XG5cdFx0XHRvdXQud3JpdGUoJywnKTtcblx0XHRcdG91dC53cml0ZUxpbmUoKTtcblx0XHRcdG91dC53cml0ZShgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwic3lzdGVtV2lkZVwiOiB0cnVlYCk7XG5cdFx0fVxuXHRcdG91dC53cml0ZSgnIH0nKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZFVzZXJLZXliaW5kaW5nSXRlbShpbnB1dDogT2JqZWN0KTogSVVzZXJLZXliaW5kaW5nSXRlbSB7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9ICdrZXknIGluIGlucHV0ICYmIHR5cGVvZiBpbnB1dC5rZXkgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IEtleWJpbmRpbmdQYXJzZXIucGFyc2VLZXliaW5kaW5nKGlucHV0LmtleSlcblx0XHRcdDogbnVsbDtcblx0XHRjb25zdCB3aGVuID0gJ3doZW4nIGluIGlucHV0ICYmIHR5cGVvZiBpbnB1dC53aGVuID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShpbnB1dC53aGVuKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29tbWFuZCA9ICdjb21tYW5kJyBpbiBpbnB1dCAmJiB0eXBlb2YgaW5wdXQuY29tbWFuZCA9PT0gJ3N0cmluZydcblx0XHRcdD8gaW5wdXQuY29tbWFuZFxuXHRcdFx0OiBudWxsO1xuXHRcdGNvbnN0IGNvbW1hbmRBcmdzID0gJ2FyZ3MnIGluIGlucHV0ICYmIHR5cGVvZiBpbnB1dC5hcmdzICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0PyBpbnB1dC5hcmdzXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzeXN0ZW1XaWRlID0gJ3N5c3RlbVdpZGUnIGluIGlucHV0ICYmIHR5cGVvZiBpbnB1dC5zeXN0ZW1XaWRlID09PSAnYm9vbGVhbidcblx0XHRcdD8gaW5wdXQuc3lzdGVtV2lkZVxuXHRcdFx0OiBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2V5YmluZGluZyxcblx0XHRcdGNvbW1hbmQsXG5cdFx0XHRjb21tYW5kQXJncyxcblx0XHRcdHdoZW4sXG5cdFx0XHRzeXN0ZW1XaWRlLFxuXHRcdFx0X3NvdXJjZUtleTogJ2tleScgaW4gaW5wdXQgJiYgdHlwZW9mIGlucHV0LmtleSA9PT0gJ3N0cmluZycgPyBpbnB1dC5rZXkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiByaWdodFBhZGRlZFN0cmluZyhzdHI6IHN0cmluZywgbWluQ2hhcnM6IG51bWJlcik6IHN0cmluZyB7XG5cdGlmIChzdHIubGVuZ3RoIDwgbWluQ2hhcnMpIHtcblx0XHRyZXR1cm4gc3RyICsgKG5ldyBBcnJheShtaW5DaGFycyAtIHN0ci5sZW5ndGgpLmpvaW4oJyAnKSk7XG5cdH1cblx0cmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIE91dHB1dEJ1aWxkZXIge1xuXG5cdHByaXZhdGUgX2xpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIF9jdXJyZW50TGluZTogc3RyaW5nID0gJyc7XG5cblx0d3JpdGUoc3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50TGluZSArPSBzdHI7XG5cdH1cblxuXHR3cml0ZUxpbmUoc3RyOiBzdHJpbmcgPSAnJyk6IHZvaWQge1xuXHRcdHRoaXMuX2xpbmVzLnB1c2godGhpcy5fY3VycmVudExpbmUgKyBzdHIpO1xuXHRcdHRoaXMuX2N1cnJlbnRMaW5lID0gJyc7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHRoaXMud3JpdGVMaW5lKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmpvaW4oJ1xcbicpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHNCQUE0QztBQVk5QyxNQUFNLGFBQWE7QUFBQSxFQUV6QixPQUFjLG9CQUFvQixLQUFvQixNQUFvQztBQUN6RixRQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0I7QUFBQSxJQUNEO0FBQ0EsVUFBTSw2QkFBNkIsS0FBSyxVQUFVLEtBQUssbUJBQW1CLHFCQUFxQixDQUFDO0FBQ2hHLFFBQUksTUFBTSxZQUFZLGtCQUFrQiw2QkFBNkIsS0FBSyxFQUFFLENBQUMsY0FBYztBQUUzRixVQUFNLHVCQUF1QixLQUFLLE9BQU8sS0FBSyxVQUFVLEtBQUssS0FBSyxVQUFVLENBQUMsSUFBSTtBQUNqRixVQUFNLHlCQUF5QixLQUFLLFVBQVUsS0FBSyxPQUFPO0FBQzFELFFBQUkscUJBQXFCLFNBQVMsR0FBRztBQUNwQyxVQUFJLE1BQU0sR0FBRyxzQkFBc0IsR0FBRztBQUN0QyxVQUFJLFVBQVU7QUFDZCxVQUFJLE1BQU0sZ0RBQWdELG9CQUFvQixFQUFFO0FBQUEsSUFDakYsT0FBTztBQUNOLFVBQUksTUFBTSxHQUFHLHNCQUFzQixFQUFFO0FBQUEsSUFDdEM7QUFDQSxRQUFJLEtBQUssYUFBYTtBQUNyQixVQUFJLE1BQU0sR0FBRztBQUNiLFVBQUksVUFBVTtBQUNkLFVBQUksTUFBTSxnREFBZ0QsS0FBSyxVQUFVLEtBQUssV0FBVyxDQUFDLEVBQUU7QUFBQSxJQUM3RjtBQUNBLFFBQUksS0FBSyxZQUFZO0FBQ3BCLFVBQUksTUFBTSxHQUFHO0FBQ2IsVUFBSSxVQUFVO0FBQ2QsVUFBSSxNQUFNLHlEQUF5RDtBQUFBLElBQ3BFO0FBQ0EsUUFBSSxNQUFNLElBQUk7QUFBQSxFQUNmO0FBQUEsRUFFQSxPQUFjLHVCQUF1QixPQUFvQztBQUN4RSxVQUFNLGFBQWEsU0FBUyxTQUFTLE9BQU8sTUFBTSxRQUFRLFdBQ3ZELGlCQUFpQixnQkFBZ0IsTUFBTSxHQUFHLElBQzFDO0FBQ0gsVUFBTSxPQUFPLFVBQVUsU0FBUyxPQUFPLE1BQU0sU0FBUyxXQUNuRCxlQUFlLFlBQVksTUFBTSxJQUFJLElBQ3JDO0FBQ0gsVUFBTSxVQUFVLGFBQWEsU0FBUyxPQUFPLE1BQU0sWUFBWSxXQUM1RCxNQUFNLFVBQ047QUFDSCxVQUFNLGNBQWMsVUFBVSxTQUFTLE9BQU8sTUFBTSxTQUFTLGNBQzFELE1BQU0sT0FDTjtBQUNILFVBQU0sYUFBYSxnQkFBZ0IsU0FBUyxPQUFPLE1BQU0sZUFBZSxZQUNyRSxNQUFNLGFBQ047QUFDSCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFlBQVksU0FBUyxTQUFTLE9BQU8sTUFBTSxRQUFRLFdBQVcsTUFBTSxNQUFNO0FBQUEsSUFDM0U7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLGtCQUFrQixLQUFhLFVBQTBCO0FBQ2pFLE1BQUksSUFBSSxTQUFTLFVBQVU7QUFDMUIsV0FBTyxNQUFPLElBQUksTUFBTSxXQUFXLElBQUksTUFBTSxFQUFFLEtBQUssR0FBRztBQUFBLEVBQ3hEO0FBQ0EsU0FBTztBQUNSO0FBRU8sTUFBTSxjQUFjO0FBQUEsRUFBcEI7QUFFTixTQUFRLFNBQW1CLENBQUM7QUFDNUIsU0FBUSxlQUF1QjtBQUFBO0FBQUEsRUFFL0IsTUFBTSxLQUFtQjtBQUN4QixTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFQSxVQUFVLE1BQWMsSUFBVTtBQUNqQyxTQUFLLE9BQU8sS0FBSyxLQUFLLGVBQWUsR0FBRztBQUN4QyxTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRUEsV0FBbUI7QUFDbEIsU0FBSyxVQUFVO0FBQ2YsV0FBTyxLQUFLLE9BQU8sS0FBSyxJQUFJO0FBQUEsRUFDN0I7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
