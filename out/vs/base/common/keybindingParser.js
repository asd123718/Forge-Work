import { KeyCodeUtils, ScanCodeUtils } from "./keyCodes.js";
import { KeyCodeChord, ScanCodeChord, Keybinding } from "./keybindings.js";
class KeybindingParser {
  static _readModifiers(input) {
    input = input.toLowerCase().trim();
    let ctrl = false;
    let shift = false;
    let alt = false;
    let meta = false;
    let matchedModifier;
    do {
      matchedModifier = false;
      if (/^ctrl(\+|\-)/.test(input)) {
        ctrl = true;
        input = input.substr("ctrl-".length);
        matchedModifier = true;
      }
      if (/^shift(\+|\-)/.test(input)) {
        shift = true;
        input = input.substr("shift-".length);
        matchedModifier = true;
      }
      if (/^alt(\+|\-)/.test(input)) {
        alt = true;
        input = input.substr("alt-".length);
        matchedModifier = true;
      }
      if (/^meta(\+|\-)/.test(input)) {
        meta = true;
        input = input.substr("meta-".length);
        matchedModifier = true;
      }
      if (/^win(\+|\-)/.test(input)) {
        meta = true;
        input = input.substr("win-".length);
        matchedModifier = true;
      }
      if (/^cmd(\+|\-)/.test(input)) {
        meta = true;
        input = input.substr("cmd-".length);
        matchedModifier = true;
      }
    } while (matchedModifier);
    let key;
    const firstSpaceIdx = input.indexOf(" ");
    if (firstSpaceIdx > 0) {
      key = input.substring(0, firstSpaceIdx);
      input = input.substring(firstSpaceIdx);
    } else {
      key = input;
      input = "";
    }
    return {
      remains: input,
      ctrl,
      shift,
      alt,
      meta,
      key
    };
  }
  static parseChord(input) {
    const mods = this._readModifiers(input);
    const scanCodeMatch = mods.key.match(/^\[([^\]]+)\]$/);
    if (scanCodeMatch) {
      const strScanCode = scanCodeMatch[1];
      const scanCode = ScanCodeUtils.lowerCaseToEnum(strScanCode);
      return [new ScanCodeChord(mods.ctrl, mods.shift, mods.alt, mods.meta, scanCode), mods.remains];
    }
    const keyCode = KeyCodeUtils.fromUserSettings(mods.key);
    return [new KeyCodeChord(mods.ctrl, mods.shift, mods.alt, mods.meta, keyCode), mods.remains];
  }
  static parseKeybinding(input) {
    if (!input) {
      return null;
    }
    const chords = [];
    let chord;
    while (input.length > 0) {
      [chord, input] = this.parseChord(input);
      chords.push(chord);
    }
    return chords.length > 0 ? new Keybinding(chords) : null;
  }
}
export {
  KeybindingParser
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGtleWJpbmRpbmdQYXJzZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXlDb2RlVXRpbHMsIFNjYW5Db2RlVXRpbHMgfSBmcm9tICcuL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEtleUNvZGVDaG9yZCwgU2NhbkNvZGVDaG9yZCwgS2V5YmluZGluZywgQ2hvcmQgfSBmcm9tICcuL2tleWJpbmRpbmdzLmpzJztcblxuZXhwb3J0IGNsYXNzIEtleWJpbmRpbmdQYXJzZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIF9yZWFkTW9kaWZpZXJzKGlucHV0OiBzdHJpbmcpIHtcblx0XHRpbnB1dCA9IGlucHV0LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXG5cdFx0bGV0IGN0cmwgPSBmYWxzZTtcblx0XHRsZXQgc2hpZnQgPSBmYWxzZTtcblx0XHRsZXQgYWx0ID0gZmFsc2U7XG5cdFx0bGV0IG1ldGEgPSBmYWxzZTtcblxuXHRcdGxldCBtYXRjaGVkTW9kaWZpZXI6IGJvb2xlYW47XG5cblx0XHRkbyB7XG5cdFx0XHRtYXRjaGVkTW9kaWZpZXIgPSBmYWxzZTtcblx0XHRcdGlmICgvXmN0cmwoXFwrfFxcLSkvLnRlc3QoaW5wdXQpKSB7XG5cdFx0XHRcdGN0cmwgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dCA9IGlucHV0LnN1YnN0cignY3RybC0nLmxlbmd0aCk7XG5cdFx0XHRcdG1hdGNoZWRNb2RpZmllciA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoL15zaGlmdChcXCt8XFwtKS8udGVzdChpbnB1dCkpIHtcblx0XHRcdFx0c2hpZnQgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dCA9IGlucHV0LnN1YnN0cignc2hpZnQtJy5sZW5ndGgpO1xuXHRcdFx0XHRtYXRjaGVkTW9kaWZpZXIgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKC9eYWx0KFxcK3xcXC0pLy50ZXN0KGlucHV0KSkge1xuXHRcdFx0XHRhbHQgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dCA9IGlucHV0LnN1YnN0cignYWx0LScubGVuZ3RoKTtcblx0XHRcdFx0bWF0Y2hlZE1vZGlmaWVyID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICgvXm1ldGEoXFwrfFxcLSkvLnRlc3QoaW5wdXQpKSB7XG5cdFx0XHRcdG1ldGEgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dCA9IGlucHV0LnN1YnN0cignbWV0YS0nLmxlbmd0aCk7XG5cdFx0XHRcdG1hdGNoZWRNb2RpZmllciA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoL153aW4oXFwrfFxcLSkvLnRlc3QoaW5wdXQpKSB7XG5cdFx0XHRcdG1ldGEgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dCA9IGlucHV0LnN1YnN0cignd2luLScubGVuZ3RoKTtcblx0XHRcdFx0bWF0Y2hlZE1vZGlmaWVyID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICgvXmNtZChcXCt8XFwtKS8udGVzdChpbnB1dCkpIHtcblx0XHRcdFx0bWV0YSA9IHRydWU7XG5cdFx0XHRcdGlucHV0ID0gaW5wdXQuc3Vic3RyKCdjbWQtJy5sZW5ndGgpO1xuXHRcdFx0XHRtYXRjaGVkTW9kaWZpZXIgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKG1hdGNoZWRNb2RpZmllcik7XG5cblx0XHRsZXQga2V5OiBzdHJpbmc7XG5cblx0XHRjb25zdCBmaXJzdFNwYWNlSWR4ID0gaW5wdXQuaW5kZXhPZignICcpO1xuXHRcdGlmIChmaXJzdFNwYWNlSWR4ID4gMCkge1xuXHRcdFx0a2V5ID0gaW5wdXQuc3Vic3RyaW5nKDAsIGZpcnN0U3BhY2VJZHgpO1xuXHRcdFx0aW5wdXQgPSBpbnB1dC5zdWJzdHJpbmcoZmlyc3RTcGFjZUlkeCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGtleSA9IGlucHV0O1xuXHRcdFx0aW5wdXQgPSAnJztcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVtYWluczogaW5wdXQsXG5cdFx0XHRjdHJsLFxuXHRcdFx0c2hpZnQsXG5cdFx0XHRhbHQsXG5cdFx0XHRtZXRhLFxuXHRcdFx0a2V5XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHBhcnNlQ2hvcmQoaW5wdXQ6IHN0cmluZyk6IFtDaG9yZCwgc3RyaW5nXSB7XG5cdFx0Y29uc3QgbW9kcyA9IHRoaXMuX3JlYWRNb2RpZmllcnMoaW5wdXQpO1xuXHRcdGNvbnN0IHNjYW5Db2RlTWF0Y2ggPSBtb2RzLmtleS5tYXRjaCgvXlxcWyhbXlxcXV0rKVxcXSQvKTtcblx0XHRpZiAoc2NhbkNvZGVNYXRjaCkge1xuXHRcdFx0Y29uc3Qgc3RyU2NhbkNvZGUgPSBzY2FuQ29kZU1hdGNoWzFdO1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGUgPSBTY2FuQ29kZVV0aWxzLmxvd2VyQ2FzZVRvRW51bShzdHJTY2FuQ29kZSk7XG5cdFx0XHRyZXR1cm4gW25ldyBTY2FuQ29kZUNob3JkKG1vZHMuY3RybCwgbW9kcy5zaGlmdCwgbW9kcy5hbHQsIG1vZHMubWV0YSwgc2NhbkNvZGUpLCBtb2RzLnJlbWFpbnNdO1xuXHRcdH1cblx0XHRjb25zdCBrZXlDb2RlID0gS2V5Q29kZVV0aWxzLmZyb21Vc2VyU2V0dGluZ3MobW9kcy5rZXkpO1xuXHRcdHJldHVybiBbbmV3IEtleUNvZGVDaG9yZChtb2RzLmN0cmwsIG1vZHMuc2hpZnQsIG1vZHMuYWx0LCBtb2RzLm1ldGEsIGtleUNvZGUpLCBtb2RzLnJlbWFpbnNdO1xuXHR9XG5cblx0c3RhdGljIHBhcnNlS2V5YmluZGluZyhpbnB1dDogc3RyaW5nKTogS2V5YmluZGluZyB8IG51bGwge1xuXHRcdGlmICghaW5wdXQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNob3JkczogQ2hvcmRbXSA9IFtdO1xuXHRcdGxldCBjaG9yZDogQ2hvcmQ7XG5cblx0XHR3aGlsZSAoaW5wdXQubGVuZ3RoID4gMCkge1xuXHRcdFx0W2Nob3JkLCBpbnB1dF0gPSB0aGlzLnBhcnNlQ2hvcmQoaW5wdXQpO1xuXHRcdFx0Y2hvcmRzLnB1c2goY2hvcmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gKGNob3Jkcy5sZW5ndGggPiAwID8gbmV3IEtleWJpbmRpbmcoY2hvcmRzKSA6IG51bGwpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGNBQWMscUJBQXFCO0FBQzVDLFNBQVMsY0FBYyxlQUFlLGtCQUF5QjtBQUV4RCxNQUFNLGlCQUFpQjtBQUFBLEVBRTdCLE9BQWUsZUFBZSxPQUFlO0FBQzVDLFlBQVEsTUFBTSxZQUFZLEVBQUUsS0FBSztBQUVqQyxRQUFJLE9BQU87QUFDWCxRQUFJLFFBQVE7QUFDWixRQUFJLE1BQU07QUFDVixRQUFJLE9BQU87QUFFWCxRQUFJO0FBRUosT0FBRztBQUNGLHdCQUFrQjtBQUNsQixVQUFJLGVBQWUsS0FBSyxLQUFLLEdBQUc7QUFDL0IsZUFBTztBQUNQLGdCQUFRLE1BQU0sT0FBTyxRQUFRLE1BQU07QUFDbkMsMEJBQWtCO0FBQUEsTUFDbkI7QUFDQSxVQUFJLGdCQUFnQixLQUFLLEtBQUssR0FBRztBQUNoQyxnQkFBUTtBQUNSLGdCQUFRLE1BQU0sT0FBTyxTQUFTLE1BQU07QUFDcEMsMEJBQWtCO0FBQUEsTUFDbkI7QUFDQSxVQUFJLGNBQWMsS0FBSyxLQUFLLEdBQUc7QUFDOUIsY0FBTTtBQUNOLGdCQUFRLE1BQU0sT0FBTyxPQUFPLE1BQU07QUFDbEMsMEJBQWtCO0FBQUEsTUFDbkI7QUFDQSxVQUFJLGVBQWUsS0FBSyxLQUFLLEdBQUc7QUFDL0IsZUFBTztBQUNQLGdCQUFRLE1BQU0sT0FBTyxRQUFRLE1BQU07QUFDbkMsMEJBQWtCO0FBQUEsTUFDbkI7QUFDQSxVQUFJLGNBQWMsS0FBSyxLQUFLLEdBQUc7QUFDOUIsZUFBTztBQUNQLGdCQUFRLE1BQU0sT0FBTyxPQUFPLE1BQU07QUFDbEMsMEJBQWtCO0FBQUEsTUFDbkI7QUFDQSxVQUFJLGNBQWMsS0FBSyxLQUFLLEdBQUc7QUFDOUIsZUFBTztBQUNQLGdCQUFRLE1BQU0sT0FBTyxPQUFPLE1BQU07QUFDbEMsMEJBQWtCO0FBQUEsTUFDbkI7QUFBQSxJQUNELFNBQVM7QUFFVCxRQUFJO0FBRUosVUFBTSxnQkFBZ0IsTUFBTSxRQUFRLEdBQUc7QUFDdkMsUUFBSSxnQkFBZ0IsR0FBRztBQUN0QixZQUFNLE1BQU0sVUFBVSxHQUFHLGFBQWE7QUFDdEMsY0FBUSxNQUFNLFVBQVUsYUFBYTtBQUFBLElBQ3RDLE9BQU87QUFDTixZQUFNO0FBQ04sY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBZSxXQUFXLE9BQWdDO0FBQ3pELFVBQU0sT0FBTyxLQUFLLGVBQWUsS0FBSztBQUN0QyxVQUFNLGdCQUFnQixLQUFLLElBQUksTUFBTSxnQkFBZ0I7QUFDckQsUUFBSSxlQUFlO0FBQ2xCLFlBQU0sY0FBYyxjQUFjLENBQUM7QUFDbkMsWUFBTSxXQUFXLGNBQWMsZ0JBQWdCLFdBQVc7QUFDMUQsYUFBTyxDQUFDLElBQUksY0FBYyxLQUFLLE1BQU0sS0FBSyxPQUFPLEtBQUssS0FBSyxLQUFLLE1BQU0sUUFBUSxHQUFHLEtBQUssT0FBTztBQUFBLElBQzlGO0FBQ0EsVUFBTSxVQUFVLGFBQWEsaUJBQWlCLEtBQUssR0FBRztBQUN0RCxXQUFPLENBQUMsSUFBSSxhQUFhLEtBQUssTUFBTSxLQUFLLE9BQU8sS0FBSyxLQUFLLEtBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxPQUFPO0FBQUEsRUFDNUY7QUFBQSxFQUVBLE9BQU8sZ0JBQWdCLE9BQWtDO0FBQ3hELFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQWtCLENBQUM7QUFDekIsUUFBSTtBQUVKLFdBQU8sTUFBTSxTQUFTLEdBQUc7QUFDeEIsT0FBQyxPQUFPLEtBQUssSUFBSSxLQUFLLFdBQVcsS0FBSztBQUN0QyxhQUFPLEtBQUssS0FBSztBQUFBLElBQ2xCO0FBQ0EsV0FBUSxPQUFPLFNBQVMsSUFBSSxJQUFJLFdBQVcsTUFBTSxJQUFJO0FBQUEsRUFDdEQ7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
