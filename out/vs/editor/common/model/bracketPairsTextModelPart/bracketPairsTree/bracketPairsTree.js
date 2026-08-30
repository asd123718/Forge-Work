import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { BracketInfo, BracketPairWithMinIndentationInfo } from "../../../textModelBracketPairs.js";
import { AstNodeKind } from "./ast.js";
import { TextEditInfo } from "./beforeEditPositionMapper.js";
import { LanguageAgnosticBracketTokens } from "./brackets.js";
import { lengthAdd, lengthGreaterThanEqual, lengthLessThan, lengthLessThanEqual, lengthsToRange, lengthZero, positionToLength, toLength } from "./length.js";
import { parseDocument } from "./parser.js";
import { DenseKeyProvider } from "./smallImmutableSet.js";
import { FastTokenizer, TextBufferTokenizer } from "./tokenizer.js";
import { BackgroundTokenizationState } from "../../../tokenizationTextModelPart.js";
import { CallbackIterable } from "../../../../../base/common/arrays.js";
import { combineTextEditInfos } from "./combineTextEditInfos.js";
class BracketPairsTree extends Disposable {
  constructor(textModel, getLanguageConfiguration) {
    super();
    this.textModel = textModel;
    this.getLanguageConfiguration = getLanguageConfiguration;
    this.didChangeEmitter = this._register(new Emitter());
    this.denseKeyProvider = new DenseKeyProvider();
    this.brackets = new LanguageAgnosticBracketTokens(this.denseKeyProvider, this.getLanguageConfiguration);
    this.onDidChange = this.didChangeEmitter.event;
    this.queuedTextEditsForInitialAstWithoutTokens = [];
    this.queuedTextEdits = [];
    if (!textModel.tokenization.hasTokens) {
      const brackets = this.brackets.getSingleLanguageBracketTokens(this.textModel.getLanguageId());
      const tokenizer = new FastTokenizer(this.textModel.getValue(), brackets);
      this.initialAstWithoutTokens = parseDocument(tokenizer, [], void 0, true);
      this.astWithTokens = this.initialAstWithoutTokens;
    } else if (textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
      this.initialAstWithoutTokens = void 0;
      this.astWithTokens = this.parseDocumentFromTextBuffer([], void 0, false);
    } else {
      this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer([], void 0, true);
      this.astWithTokens = this.initialAstWithoutTokens;
    }
  }
  didLanguageChange(languageId) {
    return this.brackets.didLanguageChange(languageId);
  }
  //#region TextModel events
  handleDidChangeBackgroundTokenizationState() {
    if (this.textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
      const wasUndefined = this.initialAstWithoutTokens === void 0;
      this.initialAstWithoutTokens = void 0;
      if (!wasUndefined) {
        this.didChangeEmitter.fire();
      }
    }
  }
  handleDidChangeTokens({ ranges }) {
    const edits = ranges.map(
      (r) => new TextEditInfo(
        toLength(r.fromLineNumber - 1, 0),
        toLength(r.toLineNumber, 0),
        toLength(r.toLineNumber - r.fromLineNumber + 1, 0)
      )
    );
    this.handleEdits(edits, true);
    if (!this.initialAstWithoutTokens) {
      this.didChangeEmitter.fire();
    }
  }
  handleContentChanged(change) {
    const edits = TextEditInfo.fromModelContentChanges(change.changes);
    this.handleEdits(edits, false);
  }
  handleEdits(edits, tokenChange) {
    const result = combineTextEditInfos(this.queuedTextEdits, edits);
    this.queuedTextEdits = result;
    if (this.initialAstWithoutTokens && !tokenChange) {
      this.queuedTextEditsForInitialAstWithoutTokens = combineTextEditInfos(this.queuedTextEditsForInitialAstWithoutTokens, edits);
    }
  }
  //#endregion
  flushQueue() {
    if (this.queuedTextEdits.length > 0) {
      this.astWithTokens = this.parseDocumentFromTextBuffer(this.queuedTextEdits, this.astWithTokens, false);
      this.queuedTextEdits = [];
    }
    if (this.queuedTextEditsForInitialAstWithoutTokens.length > 0) {
      if (this.initialAstWithoutTokens) {
        this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer(this.queuedTextEditsForInitialAstWithoutTokens, this.initialAstWithoutTokens, false);
      }
      this.queuedTextEditsForInitialAstWithoutTokens = [];
    }
  }
  /**
   * @pure (only if isPure = true)
  */
  parseDocumentFromTextBuffer(edits, previousAst, immutable) {
    const isPure = false;
    const previousAstClone = isPure ? previousAst?.deepClone() : previousAst;
    const tokenizer = new TextBufferTokenizer(this.textModel, this.brackets);
    const result = parseDocument(tokenizer, edits, previousAstClone, immutable);
    return result;
  }
  getBracketsInRange(range, onlyColorizedBrackets) {
    this.flushQueue();
    const startOffset = toLength(range.startLineNumber - 1, range.startColumn - 1);
    const endOffset = toLength(range.endLineNumber - 1, range.endColumn - 1);
    return new CallbackIterable((cb) => {
      const node = this.initialAstWithoutTokens || this.astWithTokens;
      collectBrackets(node, lengthZero, node.length, startOffset, endOffset, cb, 0, 0, /* @__PURE__ */ new Map(), onlyColorizedBrackets);
    });
  }
  getBracketPairsInRange(range, includeMinIndentation) {
    this.flushQueue();
    const startLength = positionToLength(range.getStartPosition());
    const endLength = positionToLength(range.getEndPosition());
    return new CallbackIterable((cb) => {
      const node = this.initialAstWithoutTokens || this.astWithTokens;
      const context = new CollectBracketPairsContext(cb, includeMinIndentation, this.textModel);
      collectBracketPairs(node, lengthZero, node.length, startLength, endLength, context, 0, /* @__PURE__ */ new Map());
    });
  }
  getFirstBracketAfter(position) {
    this.flushQueue();
    const node = this.initialAstWithoutTokens || this.astWithTokens;
    return getFirstBracketAfter(node, lengthZero, node.length, positionToLength(position));
  }
  getFirstBracketBefore(position) {
    this.flushQueue();
    const node = this.initialAstWithoutTokens || this.astWithTokens;
    return getFirstBracketBefore(node, lengthZero, node.length, positionToLength(position));
  }
}
function getFirstBracketBefore(node, nodeOffsetStart, nodeOffsetEnd, position) {
  if (node.kind === AstNodeKind.List || node.kind === AstNodeKind.Pair) {
    const lengths = [];
    for (const child of node.children) {
      nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
      lengths.push({ nodeOffsetStart, nodeOffsetEnd });
      nodeOffsetStart = nodeOffsetEnd;
    }
    for (let i = lengths.length - 1; i >= 0; i--) {
      const { nodeOffsetStart: nodeOffsetStart2, nodeOffsetEnd: nodeOffsetEnd2 } = lengths[i];
      if (lengthLessThan(nodeOffsetStart2, position)) {
        const result = getFirstBracketBefore(node.children[i], nodeOffsetStart2, nodeOffsetEnd2, position);
        if (result) {
          return result;
        }
      }
    }
    return null;
  } else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
    return null;
  } else if (node.kind === AstNodeKind.Bracket) {
    const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
    return {
      bracketInfo: node.bracketInfo,
      range
    };
  }
  return null;
}
function getFirstBracketAfter(node, nodeOffsetStart, nodeOffsetEnd, position) {
  if (node.kind === AstNodeKind.List || node.kind === AstNodeKind.Pair) {
    for (const child of node.children) {
      nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
      if (lengthLessThan(position, nodeOffsetEnd)) {
        const result = getFirstBracketAfter(child, nodeOffsetStart, nodeOffsetEnd, position);
        if (result) {
          return result;
        }
      }
      nodeOffsetStart = nodeOffsetEnd;
    }
    return null;
  } else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
    return null;
  } else if (node.kind === AstNodeKind.Bracket) {
    const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
    return {
      bracketInfo: node.bracketInfo,
      range
    };
  }
  return null;
}
function collectBrackets(node, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, push, level, nestingLevelOfEqualBracketType, levelPerBracketType, onlyColorizedBrackets, parentPairIsIncomplete = false) {
  if (level > 200) {
    return true;
  }
  whileLoop:
    while (true) {
      switch (node.kind) {
        case AstNodeKind.List: {
          const childCount = node.childrenLength;
          for (let i = 0; i < childCount; i++) {
            const child = node.getChild(i);
            if (!child) {
              continue;
            }
            nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
            if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
              const childEndsAfterEnd = lengthGreaterThanEqual(nodeOffsetEnd, endOffset);
              if (childEndsAfterEnd) {
                node = child;
                continue whileLoop;
              }
              const shouldContinue = collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, push, level, 0, levelPerBracketType, onlyColorizedBrackets);
              if (!shouldContinue) {
                return false;
              }
            }
            nodeOffsetStart = nodeOffsetEnd;
          }
          return true;
        }
        case AstNodeKind.Pair: {
          const colorize = !onlyColorizedBrackets || !node.closingBracket || node.closingBracket.bracketInfo.closesColorized(node.openingBracket.bracketInfo);
          let levelPerBracket = 0;
          if (levelPerBracketType) {
            let existing = levelPerBracketType.get(node.openingBracket.text);
            if (existing === void 0) {
              existing = 0;
            }
            levelPerBracket = existing;
            if (colorize) {
              existing++;
              levelPerBracketType.set(node.openingBracket.text, existing);
            }
          }
          const childCount = node.childrenLength;
          for (let i = 0; i < childCount; i++) {
            const child = node.getChild(i);
            if (!child) {
              continue;
            }
            nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
            if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
              const childEndsAfterEnd = lengthGreaterThanEqual(nodeOffsetEnd, endOffset);
              if (childEndsAfterEnd && child.kind !== AstNodeKind.Bracket) {
                node = child;
                if (colorize) {
                  level++;
                  nestingLevelOfEqualBracketType = levelPerBracket + 1;
                } else {
                  nestingLevelOfEqualBracketType = levelPerBracket;
                }
                continue whileLoop;
              }
              if (colorize || child.kind !== AstNodeKind.Bracket || !node.closingBracket) {
                const shouldContinue = collectBrackets(
                  child,
                  nodeOffsetStart,
                  nodeOffsetEnd,
                  startOffset,
                  endOffset,
                  push,
                  colorize ? level + 1 : level,
                  colorize ? levelPerBracket + 1 : levelPerBracket,
                  levelPerBracketType,
                  onlyColorizedBrackets,
                  !node.closingBracket
                );
                if (!shouldContinue) {
                  return false;
                }
              }
            }
            nodeOffsetStart = nodeOffsetEnd;
          }
          levelPerBracketType?.set(node.openingBracket.text, levelPerBracket);
          return true;
        }
        case AstNodeKind.UnexpectedClosingBracket: {
          const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
          return push(new BracketInfo(range, level - 1, 0, true));
        }
        case AstNodeKind.Bracket: {
          const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
          return push(new BracketInfo(range, level - 1, nestingLevelOfEqualBracketType - 1, parentPairIsIncomplete));
        }
        case AstNodeKind.Text:
          return true;
      }
    }
}
class CollectBracketPairsContext {
  constructor(push, includeMinIndentation, textModel) {
    this.push = push;
    this.includeMinIndentation = includeMinIndentation;
    this.textModel = textModel;
  }
}
function collectBracketPairs(node, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, context, level, levelPerBracketType) {
  if (level > 200) {
    return true;
  }
  let shouldContinue = true;
  if (node.kind === AstNodeKind.Pair) {
    let levelPerBracket = 0;
    if (levelPerBracketType) {
      let existing = levelPerBracketType.get(node.openingBracket.text);
      if (existing === void 0) {
        existing = 0;
      }
      levelPerBracket = existing;
      existing++;
      levelPerBracketType.set(node.openingBracket.text, existing);
    }
    const openingBracketEnd = lengthAdd(nodeOffsetStart, node.openingBracket.length);
    let minIndentation = -1;
    if (context.includeMinIndentation) {
      minIndentation = node.computeMinIndentation(
        nodeOffsetStart,
        context.textModel
      );
    }
    shouldContinue = context.push(
      new BracketPairWithMinIndentationInfo(
        lengthsToRange(nodeOffsetStart, nodeOffsetEnd),
        lengthsToRange(nodeOffsetStart, openingBracketEnd),
        node.closingBracket ? lengthsToRange(
          lengthAdd(openingBracketEnd, node.child?.length || lengthZero),
          nodeOffsetEnd
        ) : void 0,
        level,
        levelPerBracket,
        node,
        minIndentation
      )
    );
    nodeOffsetStart = openingBracketEnd;
    if (shouldContinue && node.child) {
      const child = node.child;
      nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
      if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
        shouldContinue = collectBracketPairs(
          child,
          nodeOffsetStart,
          nodeOffsetEnd,
          startOffset,
          endOffset,
          context,
          level + 1,
          levelPerBracketType
        );
        if (!shouldContinue) {
          return false;
        }
      }
    }
    levelPerBracketType?.set(node.openingBracket.text, levelPerBracket);
  } else {
    let curOffset = nodeOffsetStart;
    for (const child of node.children) {
      const childOffset = curOffset;
      curOffset = lengthAdd(curOffset, child.length);
      if (lengthLessThanEqual(childOffset, endOffset) && lengthLessThanEqual(startOffset, curOffset)) {
        shouldContinue = collectBracketPairs(
          child,
          childOffset,
          curOffset,
          startOffset,
          endOffset,
          context,
          level,
          levelPerBracketType
        );
        if (!shouldContinue) {
          return false;
        }
      }
    }
  }
  return shouldContinue;
}
export {
  BracketPairsTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnRcXGJyYWNrZXRQYWlyc1RyZWVcXGJyYWNrZXRQYWlyc1RyZWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL21vZGVsLmpzJztcbmltcG9ydCB7IEJyYWNrZXRJbmZvLCBCcmFja2V0UGFpcldpdGhNaW5JbmRlbnRhdGlvbkluZm8sIElGb3VuZEJyYWNrZXQgfSBmcm9tICcuLi8uLi8uLi90ZXh0TW9kZWxCcmFja2V0UGFpcnMuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBc3ROb2RlLCBBc3ROb2RlS2luZCB9IGZyb20gJy4vYXN0LmpzJztcbmltcG9ydCB7IFRleHRFZGl0SW5mbyB9IGZyb20gJy4vYmVmb3JlRWRpdFBvc2l0aW9uTWFwcGVyLmpzJztcbmltcG9ydCB7IExhbmd1YWdlQWdub3N0aWNCcmFja2V0VG9rZW5zIH0gZnJvbSAnLi9icmFja2V0cy5qcyc7XG5pbXBvcnQgeyBMZW5ndGgsIGxlbmd0aEFkZCwgbGVuZ3RoR3JlYXRlclRoYW5FcXVhbCwgbGVuZ3RoTGVzc1RoYW4sIGxlbmd0aExlc3NUaGFuRXF1YWwsIGxlbmd0aHNUb1JhbmdlLCBsZW5ndGhaZXJvLCBwb3NpdGlvblRvTGVuZ3RoLCB0b0xlbmd0aCB9IGZyb20gJy4vbGVuZ3RoLmpzJztcbmltcG9ydCB7IHBhcnNlRG9jdW1lbnQgfSBmcm9tICcuL3BhcnNlci5qcyc7XG5pbXBvcnQgeyBEZW5zZUtleVByb3ZpZGVyIH0gZnJvbSAnLi9zbWFsbEltbXV0YWJsZVNldC5qcyc7XG5pbXBvcnQgeyBGYXN0VG9rZW5pemVyLCBUZXh0QnVmZmVyVG9rZW5pemVyIH0gZnJvbSAnLi90b2tlbml6ZXIuanMnO1xuaW1wb3J0IHsgQmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ2FsbGJhY2tJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBjb21iaW5lVGV4dEVkaXRJbmZvcyB9IGZyb20gJy4vY29tYmluZVRleHRFZGl0SW5mb3MuanMnO1xuaW1wb3J0IHsgQ2xvc2luZ0JyYWNrZXRLaW5kLCBPcGVuaW5nQnJhY2tldEtpbmQgfSBmcm9tICcuLi8uLi8uLi9sYW5ndWFnZXMvc3VwcG9ydHMvbGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgQnJhY2tldFBhaXJzVHJlZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZENoYW5nZUVtaXR0ZXI7XG5cblx0Lypcblx0XHRUaGVyZSBhcmUgdHdvIHRyZWVzOlxuXHRcdCogVGhlIGluaXRpYWwgdHJlZSB0aGF0IGhhcyBubyB0b2tlbiBpbmZvcm1hdGlvbiBhbmQgaXMgdXNlZCBmb3IgcGVyZm9ybWFudCBpbml0aWFsIGJyYWNrZXQgY29sb3JpemF0aW9uLlxuXHRcdCogVGhlIHRyZWUgdGhhdCB1c2VkIHRva2VuIGluZm9ybWF0aW9uIHRvIGRldGVjdCBicmFja2V0IHBhaXJzLlxuXG5cdFx0VG8gcHJldmVudCBmbGlja2VyaW5nLCB3ZSBvbmx5IHN3aXRjaCBmcm9tIHRoZSBpbml0aWFsIHRyZWUgdG8gdHJlZSB3aXRoIHRva2VuIGluZm9ybWF0aW9uXG5cdFx0d2hlbiB0b2tlbml6YXRpb24gY29tcGxldGVzLlxuXHRcdFNpbmNlIHRoZSB0ZXh0IGNhbiBiZSBlZGl0ZWQgd2hpbGUgYmFja2dyb3VuZCB0b2tlbml6YXRpb24gaXMgaW4gcHJvZ3Jlc3MsIHdlIG5lZWQgdG8gdXBkYXRlIGJvdGggdHJlZXMuXG5cdCovXG5cdHByaXZhdGUgaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnM6IEFzdE5vZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN0V2l0aFRva2VuczogQXN0Tm9kZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlbnNlS2V5UHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJhY2tldHM7XG5cblx0cHVibGljIGRpZExhbmd1YWdlQ2hhbmdlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmJyYWNrZXRzLmRpZExhbmd1YWdlQ2hhbmdlKGxhbmd1YWdlSWQpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlO1xuXHRwcml2YXRlIHF1ZXVlZFRleHRFZGl0c0ZvckluaXRpYWxBc3RXaXRob3V0VG9rZW5zOiBUZXh0RWRpdEluZm9bXTtcblx0cHJpdmF0ZSBxdWV1ZWRUZXh0RWRpdHM6IFRleHRFZGl0SW5mb1tdO1xuXG5cdHB1YmxpYyBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbDogVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uOiAobGFuZ3VhZ2VJZDogc3RyaW5nKSA9PiBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZGlkQ2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdHRoaXMuZGVuc2VLZXlQcm92aWRlciA9IG5ldyBEZW5zZUtleVByb3ZpZGVyPHN0cmluZz4oKTtcblx0XHR0aGlzLmJyYWNrZXRzID0gbmV3IExhbmd1YWdlQWdub3N0aWNCcmFja2V0VG9rZW5zKHRoaXMuZGVuc2VLZXlQcm92aWRlciwgdGhpcy5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSB0aGlzLmRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cdFx0dGhpcy5xdWV1ZWRUZXh0RWRpdHNGb3JJbml0aWFsQXN0V2l0aG91dFRva2VucyA9IFtdO1xuXHRcdHRoaXMucXVldWVkVGV4dEVkaXRzID0gW107XG5cblx0XHRpZiAoIXRleHRNb2RlbC50b2tlbml6YXRpb24uaGFzVG9rZW5zKSB7XG5cdFx0XHRjb25zdCBicmFja2V0cyA9IHRoaXMuYnJhY2tldHMuZ2V0U2luZ2xlTGFuZ3VhZ2VCcmFja2V0VG9rZW5zKHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0XHRjb25zdCB0b2tlbml6ZXIgPSBuZXcgRmFzdFRva2VuaXplcih0aGlzLnRleHRNb2RlbC5nZXRWYWx1ZSgpLCBicmFja2V0cyk7XG5cdFx0XHR0aGlzLmluaXRpYWxBc3RXaXRob3V0VG9rZW5zID0gcGFyc2VEb2N1bWVudCh0b2tlbml6ZXIsIFtdLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0dGhpcy5hc3RXaXRoVG9rZW5zID0gdGhpcy5pbml0aWFsQXN0V2l0aG91dFRva2Vucztcblx0XHR9IGVsc2UgaWYgKHRleHRNb2RlbC50b2tlbml6YXRpb24uYmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlID09PSBCYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RhdGUuQ29tcGxldGVkKSB7XG5cdFx0XHQvLyBTa2lwIHRoZSBpbml0aWFsIGFzdCwgYXMgdGhlcmUgaXMgbm8gZmxpY2tlcmluZy5cblx0XHRcdC8vIERpcmVjdGx5IGNyZWF0ZSB0aGUgdHJlZSB3aXRoIHRva2VuIGluZm9ybWF0aW9uLlxuXHRcdFx0dGhpcy5pbml0aWFsQXN0V2l0aG91dFRva2VucyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuYXN0V2l0aFRva2VucyA9IHRoaXMucGFyc2VEb2N1bWVudEZyb21UZXh0QnVmZmVyKFtdLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gV2UgbWlzc2VkIHNvbWUgdG9rZW4gY2hhbmdlcyBhbHJlYWR5LCBzbyB3ZSBjYW5ub3QgdXNlIHRoZSBmYXN0IHRva2VuaXplciArIGRlbHRhIGluY3JlbWVudHNcblx0XHRcdHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMgPSB0aGlzLnBhcnNlRG9jdW1lbnRGcm9tVGV4dEJ1ZmZlcihbXSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdHRoaXMuYXN0V2l0aFRva2VucyA9IHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnM7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFRleHRNb2RlbCBldmVudHNcblxuXHRwdWJsaWMgaGFuZGxlRGlkQ2hhbmdlQmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRleHRNb2RlbC50b2tlbml6YXRpb24uYmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlID09PSBCYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RhdGUuQ29tcGxldGVkKSB7XG5cdFx0XHRjb25zdCB3YXNVbmRlZmluZWQgPSB0aGlzLmluaXRpYWxBc3RXaXRob3V0VG9rZW5zID09PSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBDbGVhciB0aGUgaW5pdGlhbCB0cmVlIGFzIHdlIGNhbiB1c2UgdGhlIHRyZWUgd2l0aCB0b2tlbiBpbmZvcm1hdGlvbiBub3cuXG5cdFx0XHR0aGlzLmluaXRpYWxBc3RXaXRob3V0VG9rZW5zID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF3YXNVbmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5kaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlRGlkQ2hhbmdlVG9rZW5zKHsgcmFuZ2VzIH06IElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRzID0gcmFuZ2VzLm1hcChyID0+XG5cdFx0XHRuZXcgVGV4dEVkaXRJbmZvKFxuXHRcdFx0XHR0b0xlbmd0aChyLmZyb21MaW5lTnVtYmVyIC0gMSwgMCksXG5cdFx0XHRcdHRvTGVuZ3RoKHIudG9MaW5lTnVtYmVyLCAwKSxcblx0XHRcdFx0dG9MZW5ndGgoci50b0xpbmVOdW1iZXIgLSByLmZyb21MaW5lTnVtYmVyICsgMSwgMClcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0dGhpcy5oYW5kbGVFZGl0cyhlZGl0cywgdHJ1ZSk7XG5cblx0XHRpZiAoIXRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMpIHtcblx0XHRcdHRoaXMuZGlkQ2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhbmRsZUNvbnRlbnRDaGFuZ2VkKGNoYW5nZTogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCkge1xuXHRcdGNvbnN0IGVkaXRzID0gVGV4dEVkaXRJbmZvLmZyb21Nb2RlbENvbnRlbnRDaGFuZ2VzKGNoYW5nZS5jaGFuZ2VzKTtcblx0XHR0aGlzLmhhbmRsZUVkaXRzKGVkaXRzLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUVkaXRzKGVkaXRzOiBUZXh0RWRpdEluZm9bXSwgdG9rZW5DaGFuZ2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBMYXppbHkgcXVldWUgdGhlIGVkaXRzIGFuZCBvbmx5IGFwcGx5IHRoZW0gd2hlbiB0aGUgdHJlZSBpcyBhY2Nlc3NlZC5cblx0XHRjb25zdCByZXN1bHQgPSBjb21iaW5lVGV4dEVkaXRJbmZvcyh0aGlzLnF1ZXVlZFRleHRFZGl0cywgZWRpdHMpO1xuXG5cdFx0dGhpcy5xdWV1ZWRUZXh0RWRpdHMgPSByZXN1bHQ7XG5cdFx0aWYgKHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMgJiYgIXRva2VuQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLnF1ZXVlZFRleHRFZGl0c0ZvckluaXRpYWxBc3RXaXRob3V0VG9rZW5zID0gY29tYmluZVRleHRFZGl0SW5mb3ModGhpcy5xdWV1ZWRUZXh0RWRpdHNGb3JJbml0aWFsQXN0V2l0aG91dFRva2VucywgZWRpdHMpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgZmx1c2hRdWV1ZSgpIHtcblx0XHRpZiAodGhpcy5xdWV1ZWRUZXh0RWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5hc3RXaXRoVG9rZW5zID0gdGhpcy5wYXJzZURvY3VtZW50RnJvbVRleHRCdWZmZXIodGhpcy5xdWV1ZWRUZXh0RWRpdHMsIHRoaXMuYXN0V2l0aFRva2VucywgZmFsc2UpO1xuXHRcdFx0dGhpcy5xdWV1ZWRUZXh0RWRpdHMgPSBbXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucXVldWVkVGV4dEVkaXRzRm9ySW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMpIHtcblx0XHRcdFx0dGhpcy5pbml0aWFsQXN0V2l0aG91dFRva2VucyA9IHRoaXMucGFyc2VEb2N1bWVudEZyb21UZXh0QnVmZmVyKHRoaXMucXVldWVkVGV4dEVkaXRzRm9ySW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMsIHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucXVldWVkVGV4dEVkaXRzRm9ySW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMgPSBbXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHB1cmUgKG9ubHkgaWYgaXNQdXJlID0gdHJ1ZSlcblx0Ki9cblx0cHJpdmF0ZSBwYXJzZURvY3VtZW50RnJvbVRleHRCdWZmZXIoZWRpdHM6IFRleHRFZGl0SW5mb1tdLCBwcmV2aW91c0FzdDogQXN0Tm9kZSB8IHVuZGVmaW5lZCwgaW1tdXRhYmxlOiBib29sZWFuKTogQXN0Tm9kZSB7XG5cdFx0Ly8gSXMgbXVjaCBmYXN0ZXIgaWYgYGlzUHVyZSA9IGZhbHNlYC5cblx0XHRjb25zdCBpc1B1cmUgPSBmYWxzZTtcblx0XHRjb25zdCBwcmV2aW91c0FzdENsb25lID0gaXNQdXJlID8gcHJldmlvdXNBc3Q/LmRlZXBDbG9uZSgpIDogcHJldmlvdXNBc3Q7XG5cdFx0Y29uc3QgdG9rZW5pemVyID0gbmV3IFRleHRCdWZmZXJUb2tlbml6ZXIodGhpcy50ZXh0TW9kZWwsIHRoaXMuYnJhY2tldHMpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRG9jdW1lbnQodG9rZW5pemVyLCBlZGl0cywgcHJldmlvdXNBc3RDbG9uZSwgaW1tdXRhYmxlKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldEJyYWNrZXRzSW5SYW5nZShyYW5nZTogUmFuZ2UsIG9ubHlDb2xvcml6ZWRCcmFja2V0czogYm9vbGVhbik6IENhbGxiYWNrSXRlcmFibGU8QnJhY2tldEluZm8+IHtcblx0XHR0aGlzLmZsdXNoUXVldWUoKTtcblxuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdG9MZW5ndGgocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0b0xlbmd0aChyYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgcmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0cmV0dXJuIG5ldyBDYWxsYmFja0l0ZXJhYmxlKGNiID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLmluaXRpYWxBc3RXaXRob3V0VG9rZW5zIHx8IHRoaXMuYXN0V2l0aFRva2VucyE7XG5cdFx0XHRjb2xsZWN0QnJhY2tldHMobm9kZSwgbGVuZ3RoWmVybywgbm9kZS5sZW5ndGgsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIGNiLCAwLCAwLCBuZXcgTWFwKCksIG9ubHlDb2xvcml6ZWRCcmFja2V0cyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShyYW5nZTogUmFuZ2UsIGluY2x1ZGVNaW5JbmRlbnRhdGlvbjogYm9vbGVhbik6IENhbGxiYWNrSXRlcmFibGU8QnJhY2tldFBhaXJXaXRoTWluSW5kZW50YXRpb25JbmZvPiB7XG5cdFx0dGhpcy5mbHVzaFF1ZXVlKCk7XG5cblx0XHRjb25zdCBzdGFydExlbmd0aCA9IHBvc2l0aW9uVG9MZW5ndGgocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRjb25zdCBlbmRMZW5ndGggPSBwb3NpdGlvblRvTGVuZ3RoKHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xuXG5cdFx0cmV0dXJuIG5ldyBDYWxsYmFja0l0ZXJhYmxlKGNiID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLmluaXRpYWxBc3RXaXRob3V0VG9rZW5zIHx8IHRoaXMuYXN0V2l0aFRva2VucyE7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gbmV3IENvbGxlY3RCcmFja2V0UGFpcnNDb250ZXh0KGNiLCBpbmNsdWRlTWluSW5kZW50YXRpb24sIHRoaXMudGV4dE1vZGVsKTtcblx0XHRcdGNvbGxlY3RCcmFja2V0UGFpcnMobm9kZSwgbGVuZ3RoWmVybywgbm9kZS5sZW5ndGgsIHN0YXJ0TGVuZ3RoLCBlbmRMZW5ndGgsIGNvbnRleHQsIDAsIG5ldyBNYXAoKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rmlyc3RCcmFja2V0QWZ0ZXIocG9zaXRpb246IFBvc2l0aW9uKTogSUZvdW5kQnJhY2tldCB8IG51bGwge1xuXHRcdHRoaXMuZmx1c2hRdWV1ZSgpO1xuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMgfHwgdGhpcy5hc3RXaXRoVG9rZW5zITtcblx0XHRyZXR1cm4gZ2V0Rmlyc3RCcmFja2V0QWZ0ZXIobm9kZSwgbGVuZ3RoWmVybywgbm9kZS5sZW5ndGgsIHBvc2l0aW9uVG9MZW5ndGgocG9zaXRpb24pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGaXJzdEJyYWNrZXRCZWZvcmUocG9zaXRpb246IFBvc2l0aW9uKTogSUZvdW5kQnJhY2tldCB8IG51bGwge1xuXHRcdHRoaXMuZmx1c2hRdWV1ZSgpO1xuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuaW5pdGlhbEFzdFdpdGhvdXRUb2tlbnMgfHwgdGhpcy5hc3RXaXRoVG9rZW5zITtcblx0XHRyZXR1cm4gZ2V0Rmlyc3RCcmFja2V0QmVmb3JlKG5vZGUsIGxlbmd0aFplcm8sIG5vZGUubGVuZ3RoLCBwb3NpdGlvblRvTGVuZ3RoKHBvc2l0aW9uKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Rmlyc3RCcmFja2V0QmVmb3JlKG5vZGU6IEFzdE5vZGUsIG5vZGVPZmZzZXRTdGFydDogTGVuZ3RoLCBub2RlT2Zmc2V0RW5kOiBMZW5ndGgsIHBvc2l0aW9uOiBMZW5ndGgpOiBJRm91bmRCcmFja2V0IHwgbnVsbCB7XG5cdGlmIChub2RlLmtpbmQgPT09IEFzdE5vZGVLaW5kLkxpc3QgfHwgbm9kZS5raW5kID09PSBBc3ROb2RlS2luZC5QYWlyKSB7XG5cdFx0Y29uc3QgbGVuZ3RoczogeyBub2RlT2Zmc2V0U3RhcnQ6IExlbmd0aDsgbm9kZU9mZnNldEVuZDogTGVuZ3RoIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0bm9kZU9mZnNldEVuZCA9IGxlbmd0aEFkZChub2RlT2Zmc2V0U3RhcnQsIGNoaWxkLmxlbmd0aCk7XG5cdFx0XHRsZW5ndGhzLnB1c2goeyBub2RlT2Zmc2V0U3RhcnQsIG5vZGVPZmZzZXRFbmQgfSk7XG5cdFx0XHRub2RlT2Zmc2V0U3RhcnQgPSBub2RlT2Zmc2V0RW5kO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gbGVuZ3Rocy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgeyBub2RlT2Zmc2V0U3RhcnQsIG5vZGVPZmZzZXRFbmQgfSA9IGxlbmd0aHNbaV07XG5cdFx0XHRpZiAobGVuZ3RoTGVzc1RoYW4obm9kZU9mZnNldFN0YXJ0LCBwb3NpdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0Rmlyc3RCcmFja2V0QmVmb3JlKG5vZGUuY2hpbGRyZW5baV0sIG5vZGVPZmZzZXRTdGFydCwgbm9kZU9mZnNldEVuZCwgcG9zaXRpb24pO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fSBlbHNlIGlmIChub2RlLmtpbmQgPT09IEFzdE5vZGVLaW5kLlVuZXhwZWN0ZWRDbG9zaW5nQnJhY2tldCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9IGVsc2UgaWYgKG5vZGUua2luZCA9PT0gQXN0Tm9kZUtpbmQuQnJhY2tldCkge1xuXHRcdGNvbnN0IHJhbmdlID0gbGVuZ3Roc1RvUmFuZ2Uobm9kZU9mZnNldFN0YXJ0LCBub2RlT2Zmc2V0RW5kKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YnJhY2tldEluZm86IG5vZGUuYnJhY2tldEluZm8sXG5cdFx0XHRyYW5nZVxuXHRcdH07XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldEZpcnN0QnJhY2tldEFmdGVyKG5vZGU6IEFzdE5vZGUsIG5vZGVPZmZzZXRTdGFydDogTGVuZ3RoLCBub2RlT2Zmc2V0RW5kOiBMZW5ndGgsIHBvc2l0aW9uOiBMZW5ndGgpOiBJRm91bmRCcmFja2V0IHwgbnVsbCB7XG5cdGlmIChub2RlLmtpbmQgPT09IEFzdE5vZGVLaW5kLkxpc3QgfHwgbm9kZS5raW5kID09PSBBc3ROb2RlS2luZC5QYWlyKSB7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRub2RlT2Zmc2V0RW5kID0gbGVuZ3RoQWRkKG5vZGVPZmZzZXRTdGFydCwgY2hpbGQubGVuZ3RoKTtcblx0XHRcdGlmIChsZW5ndGhMZXNzVGhhbihwb3NpdGlvbiwgbm9kZU9mZnNldEVuZCkpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0Rmlyc3RCcmFja2V0QWZ0ZXIoY2hpbGQsIG5vZGVPZmZzZXRTdGFydCwgbm9kZU9mZnNldEVuZCwgcG9zaXRpb24pO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bm9kZU9mZnNldFN0YXJ0ID0gbm9kZU9mZnNldEVuZDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH0gZWxzZSBpZiAobm9kZS5raW5kID09PSBBc3ROb2RlS2luZC5VbmV4cGVjdGVkQ2xvc2luZ0JyYWNrZXQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fSBlbHNlIGlmIChub2RlLmtpbmQgPT09IEFzdE5vZGVLaW5kLkJyYWNrZXQpIHtcblx0XHRjb25zdCByYW5nZSA9IGxlbmd0aHNUb1JhbmdlKG5vZGVPZmZzZXRTdGFydCwgbm9kZU9mZnNldEVuZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJyYWNrZXRJbmZvOiBub2RlLmJyYWNrZXRJbmZvLFxuXHRcdFx0cmFuZ2Vcblx0XHR9O1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0QnJhY2tldHMoXG5cdG5vZGU6IEFzdE5vZGUsXG5cdG5vZGVPZmZzZXRTdGFydDogTGVuZ3RoLFxuXHRub2RlT2Zmc2V0RW5kOiBMZW5ndGgsXG5cdHN0YXJ0T2Zmc2V0OiBMZW5ndGgsXG5cdGVuZE9mZnNldDogTGVuZ3RoLFxuXHRwdXNoOiAoaXRlbTogQnJhY2tldEluZm8pID0+IGJvb2xlYW4sXG5cdGxldmVsOiBudW1iZXIsXG5cdG5lc3RpbmdMZXZlbE9mRXF1YWxCcmFja2V0VHlwZTogbnVtYmVyLFxuXHRsZXZlbFBlckJyYWNrZXRUeXBlOiBNYXA8c3RyaW5nLCBudW1iZXI+LFxuXHRvbmx5Q29sb3JpemVkQnJhY2tldHM6IGJvb2xlYW4sXG5cdHBhcmVudFBhaXJJc0luY29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZSxcbik6IGJvb2xlYW4ge1xuXHRpZiAobGV2ZWwgPiAyMDApIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHdoaWxlTG9vcDpcblx0d2hpbGUgKHRydWUpIHtcblx0XHRzd2l0Y2ggKG5vZGUua2luZCkge1xuXHRcdFx0Y2FzZSBBc3ROb2RlS2luZC5MaXN0OiB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkQ291bnQgPSBub2RlLmNoaWxkcmVuTGVuZ3RoO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkQ291bnQ7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkID0gbm9kZS5nZXRDaGlsZChpKTtcblx0XHRcdFx0XHRpZiAoIWNoaWxkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bm9kZU9mZnNldEVuZCA9IGxlbmd0aEFkZChub2RlT2Zmc2V0U3RhcnQsIGNoaWxkLmxlbmd0aCk7XG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0bGVuZ3RoTGVzc1RoYW5FcXVhbChub2RlT2Zmc2V0U3RhcnQsIGVuZE9mZnNldCkgJiZcblx0XHRcdFx0XHRcdGxlbmd0aEdyZWF0ZXJUaGFuRXF1YWwobm9kZU9mZnNldEVuZCwgc3RhcnRPZmZzZXQpXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGlsZEVuZHNBZnRlckVuZCA9IGxlbmd0aEdyZWF0ZXJUaGFuRXF1YWwobm9kZU9mZnNldEVuZCwgZW5kT2Zmc2V0KTtcblx0XHRcdFx0XHRcdGlmIChjaGlsZEVuZHNBZnRlckVuZCkge1xuXHRcdFx0XHRcdFx0XHQvLyBObyBjaGlsZCBhZnRlciB0aGlzIGNoaWxkIGluIHRoZSByZXF1ZXN0ZWQgd2luZG93LCBkb24ndCByZWN1cnNlXG5cdFx0XHRcdFx0XHRcdG5vZGUgPSBjaGlsZDtcblx0XHRcdFx0XHRcdFx0Y29udGludWUgd2hpbGVMb29wO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBzaG91bGRDb250aW51ZSA9IGNvbGxlY3RCcmFja2V0cyhjaGlsZCwgbm9kZU9mZnNldFN0YXJ0LCBub2RlT2Zmc2V0RW5kLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCBwdXNoLCBsZXZlbCwgMCwgbGV2ZWxQZXJCcmFja2V0VHlwZSwgb25seUNvbG9yaXplZEJyYWNrZXRzKTtcblx0XHRcdFx0XHRcdGlmICghc2hvdWxkQ29udGludWUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRub2RlT2Zmc2V0U3RhcnQgPSBub2RlT2Zmc2V0RW5kO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBc3ROb2RlS2luZC5QYWlyOiB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yaXplID0gIW9ubHlDb2xvcml6ZWRCcmFja2V0cyB8fCAhbm9kZS5jbG9zaW5nQnJhY2tldCB8fCAobm9kZS5jbG9zaW5nQnJhY2tldC5icmFja2V0SW5mbyBhcyBDbG9zaW5nQnJhY2tldEtpbmQpLmNsb3Nlc0NvbG9yaXplZChub2RlLm9wZW5pbmdCcmFja2V0LmJyYWNrZXRJbmZvIGFzIE9wZW5pbmdCcmFja2V0S2luZCk7XG5cblx0XHRcdFx0bGV0IGxldmVsUGVyQnJhY2tldCA9IDA7XG5cdFx0XHRcdGlmIChsZXZlbFBlckJyYWNrZXRUeXBlKSB7XG5cdFx0XHRcdFx0bGV0IGV4aXN0aW5nID0gbGV2ZWxQZXJCcmFja2V0VHlwZS5nZXQobm9kZS5vcGVuaW5nQnJhY2tldC50ZXh0KTtcblx0XHRcdFx0XHRpZiAoZXhpc3RpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZXhpc3RpbmcgPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXZlbFBlckJyYWNrZXQgPSBleGlzdGluZztcblx0XHRcdFx0XHRpZiAoY29sb3JpemUpIHtcblx0XHRcdFx0XHRcdGV4aXN0aW5nKys7XG5cdFx0XHRcdFx0XHRsZXZlbFBlckJyYWNrZXRUeXBlLnNldChub2RlLm9wZW5pbmdCcmFja2V0LnRleHQsIGV4aXN0aW5nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjaGlsZENvdW50ID0gbm9kZS5jaGlsZHJlbkxlbmd0aDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZENvdW50OyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZCA9IG5vZGUuZ2V0Q2hpbGQoaSk7XG5cdFx0XHRcdFx0aWYgKCFjaGlsZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG5vZGVPZmZzZXRFbmQgPSBsZW5ndGhBZGQobm9kZU9mZnNldFN0YXJ0LCBjaGlsZC5sZW5ndGgpO1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdGxlbmd0aExlc3NUaGFuRXF1YWwobm9kZU9mZnNldFN0YXJ0LCBlbmRPZmZzZXQpICYmXG5cdFx0XHRcdFx0XHRsZW5ndGhHcmVhdGVyVGhhbkVxdWFsKG5vZGVPZmZzZXRFbmQsIHN0YXJ0T2Zmc2V0KVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hpbGRFbmRzQWZ0ZXJFbmQgPSBsZW5ndGhHcmVhdGVyVGhhbkVxdWFsKG5vZGVPZmZzZXRFbmQsIGVuZE9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGRFbmRzQWZ0ZXJFbmQgJiYgY2hpbGQua2luZCAhPT0gQXN0Tm9kZUtpbmQuQnJhY2tldCkge1xuXHRcdFx0XHRcdFx0XHQvLyBObyBjaGlsZCBhZnRlciB0aGlzIGNoaWxkIGluIHRoZSByZXF1ZXN0ZWQgd2luZG93LCBkb24ndCByZWN1cnNlXG5cdFx0XHRcdFx0XHRcdC8vIERvbid0IGRvIHRoaXMgZm9yIGJyYWNrZXRzIGJlY2F1c2Ugb2YgdW5jbG9zZWQvdW5vcGVuZWQgYnJhY2tldHNcblx0XHRcdFx0XHRcdFx0bm9kZSA9IGNoaWxkO1xuXHRcdFx0XHRcdFx0XHRpZiAoY29sb3JpemUpIHtcblx0XHRcdFx0XHRcdFx0XHRsZXZlbCsrO1xuXHRcdFx0XHRcdFx0XHRcdG5lc3RpbmdMZXZlbE9mRXF1YWxCcmFja2V0VHlwZSA9IGxldmVsUGVyQnJhY2tldCArIDE7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0bmVzdGluZ0xldmVsT2ZFcXVhbEJyYWNrZXRUeXBlID0gbGV2ZWxQZXJCcmFja2V0O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlIHdoaWxlTG9vcDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGNvbG9yaXplIHx8IGNoaWxkLmtpbmQgIT09IEFzdE5vZGVLaW5kLkJyYWNrZXQgfHwgIW5vZGUuY2xvc2luZ0JyYWNrZXQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2hvdWxkQ29udGludWUgPSBjb2xsZWN0QnJhY2tldHMoXG5cdFx0XHRcdFx0XHRcdFx0Y2hpbGQsXG5cdFx0XHRcdFx0XHRcdFx0bm9kZU9mZnNldFN0YXJ0LFxuXHRcdFx0XHRcdFx0XHRcdG5vZGVPZmZzZXRFbmQsXG5cdFx0XHRcdFx0XHRcdFx0c3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0XHRcdFx0ZW5kT2Zmc2V0LFxuXHRcdFx0XHRcdFx0XHRcdHB1c2gsXG5cdFx0XHRcdFx0XHRcdFx0Y29sb3JpemUgPyBsZXZlbCArIDEgOiBsZXZlbCxcblx0XHRcdFx0XHRcdFx0XHRjb2xvcml6ZSA/IGxldmVsUGVyQnJhY2tldCArIDEgOiBsZXZlbFBlckJyYWNrZXQsXG5cdFx0XHRcdFx0XHRcdFx0bGV2ZWxQZXJCcmFja2V0VHlwZSxcblx0XHRcdFx0XHRcdFx0XHRvbmx5Q29sb3JpemVkQnJhY2tldHMsXG5cdFx0XHRcdFx0XHRcdFx0IW5vZGUuY2xvc2luZ0JyYWNrZXQsXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdGlmICghc2hvdWxkQ29udGludWUpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bm9kZU9mZnNldFN0YXJ0ID0gbm9kZU9mZnNldEVuZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldmVsUGVyQnJhY2tldFR5cGU/LnNldChub2RlLm9wZW5pbmdCcmFja2V0LnRleHQsIGxldmVsUGVyQnJhY2tldCk7XG5cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFzdE5vZGVLaW5kLlVuZXhwZWN0ZWRDbG9zaW5nQnJhY2tldDoge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGxlbmd0aHNUb1JhbmdlKG5vZGVPZmZzZXRTdGFydCwgbm9kZU9mZnNldEVuZCk7XG5cdFx0XHRcdHJldHVybiBwdXNoKG5ldyBCcmFja2V0SW5mbyhyYW5nZSwgbGV2ZWwgLSAxLCAwLCB0cnVlKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFzdE5vZGVLaW5kLkJyYWNrZXQ6IHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBsZW5ndGhzVG9SYW5nZShub2RlT2Zmc2V0U3RhcnQsIG5vZGVPZmZzZXRFbmQpO1xuXHRcdFx0XHRyZXR1cm4gcHVzaChuZXcgQnJhY2tldEluZm8ocmFuZ2UsIGxldmVsIC0gMSwgbmVzdGluZ0xldmVsT2ZFcXVhbEJyYWNrZXRUeXBlIC0gMSwgcGFyZW50UGFpcklzSW5jb21wbGV0ZSkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBc3ROb2RlS2luZC5UZXh0OlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ29sbGVjdEJyYWNrZXRQYWlyc0NvbnRleHQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHVzaDogKGl0ZW06IEJyYWNrZXRQYWlyV2l0aE1pbkluZGVudGF0aW9uSW5mbykgPT4gYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5jbHVkZU1pbkluZGVudGF0aW9uOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdCkge1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3RCcmFja2V0UGFpcnMoXG5cdG5vZGU6IEFzdE5vZGUsXG5cdG5vZGVPZmZzZXRTdGFydDogTGVuZ3RoLFxuXHRub2RlT2Zmc2V0RW5kOiBMZW5ndGgsXG5cdHN0YXJ0T2Zmc2V0OiBMZW5ndGgsXG5cdGVuZE9mZnNldDogTGVuZ3RoLFxuXHRjb250ZXh0OiBDb2xsZWN0QnJhY2tldFBhaXJzQ29udGV4dCxcblx0bGV2ZWw6IG51bWJlcixcblx0bGV2ZWxQZXJCcmFja2V0VHlwZTogTWFwPHN0cmluZywgbnVtYmVyPlxuKTogYm9vbGVhbiB7XG5cdGlmIChsZXZlbCA+IDIwMCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0bGV0IHNob3VsZENvbnRpbnVlID0gdHJ1ZTtcblxuXHRpZiAobm9kZS5raW5kID09PSBBc3ROb2RlS2luZC5QYWlyKSB7XG5cdFx0bGV0IGxldmVsUGVyQnJhY2tldCA9IDA7XG5cdFx0aWYgKGxldmVsUGVyQnJhY2tldFR5cGUpIHtcblx0XHRcdGxldCBleGlzdGluZyA9IGxldmVsUGVyQnJhY2tldFR5cGUuZ2V0KG5vZGUub3BlbmluZ0JyYWNrZXQudGV4dCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRleGlzdGluZyA9IDA7XG5cdFx0XHR9XG5cdFx0XHRsZXZlbFBlckJyYWNrZXQgPSBleGlzdGluZztcblx0XHRcdGV4aXN0aW5nKys7XG5cdFx0XHRsZXZlbFBlckJyYWNrZXRUeXBlLnNldChub2RlLm9wZW5pbmdCcmFja2V0LnRleHQsIGV4aXN0aW5nKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVuaW5nQnJhY2tldEVuZCA9IGxlbmd0aEFkZChub2RlT2Zmc2V0U3RhcnQsIG5vZGUub3BlbmluZ0JyYWNrZXQubGVuZ3RoKTtcblx0XHRsZXQgbWluSW5kZW50YXRpb24gPSAtMTtcblx0XHRpZiAoY29udGV4dC5pbmNsdWRlTWluSW5kZW50YXRpb24pIHtcblx0XHRcdG1pbkluZGVudGF0aW9uID0gbm9kZS5jb21wdXRlTWluSW5kZW50YXRpb24oXG5cdFx0XHRcdG5vZGVPZmZzZXRTdGFydCxcblx0XHRcdFx0Y29udGV4dC50ZXh0TW9kZWxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0c2hvdWxkQ29udGludWUgPSBjb250ZXh0LnB1c2goXG5cdFx0XHRuZXcgQnJhY2tldFBhaXJXaXRoTWluSW5kZW50YXRpb25JbmZvKFxuXHRcdFx0XHRsZW5ndGhzVG9SYW5nZShub2RlT2Zmc2V0U3RhcnQsIG5vZGVPZmZzZXRFbmQpLFxuXHRcdFx0XHRsZW5ndGhzVG9SYW5nZShub2RlT2Zmc2V0U3RhcnQsIG9wZW5pbmdCcmFja2V0RW5kKSxcblx0XHRcdFx0bm9kZS5jbG9zaW5nQnJhY2tldFxuXHRcdFx0XHRcdD8gbGVuZ3Roc1RvUmFuZ2UoXG5cdFx0XHRcdFx0XHRsZW5ndGhBZGQob3BlbmluZ0JyYWNrZXRFbmQsIG5vZGUuY2hpbGQ/Lmxlbmd0aCB8fCBsZW5ndGhaZXJvKSxcblx0XHRcdFx0XHRcdG5vZGVPZmZzZXRFbmRcblx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdGxldmVsLFxuXHRcdFx0XHRsZXZlbFBlckJyYWNrZXQsXG5cdFx0XHRcdG5vZGUsXG5cdFx0XHRcdG1pbkluZGVudGF0aW9uXG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdG5vZGVPZmZzZXRTdGFydCA9IG9wZW5pbmdCcmFja2V0RW5kO1xuXHRcdGlmIChzaG91bGRDb250aW51ZSAmJiBub2RlLmNoaWxkKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IG5vZGUuY2hpbGQ7XG5cdFx0XHRub2RlT2Zmc2V0RW5kID0gbGVuZ3RoQWRkKG5vZGVPZmZzZXRTdGFydCwgY2hpbGQubGVuZ3RoKTtcblx0XHRcdGlmIChcblx0XHRcdFx0bGVuZ3RoTGVzc1RoYW5FcXVhbChub2RlT2Zmc2V0U3RhcnQsIGVuZE9mZnNldCkgJiZcblx0XHRcdFx0bGVuZ3RoR3JlYXRlclRoYW5FcXVhbChub2RlT2Zmc2V0RW5kLCBzdGFydE9mZnNldClcblx0XHRcdCkge1xuXHRcdFx0XHRzaG91bGRDb250aW51ZSA9IGNvbGxlY3RCcmFja2V0UGFpcnMoXG5cdFx0XHRcdFx0Y2hpbGQsXG5cdFx0XHRcdFx0bm9kZU9mZnNldFN0YXJ0LFxuXHRcdFx0XHRcdG5vZGVPZmZzZXRFbmQsXG5cdFx0XHRcdFx0c3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0ZW5kT2Zmc2V0LFxuXHRcdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdFx0bGV2ZWwgKyAxLFxuXHRcdFx0XHRcdGxldmVsUGVyQnJhY2tldFR5cGVcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCFzaG91bGRDb250aW51ZSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldmVsUGVyQnJhY2tldFR5cGU/LnNldChub2RlLm9wZW5pbmdCcmFja2V0LnRleHQsIGxldmVsUGVyQnJhY2tldCk7XG5cdH0gZWxzZSB7XG5cdFx0bGV0IGN1ck9mZnNldCA9IG5vZGVPZmZzZXRTdGFydDtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IGNoaWxkT2Zmc2V0ID0gY3VyT2Zmc2V0O1xuXHRcdFx0Y3VyT2Zmc2V0ID0gbGVuZ3RoQWRkKGN1ck9mZnNldCwgY2hpbGQubGVuZ3RoKTtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRsZW5ndGhMZXNzVGhhbkVxdWFsKGNoaWxkT2Zmc2V0LCBlbmRPZmZzZXQpICYmXG5cdFx0XHRcdGxlbmd0aExlc3NUaGFuRXF1YWwoc3RhcnRPZmZzZXQsIGN1ck9mZnNldClcblx0XHRcdCkge1xuXHRcdFx0XHRzaG91bGRDb250aW51ZSA9IGNvbGxlY3RCcmFja2V0UGFpcnMoXG5cdFx0XHRcdFx0Y2hpbGQsXG5cdFx0XHRcdFx0Y2hpbGRPZmZzZXQsXG5cdFx0XHRcdFx0Y3VyT2Zmc2V0LFxuXHRcdFx0XHRcdHN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRcdGVuZE9mZnNldCxcblx0XHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRcdGxldmVsLFxuXHRcdFx0XHRcdGxldmVsUGVyQnJhY2tldFR5cGVcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCFzaG91bGRDb250aW51ZSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gc2hvdWxkQ29udGludWU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxhQUFhLHlDQUF3RDtBQUk5RSxTQUFrQixtQkFBbUI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBaUIsV0FBVyx3QkFBd0IsZ0JBQWdCLHFCQUFxQixnQkFBZ0IsWUFBWSxrQkFBa0IsZ0JBQWdCO0FBQ3ZKLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZSwyQkFBMkI7QUFDbkQsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFHOUIsTUFBTSx5QkFBeUIsV0FBVztBQUFBLEVBMEJ6QyxZQUNXLFdBQ0EsMEJBQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFHakIsU0FBSyxtQkFBbUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzFELFNBQUssbUJBQW1CLElBQUksaUJBQXlCO0FBQ3JELFNBQUssV0FBVyxJQUFJLDhCQUE4QixLQUFLLGtCQUFrQixLQUFLLHdCQUF3QjtBQUN0RyxTQUFLLGNBQWMsS0FBSyxpQkFBaUI7QUFDekMsU0FBSyw0Q0FBNEMsQ0FBQztBQUNsRCxTQUFLLGtCQUFrQixDQUFDO0FBRXhCLFFBQUksQ0FBQyxVQUFVLGFBQWEsV0FBVztBQUN0QyxZQUFNLFdBQVcsS0FBSyxTQUFTLCtCQUErQixLQUFLLFVBQVUsY0FBYyxDQUFDO0FBQzVGLFlBQU0sWUFBWSxJQUFJLGNBQWMsS0FBSyxVQUFVLFNBQVMsR0FBRyxRQUFRO0FBQ3ZFLFdBQUssMEJBQTBCLGNBQWMsV0FBVyxDQUFDLEdBQUcsUUFBVyxJQUFJO0FBQzNFLFdBQUssZ0JBQWdCLEtBQUs7QUFBQSxJQUMzQixXQUFX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QUMvRSxRQUFJLGlCQUFpQjtBQUNyQixRQUFJLFFBQVEsdUJBQXVCO0FBQ2xDLHVCQUFpQixLQUFLO0FBQUEsUUFDckI7QUFBQSxRQUNBLFFBQVE7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLHFCQUFpQixRQUFRO0FBQUEsTUFDeEIsSUFBSTtBQUFBLFFBQ0gsZUFBZSxpQkFBaUIsYUFBYTtBQUFBLFFBQzdDLGVBQWUsaUJBQWlCLGlCQUFpQjtBQUFBLFFBQ2pELEtBQUssaUJBQ0Y7QUFBQSxVQUNELFVBQVUsbUJBQW1CLEtBQUssT0FBTyxVQUFVLFVBQVU7QUFBQSxVQUM3RDtBQUFBLFFBQ0QsSUFDRTtBQUFBLFFBQ0g7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLHNCQUFrQjtBQUNsQixRQUFJLGtCQUFrQixLQUFLLE9BQU87QUFDakMsWUFBTSxRQUFRLEtBQUs7QUFDbkIsc0JBQWdCLFVBQVUsaUJBQWlCLE1BQU0sTUFBTTtBQUN2RCxVQUNDLG9CQUFvQixpQkFBaUIsU0FBUyxLQUM5Qyx1QkFBdUIsZUFBZSxXQUFXLEdBQ2hEO0FBQ0QseUJBQWlCO0FBQUEsVUFDaEI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0EsUUFBUTtBQUFBLFVBQ1I7QUFBQSxRQUNEO0FBQ0EsWUFBSSxDQUFDLGdCQUFnQjtBQUNwQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLHlCQUFxQixJQUFJLEtBQUssZUFBZSxNQUFNLGVBQWU7QUFBQSxFQUNuRSxPQUFPO0FBQ04sUUFBSSxZQUFZO0FBQ2hCLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDbEMsWUFBTSxjQUFjO0FBQ3BCLGtCQUFZLFVBQVUsV0FBVyxNQUFNLE1BQU07QUFFN0MsVUFDQyxvQkFBb0IsYUFBYSxTQUFTLEtBQzFDLG9CQUFvQixhQUFhLFNBQVMsR0FDekM7QUFDRCx5QkFBaUI7QUFBQSxVQUNoQjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQ0EsWUFBSSxDQUFDLGdCQUFnQjtBQUNwQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIm5vZGVPZmZzZXRTdGFydCIsICJub2RlT2Zmc2V0RW5kIl0KfQo=
