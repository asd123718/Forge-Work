import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { SnippetController2 } from "../../../../../editor/contrib/snippet/browser/snippetController2.js";
import * as nls from "../../../../../nls.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { SnippetEditorAction } from "./abstractSnippetsActions.js";
import { pickSnippet } from "../snippetPicker.js";
import { ISnippetsService } from "../snippets.js";
import { Snippet, SnippetSource } from "../snippetsFile.js";
const _Args = class _Args {
  constructor(snippet, name, langId) {
    this.snippet = snippet;
    this.name = name;
    this.langId = langId;
  }
  static fromUser(arg) {
    if (!arg || typeof arg !== "object") {
      return _Args._empty;
    }
    let { snippet, name, langId } = arg;
    if (typeof snippet !== "string") {
      snippet = void 0;
    }
    if (typeof name !== "string") {
      name = void 0;
    }
    if (typeof langId !== "string") {
      langId = void 0;
    }
    return new _Args(snippet, name, langId);
  }
};
_Args._empty = new _Args(void 0, void 0, void 0);
let Args = _Args;
class InsertSnippetAction extends SnippetEditorAction {
  constructor() {
    super({
      id: "editor.action.insertSnippet",
      title: nls.localize2("snippet.suggestions.label", "Insert Snippet"),
      f1: true,
      precondition: EditorContextKeys.writable,
      metadata: {
        description: `Insert Snippet`,
        args: [{
          name: "args",
          schema: {
            "type": "object",
            "properties": {
              "snippet": {
                "type": "string"
              },
              "langId": {
                "type": "string"
              },
              "name": {
                "type": "string"
              }
            }
          }
        }]
      }
    });
  }
  async runEditorCommand(accessor, editor, arg) {
    const languageService = accessor.get(ILanguageService);
    const snippetService = accessor.get(ISnippetsService);
    if (!editor.hasModel()) {
      return;
    }
    const clipboardService = accessor.get(IClipboardService);
    const instaService = accessor.get(IInstantiationService);
    const snippet = await new Promise((resolve, reject) => {
      const { lineNumber, column } = editor.getPosition();
      const { snippet: snippet2, name, langId } = Args.fromUser(arg);
      if (snippet2) {
        return resolve(new Snippet(
          false,
          [],
          "",
          "",
          "",
          snippet2,
          "",
          SnippetSource.User,
          `random/${Math.random()}`
        ));
      }
      let languageId;
      if (langId) {
        if (!languageService.isRegisteredLanguageId(langId)) {
          return resolve(void 0);
        }
        languageId = langId;
      } else {
        editor.getModel().tokenization.tokenizeIfCheap(lineNumber);
        languageId = editor.getModel().getLanguageIdAtPosition(lineNumber, column);
        if (!languageService.getLanguageName(languageId)) {
          languageId = editor.getModel().getLanguageId();
        }
      }
      if (name) {
        snippetService.getSnippets(languageId, void 0, { includeNoPrefixSnippets: true }).then((snippets) => snippets.find((snippet3) => snippet3.name === name)).then(resolve, reject);
      } else {
        resolve(instaService.invokeFunction(pickSnippet, languageId, editor.getModel().uri));
      }
    });
    if (!snippet) {
      return;
    }
    let clipboardText;
    if (snippet.needsClipboard) {
      clipboardText = await clipboardService.readText();
    }
    editor.focus();
    SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
    snippetService.updateUsageTimestamp(snippet);
  }
}
export {
  InsertSnippetAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFxicm93c2VyXFxjb21tYW5kc1xcaW5zZXJ0U25pcHBldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNuaXBwZXRFZGl0b3JBY3Rpb24gfSBmcm9tICcuL2Fic3RyYWN0U25pcHBldHNBY3Rpb25zLmpzJztcbmltcG9ydCB7IHBpY2tTbmlwcGV0IH0gZnJvbSAnLi4vc25pcHBldFBpY2tlci5qcyc7XG5pbXBvcnQgeyBJU25pcHBldHNTZXJ2aWNlIH0gZnJvbSAnLi4vc25pcHBldHMuanMnO1xuaW1wb3J0IHsgU25pcHBldCwgU25pcHBldFNvdXJjZSB9IGZyb20gJy4uL3NuaXBwZXRzRmlsZS5qcyc7XG5cbmNsYXNzIEFyZ3Mge1xuXG5cdHN0YXRpYyBmcm9tVXNlcihhcmc6IGFueSk6IEFyZ3Mge1xuXHRcdGlmICghYXJnIHx8IHR5cGVvZiBhcmcgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gQXJncy5fZW1wdHk7XG5cdFx0fVxuXHRcdGxldCB7IHNuaXBwZXQsIG5hbWUsIGxhbmdJZCB9ID0gYXJnO1xuXHRcdGlmICh0eXBlb2Ygc25pcHBldCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHNuaXBwZXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdG5hbWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbGFuZ0lkICE9PSAnc3RyaW5nJykge1xuXHRcdFx0bGFuZ0lkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEFyZ3Moc25pcHBldCwgbmFtZSwgbGFuZ0lkKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9lbXB0eSA9IG5ldyBBcmdzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNuaXBwZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgSW5zZXJ0U25pcHBldEFjdGlvbiBleHRlbmRzIFNuaXBwZXRFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5pbnNlcnRTbmlwcGV0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzbmlwcGV0LnN1Z2dlc3Rpb25zLmxhYmVsJywgXCJJbnNlcnQgU25pcHBldFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgSW5zZXJ0IFNuaXBwZXRgLFxuXHRcdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdFx0J3NuaXBwZXQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQnbGFuZ0lkJzoge1xuXHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J25hbWUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZzogYW55KSB7XG5cblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgc25pcHBldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNuaXBwZXRzU2VydmljZSk7XG5cblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBzbmlwcGV0ID0gYXdhaXQgbmV3IFByb21pc2U8U25pcHBldCB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRjb25zdCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCB7IHNuaXBwZXQsIG5hbWUsIGxhbmdJZCB9ID0gQXJncy5mcm9tVXNlcihhcmcpO1xuXG5cdFx0XHRpZiAoc25pcHBldCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShuZXcgU25pcHBldChcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRzbmlwcGV0LFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFNuaXBwZXRTb3VyY2UuVXNlcixcblx0XHRcdFx0XHRgcmFuZG9tLyR7TWF0aC5yYW5kb20oKX1gXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgbGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRcdFx0aWYgKGxhbmdJZCkge1xuXHRcdFx0XHRpZiAoIWxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmdJZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhbmd1YWdlSWQgPSBsYW5nSWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS50b2tlbml6YXRpb24udG9rZW5pemVJZkNoZWFwKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRsYW5ndWFnZUlkID0gZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblxuXHRcdFx0XHQvLyB2YWxpZGF0ZSB0aGUgYGxhbmd1YWdlSWRgIHRvIGVuc3VyZSB0aGlzIGlzIGEgdXNlclxuXHRcdFx0XHQvLyBmYWNpbmcgbGFuZ3VhZ2Ugd2l0aCBhIG5hbWUgYW5kIHRoZSBjaGFuY2UgdG8gaGF2ZVxuXHRcdFx0XHQvLyBzbmlwcGV0cywgZWxzZSBmYWxsIGJhY2sgdG8gdGhlIG91dGVyIGxhbmd1YWdlXG5cdFx0XHRcdGlmICghbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZUlkKSkge1xuXHRcdFx0XHRcdGxhbmd1YWdlSWQgPSBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG5hbWUpIHtcblx0XHRcdFx0Ly8gdGFrZSBzZWxlY3RlZCBzbmlwcGV0XG5cdFx0XHRcdHNuaXBwZXRTZXJ2aWNlLmdldFNuaXBwZXRzKGxhbmd1YWdlSWQsIHVuZGVmaW5lZCwgeyBpbmNsdWRlTm9QcmVmaXhTbmlwcGV0czogdHJ1ZSB9KVxuXHRcdFx0XHRcdC50aGVuKHNuaXBwZXRzID0+IHNuaXBwZXRzLmZpbmQoc25pcHBldCA9PiBzbmlwcGV0Lm5hbWUgPT09IG5hbWUpKVxuXHRcdFx0XHRcdC50aGVuKHJlc29sdmUsIHJlamVjdCk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGxldCB1c2VyIHBpY2sgYSBzbmlwcGV0XG5cdFx0XHRcdHJlc29sdmUoaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHBpY2tTbmlwcGV0LCBsYW5ndWFnZUlkLCBlZGl0b3IuZ2V0TW9kZWwoKS51cmkpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghc25pcHBldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY2xpcGJvYXJkVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzbmlwcGV0Lm5lZWRzQ2xpcGJvYXJkKSB7XG5cdFx0XHRjbGlwYm9hcmRUZXh0ID0gYXdhaXQgY2xpcGJvYXJkU2VydmljZS5yZWFkVGV4dCgpO1xuXHRcdH1cblx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHRTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KGVkaXRvcik/Lmluc2VydChzbmlwcGV0LmNvZGVTbmlwcGV0LCB7IGNsaXBib2FyZFRleHQgfSk7XG5cdFx0c25pcHBldFNlcnZpY2UudXBkYXRlVXNhZ2VUaW1lc3RhbXAoc25pcHBldCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFT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
