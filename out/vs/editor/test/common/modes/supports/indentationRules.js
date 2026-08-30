const javascriptIndentationRules = {
  decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/,
  increaseIndentPattern: /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/,
  // e.g.  * ...| or */| or *-----*/|
  unIndentedLinePattern: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$|^(\t|[ ])*[ ]\*\/\s*$|^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
  indentNextLinePattern: /^((.*=>\s*)|((.*[^\w]+|\s*)(if|while|for)\s*\(.*\)\s*))$/
};
const rubyIndentationRules = {
  decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif)\b|(in|when)\s)/,
  increaseIndentPattern: /^\s*((begin|class|(private|protected)\s+def|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|in|while|case)|([^#]*\sdo\b)|([^#]*=\s*(case|if|unless)))\b([^#\{;]|(\"|'|\/).*\4)*(#.*)?$/
};
const phpIndentationRules = {
  increaseIndentPattern: /({(?!.*}).*|\(|\[|((else(\s)?)?if|else|for(each)?|while|switch|case).*:)\s*((\/[/*].*|)?$|\?>)/,
  decreaseIndentPattern: /^(.*\*\/)?\s*((\})|(\)+[;,])|(\]\)*[;,])|\b(else:)|\b((end(if|for(each)?|while|switch));))/
};
const goIndentationRules = {
  decreaseIndentPattern: /^\s*(\bcase\b.*:|\bdefault\b:|}[)}]*[),]?|\)[,]?)$/,
  increaseIndentPattern: /^.*(\bcase\b.*:|\bdefault\b:|(\b(func|if|else|switch|select|for|struct)\b.*)?{[^}"'`]*|\([^)"'`]*)$/
};
const htmlIndentationRules = {
  decreaseIndentPattern: /^\s*(<\/(?!html)[-_\.A-Za-z0-9]+\b[^>]*>|-->|\})/,
  increaseIndentPattern: /<(?!\?|(?:area|base|br|col|frame|hr|html|img|input|keygen|link|menuitem|meta|param|source|track|wbr)\b|[^>]*\/>)([-_\.A-Za-z0-9]+)(?=\s|>)\b[^>]*>(?!.*<\/\1>)|<!--(?!.*-->)|\{[^}"']*$/
};
const latexIndentationRules = {
  decreaseIndentPattern: /^\s*\\end{(?!document)/,
  increaseIndentPattern: /\\begin{(?!document)([^}]*)}(?!.*\\end{\1})/
};
const luaIndentationRules = {
  decreaseIndentPattern: /^\s*((\b(elseif|else|end|until)\b)|(\})|(\)))/,
  increaseIndentPattern: /^((?!(\-\-)).)*((\b(else|function|then|do|repeat)\b((?!\b(end|until)\b).)*)|(\{\s*))$/
};
const vbIndentationRules = {
  // Decrease indent when line starts with End <keyword>, Else, ElseIf, Case, Catch, Finally, Loop, Next, Wend, Until
  decreaseIndentPattern: /^\s*((End\s+(If|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Select|Try|While|For|Property|Get|Set|SyncLock|Using|AddHandler|RaiseEvent|RemoveHandler|Event|Operator))|Else|ElseIf|Case|Catch|Finally|Loop|Next|Wend|Until)\b/i,
  // Increase indent after lines with block-starting keywords (Sub, Function, Class, Module, If...Then, etc.)
  // Both alternatives are anchored to start of line with ^\s*
  increaseIndentPattern: /^\s*((If|ElseIf).*Then(?!.*End\s+If)\s*(('|REM).*)?|(Else|While|For|Do|Select\s+Case|Case|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Try|Catch|Finally|SyncLock|Using|Property|Get|Set|AddHandler|RaiseEvent|RemoveHandler|Event|Operator)\b(?!.*\bEnd\s+(If|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Select|Try|While|For|Property|Get|Set|SyncLock|Using|AddHandler|RaiseEvent|RemoveHandler|Event|Operator)\b).*(('|REM).*)?)$/i
};
export {
  goIndentationRules,
  htmlIndentationRules,
  javascriptIndentationRules,
  latexIndentationRules,
  luaIndentationRules,
  phpIndentationRules,
  rubyIndentationRules,
  vbIndentationRules
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXHN1cHBvcnRzXFxpbmRlbnRhdGlvblJ1bGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuZXhwb3J0IGNvbnN0IGphdmFzY3JpcHRJbmRlbnRhdGlvblJ1bGVzID0ge1xuXHRkZWNyZWFzZUluZGVudFBhdHRlcm46IC9eKCg/IS4qP1xcL1xcKikuKlxcKlxcLyk/XFxzKltcXH1cXF1cXCldLiokLyxcblx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXigoPyFcXC9cXC8pLikqKFxceyhbXn1cIidgXSp8KFxcdHxbIF0pKlxcL1xcLy4qKXxcXChbXilcIidgXSp8XFxbW15cXF1cIidgXSopJC8sXG5cdC8vIGUuZy4gICogLi4ufCBvciAqL3wgb3IgKi0tLS0tKi98XG5cdHVuSW5kZW50ZWRMaW5lUGF0dGVybjogL14oXFx0fFsgXSkqWyBdXFwqW14vXSpcXCpcXC9cXHMqJHxeKFxcdHxbIF0pKlsgXVxcKlxcL1xccyokfF4oXFx0fFsgXSkqWyBdXFwqKFsgXShbXlxcKl18XFwqKD8hXFwvKSkqKT8kLyxcblx0aW5kZW50TmV4dExpbmVQYXR0ZXJuOiAvXigoLio9PlxccyopfCgoLipbXlxcd10rfFxccyopKGlmfHdoaWxlfGZvcilcXHMqXFwoLipcXClcXHMqKSkkLyxcbn07XG5cbmV4cG9ydCBjb25zdCBydWJ5SW5kZW50YXRpb25SdWxlcyA9IHtcblx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooW31cXF1dKFssKV0/XFxzKigjfCQpfFxcLlthLXpBLVpfXVxcdypcXGIpfChlbmR8cmVzY3VlfGVuc3VyZXxlbHNlfGVsc2lmKVxcYnwoaW58d2hlbilcXHMpLyxcblx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooKGJlZ2lufGNsYXNzfChwcml2YXRlfHByb3RlY3RlZClcXHMrZGVmfGRlZnxlbHNlfGVsc2lmfGVuc3VyZXxmb3J8aWZ8bW9kdWxlfHJlc2N1ZXx1bmxlc3N8dW50aWx8d2hlbnxpbnx3aGlsZXxjYXNlKXwoW14jXSpcXHNkb1xcYil8KFteI10qPVxccyooY2FzZXxpZnx1bmxlc3MpKSlcXGIoW14jXFx7O118KFxcXCJ8J3xcXC8pLipcXDQpKigjLiopPyQvLFxufTtcblxuZXhwb3J0IGNvbnN0IHBocEluZGVudGF0aW9uUnVsZXMgPSB7XG5cdGluY3JlYXNlSW5kZW50UGF0dGVybjogLyh7KD8hLip9KS4qfFxcKHxcXFt8KChlbHNlKFxccyk/KT9pZnxlbHNlfGZvcihlYWNoKT98d2hpbGV8c3dpdGNofGNhc2UpLio6KVxccyooKFxcL1svKl0uKnwpPyR8XFw/PikvLFxuXHRkZWNyZWFzZUluZGVudFBhdHRlcm46IC9eKC4qXFwqXFwvKT9cXHMqKChcXH0pfChcXCkrWzssXSl8KFxcXVxcKSpbOyxdKXxcXGIoZWxzZTopfFxcYigoZW5kKGlmfGZvcihlYWNoKT98d2hpbGV8c3dpdGNoKSk7KSkvLFxufTtcblxuZXhwb3J0IGNvbnN0IGdvSW5kZW50YXRpb25SdWxlcyA9IHtcblx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooXFxiY2FzZVxcYi4qOnxcXGJkZWZhdWx0XFxiOnx9Wyl9XSpbKSxdP3xcXClbLF0/KSQvLFxuXHRpbmNyZWFzZUluZGVudFBhdHRlcm46IC9eLiooXFxiY2FzZVxcYi4qOnxcXGJkZWZhdWx0XFxiOnwoXFxiKGZ1bmN8aWZ8ZWxzZXxzd2l0Y2h8c2VsZWN0fGZvcnxzdHJ1Y3QpXFxiLiopP3tbXn1cIidgXSp8XFwoW14pXCInYF0qKSQvLFxufTtcblxuZXhwb3J0IGNvbnN0IGh0bWxJbmRlbnRhdGlvblJ1bGVzID0ge1xuXHRkZWNyZWFzZUluZGVudFBhdHRlcm46IC9eXFxzKig8XFwvKD8haHRtbClbLV9cXC5BLVphLXowLTldK1xcYltePl0qPnwtLT58XFx9KS8sXG5cdGluY3JlYXNlSW5kZW50UGF0dGVybjogLzwoPyFcXD98KD86YXJlYXxiYXNlfGJyfGNvbHxmcmFtZXxocnxodG1sfGltZ3xpbnB1dHxrZXlnZW58bGlua3xtZW51aXRlbXxtZXRhfHBhcmFtfHNvdXJjZXx0cmFja3x3YnIpXFxifFtePl0qXFwvPikoWy1fXFwuQS1aYS16MC05XSspKD89XFxzfD4pXFxiW14+XSo+KD8hLio8XFwvXFwxPil8PCEtLSg/IS4qLS0+KXxcXHtbXn1cIiddKiQvLFxufTtcblxuZXhwb3J0IGNvbnN0IGxhdGV4SW5kZW50YXRpb25SdWxlcyA9IHtcblx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccypcXFxcZW5keyg/IWRvY3VtZW50KS8sXG5cdGluY3JlYXNlSW5kZW50UGF0dGVybjogL1xcXFxiZWdpbnsoPyFkb2N1bWVudCkoW159XSopfSg/IS4qXFxcXGVuZHtcXDF9KS8sXG59O1xuXG5leHBvcnQgY29uc3QgbHVhSW5kZW50YXRpb25SdWxlcyA9IHtcblx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooKFxcYihlbHNlaWZ8ZWxzZXxlbmR8dW50aWwpXFxiKXwoXFx9KXwoXFwpKSkvLFxuXHRpbmNyZWFzZUluZGVudFBhdHRlcm46IC9eKCg/IShcXC1cXC0pKS4pKigoXFxiKGVsc2V8ZnVuY3Rpb258dGhlbnxkb3xyZXBlYXQpXFxiKCg/IVxcYihlbmR8dW50aWwpXFxiKS4pKil8KFxce1xccyopKSQvLFxufTtcblxuZXhwb3J0IGNvbnN0IHZiSW5kZW50YXRpb25SdWxlcyA9IHtcblx0Ly8gRGVjcmVhc2UgaW5kZW50IHdoZW4gbGluZSBzdGFydHMgd2l0aCBFbmQgPGtleXdvcmQ+LCBFbHNlLCBFbHNlSWYsIENhc2UsIENhdGNoLCBGaW5hbGx5LCBMb29wLCBOZXh0LCBXZW5kLCBVbnRpbFxuXHRkZWNyZWFzZUluZGVudFBhdHRlcm46IC9eXFxzKigoRW5kXFxzKyhJZnxTdWJ8RnVuY3Rpb258Q2xhc3N8TW9kdWxlfEVudW18U3RydWN0dXJlfEludGVyZmFjZXxOYW1lc3BhY2V8V2l0aHxTZWxlY3R8VHJ5fFdoaWxlfEZvcnxQcm9wZXJ0eXxHZXR8U2V0fFN5bmNMb2NrfFVzaW5nfEFkZEhhbmRsZXJ8UmFpc2VFdmVudHxSZW1vdmVIYW5kbGVyfEV2ZW50fE9wZXJhdG9yKSl8RWxzZXxFbHNlSWZ8Q2FzZXxDYXRjaHxGaW5hbGx5fExvb3B8TmV4dHxXZW5kfFVudGlsKVxcYi9pLFxuXHQvLyBJbmNyZWFzZSBpbmRlbnQgYWZ0ZXIgbGluZXMgd2l0aCBibG9jay1zdGFydGluZyBrZXl3b3JkcyAoU3ViLCBGdW5jdGlvbiwgQ2xhc3MsIE1vZHVsZSwgSWYuLi5UaGVuLCBldGMuKVxuXHQvLyBCb3RoIGFsdGVybmF0aXZlcyBhcmUgYW5jaG9yZWQgdG8gc3RhcnQgb2YgbGluZSB3aXRoIF5cXHMqXG5cdGluY3JlYXNlSW5kZW50UGF0dGVybjogL15cXHMqKChJZnxFbHNlSWYpLipUaGVuKD8hLipFbmRcXHMrSWYpXFxzKigoJ3xSRU0pLiopP3woRWxzZXxXaGlsZXxGb3J8RG98U2VsZWN0XFxzK0Nhc2V8Q2FzZXxTdWJ8RnVuY3Rpb258Q2xhc3N8TW9kdWxlfEVudW18U3RydWN0dXJlfEludGVyZmFjZXxOYW1lc3BhY2V8V2l0aHxUcnl8Q2F0Y2h8RmluYWxseXxTeW5jTG9ja3xVc2luZ3xQcm9wZXJ0eXxHZXR8U2V0fEFkZEhhbmRsZXJ8UmFpc2VFdmVudHxSZW1vdmVIYW5kbGVyfEV2ZW50fE9wZXJhdG9yKVxcYig/IS4qXFxiRW5kXFxzKyhJZnxTdWJ8RnVuY3Rpb258Q2xhc3N8TW9kdWxlfEVudW18U3RydWN0dXJlfEludGVyZmFjZXxOYW1lc3BhY2V8V2l0aHxTZWxlY3R8VHJ5fFdoaWxlfEZvcnxQcm9wZXJ0eXxHZXR8U2V0fFN5bmNMb2NrfFVzaW5nfEFkZEhhbmRsZXJ8UmFpc2VFdmVudHxSZW1vdmVIYW5kbGVyfEV2ZW50fE9wZXJhdG9yKVxcYikuKigoJ3xSRU0pLiopPykkL2ksXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS08sTUFBTSw2QkFBNkI7QUFBQSxFQUN6Qyx1QkFBdUI7QUFBQSxFQUN2Qix1QkFBdUI7QUFBQTtBQUFBLEVBRXZCLHVCQUF1QjtBQUFBLEVBQ3ZCLHVCQUF1QjtBQUN4QjtBQUVPLE1BQU0sdUJBQXVCO0FBQUEsRUFDbkMsdUJBQXVCO0FBQUEsRUFDdkIsdUJBQXVCO0FBQ3hCO0FBRU8sTUFBTSxzQkFBc0I7QUFBQSxFQUNsQyx1QkFBdUI7QUFBQSxFQUN2Qix1QkFBdUI7QUFDeEI7QUFFTyxNQUFNLHFCQUFxQjtBQUFBLEVBQ2pDLHVCQUF1QjtBQUFBLEVBQ3ZCLHVCQUF1QjtBQUN4QjtBQUVPLE1BQU0sdUJBQXVCO0FBQUEsRUFDbkMsdUJBQXVCO0FBQUEsRUFDdkIsdUJBQXVCO0FBQ3hCO0FBRU8sTUFBTSx3QkFBd0I7QUFBQSxFQUNwQyx1QkFBdUI7QUFBQSxFQUN2Qix1QkFBdUI7QUFDeEI7QUFFTyxNQUFNLHNCQUFzQjtBQUFBLEVBQ2xDLHVCQUF1QjtBQUFBLEVBQ3ZCLHVCQUF1QjtBQUN4QjtBQUVPLE1BQU0scUJBQXFCO0FBQUE7QUFBQSxFQUVqQyx1QkFBdUI7QUFBQTtBQUFBO0FBQUEsRUFHdkIsdUJBQXVCO0FBQ3hCOyIsCiAgIm5hbWVzIjogW10KfQo=
