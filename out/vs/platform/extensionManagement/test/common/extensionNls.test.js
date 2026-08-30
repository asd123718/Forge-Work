import assert from "assert";
import { deepClone } from "../../../../base/common/objects.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { localizeManifest } from "../../common/extensionNls.js";
import { NullLogger } from "../../../log/common/log.js";
const manifest = {
  name: "test",
  publisher: "test",
  version: "1.0.0",
  engines: {
    vscode: "*"
  },
  contributes: {
    commands: [
      {
        command: "test.command",
        title: "%test.command.title%",
        category: "%test.command.category%"
      }
    ],
    authentication: [
      {
        id: "test.authentication",
        label: "%test.authentication.label%"
      }
    ],
    configuration: {
      // to ensure we test another "title" property
      title: "%test.configuration.title%",
      properties: {
        "test.configuration": {
          type: "string",
          description: "not important"
        }
      }
    }
  }
};
suite("Localize Manifest", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("replaces template strings", function() {
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifest),
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category",
        "test.authentication.label": "Test Authentication",
        "test.configuration.title": "Test Configuration"
      }
    );
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, "Test Command");
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "Test Authentication");
    assert.strictEqual((localizedManifest.contributes?.configuration).title, "Test Configuration");
  });
  test("replaces template strings with fallback if not found in translations", function() {
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifest),
      {},
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category",
        "test.authentication.label": "Test Authentication",
        "test.configuration.title": "Test Configuration"
      }
    );
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, "Test Command");
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "Test Authentication");
    assert.strictEqual((localizedManifest.contributes?.configuration).title, "Test Configuration");
  });
  test("replaces template strings - command title & categories become ILocalizedString", function() {
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifest),
      {
        "test.command.title": "Befehl test",
        "test.command.category": "Testkategorie",
        "test.authentication.label": "Testauthentifizierung",
        "test.configuration.title": "Testkonfiguration"
      },
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category",
        "test.authentication.label": "Test Authentication",
        "test.configuration.title": "Test Configuration"
      }
    );
    const title = localizedManifest.contributes?.commands?.[0].title;
    const category = localizedManifest.contributes?.commands?.[0].category;
    assert.strictEqual(title.value, "Befehl test");
    assert.strictEqual(title.original, "Test Command");
    assert.strictEqual(category.value, "Testkategorie");
    assert.strictEqual(category.original, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "Testauthentifizierung");
    assert.strictEqual((localizedManifest.contributes?.configuration).title, "Testkonfiguration");
  });
  test("replaces template strings - is best effort #164630", function() {
    const manifestWithTypo = {
      name: "test",
      publisher: "test",
      version: "1.0.0",
      engines: {
        vscode: "*"
      },
      contributes: {
        authentication: [
          {
            id: "test.authentication",
            // This not existing in the bundle shouldn't cause an error.
            label: "%doesnotexist%"
          }
        ],
        commands: [
          {
            command: "test.command",
            title: "%test.command.title%",
            category: "%test.command.category%"
          }
        ]
      }
    };
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifestWithTypo),
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category"
      }
    );
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, "Test Command");
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "%doesnotexist%");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcdGVzdFxcY29tbW9uXFxleHRlbnNpb25ObHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplTWFuaWZlc3QgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0ZW5zaW9uTmxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ2dlciB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuY29uc3QgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCA9IHtcblx0bmFtZTogJ3Rlc3QnLFxuXHRwdWJsaXNoZXI6ICd0ZXN0Jyxcblx0dmVyc2lvbjogJzEuMC4wJyxcblx0ZW5naW5lczoge1xuXHRcdHZzY29kZTogJyonXG5cdH0sXG5cdGNvbnRyaWJ1dGVzOiB7XG5cdFx0Y29tbWFuZHM6IFtcblx0XHRcdHtcblx0XHRcdFx0Y29tbWFuZDogJ3Rlc3QuY29tbWFuZCcsXG5cdFx0XHRcdHRpdGxlOiAnJXRlc3QuY29tbWFuZC50aXRsZSUnLFxuXHRcdFx0XHRjYXRlZ29yeTogJyV0ZXN0LmNvbW1hbmQuY2F0ZWdvcnklJ1xuXHRcdFx0fSxcblx0XHRdLFxuXHRcdGF1dGhlbnRpY2F0aW9uOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndGVzdC5hdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdGxhYmVsOiAnJXRlc3QuYXV0aGVudGljYXRpb24ubGFiZWwlJyxcblx0XHRcdH1cblx0XHRdLFxuXHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdC8vIHRvIGVuc3VyZSB3ZSB0ZXN0IGFub3RoZXIgXCJ0aXRsZVwiIHByb3BlcnR5XG5cdFx0XHR0aXRsZTogJyV0ZXN0LmNvbmZpZ3VyYXRpb24udGl0bGUlJyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3QuY29uZmlndXJhdGlvbic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ25vdCBpbXBvcnRhbnQnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG5zdWl0ZSgnTG9jYWxpemUgTWFuaWZlc3QnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlc3QoJ3JlcGxhY2VzIHRlbXBsYXRlIHN0cmluZ3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbG9jYWxpemVkTWFuaWZlc3QgPSBsb2NhbGl6ZU1hbmlmZXN0KFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBOdWxsTG9nZ2VyKCkpLFxuXHRcdFx0ZGVlcENsb25lKG1hbmlmZXN0KSxcblx0XHRcdHtcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC50aXRsZSc6ICdUZXN0IENvbW1hbmQnLFxuXHRcdFx0XHQndGVzdC5jb21tYW5kLmNhdGVnb3J5JzogJ1Rlc3QgQ2F0ZWdvcnknLFxuXHRcdFx0XHQndGVzdC5hdXRoZW50aWNhdGlvbi5sYWJlbCc6ICdUZXN0IEF1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0J3Rlc3QuY29uZmlndXJhdGlvbi50aXRsZSc6ICdUZXN0IENvbmZpZ3VyYXRpb24nLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzPy5bMF0udGl0bGUsICdUZXN0IENvbW1hbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzPy5bMF0uY2F0ZWdvcnksICdUZXN0IENhdGVnb3J5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5hdXRoZW50aWNhdGlvbj8uWzBdLmxhYmVsLCAnVGVzdCBBdXRoZW50aWNhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbmZpZ3VyYXRpb24gYXMgSUNvbmZpZ3VyYXRpb25Ob2RlKS50aXRsZSwgJ1Rlc3QgQ29uZmlndXJhdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyB0ZW1wbGF0ZSBzdHJpbmdzIHdpdGggZmFsbGJhY2sgaWYgbm90IGZvdW5kIGluIHRyYW5zbGF0aW9ucycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBsb2NhbGl6ZWRNYW5pZmVzdCA9IGxvY2FsaXplTWFuaWZlc3QoXG5cdFx0XHRzdG9yZS5hZGQobmV3IE51bGxMb2dnZXIoKSksXG5cdFx0XHRkZWVwQ2xvbmUobWFuaWZlc3QpLFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQudGl0bGUnOiAnVGVzdCBDb21tYW5kJyxcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC5jYXRlZ29yeSc6ICdUZXN0IENhdGVnb3J5Jyxcblx0XHRcdFx0J3Rlc3QuYXV0aGVudGljYXRpb24ubGFiZWwnOiAnVGVzdCBBdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdCd0ZXN0LmNvbmZpZ3VyYXRpb24udGl0bGUnOiAnVGVzdCBDb25maWd1cmF0aW9uJyxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kcz8uWzBdLnRpdGxlLCAnVGVzdCBDb21tYW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kcz8uWzBdLmNhdGVnb3J5LCAnVGVzdCBDYXRlZ29yeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uYXV0aGVudGljYXRpb24/LlswXS5sYWJlbCwgJ1Rlc3QgQXV0aGVudGljYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb25maWd1cmF0aW9uIGFzIElDb25maWd1cmF0aW9uTm9kZSkudGl0bGUsICdUZXN0IENvbmZpZ3VyYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgdGVtcGxhdGUgc3RyaW5ncyAtIGNvbW1hbmQgdGl0bGUgJiBjYXRlZ29yaWVzIGJlY29tZSBJTG9jYWxpemVkU3RyaW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxvY2FsaXplZE1hbmlmZXN0ID0gbG9jYWxpemVNYW5pZmVzdChcblx0XHRcdHN0b3JlLmFkZChuZXcgTnVsbExvZ2dlcigpKSxcblx0XHRcdGRlZXBDbG9uZShtYW5pZmVzdCksXG5cdFx0XHR7XG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQudGl0bGUnOiAnQmVmZWhsIHRlc3QnLFxuXHRcdFx0XHQndGVzdC5jb21tYW5kLmNhdGVnb3J5JzogJ1Rlc3RrYXRlZ29yaWUnLFxuXHRcdFx0XHQndGVzdC5hdXRoZW50aWNhdGlvbi5sYWJlbCc6ICdUZXN0YXV0aGVudGlmaXppZXJ1bmcnLFxuXHRcdFx0XHQndGVzdC5jb25maWd1cmF0aW9uLnRpdGxlJzogJ1Rlc3Rrb25maWd1cmF0aW9uJyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQudGl0bGUnOiAnVGVzdCBDb21tYW5kJyxcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC5jYXRlZ29yeSc6ICdUZXN0IENhdGVnb3J5Jyxcblx0XHRcdFx0J3Rlc3QuYXV0aGVudGljYXRpb24ubGFiZWwnOiAnVGVzdCBBdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdCd0ZXN0LmNvbmZpZ3VyYXRpb24udGl0bGUnOiAnVGVzdCBDb25maWd1cmF0aW9uJyxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHM/LlswXS50aXRsZSBhcyBJTG9jYWxpemVkU3RyaW5nO1xuXHRcdGNvbnN0IGNhdGVnb3J5ID0gbG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzPy5bMF0uY2F0ZWdvcnkgYXMgSUxvY2FsaXplZFN0cmluZztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGl0bGUudmFsdWUsICdCZWZlaGwgdGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXRsZS5vcmlnaW5hbCwgJ1Rlc3QgQ29tbWFuZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXRlZ29yeS52YWx1ZSwgJ1Rlc3RrYXRlZ29yaWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2F0ZWdvcnkub3JpZ2luYWwsICdUZXN0IENhdGVnb3J5Jyk7XG5cblx0XHQvLyBFdmVyeXRoaW5nIGVsc2Ugc3RheXMgYXMgYSBzdHJpbmcuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5hdXRoZW50aWNhdGlvbj8uWzBdLmxhYmVsLCAnVGVzdGF1dGhlbnRpZml6aWVydW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbiBhcyBJQ29uZmlndXJhdGlvbk5vZGUpLnRpdGxlLCAnVGVzdGtvbmZpZ3VyYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgdGVtcGxhdGUgc3RyaW5ncyAtIGlzIGJlc3QgZWZmb3J0ICMxNjQ2MzAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWFuaWZlc3RXaXRoVHlwbzogSUV4dGVuc2lvbk1hbmlmZXN0ID0ge1xuXHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHVibGlzaGVyOiAndGVzdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0ZW5naW5lczoge1xuXHRcdFx0XHR2c2NvZGU6ICcqJ1xuXHRcdFx0fSxcblx0XHRcdGNvbnRyaWJ1dGVzOiB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6ICd0ZXN0LmF1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0XHRcdC8vIFRoaXMgbm90IGV4aXN0aW5nIGluIHRoZSBidW5kbGUgc2hvdWxkbid0IGNhdXNlIGFuIGVycm9yLlxuXHRcdFx0XHRcdFx0bGFiZWw6ICclZG9lc25vdGV4aXN0JScsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRjb21tYW5kczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0LmNvbW1hbmQnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICcldGVzdC5jb21tYW5kLnRpdGxlJScsXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogJyV0ZXN0LmNvbW1hbmQuY2F0ZWdvcnklJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxvY2FsaXplZE1hbmlmZXN0ID0gbG9jYWxpemVNYW5pZmVzdChcblx0XHRcdHN0b3JlLmFkZChuZXcgTnVsbExvZ2dlcigpKSxcblx0XHRcdGRlZXBDbG9uZShtYW5pZmVzdFdpdGhUeXBvKSxcblx0XHRcdHtcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC50aXRsZSc6ICdUZXN0IENvbW1hbmQnLFxuXHRcdFx0XHQndGVzdC5jb21tYW5kLmNhdGVnb3J5JzogJ1Rlc3QgQ2F0ZWdvcnknXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHM/LlswXS50aXRsZSwgJ1Rlc3QgQ29tbWFuZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHM/LlswXS5jYXRlZ29yeSwgJ1Rlc3QgQ2F0ZWdvcnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmF1dGhlbnRpY2F0aW9uPy5bMF0ubGFiZWwsICclZG9lc25vdGV4aXN0JScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1h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
