import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { InlineDecoration, InlineDecorationType, InlineModelDecorationsComputer, InjectedTextInlineDecorationsComputer } from "../../../common/viewModel/inlineDecorations.js";
import { createTextModel } from "../testTextModel.js";
import { IdentityCoordinatesConverter } from "../../../common/coordinatesConverter.js";
function createModelDecoration(id, range, options) {
  return {
    id,
    ownerId: 0,
    range,
    options
  };
}
suite("InlineModelDecorationsComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no decorations", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => []
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result, {
      decorations: [],
      inlineDecorations: [[]],
      hasVariableFonts: [false]
    });
    model.dispose();
  });
  test("inline class name decoration on a single line", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "test-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.strictEqual(result.decorations.length, 1);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 1, 1, 6), "test-class", InlineDecorationType.Regular)]
    ]);
    assert.deepStrictEqual(result.hasVariableFonts, [false]);
    model.dispose();
  });
  test("inlineClassName with affectsLetterSpacing", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "test-class",
          inlineClassNameAffectsLetterSpacing: true
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 1, 1, 6), "test-class", InlineDecorationType.RegularAffectingLetterSpacing)]
    ]);
    model.dispose();
  });
  test("beforeContentClassName decoration", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 3, 1, 8), {
          description: "test",
          beforeContentClassName: "before-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 3, 1, 3), "before-class", InlineDecorationType.Before)]
    ]);
    model.dispose();
  });
  test("afterContentClassName decoration", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 3, 1, 8), {
          description: "test",
          afterContentClassName: "after-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 8, 1, 8), "after-class", InlineDecorationType.After)]
    ]);
    model.dispose();
  });
  test("all decoration types combined", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 2, 1, 6), {
          description: "test",
          inlineClassName: "inline-class",
          beforeContentClassName: "before-class",
          afterContentClassName: "after-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [
        new InlineDecoration(new Range(1, 2, 1, 6), "inline-class", InlineDecorationType.Regular),
        new InlineDecoration(new Range(1, 2, 1, 2), "before-class", InlineDecorationType.Before),
        new InlineDecoration(new Range(1, 6, 1, 6), "after-class", InlineDecorationType.After)
      ]
    ]);
    model.dispose();
  });
  test("decoration spanning multiple lines", () => {
    const model = createTextModel("line one\nline two\nline three");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 3, 3, 5), {
          description: "test",
          inlineClassName: "multi-line"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 3, 11), false, false);
    const expectedInlineDecoration = new InlineDecoration(new Range(1, 3, 3, 5), "multi-line", InlineDecorationType.Regular);
    assert.deepStrictEqual(result.inlineDecorations, [
      [expectedInlineDecoration],
      [expectedInlineDecoration],
      [expectedInlineDecoration]
    ]);
    model.dispose();
  });
  test("decoration with affectsFont sets hasVariableFonts", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "font-class",
          affectsFont: true
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.hasVariableFonts, [true]);
    model.dispose();
  });
  test("multiple decorations on different lines", () => {
    const model = createTextModel("line one\nline two");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 5), {
          description: "test",
          inlineClassName: "class-a"
        }),
        createModelDecoration("dec2", new Range(2, 1, 2, 5), {
          description: "test",
          inlineClassName: "class-b"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 2, 9), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 1, 1, 5), "class-a", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(2, 1, 2, 5), "class-b", InlineDecorationType.Regular)]
    ]);
    model.dispose();
  });
  test("decoration cache is used for same decoration id", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const dec = createModelDecoration("dec1", new Range(1, 1, 1, 6), {
      description: "test",
      inlineClassName: "test-class"
    });
    const context = {
      getModelDecorations: () => [dec]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result1 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    const result2 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.strictEqual(result1.decorations[0], result2.decorations[0]);
    model.dispose();
  });
  test("reset clears decoration cache", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const dec = createModelDecoration("dec1", new Range(1, 1, 1, 6), {
      description: "test",
      inlineClassName: "test-class"
    });
    const context = {
      getModelDecorations: () => [dec]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result1 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    computer.reset();
    const result2 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.notStrictEqual(result1.decorations[0], result2.decorations[0]);
    model.dispose();
  });
  test("getInlineDecorations returns inline decorations for a model line", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "test-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 1, 1, 6), "test-class", InlineDecorationType.Regular)]
    ]);
    model.dispose();
  });
});
suite("InjectedTextInlineDecorationsComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no injections returns empty", () => {
    const context = {
      getInjectionOptions: () => null,
      getInjectionOffsets: () => null,
      getBreakOffsets: () => [10],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, []);
  });
  test("single injection with inlineClassName on a single output line", () => {
    const injectionOptions = [
      { content: "injected", inlineClassName: "injected-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [5],
      getBreakOffsets: () => [18],
      // 10 (original) + 8 (injected)
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 6, 1, 14), "injected-class", InlineDecorationType.Regular)]
    ]);
  });
  test("injection without inlineClassName produces no inline decorations", () => {
    const injectionOptions = [
      { content: "injected" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [5],
      getBreakOffsets: () => [18],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      []
      // empty - no inlineClassName
    ]);
  });
  test("injection with inlineClassNameAffectsLetterSpacing", () => {
    const injectionOptions = [
      { content: "abc", inlineClassName: "ls-class", inlineClassNameAffectsLetterSpacing: true }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [13],
      // 10 + 3
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 1, 1, 4), "ls-class", InlineDecorationType.RegularAffectingLetterSpacing)]
    ]);
  });
  test("multiple injections on a single output line", () => {
    const injectionOptions = [
      { content: "AA", inlineClassName: "class-a" },
      { content: "BBB", inlineClassName: "class-b" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [2, 5],
      getBreakOffsets: () => [15],
      // 10 + 2 + 3
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [
        new InlineDecoration(new Range(1, 3, 1, 5), "class-a", InlineDecorationType.Regular),
        new InlineDecoration(new Range(1, 8, 1, 11), "class-b", InlineDecorationType.Regular)
      ]
    ]);
  });
  test("injection spanning across wrapped lines", () => {
    const injectionOptions = [
      { content: "1234567890", inlineClassName: "injected" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [8],
      getBreakOffsets: () => [15, 30],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 5
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(5, 9, 5, 16), "injected", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(6, 1, 6, 4), "injected", InlineDecorationType.Regular)]
    ]);
  });
  test("injection with wrappedTextIndentLength on wrapped lines", () => {
    const injectionOptions = [
      { content: "12345678901234567890", inlineClassName: "injected" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [15, 30],
      getWrappedTextIndentLength: () => 4,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 1, 1, 16), "injected", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(2, 5, 2, 10), "injected", InlineDecorationType.Regular)]
    ]);
  });
  test("injection starting in later wrapped line", () => {
    const injectionOptions = [
      { content: "ab", inlineClassName: "late-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [20],
      getBreakOffsets: () => [15, 32],
      // 30 + 2
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [],
      [new InlineDecoration(new Range(2, 6, 2, 8), "late-class", InlineDecorationType.Regular)]
    ]);
  });
  test("base view line number offsets correctly", () => {
    const injectionOptions = [
      { content: "test", inlineClassName: "test-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [14],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 10
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(10, 1, 10, 5), "test-class", InlineDecorationType.Regular)]
    ]);
  });
  test("range uses view line number, not model line number", () => {
    const modelLineNumber = 3;
    const baseViewLineNumber = 7;
    const injectionOptions = [
      { content: "ghost", inlineClassName: "ghost-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [15],
      // 10 (original) + 5 (injected)
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => baseViewLineNumber
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(modelLineNumber);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(7, 1, 7, 6), "ghost-class", InlineDecorationType.Regular)]
    ]);
  });
  test("range uses view line number on wrapped lines, not model line number", () => {
    const modelLineNumber = 2;
    const baseViewLineNumber = 5;
    const injectionOptions = [
      { content: "1234567890", inlineClassName: "wrap-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [8, 20],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => baseViewLineNumber
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(modelLineNumber);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(5, 1, 5, 9), "wrap-class", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(6, 1, 6, 3), "wrap-class", InlineDecorationType.Regular)]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcdmlld01vZGVsXFxpbmxpbmVEZWNvcmF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb24sIElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJbmplY3RlZFRleHRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb24sIElubGluZURlY29yYXRpb25UeXBlLCBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIsIElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0LCBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyLCBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb29yZGluYXRlc0NvbnZlcnRlci5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vZGVsRGVjb3JhdGlvbihpZDogc3RyaW5nLCByYW5nZTogUmFuZ2UsIG9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zKTogSU1vZGVsRGVjb3JhdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0b3duZXJJZDogMCxcblx0XHRyYW5nZSxcblx0XHRvcHRpb25zXG5cdH07XG59XG5cbnN1aXRlKCdJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbm8gZGVjb3JhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0ZGVjb3JhdGlvbnM6IFtdLFxuXHRcdFx0aW5saW5lRGVjb3JhdGlvbnM6IFtbXV0sXG5cdFx0XHRoYXNWYXJpYWJsZUZvbnRzOiBbZmFsc2VdXG5cdFx0fSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmxpbmUgY2xhc3MgbmFtZSBkZWNvcmF0aW9uIG9uIGEgc2luZ2xlIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAndGVzdC1jbGFzcydcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kZWNvcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmlubGluZURlY29yYXRpb25zLCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDEsIDEsIDYpLCAndGVzdC1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXVxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lmhhc1ZhcmlhYmxlRm9udHMsIFtmYWxzZV0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW5saW5lQ2xhc3NOYW1lIHdpdGggYWZmZWN0c0xldHRlclNwYWNpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAndGVzdC1jbGFzcycsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWVcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaW5saW5lRGVjb3JhdGlvbnMsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgNiksICd0ZXN0LWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhckFmZmVjdGluZ0xldHRlclNwYWNpbmcpXVxuXHRcdF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYmVmb3JlQ29udGVudENsYXNzTmFtZSBkZWNvcmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGJlZm9yZUNvbnRlbnRDbGFzc05hbWU6ICdiZWZvcmUtY2xhc3MnXG5cdFx0XHRcdH0pXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmlubGluZURlY29yYXRpb25zLCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDMsIDEsIDMpLCAnYmVmb3JlLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKV1cblx0XHRdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyQ29udGVudENsYXNzTmFtZSBkZWNvcmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGFmdGVyQ29udGVudENsYXNzTmFtZTogJ2FmdGVyLWNsYXNzJ1xuXHRcdFx0XHR9KVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pbmxpbmVEZWNvcmF0aW9ucywgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCA4LCAxLCA4KSwgJ2FmdGVyLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpXVxuXHRcdF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYWxsIGRlY29yYXRpb24gdHlwZXMgY29tYmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAyLCAxLCA2KSwge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAnaW5saW5lLWNsYXNzJyxcblx0XHRcdFx0XHRiZWZvcmVDb250ZW50Q2xhc3NOYW1lOiAnYmVmb3JlLWNsYXNzJyxcblx0XHRcdFx0XHRhZnRlckNvbnRlbnRDbGFzc05hbWU6ICdhZnRlci1jbGFzcydcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaW5saW5lRGVjb3JhdGlvbnMsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDIsIDEsIDYpLCAnaW5saW5lLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhciksXG5cdFx0XHRcdG5ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgJ2JlZm9yZS1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSksXG5cdFx0XHRcdG5ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgJ2FmdGVyLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpLFxuXHRcdFx0XVxuXHRcdF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbiBzcGFubmluZyBtdWx0aXBsZSBsaW5lcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBvbmVcXG5saW5lIHR3b1xcbmxpbmUgdGhyZWUnKTtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKG1vZGVsKTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDMsIDMsIDUpLCB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6ICdtdWx0aS1saW5lJ1xuXHRcdFx0XHR9KVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDMsIDExKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRjb25zdCBleHBlY3RlZElubGluZURlY29yYXRpb24gPSBuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMywgMywgNSksICdtdWx0aS1saW5lJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaW5saW5lRGVjb3JhdGlvbnMsIFtcblx0XHRcdFtleHBlY3RlZElubGluZURlY29yYXRpb25dLFxuXHRcdFx0W2V4cGVjdGVkSW5saW5lRGVjb3JhdGlvbl0sXG5cdFx0XHRbZXhwZWN0ZWRJbmxpbmVEZWNvcmF0aW9uXSxcblx0XHRdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb24gd2l0aCBhZmZlY3RzRm9udCBzZXRzIGhhc1ZhcmlhYmxlRm9udHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAnZm9udC1jbGFzcycsXG5cdFx0XHRcdFx0YWZmZWN0c0ZvbnQ6IHRydWVcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaGFzVmFyaWFibGVGb250cywgW3RydWVdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGRlY29yYXRpb25zIG9uIGRpZmZlcmVudCBsaW5lcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBvbmVcXG5saW5lIHR3bycpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNSksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2NsYXNzLWEnXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzInLCBuZXcgUmFuZ2UoMiwgMSwgMiwgNSksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2NsYXNzLWInXG5cdFx0XHRcdH0pLFxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDIsIDkpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmlubGluZURlY29yYXRpb25zLCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDEsIDEsIDUpLCAnY2xhc3MtYScsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXSxcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMiwgMSwgMiwgNSksICdjbGFzcy1iJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildLFxuXHRcdF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbiBjYWNoZSBpcyB1c2VkIGZvciBzYW1lIGRlY29yYXRpb24gaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgZGVjID0gY3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAndGVzdC1jbGFzcydcblx0XHR9KTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtkZWNdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQxID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRjb25zdCByZXN1bHQyID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5kZWNvcmF0aW9uc1swXSwgcmVzdWx0Mi5kZWNvcmF0aW9uc1swXSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldCBjbGVhcnMgZGVjb3JhdGlvbiBjYWNoZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKG1vZGVsKTtcblx0XHRjb25zdCBkZWMgPSBjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHtcblx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRpbmxpbmVDbGFzc05hbWU6ICd0ZXN0LWNsYXNzJ1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW2RlY11cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGNvbXB1dGVyLnJlc2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDEuZGVjb3JhdGlvbnNbMF0sIHJlc3VsdDIuZGVjb3JhdGlvbnNbMF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5saW5lRGVjb3JhdGlvbnMgcmV0dXJucyBpbmxpbmUgZGVjb3JhdGlvbnMgZm9yIGEgbW9kZWwgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKG1vZGVsKTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6ICd0ZXN0LWNsYXNzJ1xuXHRcdFx0XHR9KVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgNiksICd0ZXN0LWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildXG5cdFx0XSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdubyBpbmplY3Rpb25zIHJldHVybnMgZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gbnVsbCxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IG51bGwsXG5cdFx0XHRnZXRCcmVha09mZnNldHM6ICgpID0+IFsxMF0sXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gMSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIGluamVjdGlvbiB3aXRoIGlubGluZUNsYXNzTmFtZSBvbiBhIHNpbmdsZSBvdXRwdXQgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdpbmplY3RlZCcsIGlubGluZUNsYXNzTmFtZTogJ2luamVjdGVkLWNsYXNzJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzVdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMThdLCAvLyAxMCAob3JpZ2luYWwpICsgOCAoaW5qZWN0ZWQpXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gMSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgNiwgMSwgMTQpLCAnaW5qZWN0ZWQtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5qZWN0aW9uIHdpdGhvdXQgaW5saW5lQ2xhc3NOYW1lIHByb2R1Y2VzIG5vIGlubGluZSBkZWNvcmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdpbmplY3RlZCcgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFs1XSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzE4XSxcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiAxLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W10gLy8gZW1wdHkgLSBubyBpbmxpbmVDbGFzc05hbWVcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5qZWN0aW9uIHdpdGggaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAnYWJjJywgaW5saW5lQ2xhc3NOYW1lOiAnbHMtY2xhc3MnLCBpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogdHJ1ZSB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzBdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMTNdLCAvLyAxMCArIDNcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiAxLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgJ2xzLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhckFmZmVjdGluZ0xldHRlclNwYWNpbmcpXVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBpbmplY3Rpb25zIG9uIGEgc2luZ2xlIG91dHB1dCBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSA9IFtcblx0XHRcdHsgY29udGVudDogJ0FBJywgaW5saW5lQ2xhc3NOYW1lOiAnY2xhc3MtYScgfSxcblx0XHRcdHsgY29udGVudDogJ0JCQicsIGlubGluZUNsYXNzTmFtZTogJ2NsYXNzLWInIH1cblx0XHRdO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldEluamVjdGlvbk9wdGlvbnM6ICgpID0+IGluamVjdGlvbk9wdGlvbnMsXG5cdFx0XHRnZXRJbmplY3Rpb25PZmZzZXRzOiAoKSA9PiBbMiwgNV0sXG5cdFx0XHRnZXRCcmVha09mZnNldHM6ICgpID0+IFsxNV0sIC8vIDEwICsgMiArIDNcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiAxLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMywgMSwgNSksICdjbGFzcy1hJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhciksXG5cdFx0XHRcdG5ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCA4LCAxLCAxMSksICdjbGFzcy1iJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhciksXG5cdFx0XHRdXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luamVjdGlvbiBzcGFubmluZyBhY3Jvc3Mgd3JhcHBlZCBsaW5lcycsICgpID0+IHtcblx0XHQvLyBPcmlnaW5hbCB0ZXh0IGlzIDIwIGNoYXJzLCBpbmplY3Rpb24gb2YgMTAgY2hhcnMgYXQgb2Zmc2V0IDhcblx0XHQvLyBCcmVhayBvZmZzZXRzIHNwbGl0IGF0IDE1IGFuZCAzMCAodHdvIHdyYXBwZWQgbGluZXMpXG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAnMTIzNDU2Nzg5MCcsIGlubGluZUNsYXNzTmFtZTogJ2luamVjdGVkJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzhdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMTUsIDMwXSxcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiA1LFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucygxKTtcblx0XHQvLyBJbmplY3RlZCB0ZXh0IHN0YXJ0cyBhdCBvZmZzZXQgOCBpbiB0aGUgaW5wdXQgd2l0aCBpbmplY3Rpb25zXG5cdFx0Ly8gTGluZSAwOiBbMCwgMTUpLCBpbmplY3RlZCB0ZXh0IG9jY3VwaWVzIFs4LCAxOCkgLT4gY2xpcHBlZCB0byBbOCwgMTUpXG5cdFx0Ly8gTGluZSAxOiBbMTUsIDMwKSwgaW5qZWN0ZWQgdGV4dCBvY2N1cGllcyBbOCwgMTgpIC0+IGNsaXBwZWQgdG8gWzE1LCAxOCkgLT4gcmVsYXRpdmU6IFswLCAzKVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDUsIDksIDUsIDE2KSwgJ2luamVjdGVkJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildLFxuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSg2LCAxLCA2LCA0KSwgJ2luamVjdGVkJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmplY3Rpb24gd2l0aCB3cmFwcGVkVGV4dEluZGVudExlbmd0aCBvbiB3cmFwcGVkIGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSA9IFtcblx0XHRcdHsgY29udGVudDogJzEyMzQ1Njc4OTAxMjM0NTY3ODkwJywgaW5saW5lQ2xhc3NOYW1lOiAnaW5qZWN0ZWQnIH1cblx0XHRdO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldEluamVjdGlvbk9wdGlvbnM6ICgpID0+IGluamVjdGlvbk9wdGlvbnMsXG5cdFx0XHRnZXRJbmplY3Rpb25PZmZzZXRzOiAoKSA9PiBbMF0sXG5cdFx0XHRnZXRCcmVha09mZnNldHM6ICgpID0+IFsxNSwgMzBdLFxuXHRcdFx0Z2V0V3JhcHBlZFRleHRJbmRlbnRMZW5ndGg6ICgpID0+IDQsXG5cdFx0XHRnZXRCYXNlVmlld0xpbmVOdW1iZXI6ICgpID0+IDEsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKDEpO1xuXHRcdC8vIExpbmUgMCAob3V0cHV0TGluZUluZGV4IDApOiBubyBvZmZzZXQsIHN0YXJ0PTAsIGVuZD0xNSAtPiBjb2x1bW5zIDEgdG8gMTZcblx0XHQvLyBMaW5lIDEgKG91dHB1dExpbmVJbmRleCAxKTogd3JhcHBlZFRleHRJbmRlbnRMZW5ndGg9NCwgc3RhcnQ9NCswPTQsIGVuZD00KzU9OSAtPiBjb2x1bW5zIDUgdG8gMTBcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCAxNiksICdpbmplY3RlZCcsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXSxcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMiwgNSwgMiwgMTApLCAnaW5qZWN0ZWQnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luamVjdGlvbiBzdGFydGluZyBpbiBsYXRlciB3cmFwcGVkIGxpbmUnLCAoKSA9PiB7XG5cdFx0Ly8gSW5qZWN0aW9uIGF0IG9mZnNldCAyMCB3aGljaCBpcyBwYXN0IHRoZSBmaXJzdCBsaW5lIGJyZWFrXG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAnYWInLCBpbmxpbmVDbGFzc05hbWU6ICdsYXRlLWNsYXNzJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzIwXSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzE1LCAzMl0sIC8vIDMwICsgMlxuXHRcdFx0Z2V0V3JhcHBlZFRleHRJbmRlbnRMZW5ndGg6ICgpID0+IDAsXG5cdFx0XHRnZXRCYXNlVmlld0xpbmVOdW1iZXI6ICgpID0+IDEsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKDEpO1xuXHRcdC8vIExpbmUgMDogWzAsIDE1KSAtPiBpbmplY3Rpb24gYXQgb2Zmc2V0IDIwIGlzIHBhc3QgdGhpcyBsaW5lIC0+IGVtcHR5XG5cdFx0Ly8gTGluZSAxOiBbMTUsIDMyKSAtPiBpbmplY3Rpb24gYXQgb2Zmc2V0IDIwIC0+IHN0YXJ0PTIwLTE1PTUsIGVuZD0yMi0xNT03IC0+IGNvbHVtbnMgNiB0byA4XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgyLCA2LCAyLCA4KSwgJ2xhdGUtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2UgdmlldyBsaW5lIG51bWJlciBvZmZzZXRzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICd0ZXN0JywgaW5saW5lQ2xhc3NOYW1lOiAndGVzdC1jbGFzcycgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFswXSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzE0XSxcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiAxMCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMTAsIDEsIDEwLCA1KSwgJ3Rlc3QtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZ2UgdXNlcyB2aWV3IGxpbmUgbnVtYmVyLCBub3QgbW9kZWwgbGluZSBudW1iZXInLCAoKSA9PiB7XG5cdFx0Ly8gTW9kZWwgbGluZSAzIG1hcHMgdG8gdmlldyBsaW5lIDcgKGUuZy4gZHVlIHRvIHByZXZpb3VzIGxpbmVzIHdyYXBwaW5nKS5cblx0XHQvLyBUaGUgcmFuZ2UgaW4gdGhlIHJlc3VsdGluZyBJbmxpbmVEZWNvcmF0aW9uIG11c3QgdXNlIHRoZSB2aWV3IGxpbmUgbnVtYmVyICg3KSxcblx0XHQvLyBub3QgdGhlIG1vZGVsIGxpbmUgbnVtYmVyICgzKSB0aGF0IGlzIHBhc3NlZCB0byBnZXRJbmxpbmVEZWNvcmF0aW9ucygpLlxuXHRcdGNvbnN0IG1vZGVsTGluZU51bWJlciA9IDM7XG5cdFx0Y29uc3QgYmFzZVZpZXdMaW5lTnVtYmVyID0gNztcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdnaG9zdCcsIGlubGluZUNsYXNzTmFtZTogJ2dob3N0LWNsYXNzJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzBdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMTVdLCAvLyAxMCAob3JpZ2luYWwpICsgNSAoaW5qZWN0ZWQpXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gYmFzZVZpZXdMaW5lTnVtYmVyLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucyhtb2RlbExpbmVOdW1iZXIpO1xuXHRcdC8vIFRoZSByYW5nZSBtdXN0IHJlZmVyZW5jZSB2aWV3IGxpbmUgNywgbm90IG1vZGVsIGxpbmUgM1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDcsIDEsIDcsIDYpLCAnZ2hvc3QtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZ2UgdXNlcyB2aWV3IGxpbmUgbnVtYmVyIG9uIHdyYXBwZWQgbGluZXMsIG5vdCBtb2RlbCBsaW5lIG51bWJlcicsICgpID0+IHtcblx0XHQvLyBNb2RlbCBsaW5lIDIgd3JhcHMgaW50byB2aWV3IGxpbmVzIDUgYW5kIDYuXG5cdFx0Ly8gQm90aCBvdXRwdXQgbGluZXMgbXVzdCB1c2UgdmlldyBsaW5lIG51bWJlcnMsIG5vdCBtb2RlbCBsaW5lIDIuXG5cdFx0Y29uc3QgbW9kZWxMaW5lTnVtYmVyID0gMjtcblx0XHRjb25zdCBiYXNlVmlld0xpbmVOdW1iZXIgPSA1O1xuXHRcdGNvbnN0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSA9IFtcblx0XHRcdHsgY29udGVudDogJzEyMzQ1Njc4OTAnLCBpbmxpbmVDbGFzc05hbWU6ICd3cmFwLWNsYXNzJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzBdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbOCwgMjBdLFxuXHRcdFx0Z2V0V3JhcHBlZFRleHRJbmRlbnRMZW5ndGg6ICgpID0+IDAsXG5cdFx0XHRnZXRCYXNlVmlld0xpbmVOdW1iZXI6ICgpID0+IGJhc2VWaWV3TGluZU51bWJlcixcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMobW9kZWxMaW5lTnVtYmVyKTtcblx0XHQvLyBGaXJzdCB3cmFwcGVkIGxpbmUgdXNlcyB2aWV3IGxpbmUgNSwgc2Vjb25kIHVzZXMgdmlldyBsaW5lIDZcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSg1LCAxLCA1LCA5KSwgJ3dyYXAtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV0sXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDYsIDEsIDYsIDMpLCAnd3JhcC1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFFdEIsU0FBUyxrQkFBa0Isc0JBQXNCLGdDQUF3RSw2Q0FBNEY7QUFDck4sU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxzQkFBc0IsSUFBWSxPQUFjLFNBQW9E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
