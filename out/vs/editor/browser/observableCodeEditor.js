import { equalsIfDefinedC, arrayEqualsC } from "../../base/common/equals.js";
import { Disposable, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { DebugLocation, TransactionImpl, autorun, autorunOpts, derived, derivedOpts, derivedWithSetter, observableFromEvent, observableFromEventOpts, observableSignal, observableSignalFromEvent, observableValue, observableValueOpts } from "../../base/common/observable.js";
import { EditorOption } from "../common/config/editorOptions.js";
import { LineRange } from "../common/core/ranges/lineRange.js";
import { OffsetRange } from "../common/core/ranges/offsetRange.js";
import { Position } from "../common/core/position.js";
import { Selection } from "../common/core/selection.js";
import { ContentWidgetPositionPreference } from "./editorBrowser.js";
import { Point } from "../common/core/2d/point.js";
function observableCodeEditor(editor) {
  return ObservableCodeEditor.get(editor);
}
const _ObservableCodeEditor = class _ObservableCodeEditor extends Disposable {
  constructor(editor) {
    super();
    this.editor = editor;
    /**
     * Tracks whether getWidthOfLine returned 0, indicating the editor may be hidden.
     * When resize happens and this flag is set, we reset cached line widths.
     */
    this._sawZeroLineWidth = false;
    /**
     * Fires when the editor container resizes.
     * This is lazily created only when someone subscribes to it.
     * Useful for detecting when a parent element's display changes from 'none' to 'block'.
     */
    this._onDidContainerResize = observableFromEventOpts(
      { owner: this, getTransaction: () => this._currentTransaction },
      (e) => {
        const container = this.editor.getContainerDomNode();
        const resizeObserver = new ResizeObserver(() => {
          if (this._sawZeroLineWidth) {
            this._sawZeroLineWidth = false;
            this.editor.resetLineWidthCaches();
          }
          e(void 0);
        });
        resizeObserver.observe(container);
        return { dispose: () => resizeObserver.disconnect() };
      },
      () => ({})
      // Return new object each time to ensure change detection
    );
    this._updateCounter = 0;
    this._currentTransaction = void 0;
    this._model = observableValue(this, this.editor.getModel());
    this.model = this._model;
    this.isReadonly = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.readOnly));
    this._versionId = observableValueOpts({ owner: this, lazy: true }, this.editor.getModel()?.getVersionId() ?? null);
    this.versionId = this._versionId;
    this._selections = observableValueOpts(
      { owner: this, equalsFn: equalsIfDefinedC(arrayEqualsC(Selection.selectionsEqual)), lazy: true },
      this.editor.getSelections() ?? null
    );
    this.selections = this._selections;
    this.positions = derivedOpts(
      { owner: this, equalsFn: equalsIfDefinedC(arrayEqualsC(Position.equals)) },
      (reader) => this.selections.read(reader)?.map((s) => s.getStartPosition()) ?? null
    );
    this.isFocused = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, (e) => {
      const d1 = this.editor.onDidFocusEditorWidget(e);
      const d2 = this.editor.onDidBlurEditorWidget(e);
      return {
        dispose() {
          d1.dispose();
          d2.dispose();
        }
      };
    }, () => this.editor.hasWidgetFocus());
    this.isTextFocused = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, (e) => {
      const d1 = this.editor.onDidFocusEditorText(e);
      const d2 = this.editor.onDidBlurEditorText(e);
      return {
        dispose() {
          d1.dispose();
          d2.dispose();
        }
      };
    }, () => this.editor.hasTextFocus());
    this.inComposition = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, (e) => {
      const d1 = this.editor.onDidCompositionStart(() => {
        e(void 0);
      });
      const d2 = this.editor.onDidCompositionEnd(() => {
        e(void 0);
      });
      return {
        dispose() {
          d1.dispose();
          d2.dispose();
        }
      };
    }, () => this.editor.inComposition);
    this.value = derivedWithSetter(
      this,
      (reader) => {
        this.versionId.read(reader);
        return this.model.read(reader)?.getValue() ?? "";
      },
      (value, tx) => {
        const model = this.model.get();
        if (model !== null) {
          if (value !== model.getValue()) {
            model.setValue(value);
          }
        }
      }
    );
    this.valueIsEmpty = derived(this, (reader) => {
      this.versionId.read(reader);
      return this.editor.getModel()?.getValueLength() === 0;
    });
    this.cursorSelection = derivedOpts({ owner: this, equalsFn: equalsIfDefinedC(Selection.selectionsEqual) }, (reader) => this.selections.read(reader)?.[0] ?? null);
    this.cursorPosition = derivedOpts({ owner: this, equalsFn: Position.equals }, (reader) => this.selections.read(reader)?.[0]?.getPosition() ?? null);
    this.cursorLineNumber = derived(this, (reader) => this.cursorPosition.read(reader)?.lineNumber ?? null);
    this.onDidType = observableSignal(this);
    this.onDidPaste = observableSignal(this);
    this.scrollTop = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, this.editor.onDidScrollChange, () => this.editor.getScrollTop());
    this.scrollLeft = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, this.editor.onDidScrollChange, () => this.editor.getScrollLeft());
    this.layoutInfo = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, this.editor.onDidLayoutChange, () => this.editor.getLayoutInfo());
    this.layoutInfoContentLeft = this.layoutInfo.map((l) => l.contentLeft);
    this.layoutInfoDecorationsLeft = this.layoutInfo.map((l) => l.decorationsLeft);
    this.layoutInfoWidth = this.layoutInfo.map((l) => l.width);
    this.layoutInfoHeight = this.layoutInfo.map((l) => l.height);
    this.layoutInfoMinimap = this.layoutInfo.map((l) => l.minimap);
    this.layoutInfoVerticalScrollbarWidth = this.layoutInfo.map((l) => l.verticalScrollbarWidth);
    this.contentWidth = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, this.editor.onDidContentSizeChange, () => this.editor.getContentWidth());
    this.contentHeight = observableFromEventOpts({ owner: this, getTransaction: () => this._currentTransaction }, this.editor.onDidContentSizeChange, () => this.editor.getContentHeight());
    this._onDidChangeViewZones = observableSignalFromEvent(this, this.editor.onDidChangeViewZones);
    this._onDidHiddenAreasChanged = observableSignalFromEvent(this, this.editor.onDidChangeHiddenAreas);
    this._onDidLineHeightChanged = observableSignalFromEvent(this, this.editor.onDidChangeLineHeight);
    this._widgetCounter = 0;
    this.openedPeekWidgets = observableValue(this, 0);
    this._register(this.editor.onBeginUpdate(() => this._beginUpdate()));
    this._register(this.editor.onEndUpdate(() => this._endUpdate()));
    this._register(this.editor.onDidChangeModel(() => {
      this._beginUpdate();
      try {
        this._model.set(this.editor.getModel(), this._currentTransaction);
        this._forceUpdate();
      } finally {
        this._endUpdate();
      }
    }));
    this._register(this.editor.onDidType((e) => {
      this._beginUpdate();
      try {
        this._forceUpdate();
        this.onDidType.trigger(this._currentTransaction, e);
      } finally {
        this._endUpdate();
      }
    }));
    this._register(this.editor.onDidPaste((e) => {
      this._beginUpdate();
      try {
        this._forceUpdate();
        this.onDidPaste.trigger(this._currentTransaction, e);
      } finally {
        this._endUpdate();
      }
    }));
    this._register(this.editor.onDidChangeModelContent((e) => {
      this._beginUpdate();
      try {
        this._versionId.set(this.editor.getModel()?.getVersionId() ?? null, this._currentTransaction, e);
        this._forceUpdate();
      } finally {
        this._endUpdate();
      }
    }));
    this._register(this.editor.onDidChangeCursorSelection((e) => {
      this._beginUpdate();
      try {
        this._selections.set(this.editor.getSelections(), this._currentTransaction, e);
        this._forceUpdate();
      } finally {
        this._endUpdate();
      }
    }));
    this.domNode = derived((reader) => {
      this.model.read(reader);
      return this.editor.getDomNode();
    });
  }
  /**
   * Make sure that editor is not disposed yet!
  */
  static get(editor) {
    let result = _ObservableCodeEditor._map.get(editor);
    if (!result) {
      result = new _ObservableCodeEditor(editor);
      _ObservableCodeEditor._map.set(editor, result);
      const d = editor.onDidDispose(() => {
        const item = _ObservableCodeEditor._map.get(editor);
        if (item) {
          _ObservableCodeEditor._map.delete(editor);
          item.dispose();
          d.dispose();
        }
      });
    }
    return result;
  }
  _beginUpdate() {
    this._updateCounter++;
    if (this._updateCounter === 1) {
      this._currentTransaction = new TransactionImpl(() => {
      });
    }
  }
  _endUpdate() {
    this._updateCounter--;
    if (this._updateCounter === 0) {
      const t = this._currentTransaction;
      this._currentTransaction = void 0;
      t.finish();
    }
  }
  /**
   * Batches the transactions started by observableFromEvent.
   *
   * If the callback causes the editor to fire an event that updates
   * an observable value backed by observableFromEvent (such as scrollTop etc.),
   * then all such updates will be part of the same transaction.
  */
  transaction(cb) {
    this._beginUpdate();
    try {
      return cb(this._currentTransaction);
    } finally {
      this._endUpdate();
    }
  }
  forceUpdate(cb) {
    this._beginUpdate();
    try {
      this._forceUpdate();
      if (!cb) {
        return void 0;
      }
      return cb(this._currentTransaction);
    } finally {
      this._endUpdate();
    }
  }
  _forceUpdate() {
    this._beginUpdate();
    try {
      this._model.set(this.editor.getModel(), this._currentTransaction);
      this._versionId.set(this.editor.getModel()?.getVersionId() ?? null, this._currentTransaction, void 0);
      this._selections.set(this.editor.getSelections(), this._currentTransaction, void 0);
    } finally {
      this._endUpdate();
    }
  }
  getOption(id, debugLocation = DebugLocation.ofCaller()) {
    return observableFromEvent(this, (cb) => this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(id)) {
        cb(void 0);
      }
    }), () => this.editor.getOption(id), debugLocation);
  }
  setDecorations(decorations) {
    const d = new DisposableStore();
    const decorationsCollection = this.editor.createDecorationsCollection();
    d.add(autorunOpts({ owner: this, debugName: () => `Apply decorations from ${decorations.debugName}` }, (reader) => {
      const d2 = decorations.read(reader);
      decorationsCollection.set(d2);
    }));
    d.add({
      dispose: () => {
        decorationsCollection.clear();
      }
    });
    return d;
  }
  createOverlayWidget(widget) {
    const overlayWidgetId = "observableOverlayWidget" + this._widgetCounter++;
    const w = {
      getDomNode: () => widget.domNode,
      getPosition: () => widget.position.get(),
      getId: () => overlayWidgetId,
      allowEditorOverflow: widget.allowEditorOverflow,
      getMinContentWidthInPx: () => widget.minContentWidthInPx.get()
    };
    this.editor.addOverlayWidget(w);
    const d = autorun((reader) => {
      widget.position.read(reader);
      widget.minContentWidthInPx.read(reader);
      this.editor.layoutOverlayWidget(w);
    });
    return toDisposable(() => {
      d.dispose();
      this.editor.removeOverlayWidget(w);
    });
  }
  createContentWidget(widget) {
    const contentWidgetId = "observableContentWidget" + this._widgetCounter++;
    const w = {
      getDomNode: () => widget.domNode,
      getPosition: () => widget.position.get(),
      getId: () => contentWidgetId,
      allowEditorOverflow: widget.allowEditorOverflow
    };
    this.editor.addContentWidget(w);
    const d = autorun((reader) => {
      widget.position.read(reader);
      this.editor.layoutContentWidget(w);
    });
    return toDisposable(() => {
      d.dispose();
      this.editor.removeContentWidget(w);
    });
  }
  observeLineOffsetRange(lineRange, store) {
    const start = this.observePosition(lineRange.map((r) => new Position(r.startLineNumber, 1)), store);
    const end = this.observePosition(lineRange.map((r) => new Position(r.endLineNumberExclusive + 1, 1)), store);
    return derived((reader) => {
      start.read(reader);
      end.read(reader);
      const range = lineRange.read(reader);
      const lineCount = this.model.read(reader)?.getLineCount();
      const s = (typeof lineCount !== "undefined" && range.startLineNumber > lineCount ? this.editor.getBottomForLineNumber(lineCount) : this.editor.getTopForLineNumber(range.startLineNumber)) - this.scrollTop.read(reader);
      const e = range.isEmpty ? s : this.editor.getBottomForLineNumber(range.endLineNumberExclusive - 1) - this.scrollTop.read(reader);
      return new OffsetRange(s, e);
    });
  }
  /**
   * Uses an approximation if the exact position cannot be determined.
   */
  getLeftOfPosition(position, reader) {
    this.layoutInfo.read(reader);
    this.value.read(reader);
    let offset = this.editor.getOffsetForColumn(position.lineNumber, position.column);
    if (offset === -1) {
      const typicalHalfwidthCharacterWidth = this.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
      const approximation = position.column * typicalHalfwidthCharacterWidth;
      offset = approximation;
    }
    return offset;
  }
  observePosition(position, store) {
    let pos = position.get();
    const result = observableValueOpts({ owner: this, debugName: () => `topLeftOfPosition${pos?.toString()}`, equalsFn: equalsIfDefinedC(Point.equals) }, new Point(0, 0));
    const contentWidgetId = `observablePositionWidget` + this._widgetCounter++;
    const domNode = document.createElement("div");
    const w = {
      getDomNode: () => domNode,
      getPosition: () => {
        return pos ? { preference: [ContentWidgetPositionPreference.EXACT], position: position.get() } : null;
      },
      getId: () => contentWidgetId,
      allowEditorOverflow: false,
      useDisplayNone: true,
      afterRender: (position2, coordinate) => {
        const model = this._model.get();
        if (model && pos && pos.lineNumber > model.getLineCount()) {
          result.set(new Point(0, this.editor.getBottomForLineNumber(model.getLineCount()) - this.scrollTop.get()), void 0);
        } else {
          result.set(coordinate ? new Point(coordinate.left, coordinate.top) : null, void 0);
        }
      }
    };
    this.editor.addContentWidget(w);
    store.add(autorun((reader) => {
      pos = position.read(reader);
      this.editor.layoutContentWidget(w);
    }));
    store.add(toDisposable(() => {
      this.editor.removeContentWidget(w);
    }));
    return result;
  }
  isTargetHovered(predicate, store) {
    const isHovered = observableValue("isInjectedTextHovered", false);
    store.add(this.editor.onMouseMove((e) => {
      const val = predicate(e);
      isHovered.set(val, void 0);
    }));
    store.add(this.editor.onMouseLeave((E) => {
      isHovered.set(false, void 0);
    }));
    return isHovered;
  }
  observeLineHeightForPosition(position) {
    return derived((reader) => {
      const pos = position instanceof Position ? position : position.read(reader);
      if (pos === null) {
        return null;
      }
      this.getOption(EditorOption.lineHeight).read(reader);
      return this.editor.getLineHeightForPosition(pos);
    });
  }
  observeLineHeightForLine(lineNumber) {
    if (typeof lineNumber === "number") {
      return this.observeLineHeightForPosition(new Position(lineNumber, 1));
    }
    return derived((reader) => {
      const line = lineNumber.read(reader);
      if (line === null) {
        return null;
      }
      return this.observeLineHeightForPosition(new Position(line, 1)).read(reader);
    });
  }
  observeLineHeightsForLineRange(lineNumber) {
    return derived((reader) => {
      const range = lineNumber instanceof LineRange ? lineNumber : lineNumber.read(reader);
      const heights = [];
      for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
        heights.push(this.observeLineHeightForLine(i).read(reader));
      }
      return heights;
    });
  }
  /**
   * Get the width of a line in pixels.
   * Reading the returned value depends on layoutInfo, value, scrollTop, and container resize events.
   * The container resize dependency ensures correct values when the editor becomes visible after being hidden.
   */
  getWidthOfLine(lineNumber, reader) {
    this.layoutInfo.read(reader);
    this.value.read(reader);
    this.scrollTop.read(reader);
    const width = this.editor.getWidthOfLine(lineNumber);
    this._onDidContainerResize.read(reader);
    if (width === 0) {
      this._sawZeroLineWidth = true;
    }
    return width;
  }
  /**
   * Get the vertical position (top offset) for the line's bottom w.r.t. to the first line.
   */
  observeTopForLineNumber(lineNumber) {
    return derived((reader) => {
      this.layoutInfo.read(reader);
      this._onDidChangeViewZones.read(reader);
      this._onDidHiddenAreasChanged.read(reader);
      this._onDidLineHeightChanged.read(reader);
      this._versionId.read(reader);
      return this.editor.getTopForLineNumber(lineNumber);
    });
  }
  /**
   * Get the vertical position (top offset) for the line's bottom w.r.t. to the first line.
   */
  observeBottomForLineNumber(lineNumber) {
    return derived((reader) => {
      this.layoutInfo.read(reader);
      this._onDidChangeViewZones.read(reader);
      this._onDidHiddenAreasChanged.read(reader);
      this._onDidLineHeightChanged.read(reader);
      this._versionId.read(reader);
      return this.editor.getBottomForLineNumber(lineNumber);
    });
  }
};
_ObservableCodeEditor._map = /* @__PURE__ */ new Map();
let ObservableCodeEditor = _ObservableCodeEditor;
export {
  ObservableCodeEditor,
  observableCodeEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXG9ic2VydmFibGVDb2RlRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXF1YWxzSWZEZWZpbmVkQywgYXJyYXlFcXVhbHNDIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0xvY2F0aW9uLCBJT2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJUmVhZGVyLCBJVHJhbnNhY3Rpb24sIFRyYW5zYWN0aW9uSW1wbCwgYXV0b3J1biwgYXV0b3J1bk9wdHMsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBkZXJpdmVkV2l0aFNldHRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMsIG9ic2VydmFibGVTaWduYWwsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBGaW5kQ29tcHV0ZWRFZGl0b3JPcHRpb25WYWx1ZUJ5SWQgfSBmcm9tICcuLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCB9IGZyb20gJy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uLCBJRWRpdG9yTW91c2VFdmVudCwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIElQYXN0ZUV2ZW50IH0gZnJvbSAnLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFBvaW50IH0gZnJvbSAnLi4vY29tbW9uL2NvcmUvMmQvcG9pbnQuanMnO1xuXG4vKipcbiAqIFJldHVybnMgYSBmYWNhZGUgZm9yIHRoZSBjb2RlIGVkaXRvciB0aGF0IHByb3ZpZGVzIG9ic2VydmFibGVzIGZvciB2YXJpb3VzIHN0YXRlcy9ldmVudHMuXG4qL1xuZXhwb3J0IGZ1bmN0aW9uIG9ic2VydmFibGVDb2RlRWRpdG9yKGVkaXRvcjogSUNvZGVFZGl0b3IpOiBPYnNlcnZhYmxlQ29kZUVkaXRvciB7XG5cdHJldHVybiBPYnNlcnZhYmxlQ29kZUVkaXRvci5nZXQoZWRpdG9yKTtcbn1cblxuZXhwb3J0IGNsYXNzIE9ic2VydmFibGVDb2RlRWRpdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9tYXAgPSBuZXcgTWFwPElDb2RlRWRpdG9yLCBPYnNlcnZhYmxlQ29kZUVkaXRvcj4oKTtcblxuXHQvKipcblx0ICogTWFrZSBzdXJlIHRoYXQgZWRpdG9yIGlzIG5vdCBkaXNwb3NlZCB5ZXQhXG5cdCovXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBPYnNlcnZhYmxlQ29kZUVkaXRvciB7XG5cdFx0bGV0IHJlc3VsdCA9IE9ic2VydmFibGVDb2RlRWRpdG9yLl9tYXAuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlc3VsdCA9IG5ldyBPYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpO1xuXHRcdFx0T2JzZXJ2YWJsZUNvZGVFZGl0b3IuX21hcC5zZXQoZWRpdG9yLCByZXN1bHQpO1xuXHRcdFx0Y29uc3QgZCA9IGVkaXRvci5vbkRpZERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gT2JzZXJ2YWJsZUNvZGVFZGl0b3IuX21hcC5nZXQoZWRpdG9yKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRPYnNlcnZhYmxlQ29kZUVkaXRvci5fbWFwLmRlbGV0ZShlZGl0b3IpO1xuXHRcdFx0XHRcdGl0ZW0uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvdW50ZXI7XG5cdHByaXZhdGUgX2N1cnJlbnRUcmFuc2FjdGlvbjogVHJhbnNhY3Rpb25JbXBsIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2JlZ2luVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXIrKztcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnRlciA9PT0gMSkge1xuXHRcdFx0dGhpcy5fY3VycmVudFRyYW5zYWN0aW9uID0gbmV3IFRyYW5zYWN0aW9uSW1wbCgoKSA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIGVkaXRvciBzdGF0ZSAqL1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5kVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXItLTtcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnRlciA9PT0gMCkge1xuXHRcdFx0Y29uc3QgdCA9IHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiE7XG5cdFx0XHR0aGlzLl9jdXJyZW50VHJhbnNhY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0LmZpbmlzaCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXIgPSAwO1xuXHRcdHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tb2RlbCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLmVkaXRvci5nZXRNb2RlbCgpKTtcblx0XHR0aGlzLm1vZGVsID0gdGhpcy5fbW9kZWw7XG5cdFx0dGhpcy5pc1JlYWRvbmx5ID0gb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMoeyBvd25lcjogdGhpcywgZ2V0VHJhbnNhY3Rpb246ICgpID0+IHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiB9LCB0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sICgpID0+IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpKTtcblx0XHR0aGlzLl92ZXJzaW9uSWQgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPG51bWJlciB8IG51bGwsIElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGxhenk6IHRydWUgfSwgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0VmVyc2lvbklkKCkgPz8gbnVsbCk7XG5cdFx0dGhpcy52ZXJzaW9uSWQgPSB0aGlzLl92ZXJzaW9uSWQ7XG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IG9ic2VydmFibGVWYWx1ZU9wdHM8U2VsZWN0aW9uW10gfCBudWxsLCBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkPihcblx0XHRcdHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBlcXVhbHNJZkRlZmluZWRDKGFycmF5RXF1YWxzQyhTZWxlY3Rpb24uc2VsZWN0aW9uc0VxdWFsKSksIGxhenk6IHRydWUgfSxcblx0XHRcdHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbnMoKSA/PyBudWxsXG5cdFx0KTtcblx0XHR0aGlzLnNlbGVjdGlvbnMgPSB0aGlzLl9zZWxlY3Rpb25zO1xuXHRcdHRoaXMucG9zaXRpb25zID0gZGVyaXZlZE9wdHM8cmVhZG9ubHkgUG9zaXRpb25bXSB8IG51bGw+KFxuXHRcdFx0eyBvd25lcjogdGhpcywgZXF1YWxzRm46IGVxdWFsc0lmRGVmaW5lZEMoYXJyYXlFcXVhbHNDKFBvc2l0aW9uLmVxdWFscykpIH0sXG5cdFx0XHRyZWFkZXIgPT4gdGhpcy5zZWxlY3Rpb25zLnJlYWQocmVhZGVyKT8ubWFwKHMgPT4gcy5nZXRTdGFydFBvc2l0aW9uKCkpID8/IG51bGxcblx0XHQpO1xuXHRcdHRoaXMuaXNGb2N1c2VkID0gb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMoeyBvd25lcjogdGhpcywgZ2V0VHJhbnNhY3Rpb246ICgpID0+IHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiB9LCBlID0+IHtcblx0XHRcdGNvbnN0IGQxID0gdGhpcy5lZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldChlKTtcblx0XHRcdGNvbnN0IGQyID0gdGhpcy5lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KGUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRkMS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZDIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0sICgpID0+IHRoaXMuZWRpdG9yLmhhc1dpZGdldEZvY3VzKCkpO1xuXHRcdHRoaXMuaXNUZXh0Rm9jdXNlZCA9IG9ic2VydmFibGVGcm9tRXZlbnRPcHRzKHsgb3duZXI6IHRoaXMsIGdldFRyYW5zYWN0aW9uOiAoKSA9PiB0aGlzLl9jdXJyZW50VHJhbnNhY3Rpb24gfSwgZSA9PiB7XG5cdFx0XHRjb25zdCBkMSA9IHRoaXMuZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0KGUpO1xuXHRcdFx0Y29uc3QgZDIgPSB0aGlzLmVkaXRvci5vbkRpZEJsdXJFZGl0b3JUZXh0KGUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRkMS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZDIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0sICgpID0+IHRoaXMuZWRpdG9yLmhhc1RleHRGb2N1cygpKTtcblx0XHR0aGlzLmluQ29tcG9zaXRpb24gPSBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cyh7IG93bmVyOiB0aGlzLCBnZXRUcmFuc2FjdGlvbjogKCkgPT4gdGhpcy5fY3VycmVudFRyYW5zYWN0aW9uIH0sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZDEgPSB0aGlzLmVkaXRvci5vbkRpZENvbXBvc2l0aW9uU3RhcnQoKCkgPT4ge1xuXHRcdFx0XHRlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGQyID0gdGhpcy5lZGl0b3Iub25EaWRDb21wb3NpdGlvbkVuZCgoKSA9PiB7XG5cdFx0XHRcdGUodW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRkMS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZDIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0sICgpID0+IHRoaXMuZWRpdG9yLmluQ29tcG9zaXRpb24pO1xuXHRcdHRoaXMudmFsdWUgPSBkZXJpdmVkV2l0aFNldHRlcih0aGlzLFxuXHRcdFx0cmVhZGVyID0+IHsgdGhpcy52ZXJzaW9uSWQucmVhZChyZWFkZXIpOyByZXR1cm4gdGhpcy5tb2RlbC5yZWFkKHJlYWRlcik/LmdldFZhbHVlKCkgPz8gJyc7IH0sXG5cdFx0XHQodmFsdWUsIHR4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbC5nZXQoKTtcblx0XHRcdFx0aWYgKG1vZGVsICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlICE9PSBtb2RlbC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHRcdFx0XHRtb2RlbC5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0XHR0aGlzLnZhbHVlSXNFbXB0eSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHsgdGhpcy52ZXJzaW9uSWQucmVhZChyZWFkZXIpOyByZXR1cm4gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0VmFsdWVMZW5ndGgoKSA9PT0gMDsgfSk7XG5cdFx0dGhpcy5jdXJzb3JTZWxlY3Rpb24gPSBkZXJpdmVkT3B0cyh7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogZXF1YWxzSWZEZWZpbmVkQyhTZWxlY3Rpb24uc2VsZWN0aW9uc0VxdWFsKSB9LCByZWFkZXIgPT4gdGhpcy5zZWxlY3Rpb25zLnJlYWQocmVhZGVyKT8uWzBdID8/IG51bGwpO1xuXHRcdHRoaXMuY3Vyc29yUG9zaXRpb24gPSBkZXJpdmVkT3B0cyh7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogUG9zaXRpb24uZXF1YWxzIH0sIHJlYWRlciA9PiB0aGlzLnNlbGVjdGlvbnMucmVhZChyZWFkZXIpPy5bMF0/LmdldFBvc2l0aW9uKCkgPz8gbnVsbCk7XG5cdFx0dGhpcy5jdXJzb3JMaW5lTnVtYmVyID0gZGVyaXZlZDxudW1iZXIgfCBudWxsPih0aGlzLCByZWFkZXIgPT4gdGhpcy5jdXJzb3JQb3NpdGlvbi5yZWFkKHJlYWRlcik/LmxpbmVOdW1iZXIgPz8gbnVsbCk7XG5cdFx0dGhpcy5vbkRpZFR5cGUgPSBvYnNlcnZhYmxlU2lnbmFsPHN0cmluZz4odGhpcyk7XG5cdFx0dGhpcy5vbkRpZFBhc3RlID0gb2JzZXJ2YWJsZVNpZ25hbDxJUGFzdGVFdmVudD4odGhpcyk7XG5cdFx0dGhpcy5zY3JvbGxUb3AgPSBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cyh7IG93bmVyOiB0aGlzLCBnZXRUcmFuc2FjdGlvbjogKCkgPT4gdGhpcy5fY3VycmVudFRyYW5zYWN0aW9uIH0sIHRoaXMuZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlLCAoKSA9PiB0aGlzLmVkaXRvci5nZXRTY3JvbGxUb3AoKSk7XG5cdFx0dGhpcy5zY3JvbGxMZWZ0ID0gb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMoeyBvd25lcjogdGhpcywgZ2V0VHJhbnNhY3Rpb246ICgpID0+IHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiB9LCB0aGlzLmVkaXRvci5vbkRpZFNjcm9sbENoYW5nZSwgKCkgPT4gdGhpcy5lZGl0b3IuZ2V0U2Nyb2xsTGVmdCgpKTtcblx0XHR0aGlzLmxheW91dEluZm8gPSBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cyh7IG93bmVyOiB0aGlzLCBnZXRUcmFuc2FjdGlvbjogKCkgPT4gdGhpcy5fY3VycmVudFRyYW5zYWN0aW9uIH0sIHRoaXMuZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlLCAoKSA9PiB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkpO1xuXHRcdHRoaXMubGF5b3V0SW5mb0NvbnRlbnRMZWZ0ID0gdGhpcy5sYXlvdXRJbmZvLm1hcChsID0+IGwuY29udGVudExlZnQpO1xuXHRcdHRoaXMubGF5b3V0SW5mb0RlY29yYXRpb25zTGVmdCA9IHRoaXMubGF5b3V0SW5mby5tYXAobCA9PiBsLmRlY29yYXRpb25zTGVmdCk7XG5cdFx0dGhpcy5sYXlvdXRJbmZvV2lkdGggPSB0aGlzLmxheW91dEluZm8ubWFwKGwgPT4gbC53aWR0aCk7XG5cdFx0dGhpcy5sYXlvdXRJbmZvSGVpZ2h0ID0gdGhpcy5sYXlvdXRJbmZvLm1hcChsID0+IGwuaGVpZ2h0KTtcblx0XHR0aGlzLmxheW91dEluZm9NaW5pbWFwID0gdGhpcy5sYXlvdXRJbmZvLm1hcChsID0+IGwubWluaW1hcCk7XG5cdFx0dGhpcy5sYXlvdXRJbmZvVmVydGljYWxTY3JvbGxiYXJXaWR0aCA9IHRoaXMubGF5b3V0SW5mby5tYXAobCA9PiBsLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgpO1xuXHRcdHRoaXMuY29udGVudFdpZHRoID0gb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMoeyBvd25lcjogdGhpcywgZ2V0VHJhbnNhY3Rpb246ICgpID0+IHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiB9LCB0aGlzLmVkaXRvci5vbkRpZENvbnRlbnRTaXplQ2hhbmdlLCAoKSA9PiB0aGlzLmVkaXRvci5nZXRDb250ZW50V2lkdGgoKSk7XG5cdFx0dGhpcy5jb250ZW50SGVpZ2h0ID0gb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMoeyBvd25lcjogdGhpcywgZ2V0VHJhbnNhY3Rpb246ICgpID0+IHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiB9LCB0aGlzLmVkaXRvci5vbkRpZENvbnRlbnRTaXplQ2hhbmdlLCAoKSA9PiB0aGlzLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1pvbmVzID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLmVkaXRvci5vbkRpZENoYW5nZVZpZXdab25lcyk7XG5cdFx0dGhpcy5fb25EaWRIaWRkZW5BcmVhc0NoYW5nZWQgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlSGlkZGVuQXJlYXMpO1xuXHRcdHRoaXMuX29uRGlkTGluZUhlaWdodENoYW5nZWQgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTGluZUhlaWdodCk7XG5cblx0XHR0aGlzLl93aWRnZXRDb3VudGVyID0gMDtcblx0XHR0aGlzLm9wZW5lZFBlZWtXaWRnZXRzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25CZWdpblVwZGF0ZSgoKSA9PiB0aGlzLl9iZWdpblVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25FbmRVcGRhdGUoKCkgPT4gdGhpcy5fZW5kVXBkYXRlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYmVnaW5VcGRhdGUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsLnNldCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLCB0aGlzLl9jdXJyZW50VHJhbnNhY3Rpb24pO1xuXHRcdFx0XHR0aGlzLl9mb3JjZVVwZGF0ZSgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5fZW5kVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRUeXBlKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9iZWdpblVwZGF0ZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fZm9yY2VVcGRhdGUoKTtcblx0XHRcdFx0dGhpcy5vbkRpZFR5cGUudHJpZ2dlcih0aGlzLl9jdXJyZW50VHJhbnNhY3Rpb24sIGUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5fZW5kVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRQYXN0ZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fYmVnaW5VcGRhdGUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2ZvcmNlVXBkYXRlKCk7XG5cdFx0XHRcdHRoaXMub25EaWRQYXN0ZS50cmlnZ2VyKHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiwgZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChlID0+IHtcblx0XHRcdHRoaXMuX2JlZ2luVXBkYXRlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl92ZXJzaW9uSWQuc2V0KHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LmdldFZlcnNpb25JZCgpID8/IG51bGwsIHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiwgZSk7XG5cdFx0XHRcdHRoaXMuX2ZvcmNlVXBkYXRlKCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbihlID0+IHtcblx0XHRcdHRoaXMuX2JlZ2luVXBkYXRlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25zLnNldCh0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKCksIHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiwgZSk7XG5cdFx0XHRcdHRoaXMuX2ZvcmNlVXBkYXRlKCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQmF0Y2hlcyB0aGUgdHJhbnNhY3Rpb25zIHN0YXJ0ZWQgYnkgb2JzZXJ2YWJsZUZyb21FdmVudC5cblx0ICpcblx0ICogSWYgdGhlIGNhbGxiYWNrIGNhdXNlcyB0aGUgZWRpdG9yIHRvIGZpcmUgYW4gZXZlbnQgdGhhdCB1cGRhdGVzXG5cdCAqIGFuIG9ic2VydmFibGUgdmFsdWUgYmFja2VkIGJ5IG9ic2VydmFibGVGcm9tRXZlbnQgKHN1Y2ggYXMgc2Nyb2xsVG9wIGV0Yy4pLFxuXHQgKiB0aGVuIGFsbCBzdWNoIHVwZGF0ZXMgd2lsbCBiZSBwYXJ0IG9mIHRoZSBzYW1lIHRyYW5zYWN0aW9uLlxuXHQqL1xuXHRwdWJsaWMgdHJhbnNhY3Rpb248VD4oY2I6ICh0eDogSVRyYW5zYWN0aW9uKSA9PiBUKTogVCB7XG5cdFx0dGhpcy5fYmVnaW5VcGRhdGUoKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGNiKHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiEpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9yY2VVcGRhdGUoKTogdm9pZDtcblx0cHVibGljIGZvcmNlVXBkYXRlPFQ+KGNiOiAodHg6IElUcmFuc2FjdGlvbikgPT4gVCk6IFQ7XG5cdHB1YmxpYyBmb3JjZVVwZGF0ZTxUPihjYj86ICh0eDogSVRyYW5zYWN0aW9uKSA9PiBUKTogVCB7XG5cdFx0dGhpcy5fYmVnaW5VcGRhdGUoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fZm9yY2VVcGRhdGUoKTtcblx0XHRcdGlmICghY2IpIHsgcmV0dXJuIHVuZGVmaW5lZCBhcyBUOyB9XG5cdFx0XHRyZXR1cm4gY2IodGhpcy5fY3VycmVudFRyYW5zYWN0aW9uISk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2VuZFVwZGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZvcmNlVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2JlZ2luVXBkYXRlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX21vZGVsLnNldCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLCB0aGlzLl9jdXJyZW50VHJhbnNhY3Rpb24pO1xuXHRcdFx0dGhpcy5fdmVyc2lvbklkLnNldCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpPy5nZXRWZXJzaW9uSWQoKSA/PyBudWxsLCB0aGlzLl9jdXJyZW50VHJhbnNhY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25zLnNldCh0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKCksIHRoaXMuX2N1cnJlbnRUcmFuc2FjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZW5kVXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw7XG5cdHB1YmxpYyByZWFkb25seSBtb2RlbDogSU9ic2VydmFibGU8SVRleHRNb2RlbCB8IG51bGw+O1xuXG5cdHB1YmxpYyByZWFkb25seSBpc1JlYWRvbmx5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZlcnNpb25JZDtcblx0cHVibGljIHJlYWRvbmx5IHZlcnNpb25JZDogSU9ic2VydmFibGVXaXRoQ2hhbmdlPG51bWJlciB8IG51bGwsIElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbnM7XG5cdHB1YmxpYyByZWFkb25seSBzZWxlY3Rpb25zOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8U2VsZWN0aW9uW10gfCBudWxsLCBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkPjtcblxuXG5cdHB1YmxpYyByZWFkb25seSBwb3NpdGlvbnM7XG5cblx0cHVibGljIHJlYWRvbmx5IGlzRm9jdXNlZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNUZXh0Rm9jdXNlZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5Db21wb3NpdGlvbjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdmFsdWU7XG5cdHB1YmxpYyByZWFkb25seSB2YWx1ZUlzRW1wdHk7XG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JTZWxlY3Rpb247XG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JQb3NpdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IGN1cnNvckxpbmVOdW1iZXI7XG5cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkVHlwZTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUGFzdGU7XG5cblx0cHVibGljIHJlYWRvbmx5IHNjcm9sbFRvcDtcblx0cHVibGljIHJlYWRvbmx5IHNjcm9sbExlZnQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGxheW91dEluZm87XG5cdHB1YmxpYyByZWFkb25seSBsYXlvdXRJbmZvQ29udGVudExlZnQ7XG5cdHB1YmxpYyByZWFkb25seSBsYXlvdXRJbmZvRGVjb3JhdGlvbnNMZWZ0O1xuXHRwdWJsaWMgcmVhZG9ubHkgbGF5b3V0SW5mb1dpZHRoO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGF5b3V0SW5mb0hlaWdodDtcblx0cHVibGljIHJlYWRvbmx5IGxheW91dEluZm9NaW5pbWFwO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGF5b3V0SW5mb1ZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cblx0cHVibGljIHJlYWRvbmx5IGNvbnRlbnRXaWR0aDtcblx0cHVibGljIHJlYWRvbmx5IGNvbnRlbnRIZWlnaHQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU7XG5cblx0cHVibGljIGdldE9wdGlvbjxUIGV4dGVuZHMgRWRpdG9yT3B0aW9uPihpZDogVCwgZGVidWdMb2NhdGlvbiA9IERlYnVnTG9jYXRpb24ub2ZDYWxsZXIoKSk6IElPYnNlcnZhYmxlPEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZDxUPj4ge1xuXHRcdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIGNiID0+IHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoaWQpKSB7IGNiKHVuZGVmaW5lZCk7IH1cblx0XHR9KSwgKCkgPT4gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKGlkKSwgZGVidWdMb2NhdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgc2V0RGVjb3JhdGlvbnMoZGVjb3JhdGlvbnM6IElPYnNlcnZhYmxlPElNb2RlbERlbHRhRGVjb3JhdGlvbltdPik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zQ29sbGVjdGlvbiA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdGQuYWRkKGF1dG9ydW5PcHRzKHsgb3duZXI6IHRoaXMsIGRlYnVnTmFtZTogKCkgPT4gYEFwcGx5IGRlY29yYXRpb25zIGZyb20gJHtkZWNvcmF0aW9ucy5kZWJ1Z05hbWV9YCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IGRlY29yYXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGRlY29yYXRpb25zQ29sbGVjdGlvbi5zZXQoZCk7XG5cdFx0fSkpO1xuXHRcdGQuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGQ7XG5cdH1cblxuXHRwcml2YXRlIF93aWRnZXRDb3VudGVyO1xuXG5cdHB1YmxpYyBjcmVhdGVPdmVybGF5V2lkZ2V0KHdpZGdldDogSU9ic2VydmFibGVPdmVybGF5V2lkZ2V0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IG92ZXJsYXlXaWRnZXRJZCA9ICdvYnNlcnZhYmxlT3ZlcmxheVdpZGdldCcgKyAodGhpcy5fd2lkZ2V0Q291bnRlcisrKTtcblx0XHRjb25zdCB3OiBJT3ZlcmxheVdpZGdldCA9IHtcblx0XHRcdGdldERvbU5vZGU6ICgpID0+IHdpZGdldC5kb21Ob2RlLFxuXHRcdFx0Z2V0UG9zaXRpb246ICgpID0+IHdpZGdldC5wb3NpdGlvbi5nZXQoKSxcblx0XHRcdGdldElkOiAoKSA9PiBvdmVybGF5V2lkZ2V0SWQsXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiB3aWRnZXQuYWxsb3dFZGl0b3JPdmVyZmxvdyxcblx0XHRcdGdldE1pbkNvbnRlbnRXaWR0aEluUHg6ICgpID0+IHdpZGdldC5taW5Db250ZW50V2lkdGhJblB4LmdldCgpLFxuXHRcdH07XG5cdFx0dGhpcy5lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh3KTtcblx0XHRjb25zdCBkID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0d2lkZ2V0LnBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHdpZGdldC5taW5Db250ZW50V2lkdGhJblB4LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodyk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ29udGVudFdpZGdldCh3aWRnZXQ6IElPYnNlcnZhYmxlQ29udGVudFdpZGdldCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBjb250ZW50V2lkZ2V0SWQgPSAnb2JzZXJ2YWJsZUNvbnRlbnRXaWRnZXQnICsgKHRoaXMuX3dpZGdldENvdW50ZXIrKyk7XG5cdFx0Y29uc3QgdzogSUNvbnRlbnRXaWRnZXQgPSB7XG5cdFx0XHRnZXREb21Ob2RlOiAoKSA9PiB3aWRnZXQuZG9tTm9kZSxcblx0XHRcdGdldFBvc2l0aW9uOiAoKSA9PiB3aWRnZXQucG9zaXRpb24uZ2V0KCksXG5cdFx0XHRnZXRJZDogKCkgPT4gY29udGVudFdpZGdldElkLFxuXHRcdFx0YWxsb3dFZGl0b3JPdmVyZmxvdzogd2lkZ2V0LmFsbG93RWRpdG9yT3ZlcmZsb3csXG5cdFx0fTtcblx0XHR0aGlzLmVkaXRvci5hZGRDb250ZW50V2lkZ2V0KHcpO1xuXHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR3aWRnZXQucG9zaXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh3KTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh3KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvYnNlcnZlTGluZU9mZnNldFJhbmdlKGxpbmVSYW5nZTogSU9ic2VydmFibGU8TGluZVJhbmdlPiwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IElPYnNlcnZhYmxlPE9mZnNldFJhbmdlPiB7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLm9ic2VydmVQb3NpdGlvbihsaW5lUmFuZ2UubWFwKHIgPT4gbmV3IFBvc2l0aW9uKHIuc3RhcnRMaW5lTnVtYmVyLCAxKSksIHN0b3JlKTtcblx0XHRjb25zdCBlbmQgPSB0aGlzLm9ic2VydmVQb3NpdGlvbihsaW5lUmFuZ2UubWFwKHIgPT4gbmV3IFBvc2l0aW9uKHIuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSArIDEsIDEpKSwgc3RvcmUpO1xuXG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdHN0YXJ0LnJlYWQocmVhZGVyKTtcblx0XHRcdGVuZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCByYW5nZSA9IGxpbmVSYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLm1vZGVsLnJlYWQocmVhZGVyKT8uZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBzID0gKFxuXHRcdFx0XHQodHlwZW9mIGxpbmVDb3VudCAhPT0gJ3VuZGVmaW5lZCcgJiYgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gbGluZUNvdW50XG5cdFx0XHRcdFx0PyB0aGlzLmVkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKGxpbmVDb3VudClcblx0XHRcdFx0XHQ6IHRoaXMuZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKVxuXHRcdFx0XHQpXG5cdFx0XHRcdC0gdGhpcy5zY3JvbGxUb3AucmVhZChyZWFkZXIpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgZSA9IHJhbmdlLmlzRW1wdHkgPyBzIDogKHRoaXMuZWRpdG9yLmdldEJvdHRvbUZvckxpbmVOdW1iZXIocmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEpIC0gdGhpcy5zY3JvbGxUb3AucmVhZChyZWFkZXIpKTtcblx0XHRcdHJldHVybiBuZXcgT2Zmc2V0UmFuZ2UocywgZSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVXNlcyBhbiBhcHByb3hpbWF0aW9uIGlmIHRoZSBleGFjdCBwb3NpdGlvbiBjYW5ub3QgYmUgZGV0ZXJtaW5lZC5cblx0ICovXG5cdGdldExlZnRPZlBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0XHR0aGlzLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMudmFsdWUucmVhZChyZWFkZXIpO1xuXG5cdFx0bGV0IG9mZnNldCA9IHRoaXMuZWRpdG9yLmdldE9mZnNldEZvckNvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdGlmIChvZmZzZXQgPT09IC0xKSB7XG5cdFx0XHQvLyBhcHByb3hpbWF0aW9uXG5cdFx0XHRjb25zdCB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0XHRjb25zdCBhcHByb3hpbWF0aW9uID0gcG9zaXRpb24uY29sdW1uICogdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdFx0b2Zmc2V0ID0gYXBwcm94aW1hdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIG9mZnNldDtcblx0fVxuXG5cdHB1YmxpYyBvYnNlcnZlUG9zaXRpb24ocG9zaXRpb246IElPYnNlcnZhYmxlPFBvc2l0aW9uIHwgbnVsbD4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJT2JzZXJ2YWJsZTxQb2ludCB8IG51bGw+IHtcblx0XHRsZXQgcG9zID0gcG9zaXRpb24uZ2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxQb2ludCB8IG51bGw+KHsgb3duZXI6IHRoaXMsIGRlYnVnTmFtZTogKCkgPT4gYHRvcExlZnRPZlBvc2l0aW9uJHtwb3M/LnRvU3RyaW5nKCl9YCwgZXF1YWxzRm46IGVxdWFsc0lmRGVmaW5lZEMoUG9pbnQuZXF1YWxzKSB9LCBuZXcgUG9pbnQoMCwgMCkpO1xuXHRcdGNvbnN0IGNvbnRlbnRXaWRnZXRJZCA9IGBvYnNlcnZhYmxlUG9zaXRpb25XaWRnZXRgICsgKHRoaXMuX3dpZGdldENvdW50ZXIrKyk7XG5cdFx0Y29uc3QgZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IHc6IElDb250ZW50V2lkZ2V0ID0ge1xuXHRcdFx0Z2V0RG9tTm9kZTogKCkgPT4gZG9tTm9kZSxcblx0XHRcdGdldFBvc2l0aW9uOiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBwb3MgPyB7IHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXSwgcG9zaXRpb246IHBvc2l0aW9uLmdldCgpIH0gOiBudWxsO1xuXHRcdFx0fSxcblx0XHRcdGdldElkOiAoKSA9PiBjb250ZW50V2lkZ2V0SWQsXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdHVzZURpc3BsYXlOb25lOiB0cnVlLFxuXHRcdFx0YWZ0ZXJSZW5kZXI6IChwb3NpdGlvbiwgY29vcmRpbmF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsLmdldCgpO1xuXHRcdFx0XHRpZiAobW9kZWwgJiYgcG9zICYmIHBvcy5saW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHQvLyB0aGUgcG9zaXRpb24gaXMgYWZ0ZXIgdGhlIGxhc3QgbGluZVxuXHRcdFx0XHRcdHJlc3VsdC5zZXQobmV3IFBvaW50KDAsIHRoaXMuZWRpdG9yLmdldEJvdHRvbUZvckxpbmVOdW1iZXIobW9kZWwuZ2V0TGluZUNvdW50KCkpIC0gdGhpcy5zY3JvbGxUb3AuZ2V0KCkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQoY29vcmRpbmF0ZSA/IG5ldyBQb2ludChjb29yZGluYXRlLmxlZnQsIGNvb3JkaW5hdGUudG9wKSA6IG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0aGlzLmVkaXRvci5hZGRDb250ZW50V2lkZ2V0KHcpO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRwb3MgPSBwb3NpdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHcpO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodyk7XG5cdFx0fSkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgb3BlbmVkUGVla1dpZGdldHM7XG5cblx0aXNUYXJnZXRIb3ZlcmVkKHByZWRpY2F0ZTogKHRhcmdldDogSUVkaXRvck1vdXNlRXZlbnQpID0+IGJvb2xlYW4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgaXNIb3ZlcmVkID0gb2JzZXJ2YWJsZVZhbHVlKCdpc0luamVjdGVkVGV4dEhvdmVyZWQnLCBmYWxzZSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VNb3ZlKGUgPT4ge1xuXHRcdFx0Y29uc3QgdmFsID0gcHJlZGljYXRlKGUpO1xuXHRcdFx0aXNIb3ZlcmVkLnNldCh2YWwsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VMZWF2ZShFID0+IHtcblx0XHRcdGlzSG92ZXJlZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdHJldHVybiBpc0hvdmVyZWQ7XG5cdH1cblxuXHRvYnNlcnZlTGluZUhlaWdodEZvclBvc2l0aW9uKHBvc2l0aW9uOiBJT2JzZXJ2YWJsZTxQb3NpdGlvbj4gfCBQb3NpdGlvbik6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cdG9ic2VydmVMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb246IElPYnNlcnZhYmxlPG51bGw+KTogSU9ic2VydmFibGU8bnVsbD47XG5cdG9ic2VydmVMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb246IElPYnNlcnZhYmxlPFBvc2l0aW9uIHwgbnVsbD4gfCBQb3NpdGlvbik6IElPYnNlcnZhYmxlPG51bWJlciB8IG51bGw+IHtcblx0XHRyZXR1cm4gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcG9zID0gcG9zaXRpb24gaW5zdGFuY2VvZiBQb3NpdGlvbiA/IHBvc2l0aW9uIDogcG9zaXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHBvcyA9PT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihwb3MpO1xuXHRcdH0pO1xuXHR9XG5cblx0b2JzZXJ2ZUxpbmVIZWlnaHRGb3JMaW5lKGxpbmVOdW1iZXI6IElPYnNlcnZhYmxlPG51bWJlcj4gfCBudW1iZXIpOiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRvYnNlcnZlTGluZUhlaWdodEZvckxpbmUobGluZU51bWJlcjogSU9ic2VydmFibGU8bnVsbD4pOiBJT2JzZXJ2YWJsZTxudWxsPjtcblx0b2JzZXJ2ZUxpbmVIZWlnaHRGb3JMaW5lKGxpbmVOdW1iZXI6IElPYnNlcnZhYmxlPG51bWJlciB8IG51bGw+IHwgbnVtYmVyKTogSU9ic2VydmFibGU8bnVtYmVyIHwgbnVsbD4ge1xuXHRcdGlmICh0eXBlb2YgbGluZU51bWJlciA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB0aGlzLm9ic2VydmVMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVOdW1iZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGxpbmUgPT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLm9ic2VydmVMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKGxpbmUsIDEpKS5yZWFkKHJlYWRlcik7XG5cdFx0fSk7XG5cdH1cblxuXHRvYnNlcnZlTGluZUhlaWdodHNGb3JMaW5lUmFuZ2UobGluZU51bWJlcjogSU9ic2VydmFibGU8TGluZVJhbmdlPiB8IExpbmVSYW5nZSk6IElPYnNlcnZhYmxlPG51bWJlcltdPiB7XG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlID0gbGluZU51bWJlciBpbnN0YW5jZW9mIExpbmVSYW5nZSA/IGxpbmVOdW1iZXIgOiBsaW5lTnVtYmVyLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgaGVpZ2h0czogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGkgPCByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRcdFx0aGVpZ2h0cy5wdXNoKHRoaXMub2JzZXJ2ZUxpbmVIZWlnaHRGb3JMaW5lKGkpLnJlYWQocmVhZGVyKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaGVpZ2h0cztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld1pvbmVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGRlbkFyZWFzQ2hhbmdlZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMaW5lSGVpZ2h0Q2hhbmdlZDtcblxuXHQvKipcblx0ICogVHJhY2tzIHdoZXRoZXIgZ2V0V2lkdGhPZkxpbmUgcmV0dXJuZWQgMCwgaW5kaWNhdGluZyB0aGUgZWRpdG9yIG1heSBiZSBoaWRkZW4uXG5cdCAqIFdoZW4gcmVzaXplIGhhcHBlbnMgYW5kIHRoaXMgZmxhZyBpcyBzZXQsIHdlIHJlc2V0IGNhY2hlZCBsaW5lIHdpZHRocy5cblx0ICovXG5cdHByaXZhdGUgX3Nhd1plcm9MaW5lV2lkdGggPSBmYWxzZTtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGUgZWRpdG9yIGNvbnRhaW5lciByZXNpemVzLlxuXHQgKiBUaGlzIGlzIGxhemlseSBjcmVhdGVkIG9ubHkgd2hlbiBzb21lb25lIHN1YnNjcmliZXMgdG8gaXQuXG5cdCAqIFVzZWZ1bCBmb3IgZGV0ZWN0aW5nIHdoZW4gYSBwYXJlbnQgZWxlbWVudCdzIGRpc3BsYXkgY2hhbmdlcyBmcm9tICdub25lJyB0byAnYmxvY2snLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb250YWluZXJSZXNpemUgPSBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cyhcblx0XHR7IG93bmVyOiB0aGlzLCBnZXRUcmFuc2FjdGlvbjogKCkgPT4gdGhpcy5fY3VycmVudFRyYW5zYWN0aW9uIH0sXG5cdFx0ZSA9PiB7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCk7XG5cdFx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRcdC8vIElmIHdlIHByZXZpb3VzbHkgc2F3IGEgMCB3aWR0aCwgdGhlIGVkaXRvciB3YXMgbGlrZWx5IGhpZGRlbi5cblx0XHRcdFx0Ly8gTm93IHRoYXQgaXQgcmVzaXplZCAoYmVjYW1lIHZpc2libGUpLCBmbHVzaCB0aGUgY2FjaGVkIHdpZHRocy5cblx0XHRcdFx0aWYgKHRoaXMuX3Nhd1plcm9MaW5lV2lkdGgpIHtcblx0XHRcdFx0XHR0aGlzLl9zYXdaZXJvTGluZVdpZHRoID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3IucmVzZXRMaW5lV2lkdGhDYWNoZXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHRcdHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoY29udGFpbmVyKTtcblx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKSB9O1xuXHRcdH0sXG5cdFx0KCkgPT4gKHt9KSAvLyBSZXR1cm4gbmV3IG9iamVjdCBlYWNoIHRpbWUgdG8gZW5zdXJlIGNoYW5nZSBkZXRlY3Rpb25cblx0KTtcblxuXHQvKipcblx0ICogR2V0IHRoZSB3aWR0aCBvZiBhIGxpbmUgaW4gcGl4ZWxzLlxuXHQgKiBSZWFkaW5nIHRoZSByZXR1cm5lZCB2YWx1ZSBkZXBlbmRzIG9uIGxheW91dEluZm8sIHZhbHVlLCBzY3JvbGxUb3AsIGFuZCBjb250YWluZXIgcmVzaXplIGV2ZW50cy5cblx0ICogVGhlIGNvbnRhaW5lciByZXNpemUgZGVwZW5kZW5jeSBlbnN1cmVzIGNvcnJlY3QgdmFsdWVzIHdoZW4gdGhlIGVkaXRvciBiZWNvbWVzIHZpc2libGUgYWZ0ZXIgYmVpbmcgaGlkZGVuLlxuXHQgKi9cblx0Z2V0V2lkdGhPZkxpbmUobGluZU51bWJlcjogbnVtYmVyLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdHRoaXMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0dGhpcy52YWx1ZS5yZWFkKHJlYWRlcik7XG5cdFx0dGhpcy5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5lZGl0b3IuZ2V0V2lkdGhPZkxpbmUobGluZU51bWJlcik7XG5cdFx0dGhpcy5fb25EaWRDb250YWluZXJSZXNpemUucmVhZChyZWFkZXIpO1xuXHRcdGlmICh3aWR0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc2F3WmVyb0xpbmVXaWR0aCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB3aWR0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHZlcnRpY2FsIHBvc2l0aW9uICh0b3Agb2Zmc2V0KSBmb3IgdGhlIGxpbmUncyBib3R0b20gdy5yLnQuIHRvIHRoZSBmaXJzdCBsaW5lLlxuXHQgKi9cblx0b2JzZXJ2ZVRvcEZvckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogSU9ic2VydmFibGU8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdHRoaXMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdab25lcy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZEhpZGRlbkFyZWFzQ2hhbmdlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZExpbmVIZWlnaHRDaGFuZ2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3ZlcnNpb25JZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHZlcnRpY2FsIHBvc2l0aW9uICh0b3Agb2Zmc2V0KSBmb3IgdGhlIGxpbmUncyBib3R0b20gdy5yLnQuIHRvIHRoZSBmaXJzdCBsaW5lLlxuXHQgKi9cblx0b2JzZXJ2ZUJvdHRvbUZvckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogSU9ic2VydmFibGU8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdHRoaXMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdab25lcy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZEhpZGRlbkFyZWFzQ2hhbmdlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZExpbmVIZWlnaHRDaGFuZ2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3ZlcnNpb25JZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5lZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU9ic2VydmFibGVPdmVybGF5V2lkZ2V0IHtcblx0Z2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHBvc2l0aW9uOiBJT2JzZXJ2YWJsZTxJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbD47XG5cdHJlYWRvbmx5IG1pbkNvbnRlbnRXaWR0aEluUHg6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cdGdldCBhbGxvd0VkaXRvck92ZXJmbG93KCk6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJT2JzZXJ2YWJsZUNvbnRlbnRXaWRnZXQge1xuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgcG9zaXRpb246IElPYnNlcnZhYmxlPElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsPjtcblx0Z2V0IGFsbG93RWRpdG9yT3ZlcmZsb3coKTogYm9vbGVhbjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCLG9CQUFvQjtBQUMvQyxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGVBQTBFLGlCQUFpQixTQUFTLGFBQWEsU0FBUyxhQUFhLG1CQUFtQixxQkFBcUIseUJBQXlCLGtCQUFrQiwyQkFBMkIsaUJBQWlCLDJCQUEyQjtBQUMxUyxTQUFTLG9CQUF1RDtBQUNoRSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUkxQixTQUFTLHVDQUFvSztBQUM3SyxTQUFTLGFBQWE7QUFLZixTQUFTLHFCQUFxQixRQUEyQztBQUMvRSxTQUFPLHFCQUFxQixJQUFJLE1BQU07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
