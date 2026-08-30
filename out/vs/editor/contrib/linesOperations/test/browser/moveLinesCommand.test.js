var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { EditorAutoIndentStrategy } from "../../../../common/config/editorOptions.js";
import { Selection } from "../../../../common/core/selection.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { LanguageService } from "../../../../common/services/languageService.js";
import { MoveLinesCommand } from "../../browser/moveLinesCommand.js";
import { testCommand } from "../../../../test/browser/testCommand.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
var MoveLinesDirection = /* @__PURE__ */ ((MoveLinesDirection2) => {
  MoveLinesDirection2[MoveLinesDirection2["Up"] = 0] = "Up";
  MoveLinesDirection2[MoveLinesDirection2["Down"] = 1] = "Down";
  return MoveLinesDirection2;
})(MoveLinesDirection || {});
function testMoveLinesDownCommand(lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
  testMoveLinesUpOrDownCommand(1 /* Down */, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesUpCommand(lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
  testMoveLinesUpOrDownCommand(0 /* Up */, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesDownWithIndentCommand(languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
  testMoveLinesUpOrDownWithIndentCommand(1 /* Down */, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesUpWithIndentCommand(languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
  testMoveLinesUpOrDownWithIndentCommand(0 /* Up */, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesUpOrDownCommand(direction, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
  const disposables = new DisposableStore();
  if (!languageConfigurationService) {
    languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
  }
  testCommand(lines, null, selection, (accessor, sel) => new MoveLinesCommand(sel, direction === 0 /* Up */ ? false : true, EditorAutoIndentStrategy.Advanced, languageConfigurationService), expectedLines, expectedSelection);
  disposables.dispose();
}
function testMoveLinesUpOrDownWithIndentCommand(direction, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
  const disposables = new DisposableStore();
  if (!languageConfigurationService) {
    languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
  }
  testCommand(lines, languageId, selection, (accessor, sel) => new MoveLinesCommand(sel, direction === 0 /* Up */ ? false : true, EditorAutoIndentStrategy.Full, languageConfigurationService), expectedLines, expectedSelection);
  disposables.dispose();
}
suite("Editor Contrib - Move Lines Command", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("move first up / last down disabled", function() {
    testMoveLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1)
    );
    testMoveLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 1, 5, 1),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 1, 5, 1)
    );
  });
  test("move first line down", function() {
    testMoveLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 1, 1),
      [
        "second line",
        "first",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 2, 1)
    );
  });
  test("move 2nd line up", function() {
    testMoveLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 2, 1),
      [
        "second line",
        "first",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
  test("issue #1322a: move 2nd line up", function() {
    testMoveLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 12, 2, 12),
      [
        "second line",
        "first",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 12, 1, 12)
    );
  });
  test("issue #1322b: move last line up", function() {
    testMoveLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 6, 5, 6),
      [
        "first",
        "second line",
        "third line",
        "fifth",
        "fourth line"
      ],
      new Selection(4, 6, 4, 6)
    );
  });
  test("issue #1322c: move last line selected up", function() {
    testMoveLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 6, 5, 1),
      [
        "first",
        "second line",
        "third line",
        "fifth",
        "fourth line"
      ],
      new Selection(4, 6, 4, 1)
    );
  });
  test("move last line up", function() {
    testMoveLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 1, 5, 1),
      [
        "first",
        "second line",
        "third line",
        "fifth",
        "fourth line"
      ],
      new Selection(4, 1, 4, 1)
    );
  });
  test("move 4th line down", function() {
    testMoveLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 1, 4, 1),
      [
        "first",
        "second line",
        "third line",
        "fifth",
        "fourth line"
      ],
      new Selection(5, 1, 5, 1)
    );
  });
  test("move multiple lines down", function() {
    testMoveLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 4, 2, 2),
      [
        "first",
        "fifth",
        "second line",
        "third line",
        "fourth line"
      ],
      new Selection(5, 4, 3, 2)
    );
  });
  test("invisible selection is ignored", function() {
    testMoveLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 1),
      [
        "second line",
        "first",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 1, 2, 1)
    );
  });
});
let IndentRulesMode = class extends Disposable {
  constructor(indentationRules, languageService, languageConfigurationService) {
    super();
    this.languageId = "moveLinesIndentMode";
    this._register(languageService.registerLanguage({ id: this.languageId }));
    this._register(languageConfigurationService.register(this.languageId, {
      indentationRules
    }));
  }
};
IndentRulesMode = __decorateClass([
  __decorateParam(1, ILanguageService),
  __decorateParam(2, ILanguageConfigurationService)
], IndentRulesMode);
suite("Editor contrib - Move Lines Command honors Indentation Rules", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const indentRules = {
    decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
    increaseIndentPattern: /(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
    indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
    unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
  };
  test("first line indentation adjust to 0", () => {
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    const mode = new IndentRulesMode(indentRules, languageService, languageConfigurationService);
    testMoveLinesUpWithIndentCommand(
      mode.languageId,
      [
        "class X {",
        "	z = 2",
        "}"
      ],
      new Selection(2, 1, 2, 1),
      [
        "z = 2",
        "class X {",
        "}"
      ],
      new Selection(1, 1, 1, 1),
      languageConfigurationService
    );
    mode.dispose();
    languageService.dispose();
    languageConfigurationService.dispose();
  });
  test("move lines across block", () => {
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    const mode = new IndentRulesMode(indentRules, languageService, languageConfigurationService);
    testMoveLinesDownWithIndentCommand(
      mode.languageId,
      [
        "const value = 2;",
        "const standardLanguageDescriptions = [",
        "    {",
        "        diagnosticSource: 'js',",
        "    }",
        "];"
      ],
      new Selection(1, 1, 1, 1),
      [
        "const standardLanguageDescriptions = [",
        "    const value = 2;",
        "    {",
        "        diagnosticSource: 'js',",
        "    }",
        "];"
      ],
      new Selection(2, 5, 2, 5),
      languageConfigurationService
    );
    mode.dispose();
    languageService.dispose();
    languageConfigurationService.dispose();
  });
  test("move line should still work as before if there is no indentation rules", () => {
    testMoveLinesUpWithIndentCommand(
      null,
      [
        "if (true) {",
        "    var task = new Task(() => {",
        "        var work = 1234;",
        "    });",
        "}"
      ],
      new Selection(3, 1, 3, 1),
      [
        "if (true) {",
        "        var work = 1234;",
        "    var task = new Task(() => {",
        "    });",
        "}"
      ],
      new Selection(2, 1, 2, 1)
    );
  });
});
let EnterRulesMode = class extends Disposable {
  constructor(languageService, languageConfigurationService) {
    super();
    this.languageId = "moveLinesEnterMode";
    this._register(languageService.registerLanguage({ id: this.languageId }));
    this._register(languageConfigurationService.register(this.languageId, {
      indentationRules: {
        decreaseIndentPattern: /^\s*\[$/,
        increaseIndentPattern: /^\s*\]$/
      },
      brackets: [
        ["{", "}"]
      ]
    }));
  }
};
EnterRulesMode = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, ILanguageConfigurationService)
], EnterRulesMode);
suite("Editor - contrib - Move Lines Command honors onEnter Rules", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #54829. move block across block", () => {
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    const mode = new EnterRulesMode(languageService, languageConfigurationService);
    testMoveLinesDownWithIndentCommand(
      mode.languageId,
      [
        "if (true) {",
        "    if (false) {",
        "        if (1) {",
        "            console.log('b');",
        "        }",
        "        console.log('a');",
        "    }",
        "}"
      ],
      new Selection(3, 9, 5, 10),
      [
        "if (true) {",
        "    if (false) {",
        "        console.log('a');",
        "        if (1) {",
        "            console.log('b');",
        "        }",
        "    }",
        "}"
      ],
      new Selection(4, 9, 6, 10),
      languageConfigurationService
    );
    mode.dispose();
    languageService.dispose();
    languageConfigurationService.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmVzT3BlcmF0aW9uc1xcdGVzdFxcYnJvd3NlclxcbW92ZUxpbmVzQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSW5kZW50YXRpb25SdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW92ZUxpbmVzQ29tbWFuZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW92ZUxpbmVzQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyB0ZXN0Q29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29tbWFuZC5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL21vZGVzL3Rlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcblxuY29uc3QgZW51bSBNb3ZlTGluZXNEaXJlY3Rpb24ge1xuXHRVcCxcblx0RG93blxufVxuXG5mdW5jdGlvbiB0ZXN0TW92ZUxpbmVzRG93bkNvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U/OiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHR0ZXN0TW92ZUxpbmVzVXBPckRvd25Db21tYW5kKE1vdmVMaW5lc0RpcmVjdGlvbi5Eb3duLCBsaW5lcywgc2VsZWN0aW9uLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbiwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG59XG5cbmZ1bmN0aW9uIHRlc3RNb3ZlTGluZXNVcENvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U/OiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHR0ZXN0TW92ZUxpbmVzVXBPckRvd25Db21tYW5kKE1vdmVMaW5lc0RpcmVjdGlvbi5VcCwgbGluZXMsIHNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lcywgZXhwZWN0ZWRTZWxlY3Rpb24sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xufVxuXG5mdW5jdGlvbiB0ZXN0TW92ZUxpbmVzRG93bldpdGhJbmRlbnRDb21tYW5kKGxhbmd1YWdlSWQ6IHN0cmluZywgbGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U/OiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHR0ZXN0TW92ZUxpbmVzVXBPckRvd25XaXRoSW5kZW50Q29tbWFuZChNb3ZlTGluZXNEaXJlY3Rpb24uRG93biwgbGFuZ3VhZ2VJZCwgbGluZXMsIHNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lcywgZXhwZWN0ZWRTZWxlY3Rpb24sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xufVxuXG5mdW5jdGlvbiB0ZXN0TW92ZUxpbmVzVXBXaXRoSW5kZW50Q29tbWFuZChsYW5ndWFnZUlkOiBzdHJpbmcsIGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZFNlbGVjdGlvbjogU2VsZWN0aW9uLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0dGVzdE1vdmVMaW5lc1VwT3JEb3duV2l0aEluZGVudENvbW1hbmQoTW92ZUxpbmVzRGlyZWN0aW9uLlVwLCBsYW5ndWFnZUlkLCBsaW5lcywgc2VsZWN0aW9uLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbiwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG59XG5cbmZ1bmN0aW9uIHRlc3RNb3ZlTGluZXNVcE9yRG93bkNvbW1hbmQoZGlyZWN0aW9uOiBNb3ZlTGluZXNEaXJlY3Rpb24sIGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZFNlbGVjdGlvbjogU2VsZWN0aW9uLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGlmICghbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHR9XG5cdHRlc3RDb21tYW5kKGxpbmVzLCBudWxsLCBzZWxlY3Rpb24sIChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgTW92ZUxpbmVzQ29tbWFuZChzZWwsIGRpcmVjdGlvbiA9PT0gTW92ZUxpbmVzRGlyZWN0aW9uLlVwID8gZmFsc2UgOiB0cnVlLCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuQWR2YW5jZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbik7XG5cdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcbn1cblxuZnVuY3Rpb24gdGVzdE1vdmVMaW5lc1VwT3JEb3duV2l0aEluZGVudENvbW1hbmQoZGlyZWN0aW9uOiBNb3ZlTGluZXNEaXJlY3Rpb24sIGxhbmd1YWdlSWQ6IHN0cmluZywgbGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U/OiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0aWYgKCFsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdH1cblx0dGVzdENvbW1hbmQobGluZXMsIGxhbmd1YWdlSWQsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBNb3ZlTGluZXNDb21tYW5kKHNlbCwgZGlyZWN0aW9uID09PSBNb3ZlTGluZXNEaXJlY3Rpb24uVXAgPyBmYWxzZSA6IHRydWUsIEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgZXhwZWN0ZWRMaW5lcywgZXhwZWN0ZWRTZWxlY3Rpb24pO1xuXHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG59XG5cbnN1aXRlKCdFZGl0b3IgQ29udHJpYiAtIE1vdmUgTGluZXMgQ29tbWFuZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtb3ZlIGZpcnN0IHVwIC8gbGFzdCBkb3duIGRpc2FibGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RNb3ZlTGluZXNVcENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHQpO1xuXG5cdFx0dGVzdE1vdmVMaW5lc0Rvd25Db21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBmaXJzdCBsaW5lIGRvd24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdE1vdmVMaW5lc0Rvd25Db21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAybmQgbGluZSB1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TW92ZUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEzMjJhOiBtb3ZlIDJuZCBsaW5lIHVwJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RNb3ZlTGluZXNVcENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTIsIDIsIDEyKSxcblx0XHRcdFtcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEzMjJiOiBtb3ZlIGxhc3QgbGluZSB1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TW92ZUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDYsIDUsIDYpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmaWZ0aCcsXG5cdFx0XHRcdCdmb3VydGggbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDYsIDQsIDYpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEzMjJjOiBtb3ZlIGxhc3QgbGluZSBzZWxlY3RlZCB1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TW92ZUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDYsIDUsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmaWZ0aCcsXG5cdFx0XHRcdCdmb3VydGggbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDYsIDQsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsYXN0IGxpbmUgdXAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdE1vdmVMaW5lc1VwQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgNHRoIGxpbmUgZG93bicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TW92ZUxpbmVzRG93bkNvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMSwgNSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIG11bHRpcGxlIGxpbmVzIGRvd24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdE1vdmVMaW5lc0Rvd25Db21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDIsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnZmlmdGgnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDMsIDIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW52aXNpYmxlIHNlbGVjdGlvbiBpcyBpZ25vcmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RNb3ZlTGluZXNEb3duQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIEluZGVudFJ1bGVzTW9kZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9ICdtb3ZlTGluZXNJbmRlbnRNb2RlJztcblx0Y29uc3RydWN0b3IoXG5cdFx0aW5kZW50YXRpb25SdWxlczogSW5kZW50YXRpb25SdWxlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiB0aGlzLmxhbmd1YWdlSWQgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiBpbmRlbnRhdGlvblJ1bGVzXG5cdFx0fSkpO1xuXHR9XG59XG5cbnN1aXRlKCdFZGl0b3IgY29udHJpYiAtIE1vdmUgTGluZXMgQ29tbWFuZCBob25vcnMgSW5kZW50YXRpb24gUnVsZXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgaW5kZW50UnVsZXMgPSB7XG5cdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooKD8hXFxTLipcXC9bKl0pLipbKl1cXC9cXHMqKT9bfSlcXF1dfF5cXHMqKGNhc2VcXGIuKnxkZWZhdWx0KTpcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JC8sXG5cdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvKFxce1tefVwiJ2BdKnxcXChbXilcIiddKnxcXFtbXlxcXVwiJ10qfF5cXHMqKFxce1xcfXxcXChcXCl8XFxbXFxdfChjYXNlXFxiLip8ZGVmYXVsdCk6KSlcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JC8sXG5cdFx0aW5kZW50TmV4dExpbmVQYXR0ZXJuOiAvXlxccyooZm9yfHdoaWxlfGlmfGVsc2UpXFxiKD8hLipbO3t9XVxccyooXFwvXFwvLip8XFwvWypdLipbKl1cXC9cXHMqKT8kKS8sXG5cdFx0dW5JbmRlbnRlZExpbmVQYXR0ZXJuOiAvXig/IS4qKFs7e31dfFxcUzopXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQpKD8hLiooXFx7W159XCInXSp8XFwoW14pXCInXSp8XFxbW15cXF1cIiddKnxeXFxzKihcXHtcXH18XFwoXFwpfFxcW1xcXXwoY2FzZVxcYi4qfGRlZmF1bHQpOikpXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQpKD8hXlxccyooKD8hXFxTLipcXC9bKl0pLipbKl1cXC9cXHMqKT9bfSlcXF1dfF5cXHMqKGNhc2VcXGIuKnxkZWZhdWx0KTpcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JCkoPyFeXFxzKihmb3J8d2hpbGV8aWZ8ZWxzZSlcXGIoPyEuKls7e31dXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQpKS9cblx0fTtcblxuXHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjg1NTIjaXNzdWVjb21tZW50LTMwNzg2Mjc5N1xuXHR0ZXN0KCdmaXJzdCBsaW5lIGluZGVudGF0aW9uIGFkanVzdCB0byAwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IG5ldyBMYW5ndWFnZVNlcnZpY2UoKTtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZSA9IG5ldyBJbmRlbnRSdWxlc01vZGUoaW5kZW50UnVsZXMsIGxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0ZXN0TW92ZUxpbmVzVXBXaXRoSW5kZW50Q29tbWFuZChcblx0XHRcdG1vZGUubGFuZ3VhZ2VJZCxcblx0XHRcdFtcblx0XHRcdFx0J2NsYXNzIFggeycsXG5cdFx0XHRcdCdcXHR6ID0gMicsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCd6ID0gMicsXG5cdFx0XHRcdCdjbGFzcyBYIHsnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdCk7XG5cblx0XHRtb2RlLmRpc3Bvc2UoKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjg1NTIjaXNzdWVjb21tZW50LTMwNzg2NzcxN1xuXHR0ZXN0KCdtb3ZlIGxpbmVzIGFjcm9zcyBibG9jaycsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGUgPSBuZXcgSW5kZW50UnVsZXNNb2RlKGluZGVudFJ1bGVzLCBsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGVzdE1vdmVMaW5lc0Rvd25XaXRoSW5kZW50Q29tbWFuZChcblx0XHRcdG1vZGUubGFuZ3VhZ2VJZCxcblx0XHRcdFtcblx0XHRcdFx0J2NvbnN0IHZhbHVlID0gMjsnLFxuXHRcdFx0XHQnY29uc3Qgc3RhbmRhcmRMYW5ndWFnZURlc2NyaXB0aW9ucyA9IFsnLFxuXHRcdFx0XHQnICAgIHsnLFxuXHRcdFx0XHQnICAgICAgICBkaWFnbm9zdGljU291cmNlOiBcXCdqc1xcJywnLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHQnXTsnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2NvbnN0IHN0YW5kYXJkTGFuZ3VhZ2VEZXNjcmlwdGlvbnMgPSBbJyxcblx0XHRcdFx0JyAgICBjb25zdCB2YWx1ZSA9IDI7Jyxcblx0XHRcdFx0JyAgICB7Jyxcblx0XHRcdFx0JyAgICAgICAgZGlhZ25vc3RpY1NvdXJjZTogXFwnanNcXCcsJyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0J107J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSksXG5cdFx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KTtcblxuXHRcdG1vZGUuZGlzcG9zZSgpO1xuXHRcdGxhbmd1YWdlU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cblx0dGVzdCgnbW92ZSBsaW5lIHNob3VsZCBzdGlsbCB3b3JrIGFzIGJlZm9yZSBpZiB0aGVyZSBpcyBubyBpbmRlbnRhdGlvbiBydWxlcycsICgpID0+IHtcblx0XHR0ZXN0TW92ZUxpbmVzVXBXaXRoSW5kZW50Q29tbWFuZChcblx0XHRcdG51bGwhLFxuXHRcdFx0W1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgIHZhciB0YXNrID0gbmV3IFRhc2soKCkgPT4geycsXG5cdFx0XHRcdCcgICAgICAgIHZhciB3b3JrID0gMTIzNDsnLFxuXHRcdFx0XHQnICAgIH0pOycsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgICAgICAgIHZhciB3b3JrID0gMTIzNDsnLFxuXHRcdFx0XHQnICAgIHZhciB0YXNrID0gbmV3IFRhc2soKCkgPT4geycsXG5cdFx0XHRcdCcgICAgfSk7Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIEVudGVyUnVsZXNNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkID0gJ21vdmVMaW5lc0VudGVyTW9kZSc7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiB0aGlzLmxhbmd1YWdlSWQgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiB7XG5cdFx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogL15cXHMqXFxbJC8sXG5cdFx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogL15cXHMqXFxdJC8sXG5cdFx0XHR9LFxuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXVxuXHRcdFx0XVxuXHRcdH0pKTtcblx0fVxufVxuXG5zdWl0ZSgnRWRpdG9yIC0gY29udHJpYiAtIE1vdmUgTGluZXMgQ29tbWFuZCBob25vcnMgb25FbnRlciBSdWxlcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTQ4MjkuIG1vdmUgYmxvY2sgYWNyb3NzIGJsb2NrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IG5ldyBMYW5ndWFnZVNlcnZpY2UoKTtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZSA9IG5ldyBFbnRlclJ1bGVzTW9kZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGVzdE1vdmVMaW5lc0Rvd25XaXRoSW5kZW50Q29tbWFuZChcblx0XHRcdG1vZGUubGFuZ3VhZ2VJZCxcblxuXHRcdFx0W1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgIGlmIChmYWxzZSkgeycsXG5cdFx0XHRcdCcgICAgICAgIGlmICgxKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgICAgIGNvbnNvbGUubG9nKFxcJ2JcXCcpOycsXG5cdFx0XHRcdCcgICAgICAgIH0nLFxuXHRcdFx0XHQnICAgICAgICBjb25zb2xlLmxvZyhcXCdhXFwnKTsnLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDksIDUsIDEwKSxcblx0XHRcdFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgICBpZiAoZmFsc2UpIHsnLFxuXHRcdFx0XHQnICAgICAgICBjb25zb2xlLmxvZyhcXCdhXFwnKTsnLFxuXHRcdFx0XHQnICAgICAgICBpZiAoMSkgeycsXG5cdFx0XHRcdCcgICAgICAgICAgICBjb25zb2xlLmxvZyhcXCdiXFwnKTsnLFxuXHRcdFx0XHQnICAgICAgICB9Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCA5LCA2LCAxMCksXG5cdFx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KTtcblxuXHRcdG1vZGUuZGlzcG9zZSgpO1xuXHRcdGxhbmd1YWdlU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3Q0FBd0M7QUFFakQsSUFBVyxxQkFBWCxrQkFBV0Esd0JBQVg7QUFDQyxFQUFBQSx3Q0FBQTtBQUNBLEVBQUFBLHdDQUFBO0FBRlUsU0FBQUE7QUFBQSxHQUFBO0FBS1gsU0FBUyx5QkFBeUIsT0FBaUIsV0FBc0IsZUFBeUIsbUJBQThCLDhCQUFvRTtBQUNuTSwrQkFBNkIsY0FBeUIsT0FBTyxXQUFXLGVBQWUsbUJBQW1CLDRCQUE0QjtBQUN2STtBQUVBLFNBQVMsdUJBQXVCLE9BQWlCLFdBQXNCLGVBQXlCLG1CQUE4Qiw4QkFBb0U7QUFDak0sK0JBQTZCLFlBQXVCLE9BQU8sV0FBVyxlQUFlLG1CQUFtQiw0QkFBNEI7QUFDckk7QUFFQSxTQUFTLG1DQUFtQyxZQUFvQixPQUFpQixX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
