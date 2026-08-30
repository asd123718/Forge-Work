import { IndentAction } from "../../../../common/languages/languageConfiguration.js";
const javascriptOnEnterRules = [
  {
    // e.g. /** | */
    beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
    afterText: /^\s*\*\/$/,
    action: { indentAction: IndentAction.IndentOutdent, appendText: " * " }
  },
  {
    // e.g. /** ...|
    beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
    action: { indentAction: IndentAction.None, appendText: " * " }
  },
  {
    // e.g.  * ...|
    beforeText: /^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
    previousLineText: /(?=^(\s*(\/\*\*|\*)).*)(?=(?!(\s*\*\/)))/,
    action: { indentAction: IndentAction.None, appendText: "* " }
  },
  {
    // e.g.  */|
    beforeText: /^(\t|[ ])*[ ]\*\/\s*$/,
    action: { indentAction: IndentAction.None, removeText: 1 }
  },
  {
    // e.g.  *-----*/|
    beforeText: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$/,
    action: { indentAction: IndentAction.None, removeText: 1 }
  },
  {
    beforeText: /^\s*(\bcase\s.+:|\bdefault:)$/,
    afterText: /^(?!\s*(\bcase\b|\bdefault\b))/,
    action: { indentAction: IndentAction.Indent }
  },
  {
    previousLineText: /^\s*(((else ?)?if|for|while)\s*\(.*\)\s*|else\s*)$/,
    beforeText: /^\s+([^{i\s]|i(?!f\b))/,
    action: { indentAction: IndentAction.Outdent }
  },
  // Indent when pressing enter from inside ()
  {
    beforeText: /^.*\([^\)]*$/,
    afterText: /^\s*\).*$/,
    action: { indentAction: IndentAction.IndentOutdent, appendText: "	" }
  },
  // Indent when pressing enter from inside {}
  {
    beforeText: /^.*\{[^\}]*$/,
    afterText: /^\s*\}.*$/,
    action: { indentAction: IndentAction.IndentOutdent, appendText: "	" }
  },
  // Indent when pressing enter from inside []
  {
    beforeText: /^.*\[[^\]]*$/,
    afterText: /^\s*\].*$/,
    action: { indentAction: IndentAction.IndentOutdent, appendText: "	" }
  }
];
const phpOnEnterRules = [
  {
    beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
    afterText: /^\s*\*\/$/,
    action: {
      indentAction: IndentAction.IndentOutdent,
      appendText: " * "
    }
  },
  {
    beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
    action: {
      indentAction: IndentAction.None,
      appendText: " * "
    }
  },
  {
    beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
    action: {
      indentAction: IndentAction.None,
      appendText: "* "
    }
  },
  {
    beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
    action: {
      indentAction: IndentAction.None,
      removeText: 1
    }
  },
  {
    beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
    action: {
      indentAction: IndentAction.None,
      removeText: 1
    }
  },
  {
    beforeText: /^\s+([^{i\s]|i(?!f\b))/,
    previousLineText: /^\s*(((else ?)?if|for(each)?|while)\s*\(.*\)\s*|else\s*)$/,
    action: {
      indentAction: IndentAction.Outdent
    }
  }
];
const cppOnEnterRules = [
  {
    previousLineText: /^\s*(((else ?)?if|for|while)\s*\(.*\)\s*|else\s*)$/,
    beforeText: /^\s+([^{i\s]|i(?!f\b))/,
    action: {
      indentAction: IndentAction.Outdent
    }
  }
];
const htmlOnEnterRules = [
  {
    beforeText: /<(?!(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr))([_:\w][_:\w\-.\d]*)(?:(?:[^'"/>]|"[^"]*"|'[^']*')*?(?!\/)>)[^<]*$/i,
    afterText: /^<\/([_:\w][_:\w\-.\d]*)\s*>/i,
    action: {
      indentAction: IndentAction.IndentOutdent
    }
  },
  {
    beforeText: /<(?!(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr))([_:\w][_:\w\-.\d]*)(?:(?:[^'"/>]|"[^"]*"|'[^']*')*?(?!\/)>)[^<]*$/i,
    action: {
      indentAction: IndentAction.Indent
    }
  }
];
const vbOnEnterRules = [
  // Prevent indent after End statements and block terminators (but NOT ElseIf...Then or Else which should indent)
  {
    beforeText: /^\s*((End\s+(If|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Select|Try|While|For|Property|Get|Set|SyncLock|Using|AddHandler|RaiseEvent|RemoveHandler|Event|Operator))|Loop|Next|Wend|Until)\b.*$/i,
    action: {
      indentAction: IndentAction.None
    }
  }
];
export {
  cppOnEnterRules,
  htmlOnEnterRules,
  javascriptOnEnterRules,
  phpOnEnterRules,
  vbOnEnterRules
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXHN1cHBvcnRzXFxvbkVudGVyUnVsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJbmRlbnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBqYXZhc2NyaXB0T25FbnRlclJ1bGVzID0gW1xuXHR7XG5cdFx0Ly8gZS5nLiAvKiogfCAqL1xuXHRcdGJlZm9yZVRleHQ6IC9eXFxzKlxcL1xcKlxcKig/IVxcLykoW15cXCpdfFxcKig/IVxcLykpKiQvLFxuXHRcdGFmdGVyVGV4dDogL15cXHMqXFwqXFwvJC8sXG5cdFx0YWN0aW9uOiB7IGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQsIGFwcGVuZFRleHQ6ICcgKiAnIH1cblx0fSwge1xuXHRcdC8vIGUuZy4gLyoqIC4uLnxcblx0XHRiZWZvcmVUZXh0OiAvXlxccypcXC9cXCpcXCooPyFcXC8pKFteXFwqXXxcXCooPyFcXC8pKSokLyxcblx0XHRhY3Rpb246IHsgaW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uTm9uZSwgYXBwZW5kVGV4dDogJyAqICcgfVxuXHR9LCB7XG5cdFx0Ly8gZS5nLiAgKiAuLi58XG5cdFx0YmVmb3JlVGV4dDogL14oXFx0fFsgXSkqWyBdXFwqKFsgXShbXlxcKl18XFwqKD8hXFwvKSkqKT8kLyxcblx0XHRwcmV2aW91c0xpbmVUZXh0OiAvKD89XihcXHMqKFxcL1xcKlxcKnxcXCopKS4qKSg/PSg/IShcXHMqXFwqXFwvKSkpLyxcblx0XHRhY3Rpb246IHsgaW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uTm9uZSwgYXBwZW5kVGV4dDogJyogJyB9XG5cdH0sIHtcblx0XHQvLyBlLmcuICAqL3xcblx0XHRiZWZvcmVUZXh0OiAvXihcXHR8WyBdKSpbIF1cXCpcXC9cXHMqJC8sXG5cdFx0YWN0aW9uOiB7IGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLk5vbmUsIHJlbW92ZVRleHQ6IDEgfVxuXHR9LFxuXHR7XG5cdFx0Ly8gZS5nLiAgKi0tLS0tKi98XG5cdFx0YmVmb3JlVGV4dDogL14oXFx0fFsgXSkqWyBdXFwqW14vXSpcXCpcXC9cXHMqJC8sXG5cdFx0YWN0aW9uOiB7IGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLk5vbmUsIHJlbW92ZVRleHQ6IDEgfVxuXHR9LFxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL15cXHMqKFxcYmNhc2VcXHMuKzp8XFxiZGVmYXVsdDopJC8sXG5cdFx0YWZ0ZXJUZXh0OiAvXig/IVxccyooXFxiY2FzZVxcYnxcXGJkZWZhdWx0XFxiKSkvLFxuXHRcdGFjdGlvbjogeyBpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnQgfVxuXHR9LFxuXHR7XG5cdFx0cHJldmlvdXNMaW5lVGV4dDogL15cXHMqKCgoZWxzZSA/KT9pZnxmb3J8d2hpbGUpXFxzKlxcKC4qXFwpXFxzKnxlbHNlXFxzKikkLyxcblx0XHRiZWZvcmVUZXh0OiAvXlxccysoW157aVxcc118aSg/IWZcXGIpKS8sXG5cdFx0YWN0aW9uOiB7IGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLk91dGRlbnQgfVxuXHR9LFxuXHQvLyBJbmRlbnQgd2hlbiBwcmVzc2luZyBlbnRlciBmcm9tIGluc2lkZSAoKVxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL14uKlxcKFteXFwpXSokLyxcblx0XHRhZnRlclRleHQ6IC9eXFxzKlxcKS4qJC8sXG5cdFx0YWN0aW9uOiB7IGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQsIGFwcGVuZFRleHQ6ICdcXHQnIH1cblx0fSxcblx0Ly8gSW5kZW50IHdoZW4gcHJlc3NpbmcgZW50ZXIgZnJvbSBpbnNpZGUge31cblx0e1xuXHRcdGJlZm9yZVRleHQ6IC9eLipcXHtbXlxcfV0qJC8sXG5cdFx0YWZ0ZXJUZXh0OiAvXlxccypcXH0uKiQvLFxuXHRcdGFjdGlvbjogeyBpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50LCBhcHBlbmRUZXh0OiAnXFx0JyB9XG5cdH0sXG5cdC8vIEluZGVudCB3aGVuIHByZXNzaW5nIGVudGVyIGZyb20gaW5zaWRlIFtdXG5cdHtcblx0XHRiZWZvcmVUZXh0OiAvXi4qXFxbW15cXF1dKiQvLFxuXHRcdGFmdGVyVGV4dDogL15cXHMqXFxdLiokLyxcblx0XHRhY3Rpb246IHsgaW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudCwgYXBwZW5kVGV4dDogJ1xcdCcgfVxuXHR9LFxuXTtcblxuZXhwb3J0IGNvbnN0IHBocE9uRW50ZXJSdWxlcyA9IFtcblx0e1xuXHRcdGJlZm9yZVRleHQ6IC9eXFxzKlxcL1xcKlxcKig/IVxcLykoW15cXCpdfFxcKig/IVxcLykpKiQvLFxuXHRcdGFmdGVyVGV4dDogL15cXHMqXFwqXFwvJC8sXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHRpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50LFxuXHRcdFx0YXBwZW5kVGV4dDogJyAqICcsXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL15cXHMqXFwvXFwqXFwqKD8hXFwvKShbXlxcKl18XFwqKD8hXFwvKSkqJC8sXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHRpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5Ob25lLFxuXHRcdFx0YXBwZW5kVGV4dDogJyAqICcsXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL14oXFx0fChcXCBcXCApKSpcXCBcXCooXFwgKFteXFwqXXxcXCooPyFcXC8pKSopPyQvLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0aW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uTm9uZSxcblx0XHRcdGFwcGVuZFRleHQ6ICcqICcsXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL14oXFx0fChcXCBcXCApKSpcXCBcXCpcXC9cXHMqJC8sXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHRpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5Ob25lLFxuXHRcdFx0cmVtb3ZlVGV4dDogMSxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRiZWZvcmVUZXh0OiAvXihcXHR8KFxcIFxcICkpKlxcIFxcKlteL10qXFwqXFwvXFxzKiQvLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0aW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uTm9uZSxcblx0XHRcdHJlbW92ZVRleHQ6IDEsXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL15cXHMrKFtee2lcXHNdfGkoPyFmXFxiKSkvLFxuXHRcdHByZXZpb3VzTGluZVRleHQ6IC9eXFxzKigoKGVsc2UgPyk/aWZ8Zm9yKGVhY2gpP3x3aGlsZSlcXHMqXFwoLipcXClcXHMqfGVsc2VcXHMqKSQvLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0aW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uT3V0ZGVudFxuXHRcdH1cblx0fSxcbl07XG5cbmV4cG9ydCBjb25zdCBjcHBPbkVudGVyUnVsZXMgPSBbXG5cdHtcblx0XHRwcmV2aW91c0xpbmVUZXh0OiAvXlxccyooKChlbHNlID8pP2lmfGZvcnx3aGlsZSlcXHMqXFwoLipcXClcXHMqfGVsc2VcXHMqKSQvLFxuXHRcdGJlZm9yZVRleHQ6IC9eXFxzKyhbXntpXFxzXXxpKD8hZlxcYikpLyxcblx0XHRhY3Rpb246IHtcblx0XHRcdGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLk91dGRlbnRcblx0XHR9XG5cdH1cbl07XG5cbmV4cG9ydCBjb25zdCBodG1sT25FbnRlclJ1bGVzID0gW1xuXHR7XG5cdFx0YmVmb3JlVGV4dDogLzwoPyEoPzphcmVhfGJhc2V8YnJ8Y29sfGVtYmVkfGhyfGltZ3xpbnB1dHxrZXlnZW58bGlua3xtZW51aXRlbXxtZXRhfHBhcmFtfHNvdXJjZXx0cmFja3x3YnIpKShbXzpcXHddW186XFx3XFwtLlxcZF0qKSg/Oig/OlteJ1wiLz5dfFwiW15cIl0qXCJ8J1teJ10qJykqPyg/IVxcLyk+KVtePF0qJC9pLFxuXHRcdGFmdGVyVGV4dDogL148XFwvKFtfOlxcd11bXzpcXHdcXC0uXFxkXSopXFxzKj4vaSxcblx0XHRhY3Rpb246IHtcblx0XHRcdGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnRcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRiZWZvcmVUZXh0OiAvPCg/ISg/OmFyZWF8YmFzZXxicnxjb2x8ZW1iZWR8aHJ8aW1nfGlucHV0fGtleWdlbnxsaW5rfG1lbnVpdGVtfG1ldGF8cGFyYW18c291cmNlfHRyYWNrfHdicikpKFtfOlxcd11bXzpcXHdcXC0uXFxkXSopKD86KD86W14nXCIvPl18XCJbXlwiXSpcInwnW14nXSonKSo/KD8hXFwvKT4pW148XSokL2ksXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHRpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnRcblx0XHR9XG5cdH1cbl07XG5cbmV4cG9ydCBjb25zdCB2Yk9uRW50ZXJSdWxlcyA9IFtcblx0Ly8gUHJldmVudCBpbmRlbnQgYWZ0ZXIgRW5kIHN0YXRlbWVudHMgYW5kIGJsb2NrIHRlcm1pbmF0b3JzIChidXQgTk9UIEVsc2VJZi4uLlRoZW4gb3IgRWxzZSB3aGljaCBzaG91bGQgaW5kZW50KVxuXHR7XG5cdFx0YmVmb3JlVGV4dDogL15cXHMqKChFbmRcXHMrKElmfFN1YnxGdW5jdGlvbnxDbGFzc3xNb2R1bGV8RW51bXxTdHJ1Y3R1cmV8SW50ZXJmYWNlfE5hbWVzcGFjZXxXaXRofFNlbGVjdHxUcnl8V2hpbGV8Rm9yfFByb3BlcnR5fEdldHxTZXR8U3luY0xvY2t8VXNpbmd8QWRkSGFuZGxlcnxSYWlzZUV2ZW50fFJlbW92ZUhhbmRsZXJ8RXZlbnR8T3BlcmF0b3IpKXxMb29wfE5leHR8V2VuZHxVbnRpbClcXGIuKiQvaSxcblx0XHRhY3Rpb246IHtcblx0XHRcdGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLk5vbmVcblx0XHR9XG5cdH1cbl07XG5cbi8qXG5leHBvcnQgZW51bSBJbmRlbnRBY3Rpb24ge1xuXHROb25lID0gMCxcblx0SW5kZW50ID0gMSxcblx0SW5kZW50T3V0ZGVudCA9IDIsXG5cdE91dGRlbnQgPSAzXG59XG4qL1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBb0I7QUFFdEIsTUFBTSx5QkFBeUI7QUFBQSxFQUNyQztBQUFBO0FBQUEsSUFFQyxZQUFZO0FBQUEsSUFDWixXQUFXO0FBQUEsSUFDWCxRQUFRLEVBQUUsY0FBYyxhQUFhLGVBQWUsWUFBWSxNQUFNO0FBQUEsRUFDdkU7QUFBQSxFQUFHO0FBQUE7QUFBQSxJQUVGLFlBQVk7QUFBQSxJQUNaLFFBQVEsRUFBRSxjQUFjLGFBQWEsTUFBTSxZQUFZLE1BQU07QUFBQSxFQUM5RDtBQUFBLEVBQUc7QUFBQTtBQUFBLElBRUYsWUFBWTtBQUFBLElBQ1osa0JBQWtCO0FBQUEsSUFDbEIsUUFBUSxFQUFFLGNBQWMsYUFBYSxNQUFNLFlBQVksS0FBSztBQUFBLEVBQzdEO0FBQUEsRUFBRztBQUFB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
