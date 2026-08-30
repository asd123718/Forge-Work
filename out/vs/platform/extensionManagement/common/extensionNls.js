import { isObject, isString } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
function localizeManifest(logger, extensionManifest, translations, fallbackTranslations) {
  try {
    replaceNLStrings(logger, extensionManifest, translations, fallbackTranslations);
  } catch (error) {
    logger.error(error?.message ?? error);
  }
  return extensionManifest;
}
function replaceNLStrings(logger, extensionManifest, messages, originalMessages) {
  const processEntry = (obj, key, command) => {
    const value = obj[key];
    if (isString(value)) {
      const str = value;
      const length = str.length;
      if (length > 1 && str[0] === "%" && str[length - 1] === "%") {
        const messageKey = str.substr(1, length - 2);
        let translated = messages[messageKey];
        if (translated === void 0 && originalMessages) {
          translated = originalMessages[messageKey];
        }
        const message = typeof translated === "string" ? translated : translated?.message;
        const original = originalMessages?.[messageKey];
        const originalMessage = typeof original === "string" ? original : original?.message;
        if (!message) {
          if (!originalMessage) {
            logger.warn(`[${extensionManifest.name}]: ${localize("missingNLSKey", "Couldn't find message for key {0}.", messageKey)}`);
          }
          return;
        }
        if (
          // if we are translating the title or category of a command
          command && (key === "title" || key === "category") && // and the original value is not the same as the translated value
          originalMessage && originalMessage !== message
        ) {
          const localizedString = {
            value: message,
            original: originalMessage
          };
          obj[key] = localizedString;
        } else {
          obj[key] = message;
        }
      }
    } else if (isObject(value)) {
      for (const k in value) {
        if (value.hasOwnProperty(k)) {
          k === "commands" ? processEntry(value, k, true) : processEntry(value, k, command);
        }
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        processEntry(value, i, command);
      }
    }
  };
  for (const key in extensionManifest) {
    if (extensionManifest.hasOwnProperty(key)) {
      processEntry(extensionManifest, key);
    }
  }
}
export {
  localizeManifest
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25ObHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUcmFuc2xhdGlvbnMge1xuXHRba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB7IG1lc3NhZ2U6IHN0cmluZzsgY29tbWVudDogc3RyaW5nW10gfSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvY2FsaXplTWFuaWZlc3QobG9nZ2VyOiBJTG9nZ2VyLCBleHRlbnNpb25NYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCB0cmFuc2xhdGlvbnM6IElUcmFuc2xhdGlvbnMsIGZhbGxiYWNrVHJhbnNsYXRpb25zPzogSVRyYW5zbGF0aW9ucyk6IElFeHRlbnNpb25NYW5pZmVzdCB7XG5cdHRyeSB7XG5cdFx0cmVwbGFjZU5MU3RyaW5ncyhsb2dnZXIsIGV4dGVuc2lvbk1hbmlmZXN0LCB0cmFuc2xhdGlvbnMsIGZhbGxiYWNrVHJhbnNsYXRpb25zKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRsb2dnZXIuZXJyb3IoZXJyb3I/Lm1lc3NhZ2UgPz8gZXJyb3IpO1xuXHRcdC8qSWdub3JlIEVycm9yKi9cblx0fVxuXHRyZXR1cm4gZXh0ZW5zaW9uTWFuaWZlc3Q7XG59XG5cbi8qKlxuICogVGhpcyByb3V0aW5lIG1ha2VzIHRoZSBmb2xsb3dpbmcgYXNzdW1wdGlvbnM6XG4gKiBUaGUgcm9vdCBlbGVtZW50IGlzIGFuIG9iamVjdCBsaXRlcmFsXG4gKi9cbmZ1bmN0aW9uIHJlcGxhY2VOTFN0cmluZ3MobG9nZ2VyOiBJTG9nZ2VyLCBleHRlbnNpb25NYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBtZXNzYWdlczogSVRyYW5zbGF0aW9ucywgb3JpZ2luYWxNZXNzYWdlcz86IElUcmFuc2xhdGlvbnMpOiB2b2lkIHtcblx0Y29uc3QgcHJvY2Vzc0VudHJ5ID0gKG9iajogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGtleTogc3RyaW5nIHwgbnVtYmVyLCBjb21tYW5kPzogYm9vbGVhbikgPT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gb2JqW2tleV07XG5cdFx0aWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0Y29uc3Qgc3RyID0gdmFsdWU7XG5cdFx0XHRjb25zdCBsZW5ndGggPSBzdHIubGVuZ3RoO1xuXHRcdFx0aWYgKGxlbmd0aCA+IDEgJiYgc3RyWzBdID09PSAnJScgJiYgc3RyW2xlbmd0aCAtIDFdID09PSAnJScpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZUtleSA9IHN0ci5zdWJzdHIoMSwgbGVuZ3RoIC0gMik7XG5cdFx0XHRcdGxldCB0cmFuc2xhdGVkID0gbWVzc2FnZXNbbWVzc2FnZUtleV07XG5cdFx0XHRcdC8vIElmIHRoZSBtZXNzYWdlcyBjb21lIGZyb20gYSBsYW5ndWFnZSBwYWNrIHRoZXkgbWlnaHQgbWlzcyBzb21lIGtleXNcblx0XHRcdFx0Ly8gRmlsbCB0aGVtIGZyb20gdGhlIG9yaWdpbmFsIG1lc3NhZ2VzLlxuXHRcdFx0XHRpZiAodHJhbnNsYXRlZCA9PT0gdW5kZWZpbmVkICYmIG9yaWdpbmFsTWVzc2FnZXMpIHtcblx0XHRcdFx0XHR0cmFuc2xhdGVkID0gb3JpZ2luYWxNZXNzYWdlc1ttZXNzYWdlS2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0eXBlb2YgdHJhbnNsYXRlZCA9PT0gJ3N0cmluZycgPyB0cmFuc2xhdGVkIDogdHJhbnNsYXRlZD8ubWVzc2FnZTtcblxuXHRcdFx0XHQvLyBUaGlzIGJyYW5jaCByZXR1cm5zIElMb2NhbGl6ZWRTdHJpbmcncyBpbnN0ZWFkIG9mIFN0cmluZ3Mgc28gdGhhdCB0aGUgQ29tbWFuZCBQYWxldHRlIGNhbiBjb250YWluIGJvdGggdGhlIGxvY2FsaXplZCBhbmQgdGhlIG9yaWdpbmFsIHZhbHVlLlxuXHRcdFx0XHRjb25zdCBvcmlnaW5hbCA9IG9yaWdpbmFsTWVzc2FnZXM/LlttZXNzYWdlS2V5XTtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0eXBlb2Ygb3JpZ2luYWwgPT09ICdzdHJpbmcnID8gb3JpZ2luYWwgOiBvcmlnaW5hbD8ubWVzc2FnZTtcblxuXHRcdFx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdFx0XHRpZiAoIW9yaWdpbmFsTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0bG9nZ2VyLndhcm4oYFske2V4dGVuc2lvbk1hbmlmZXN0Lm5hbWV9XTogJHtsb2NhbGl6ZSgnbWlzc2luZ05MU0tleScsIFwiQ291bGRuJ3QgZmluZCBtZXNzYWdlIGZvciBrZXkgezB9LlwiLCBtZXNzYWdlS2V5KX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdC8vIGlmIHdlIGFyZSB0cmFuc2xhdGluZyB0aGUgdGl0bGUgb3IgY2F0ZWdvcnkgb2YgYSBjb21tYW5kXG5cdFx0XHRcdFx0Y29tbWFuZCAmJiAoa2V5ID09PSAndGl0bGUnIHx8IGtleSA9PT0gJ2NhdGVnb3J5JykgJiZcblx0XHRcdFx0XHQvLyBhbmQgdGhlIG9yaWdpbmFsIHZhbHVlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgdHJhbnNsYXRlZCB2YWx1ZVxuXHRcdFx0XHRcdG9yaWdpbmFsTWVzc2FnZSAmJiBvcmlnaW5hbE1lc3NhZ2UgIT09IG1lc3NhZ2Vcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgbG9jYWxpemVkU3RyaW5nOiBJTG9jYWxpemVkU3RyaW5nID0ge1xuXHRcdFx0XHRcdFx0dmFsdWU6IG1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbDogb3JpZ2luYWxNZXNzYWdlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRvYmpba2V5XSA9IGxvY2FsaXplZFN0cmluZztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvYmpba2V5XSA9IG1lc3NhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuXHRcdFx0Zm9yIChjb25zdCBrIGluIHZhbHVlKSB7XG5cdFx0XHRcdGlmICh2YWx1ZS5oYXNPd25Qcm9wZXJ0eShrKSkge1xuXHRcdFx0XHRcdGsgPT09ICdjb21tYW5kcycgPyBwcm9jZXNzRW50cnkodmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGssIHRydWUpIDogcHJvY2Vzc0VudHJ5KHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBrLCBjb21tYW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgKHZhbHVlIGFzIEFycmF5PHVua25vd24+KS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRwcm9jZXNzRW50cnkodmFsdWUsIGksIGNvbW1hbmQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRmb3IgKGNvbnN0IGtleSBpbiBleHRlbnNpb25NYW5pZmVzdCkge1xuXHRcdGlmIChleHRlbnNpb25NYW5pZmVzdC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0XHRwcm9jZXNzRW50cnkoZXh0ZW5zaW9uTWFuaWZlc3QsIGtleSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsZ0JBQWdCO0FBR25DLFNBQVMsZ0JBQWdCO0FBT2xCLFNBQVMsaUJBQWlCLFFBQWlCLG1CQUF1QyxjQUE2QixzQkFBMEQ7QUFDL0ssTUFBSTtBQUNILHFCQUFpQixRQUFRLG1CQUFtQixjQUFjLG9CQUFvQjtBQUFBLEVBQy9FLFNBQVMsT0FBTztBQUNmLFdBQU8sTUFBTSxPQUFPLFdBQVcsS0FBSztBQUFBLEVBRXJDO0FBQ0EsU0FBTztBQUNSO0FBTUEsU0FBUyxpQkFBaUIsUUFBaUIsbUJBQXVDLFVBQXlCLGtCQUF3QztBQUNsSixRQUFNLGVBQWUsQ0FBQyxLQUE4QixLQUFzQixZQUFzQjtBQUMvRixVQUFNLFFBQVEsSUFBSSxHQUFHO0FBQ3JCLFFBQUksU0FBUyxLQUFLLEdBQUc7QUFDcEIsWUFBTSxNQUFNO0FBQ1osWUFBTSxTQUFTLElBQUk7QUFDbkIsVUFBSSxTQUFTLEtBQUssSUFBSSxDQUFDLE1BQU0sT0FBTyxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUs7QUFDNUQsY0FBTSxhQUFhLElBQUksT0FBTyxHQUFHLFNBQVMsQ0FBQztBQUMzQyxZQUFJLGFBQWEsU0FBUyxVQUFVO0FBR3BDLFlBQUksZUFBZSxVQUFhLGtCQUFrQjtBQUNqRCx1QkFBYSxpQkFBaUIsVUFBVTtBQUFBLFFBQ3pDO0FBQ0EsY0FBTSxVQUE4QixPQUFPLGVBQWUsV0FBVyxhQUFhLFlBQVk7QUFHOUYsY0FBTSxXQUFXLG1CQUFtQixVQUFVO0FBQzlDLGNBQU0sa0JBQXNDLE9BQU8sYUFBYSxXQUFXLFdBQVcsVUFBVTtBQUVoRyxZQUFJLENBQUMsU0FBUztBQUNiLGNBQUksQ0FBQyxpQkFBaUI7QUFDckIsbUJBQU8sS0FBSyxJQUFJLGtCQUFrQixJQUFJLE1BQU0sU0FBUyxpQkFBaUIsc0NBQXNDLFVBQVUsQ0FBQyxFQUFFO0FBQUEsVUFDMUg7QUFDQTtBQUFBLFFBQ0Q7QUFFQTtBQUFBO0FBQUEsVUFFQyxZQUFZLFFBQVEsV0FBVyxRQUFRO0FBQUEsVUFFdkMsbUJBQW1CLG9CQUFvQjtBQUFBLFVBQ3RDO0FBQ0QsZ0JBQU0sa0JBQW9DO0FBQUEsWUFDekMsT0FBTztBQUFBLFlBQ1AsVUFBVTtBQUFBLFVBQ1g7QUFDQSxjQUFJLEdBQUcsSUFBSTtBQUFBLFFBQ1osT0FBTztBQUNOLGNBQUksR0FBRyxJQUFJO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFdBQVcsU0FBUyxLQUFLLEdBQUc7QUFDM0IsaUJBQVcsS0FBSyxPQUFPO0FBQ3RCLFlBQUksTUFBTSxlQUFlLENBQUMsR0FBRztBQUM1QixnQkFBTSxhQUFhLGFBQWEsT0FBa0MsR0FBRyxJQUFJLElBQUksYUFBYSxPQUFrQyxHQUFHLE9BQU87QUFBQSxRQUN2STtBQUFBLE1BQ0Q7QUFBQSxJQUNELFdBQVcsTUFBTSxRQUFRLEtBQUssR0FBRztBQUNoQyxlQUFTLElBQUksR0FBRyxJQUFLLE1BQXlCLFFBQVEsS0FBSztBQUMxRCxxQkFBYSxPQUFPLEdBQUcsT0FBTztBQUFBLE1BQy9CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxhQUFXLE9BQU8sbUJBQW1CO0FBQ3BDLFFBQUksa0JBQWtCLGVBQWUsR0FBRyxHQUFHO0FBQzFDLG1CQUFhLG1CQUFtQixHQUFHO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
