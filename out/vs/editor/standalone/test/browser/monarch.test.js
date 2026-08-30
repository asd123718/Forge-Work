import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Token, TokenizationRegistry } from "../../../common/languages.js";
import { LanguageService } from "../../../common/services/languageService.js";
import { StandaloneConfigurationService } from "../../browser/standaloneServices.js";
import { compile } from "../../common/monarch/monarchCompile.js";
import { MonarchTokenizer } from "../../common/monarch/monarchLexer.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
suite("Monarch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMonarchTokenizer(languageService, languageId, language, configurationService) {
    return new MonarchTokenizer(languageService, null, languageId, compile(languageId, language), configurationService);
  }
  function getTokens(tokenizer, lines) {
    const actualTokens = [];
    let state = tokenizer.getInitialState();
    for (const line of lines) {
      const result = tokenizer.tokenize(line, true, state);
      actualTokens.push(result.tokens);
      state = result.endState;
    }
    return actualTokens;
  }
  test("Ensure @rematch and nextEmbedded can be used together in Monarch grammar", () => {
    const disposables = new DisposableStore();
    const languageService = disposables.add(new LanguageService());
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    disposables.add(languageService.registerLanguage({ id: "sql" }));
    disposables.add(TokenizationRegistry.register("sql", disposables.add(createMonarchTokenizer(languageService, "sql", {
      tokenizer: {
        root: [
          [/./, "token"]
        ]
      }
    }, configurationService))));
    const SQL_QUERY_START = "(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|ALTER|WITH)";
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test1", {
      tokenizer: {
        root: [
          [`(""")${SQL_QUERY_START}`, [{ "token": "string.quote" }, { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" }]],
          [/(""")$/, [{ token: "string.quote", next: "@maybeStringIsSQL" }]]
        ],
        maybeStringIsSQL: [
          [/(.*)/, {
            cases: {
              [`${SQL_QUERY_START}\\b.*`]: { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" },
              "@default": { token: "@rematch", switchTo: "@endDblDocString" }
            }
          }]
        ],
        endDblDocString: [
          ["[^']+", "string"],
          ["\\\\'", "string"],
          ["'''", "string", "@popall"],
          ["'", "string"]
        ],
        endStringWithSQL: [[/"""/, { token: "string.quote", next: "@popall", nextEmbedded: "@pop" }]]
      }
    }, configurationService));
    const lines = [
      `mysql_query("""SELECT * FROM table_name WHERE ds = '<DATEID>'""")`,
      `mysql_query("""`,
      `SELECT *`,
      `FROM table_name`,
      `WHERE ds = '<DATEID>'`,
      `""")`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1"),
        new Token(15, "token.sql", "sql"),
        new Token(61, "string.quote.test1", "test1"),
        new Token(64, "source.test1", "test1")
      ],
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "string.quote.test1", "test1"),
        new Token(3, "source.test1", "test1")
      ]
    ]);
    disposables.dispose();
  });
  test('Test nextEmbedded: "@pop" in cases statement', () => {
    const disposables = new DisposableStore();
    const languageService = disposables.add(new LanguageService());
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    disposables.add(languageService.registerLanguage({ id: "sql" }));
    disposables.add(TokenizationRegistry.register("sql", disposables.add(createMonarchTokenizer(languageService, "sql", {
      tokenizer: {
        root: [
          [/./, "token"]
        ]
      }
    }, configurationService))));
    const SQL_QUERY_START = "(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|ALTER|WITH)";
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test1", {
      tokenizer: {
        root: [
          [`(""")${SQL_QUERY_START}`, [{ "token": "string.quote" }, { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" }]],
          [/(""")$/, [{ token: "string.quote", next: "@maybeStringIsSQL" }]]
        ],
        maybeStringIsSQL: [
          [/(.*)/, {
            cases: {
              [`${SQL_QUERY_START}\\b.*`]: { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" },
              "@default": { token: "@rematch", switchTo: "@endDblDocString" }
            }
          }]
        ],
        endDblDocString: [
          ["[^']+", "string"],
          ["\\\\'", "string"],
          ["'''", "string", "@popall"],
          ["'", "string"]
        ],
        endStringWithSQL: [[/"""/, {
          cases: {
            '"""': {
              cases: {
                "": { token: "string.quote", next: "@popall", nextEmbedded: "@pop" }
              }
            },
            "@default": ""
          }
        }]]
      }
    }, configurationService));
    const lines = [
      `mysql_query("""SELECT * FROM table_name WHERE ds = '<DATEID>'""")`,
      `mysql_query("""`,
      `SELECT *`,
      `FROM table_name`,
      `WHERE ds = '<DATEID>'`,
      `""")`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1"),
        new Token(15, "token.sql", "sql"),
        new Token(61, "string.quote.test1", "test1"),
        new Token(64, "source.test1", "test1")
      ],
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "string.quote.test1", "test1"),
        new Token(3, "source.test1", "test1")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#1235: Empty Line Handling", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      tokenizer: {
        root: [
          { include: "@comments" }
        ],
        comments: [
          [/\/\/$/, "comment"],
          // empty single-line comment
          [/\/\//, "comment", "@comment_cpp"]
        ],
        comment_cpp: [
          [/(?:[^\\]|(?:\\.))+$/, "comment", "@pop"],
          [/.+$/, "comment"],
          [/$/, "comment", "@pop"]
          // No possible rule to detect an empty line and @pop?
        ]
      }
    }, configurationService));
    const lines = [
      `// This comment \\`,
      `   continues on the following line`,
      ``,
      `// This comment does NOT continue \\\\`,
      `   because the escape char was itself escaped`,
      ``,
      `// This comment DOES continue because \\\\\\`,
      `   the 1st '\\' escapes the 2nd; the 3rd escapes EOL`,
      ``,
      `// This comment continues to the following line \\`,
      ``,
      `But the line was empty. This line should not be commented.`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [new Token(0, "comment.test", "test")],
      [new Token(0, "comment.test", "test")],
      [],
      [new Token(0, "comment.test", "test")],
      [new Token(0, "source.test", "test")],
      [],
      [new Token(0, "comment.test", "test")],
      [new Token(0, "comment.test", "test")],
      [],
      [new Token(0, "comment.test", "test")],
      [],
      [new Token(0, "source.test", "test")]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#2265: Exit a state at end of line", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      includeLF: true,
      tokenizer: {
        root: [
          [/^\*/, "", "@inner"],
          [/\:\*/, "", "@inner"],
          [/[^*:]+/, "string"],
          [/[*:]/, "string"]
        ],
        inner: [
          [/\n/, "", "@pop"],
          [/\d+/, "number"],
          [/[^\d]+/, ""]
        ]
      }
    }, configurationService));
    const lines = [
      `PRINT 10 * 20`,
      `*FX200, 3`,
      `PRINT 2*3:*FX200, 3`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "string.test", "test")
      ],
      [
        new Token(0, "", "test"),
        new Token(3, "number.test", "test"),
        new Token(6, "", "test"),
        new Token(8, "number.test", "test")
      ],
      [
        new Token(0, "string.test", "test"),
        new Token(9, "", "test"),
        new Token(13, "number.test", "test"),
        new Token(16, "", "test"),
        new Token(18, "number.test", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("issue #115662: monarchCompile function need an extra option which can control replacement", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer1 = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      uselessReplaceKey1: "@uselessReplaceKey2",
      uselessReplaceKey2: "@uselessReplaceKey3",
      uselessReplaceKey3: "@uselessReplaceKey4",
      uselessReplaceKey4: "@uselessReplaceKey5",
      uselessReplaceKey5: "@ham",
      tokenizer: {
        root: [
          {
            regex: /@\w+/.test("@ham") ? new RegExp(`^${"@uselessReplaceKey1"}$`) : new RegExp(`^${"@ham"}$`),
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const tokenizer2 = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      tokenizer: {
        root: [
          {
            regex: /@@ham/,
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const lines = [
      `@ham`
    ];
    const actualTokens1 = getTokens(tokenizer1, lines);
    assert.deepStrictEqual(actualTokens1, [
      [
        new Token(0, "ham.test", "test")
      ]
    ]);
    const actualTokens2 = getTokens(tokenizer2, lines);
    assert.deepStrictEqual(actualTokens2, [
      [
        new Token(0, "ham.test", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#2424: Allow to target @@", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      tokenizer: {
        root: [
          {
            regex: /@@@@/,
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const lines = [
      `@@`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "ham.test", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#3025: Check maxTokenizationLineLength before tokenizing", async () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    await configurationService.updateValue("editor.maxTokenizationLineLength", 4);
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      tokenizer: {
        root: [
          {
            regex: /ham/,
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const lines = [
      "ham",
      // length 3, should be tokenized
      "hamham"
      // length 6, should NOT be tokenized
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "ham.test", "test")
      ],
      [
        new Token(0, "", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#3128: allow state access within rules", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      encoding: /u|u8|U|L/,
      tokenizer: {
        root: [
          // C++ 11 Raw String
          [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: "string.raw.begin", next: "@raw.$1" }]
        ],
        raw: [
          [/.*\)$S2\"/, "string.raw", "@pop"],
          [/.*/, "string.raw"]
        ]
      }
    }, configurationService));
    const lines = [
      `int main(){`,
      ``,
      `	auto s = R""""(`,
      `	Hello World`,
      `	)"""";`,
      ``,
      `	std::cout << "hello";`,
      ``,
      `}`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [new Token(0, "source.test", "test")],
      [],
      [new Token(0, "source.test", "test"), new Token(10, "string.raw.begin.test", "test")],
      [new Token(0, "string.raw.test", "test")],
      [new Token(0, "string.raw.test", "test"), new Token(6, "source.test", "test")],
      [],
      [new Token(0, "source.test", "test")],
      [],
      [new Token(0, "source.test", "test")]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#4775: Raw-strings in c++ can break monarch", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      encoding: /u|u8|U|L/,
      tokenizer: {
        root: [
          // C++ 11 Raw String
          [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: "string.raw.begin", next: "@raw.$1" }]
        ],
        raw: [
          [/.*\)$S2\"/, "string.raw", "@pop"],
          [/.*/, "string.raw"]
        ]
      }
    }, configurationService));
    const lines = [
      `R"[())"`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [new Token(0, "string.raw.begin.test", "test"), new Token(4, "string.raw.test", "test")]
    ]);
    disposables.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXHRlc3RcXGJyb3dzZXJcXG1vbmFyY2gudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRva2VuLCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3N0YW5kYWxvbmVTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBjb21waWxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vbmFyY2gvbW9uYXJjaENvbXBpbGUuanMnO1xuaW1wb3J0IHsgTW9uYXJjaFRva2VuaXplciB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb25hcmNoL21vbmFyY2hMZXhlci5qcyc7XG5pbXBvcnQgeyBJTW9uYXJjaExhbmd1YWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vbmFyY2gvbW9uYXJjaFR5cGVzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbnN1aXRlKCdNb25hcmNoJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUlkOiBzdHJpbmcsIGxhbmd1YWdlOiBJTW9uYXJjaExhbmd1YWdlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogTW9uYXJjaFRva2VuaXplciB7XG5cdFx0cmV0dXJuIG5ldyBNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZSwgbnVsbCEsIGxhbmd1YWdlSWQsIGNvbXBpbGUobGFuZ3VhZ2VJZCwgbGFuZ3VhZ2UpLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRUb2tlbnModG9rZW5pemVyOiBNb25hcmNoVG9rZW5pemVyLCBsaW5lczogc3RyaW5nW10pOiBUb2tlbltdW10ge1xuXHRcdGNvbnN0IGFjdHVhbFRva2VuczogVG9rZW5bXVtdID0gW107XG5cdFx0bGV0IHN0YXRlID0gdG9rZW5pemVyLmdldEluaXRpYWxTdGF0ZSgpO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9rZW5pemVyLnRva2VuaXplKGxpbmUsIHRydWUsIHN0YXRlKTtcblx0XHRcdGFjdHVhbFRva2Vucy5wdXNoKHJlc3VsdC50b2tlbnMpO1xuXHRcdFx0c3RhdGUgPSByZXN1bHQuZW5kU3RhdGU7XG5cdFx0fVxuXHRcdHJldHVybiBhY3R1YWxUb2tlbnM7XG5cdH1cblxuXHR0ZXN0KCdFbnN1cmUgQHJlbWF0Y2ggYW5kIG5leHRFbWJlZGRlZCBjYW4gYmUgdXNlZCB0b2dldGhlciBpbiBNb25hcmNoIGdyYW1tYXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogJ3NxbCcgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcignc3FsJywgZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAnc3FsJywge1xuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHRbLy4vLCAndG9rZW4nXVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKSkpO1xuXHRcdGNvbnN0IFNRTF9RVUVSWV9TVEFSVCA9ICcoU0VMRUNUfElOU0VSVHxVUERBVEV8REVMRVRFfENSRUFURXxSRVBMQUNFfEFMVEVSfFdJVEgpJztcblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0MScsIHtcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0W2AoXFxcIlxcXCJcXFwiKSR7U1FMX1FVRVJZX1NUQVJUfWAsIFt7ICd0b2tlbic6ICdzdHJpbmcucXVvdGUnLCB9LCB7IHRva2VuOiAnQHJlbWF0Y2gnLCBuZXh0OiAnQGVuZFN0cmluZ1dpdGhTUUwnLCBuZXh0RW1iZWRkZWQ6ICdzcWwnLCB9LF1dLFxuXHRcdFx0XHRcdFsvKFwiXCJcIikkLywgW3sgdG9rZW46ICdzdHJpbmcucXVvdGUnLCBuZXh0OiAnQG1heWJlU3RyaW5nSXNTUUwnLCB9LF1dLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRtYXliZVN0cmluZ0lzU1FMOiBbXG5cdFx0XHRcdFx0Wy8oLiopLywge1xuXHRcdFx0XHRcdFx0Y2FzZXM6IHtcblx0XHRcdFx0XHRcdFx0W2Ake1NRTF9RVUVSWV9TVEFSVH1cXFxcYi4qYF06IHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdAZW5kU3RyaW5nV2l0aFNRTCcsIG5leHRFbWJlZGRlZDogJ3NxbCcsIH0sXG5cdFx0XHRcdFx0XHRcdCdAZGVmYXVsdCc6IHsgdG9rZW46ICdAcmVtYXRjaCcsIHN3aXRjaFRvOiAnQGVuZERibERvY1N0cmluZycsIH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGVuZERibERvY1N0cmluZzogW1xuXHRcdFx0XHRcdFsnW15cXCddKycsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRbJ1xcXFxcXFxcXFwnJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdFsnXFwnXFwnXFwnJywgJ3N0cmluZycsICdAcG9wYWxsJ10sXG5cdFx0XHRcdFx0WydcXCcnLCAnc3RyaW5nJ11cblx0XHRcdFx0XSxcblx0XHRcdFx0ZW5kU3RyaW5nV2l0aFNRTDogW1svXCJcIlwiLywgeyB0b2tlbjogJ3N0cmluZy5xdW90ZScsIG5leHQ6ICdAcG9wYWxsJywgbmV4dEVtYmVkZGVkOiAnQHBvcCcsIH0sXV0sXG5cdFx0XHR9XG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YG15c3FsX3F1ZXJ5KFwiXCJcIlNFTEVDVCAqIEZST00gdGFibGVfbmFtZSBXSEVSRSBkcyA9ICc8REFURUlEPidcIlwiXCIpYCxcblx0XHRcdGBteXNxbF9xdWVyeShcIlwiXCJgLFxuXHRcdFx0YFNFTEVDVCAqYCxcblx0XHRcdGBGUk9NIHRhYmxlX25hbWVgLFxuXHRcdFx0YFdIRVJFIGRzID0gJzxEQVRFSUQ+J2AsXG5cdFx0XHRgXCJcIlwiKWAsXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IGdldFRva2Vucyh0b2tlbml6ZXIsIGxpbmVzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zLCBbXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc291cmNlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbigxMiwgJ3N0cmluZy5xdW90ZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMTUsICd0b2tlbi5zcWwnLCAnc3FsJyksXG5cdFx0XHRcdG5ldyBUb2tlbig2MSwgJ3N0cmluZy5xdW90ZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oNjQsICdzb3VyY2UudGVzdDEnLCAndGVzdDEnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdzb3VyY2UudGVzdDEnLCAndGVzdDEnKSxcblx0XHRcdFx0bmV3IFRva2VuKDEyLCAnc3RyaW5nLnF1b3RlLnRlc3QxJywgJ3Rlc3QxJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAndG9rZW4uc3FsJywgJ3NxbCcpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3Rva2VuLnNxbCcsICdzcWwnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICd0b2tlbi5zcWwnLCAnc3FsJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc3RyaW5nLnF1b3RlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbigzLCAnc291cmNlLnRlc3QxJywgJ3Rlc3QxJylcblx0XHRcdF1cblx0XHRdKTtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgbmV4dEVtYmVkZGVkOiBcIkBwb3BcIiBpbiBjYXNlcyBzdGF0ZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogJ3NxbCcgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcignc3FsJywgZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAnc3FsJywge1xuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHRbLy4vLCAndG9rZW4nXVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKSkpO1xuXHRcdGNvbnN0IFNRTF9RVUVSWV9TVEFSVCA9ICcoU0VMRUNUfElOU0VSVHxVUERBVEV8REVMRVRFfENSRUFURXxSRVBMQUNFfEFMVEVSfFdJVEgpJztcblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0MScsIHtcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0W2AoXFxcIlxcXCJcXFwiKSR7U1FMX1FVRVJZX1NUQVJUfWAsIFt7ICd0b2tlbic6ICdzdHJpbmcucXVvdGUnLCB9LCB7IHRva2VuOiAnQHJlbWF0Y2gnLCBuZXh0OiAnQGVuZFN0cmluZ1dpdGhTUUwnLCBuZXh0RW1iZWRkZWQ6ICdzcWwnLCB9LF1dLFxuXHRcdFx0XHRcdFsvKFwiXCJcIikkLywgW3sgdG9rZW46ICdzdHJpbmcucXVvdGUnLCBuZXh0OiAnQG1heWJlU3RyaW5nSXNTUUwnLCB9LF1dLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRtYXliZVN0cmluZ0lzU1FMOiBbXG5cdFx0XHRcdFx0Wy8oLiopLywge1xuXHRcdFx0XHRcdFx0Y2FzZXM6IHtcblx0XHRcdFx0XHRcdFx0W2Ake1NRTF9RVUVSWV9TVEFSVH1cXFxcYi4qYF06IHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdAZW5kU3RyaW5nV2l0aFNRTCcsIG5leHRFbWJlZGRlZDogJ3NxbCcsIH0sXG5cdFx0XHRcdFx0XHRcdCdAZGVmYXVsdCc6IHsgdG9rZW46ICdAcmVtYXRjaCcsIHN3aXRjaFRvOiAnQGVuZERibERvY1N0cmluZycsIH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGVuZERibERvY1N0cmluZzogW1xuXHRcdFx0XHRcdFsnW15cXCddKycsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRbJ1xcXFxcXFxcXFwnJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdFsnXFwnXFwnXFwnJywgJ3N0cmluZycsICdAcG9wYWxsJ10sXG5cdFx0XHRcdFx0WydcXCcnLCAnc3RyaW5nJ11cblx0XHRcdFx0XSxcblx0XHRcdFx0ZW5kU3RyaW5nV2l0aFNRTDogW1svXCJcIlwiLywge1xuXHRcdFx0XHRcdGNhc2VzOiB7XG5cdFx0XHRcdFx0XHQnXCJcIlwiJzoge1xuXHRcdFx0XHRcdFx0XHRjYXNlczoge1xuXHRcdFx0XHRcdFx0XHRcdCcnOiB7IHRva2VuOiAnc3RyaW5nLnF1b3RlJywgbmV4dDogJ0Bwb3BhbGwnLCBuZXh0RW1iZWRkZWQ6ICdAcG9wJywgfVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J0BkZWZhdWx0JzogJydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXSxcblx0XHRcdH1cblx0XHR9LCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRgbXlzcWxfcXVlcnkoXCJcIlwiU0VMRUNUICogRlJPTSB0YWJsZV9uYW1lIFdIRVJFIGRzID0gJzxEQVRFSUQ+J1wiXCJcIilgLFxuXHRcdFx0YG15c3FsX3F1ZXJ5KFwiXCJcImAsXG5cdFx0XHRgU0VMRUNUICpgLFxuXHRcdFx0YEZST00gdGFibGVfbmFtZWAsXG5cdFx0XHRgV0hFUkUgZHMgPSAnPERBVEVJRD4nYCxcblx0XHRcdGBcIlwiXCIpYCxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsVG9rZW5zID0gZ2V0VG9rZW5zKHRva2VuaXplciwgbGluZXMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxUb2tlbnMsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdzb3VyY2UudGVzdDEnLCAndGVzdDEnKSxcblx0XHRcdFx0bmV3IFRva2VuKDEyLCAnc3RyaW5nLnF1b3RlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbigxNSwgJ3Rva2VuLnNxbCcsICdzcWwnKSxcblx0XHRcdFx0bmV3IFRva2VuKDYxLCAnc3RyaW5nLnF1b3RlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbig2NCwgJ3NvdXJjZS50ZXN0MScsICd0ZXN0MScpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3NvdXJjZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMTIsICdzdHJpbmcucXVvdGUudGVzdDEnLCAndGVzdDEnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICd0b2tlbi5zcWwnLCAnc3FsJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAndG9rZW4uc3FsJywgJ3NxbCcpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3Rva2VuLnNxbCcsICdzcWwnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdzdHJpbmcucXVvdGUudGVzdDEnLCAndGVzdDEnKSxcblx0XHRcdFx0bmV3IFRva2VuKDMsICdzb3VyY2UudGVzdDEnLCAndGVzdDEnKVxuXHRcdFx0XVxuXHRcdF0pO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciMxMjM1OiBFbXB0eSBMaW5lIEhhbmRsaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdCcsIHtcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0eyBpbmNsdWRlOiAnQGNvbW1lbnRzJyB9LFxuXHRcdFx0XHRdLFxuXG5cdFx0XHRcdGNvbW1lbnRzOiBbXG5cdFx0XHRcdFx0Wy9cXC9cXC8kLywgJ2NvbW1lbnQnXSwgLy8gZW1wdHkgc2luZ2xlLWxpbmUgY29tbWVudFxuXHRcdFx0XHRcdFsvXFwvXFwvLywgJ2NvbW1lbnQnLCAnQGNvbW1lbnRfY3BwJ10sXG5cdFx0XHRcdF0sXG5cblx0XHRcdFx0Y29tbWVudF9jcHA6IFtcblx0XHRcdFx0XHRbLyg/OlteXFxcXF18KD86XFxcXC4pKSskLywgJ2NvbW1lbnQnLCAnQHBvcCddLFxuXHRcdFx0XHRcdFsvLiskLywgJ2NvbW1lbnQnXSxcblx0XHRcdFx0XHRbLyQvLCAnY29tbWVudCcsICdAcG9wJ11cblx0XHRcdFx0XHQvLyBObyBwb3NzaWJsZSBydWxlIHRvIGRldGVjdCBhbiBlbXB0eSBsaW5lIGFuZCBAcG9wP1xuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9LCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRgLy8gVGhpcyBjb21tZW50IFxcXFxgLFxuXHRcdFx0YCAgIGNvbnRpbnVlcyBvbiB0aGUgZm9sbG93aW5nIGxpbmVgLFxuXHRcdFx0YGAsXG5cdFx0XHRgLy8gVGhpcyBjb21tZW50IGRvZXMgTk9UIGNvbnRpbnVlIFxcXFxcXFxcYCxcblx0XHRcdGAgICBiZWNhdXNlIHRoZSBlc2NhcGUgY2hhciB3YXMgaXRzZWxmIGVzY2FwZWRgLFxuXHRcdFx0YGAsXG5cdFx0XHRgLy8gVGhpcyBjb21tZW50IERPRVMgY29udGludWUgYmVjYXVzZSBcXFxcXFxcXFxcXFxgLFxuXHRcdFx0YCAgIHRoZSAxc3QgJ1xcXFwnIGVzY2FwZXMgdGhlIDJuZDsgdGhlIDNyZCBlc2NhcGVzIEVPTGAsXG5cdFx0XHRgYCxcblx0XHRcdGAvLyBUaGlzIGNvbW1lbnQgY29udGludWVzIHRvIHRoZSBmb2xsb3dpbmcgbGluZSBcXFxcYCxcblx0XHRcdGBgLFxuXHRcdFx0YEJ1dCB0aGUgbGluZSB3YXMgZW1wdHkuIFRoaXMgbGluZSBzaG91bGQgbm90IGJlIGNvbW1lbnRlZC5gLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBnZXRUb2tlbnModG9rZW5pemVyLCBsaW5lcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VucywgW1xuXHRcdFx0W25ldyBUb2tlbigwLCAnY29tbWVudC50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdjb21tZW50LnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnY29tbWVudC50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdzb3VyY2UudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W10sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdjb21tZW50LnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ2NvbW1lbnQudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W10sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdjb21tZW50LnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnc291cmNlLnRlc3QnLCAndGVzdCcpXVxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciMyMjY1OiBFeGl0IGEgc3RhdGUgYXQgZW5kIG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IExhbmd1YWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0aW5jbHVkZUxGOiB0cnVlLFxuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHRbL15cXCovLCAnJywgJ0Bpbm5lciddLFxuXHRcdFx0XHRcdFsvXFw6XFwqLywgJycsICdAaW5uZXInXSxcblx0XHRcdFx0XHRbL1teKjpdKy8sICdzdHJpbmcnXSxcblx0XHRcdFx0XHRbL1sqOl0vLCAnc3RyaW5nJ11cblx0XHRcdFx0XSxcblx0XHRcdFx0aW5uZXI6IFtcblx0XHRcdFx0XHRbL1xcbi8sICcnLCAnQHBvcCddLFxuXHRcdFx0XHRcdFsvXFxkKy8sICdudW1iZXInXSxcblx0XHRcdFx0XHRbL1teXFxkXSsvLCAnJ11cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdGBQUklOVCAxMCAqIDIwYCxcblx0XHRcdGAqRlgyMDAsIDNgLFxuXHRcdFx0YFBSSU5UIDIqMzoqRlgyMDAsIDNgXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IGdldFRva2Vucyh0b2tlbml6ZXIsIGxpbmVzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zLCBbXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc3RyaW5nLnRlc3QnLCAndGVzdCcpLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICcnLCAndGVzdCcpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMywgJ251bWJlci50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdFx0bmV3IFRva2VuKDYsICcnLCAndGVzdCcpLFxuXHRcdFx0XHRuZXcgVG9rZW4oOCwgJ251bWJlci50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc3RyaW5nLnRlc3QnLCAndGVzdCcpLFxuXHRcdFx0XHRuZXcgVG9rZW4oOSwgJycsICd0ZXN0JyksXG5cdFx0XHRcdG5ldyBUb2tlbigxMywgJ251bWJlci50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdFx0bmV3IFRva2VuKDE2LCAnJywgJ3Rlc3QnKSxcblx0XHRcdFx0bmV3IFRva2VuKDE4LCAnbnVtYmVyLnRlc3QnLCAndGVzdCcpLFxuXHRcdFx0XVxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE1NjYyOiBtb25hcmNoQ29tcGlsZSBmdW5jdGlvbiBuZWVkIGFuIGV4dHJhIG9wdGlvbiB3aGljaCBjYW4gY29udHJvbCByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgdG9rZW5pemVyMSA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZSwgJ3Rlc3QnLCB7XG5cdFx0XHRpZ25vcmVDYXNlOiBmYWxzZSxcblx0XHRcdHVzZWxlc3NSZXBsYWNlS2V5MTogJ0B1c2VsZXNzUmVwbGFjZUtleTInLFxuXHRcdFx0dXNlbGVzc1JlcGxhY2VLZXkyOiAnQHVzZWxlc3NSZXBsYWNlS2V5MycsXG5cdFx0XHR1c2VsZXNzUmVwbGFjZUtleTM6ICdAdXNlbGVzc1JlcGxhY2VLZXk0Jyxcblx0XHRcdHVzZWxlc3NSZXBsYWNlS2V5NDogJ0B1c2VsZXNzUmVwbGFjZUtleTUnLFxuXHRcdFx0dXNlbGVzc1JlcGxhY2VLZXk1OiAnQGhhbScsXG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlZ2V4OiAvQFxcdysvLnRlc3QoJ0BoYW0nKVxuXHRcdFx0XHRcdFx0XHQ/IG5ldyBSZWdFeHAoYF4keydAdXNlbGVzc1JlcGxhY2VLZXkxJ30kYClcblx0XHRcdFx0XHRcdFx0OiBuZXcgUmVnRXhwKGBeJHsnQGhhbSd9JGApLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7IHRva2VuOiAnaGFtJyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRva2VuaXplcjIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0aWdub3JlQ2FzZTogZmFsc2UsXG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlZ2V4OiAvQEBoYW0vLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7IHRva2VuOiAnaGFtJyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YEBoYW1gXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VuczEgPSBnZXRUb2tlbnModG9rZW5pemVyMSwgbGluZXMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zMSwgW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ2hhbS50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdF1cblx0XHRdKTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VuczIgPSBnZXRUb2tlbnModG9rZW5pemVyMiwgbGluZXMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zMiwgW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ2hhbS50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdF1cblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMjQyNDogQWxsb3cgdG8gdGFyZ2V0IEBAJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0aWdub3JlQ2FzZTogZmFsc2UsXG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlZ2V4OiAvQEBAQC8sXG5cdFx0XHRcdFx0XHRhY3Rpb246IHsgdG9rZW46ICdoYW0nIH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9LCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRgQEBgXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IGdldFRva2Vucyh0b2tlbml6ZXIsIGxpbmVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VucywgW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ2hhbS50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdF1cblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMzAyNTogQ2hlY2sgbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCBiZWZvcmUgdG9rZW5pemluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cblx0XHQvLyBTZXQgbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCB0byA0IHNvIHRoYXQgXCJoYW1cIiB3b3JrcyBidXQgXCJoYW1oYW1cIiB3b3VsZCBmYWlsXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2VkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJywgNCk7XG5cblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZWdleDogL2hhbS8sXG5cdFx0XHRcdFx0XHRhY3Rpb246IHsgdG9rZW46ICdoYW0nIH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9LCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHQnaGFtJywgLy8gbGVuZ3RoIDMsIHNob3VsZCBiZSB0b2tlbml6ZWRcblx0XHRcdCdoYW1oYW0nIC8vIGxlbmd0aCA2LCBzaG91bGQgTk9UIGJlIHRva2VuaXplZFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBnZXRUb2tlbnModG9rZW5pemVyLCBsaW5lcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxUb2tlbnMsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdoYW0udGVzdCcsICd0ZXN0JyksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnJywgJ3Rlc3QnKVxuXHRcdFx0XVxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciMzMTI4OiBhbGxvdyBzdGF0ZSBhY2Nlc3Mgd2l0aGluIHJ1bGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0aWdub3JlQ2FzZTogZmFsc2UsXG5cdFx0XHRlbmNvZGluZzogL3V8dTh8VXxMLyxcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0Ly8gQysrIDExIFJhdyBTdHJpbmdcblx0XHRcdFx0XHRbL0BlbmNvZGluZz9SXFxcIig/OihbXiAoKVxcXFxcXHRdKikpXFwoLywgeyB0b2tlbjogJ3N0cmluZy5yYXcuYmVnaW4nLCBuZXh0OiAnQHJhdy4kMScgfV0sXG5cdFx0XHRcdF0sXG5cblx0XHRcdFx0cmF3OiBbXG5cdFx0XHRcdFx0Wy8uKlxcKSRTMlxcXCIvLCAnc3RyaW5nLnJhdycsICdAcG9wJ10sXG5cdFx0XHRcdFx0Wy8uKi8sICdzdHJpbmcucmF3J11cblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YGludCBtYWluKCl7YCxcblx0XHRcdGBgLFxuXHRcdFx0YFx0YXV0byBzID0gUlwiXCJcIlwiKGAsXG5cdFx0XHRgXHRIZWxsbyBXb3JsZGAsXG5cdFx0XHRgXHQpXCJcIlwiXCI7YCxcblx0XHRcdGBgLFxuXHRcdFx0YFx0c3RkOjpjb3V0IDw8IFwiaGVsbG9cIjtgLFxuXHRcdFx0YGAsXG5cdFx0XHRgfWAsXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IGdldFRva2Vucyh0b2tlbml6ZXIsIGxpbmVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VucywgW1xuXHRcdFx0W25ldyBUb2tlbigwLCAnc291cmNlLnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnc291cmNlLnRlc3QnLCAndGVzdCcpLCBuZXcgVG9rZW4oMTAsICdzdHJpbmcucmF3LmJlZ2luLnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ3N0cmluZy5yYXcudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnc3RyaW5nLnJhdy50ZXN0JywgJ3Rlc3QnKSwgbmV3IFRva2VuKDYsICdzb3VyY2UudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W10sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdzb3VyY2UudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W10sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdzb3VyY2UudGVzdCcsICd0ZXN0JyldLFxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciM0Nzc1OiBSYXctc3RyaW5ncyBpbiBjKysgY2FuIGJyZWFrIG1vbmFyY2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IExhbmd1YWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHRva2VuaXplciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZSwgJ3Rlc3QnLCB7XG5cdFx0XHRpZ25vcmVDYXNlOiBmYWxzZSxcblx0XHRcdGVuY29kaW5nOiAvdXx1OHxVfEwvLFxuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHQvLyBDKysgMTEgUmF3IFN0cmluZ1xuXHRcdFx0XHRcdFsvQGVuY29kaW5nP1JcXFwiKD86KFteICgpXFxcXFxcdF0qKSlcXCgvLCB7IHRva2VuOiAnc3RyaW5nLnJhdy5iZWdpbicsIG5leHQ6ICdAcmF3LiQxJyB9XSxcblx0XHRcdFx0XSxcblxuXHRcdFx0XHRyYXc6IFtcblx0XHRcdFx0XHRbLy4qXFwpJFMyXFxcIi8sICdzdHJpbmcucmF3JywgJ0Bwb3AnXSxcblx0XHRcdFx0XHRbLy4qLywgJ3N0cmluZy5yYXcnXVxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9LCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRgUlwiWygpKVwiYCxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsVG9rZW5zID0gZ2V0VG9rZW5zKHRva2VuaXplciwgbGluZXMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zLCBbXG5cdFx0XHRbbmV3IFRva2VuKDAsICdzdHJpbmcucmF3LmJlZ2luLnRlc3QnLCAndGVzdCcpLCBuZXcgVG9rZW4oNCwgJ3N0cmluZy5yYXcudGVzdCcsICd0ZXN0JyldLFxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxPQUFPLDRCQUE0QjtBQUU1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFHakMsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxXQUFXLE1BQU07QUFFdEIsMENBQXdDO0FBRXhDLFdBQVMsdUJBQXVCLGlCQUFtQyxZQUFvQixVQUE0QixzQkFBK0Q7QUFDakwsV0FBTyxJQUFJLGlCQUFpQixpQkFBaUIsTUFBTyxZQUFZLFFB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
