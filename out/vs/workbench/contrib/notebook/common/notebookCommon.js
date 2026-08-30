import { VSBuffer } from "../../../../base/common/buffer.js";
import * as glob from "../../../../base/common/glob.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Mimes } from "../../../../base/common/mime.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { generateMetadataUri, generate as generateUri, extractCellOutputDetails, parseMetadataUri, parse as parseUri } from "../../../services/notebook/common/notebookDocumentService.js";
const NOTEBOOK_EDITOR_ID = "workbench.editor.notebook";
const NOTEBOOK_DIFF_EDITOR_ID = "workbench.editor.notebookTextDiffEditor";
const NOTEBOOK_MULTI_DIFF_EDITOR_ID = "workbench.editor.notebookMultiTextDiffEditor";
const INTERACTIVE_WINDOW_EDITOR_ID = "workbench.editor.interactive";
const REPL_EDITOR_ID = "workbench.editor.repl";
const NOTEBOOK_OUTPUT_EDITOR_ID = "workbench.editor.notebookOutputEditor";
const EXECUTE_REPL_COMMAND_ID = "replNotebook.input.execute";
var CellKind = /* @__PURE__ */ ((CellKind2) => {
  CellKind2[CellKind2["Markup"] = 1] = "Markup";
  CellKind2[CellKind2["Code"] = 2] = "Code";
  return CellKind2;
})(CellKind || {});
const NOTEBOOK_DISPLAY_ORDER = [
  "application/json",
  "application/javascript",
  "text/html",
  "image/svg+xml",
  Mimes.latex,
  Mimes.markdown,
  "image/png",
  "image/jpeg",
  Mimes.text
];
const ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER = [
  Mimes.latex,
  Mimes.markdown,
  "application/json",
  "text/html",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  Mimes.text
];
const RENDERER_EQUIVALENT_EXTENSIONS = /* @__PURE__ */ new Map([
  ["ms-toolsai.jupyter", /* @__PURE__ */ new Set(["jupyter-notebook", "interactive"])],
  ["ms-toolsai.jupyter-renderers", /* @__PURE__ */ new Set(["jupyter-notebook", "interactive"])]
]);
const RENDERER_NOT_AVAILABLE = "_notAvailable";
var NotebookRunState = /* @__PURE__ */ ((NotebookRunState2) => {
  NotebookRunState2[NotebookRunState2["Running"] = 1] = "Running";
  NotebookRunState2[NotebookRunState2["Idle"] = 2] = "Idle";
  return NotebookRunState2;
})(NotebookRunState || {});
var NotebookCellExecutionState = /* @__PURE__ */ ((NotebookCellExecutionState2) => {
  NotebookCellExecutionState2[NotebookCellExecutionState2["Unconfirmed"] = 1] = "Unconfirmed";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Pending"] = 2] = "Pending";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Executing"] = 3] = "Executing";
  return NotebookCellExecutionState2;
})(NotebookCellExecutionState || {});
var NotebookExecutionState = /* @__PURE__ */ ((NotebookExecutionState2) => {
  NotebookExecutionState2[NotebookExecutionState2["Unconfirmed"] = 1] = "Unconfirmed";
  NotebookExecutionState2[NotebookExecutionState2["Pending"] = 2] = "Pending";
  NotebookExecutionState2[NotebookExecutionState2["Executing"] = 3] = "Executing";
  return NotebookExecutionState2;
})(NotebookExecutionState || {});
var NotebookRendererMatch = /* @__PURE__ */ ((NotebookRendererMatch2) => {
  NotebookRendererMatch2[NotebookRendererMatch2["WithHardKernelDependency"] = 0] = "WithHardKernelDependency";
  NotebookRendererMatch2[NotebookRendererMatch2["WithOptionalKernelDependency"] = 1] = "WithOptionalKernelDependency";
  NotebookRendererMatch2[NotebookRendererMatch2["Pure"] = 2] = "Pure";
  NotebookRendererMatch2[NotebookRendererMatch2["Never"] = 3] = "Never";
  return NotebookRendererMatch2;
})(NotebookRendererMatch || {});
var RendererMessagingSpec = /* @__PURE__ */ ((RendererMessagingSpec2) => {
  RendererMessagingSpec2["Always"] = "always";
  RendererMessagingSpec2["Never"] = "never";
  RendererMessagingSpec2["Optional"] = "optional";
  return RendererMessagingSpec2;
})(RendererMessagingSpec || {});
var NotebookCellsChangeType = /* @__PURE__ */ ((NotebookCellsChangeType2) => {
  NotebookCellsChangeType2[NotebookCellsChangeType2["ModelChange"] = 1] = "ModelChange";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Move"] = 2] = "Move";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellLanguage"] = 5] = "ChangeCellLanguage";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Initialize"] = 6] = "Initialize";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellMetadata"] = 7] = "ChangeCellMetadata";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Output"] = 8] = "Output";
  NotebookCellsChangeType2[NotebookCellsChangeType2["OutputItem"] = 9] = "OutputItem";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellContent"] = 10] = "ChangeCellContent";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeDocumentMetadata"] = 11] = "ChangeDocumentMetadata";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellInternalMetadata"] = 12] = "ChangeCellInternalMetadata";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellMime"] = 13] = "ChangeCellMime";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Unknown"] = 100] = "Unknown";
  return NotebookCellsChangeType2;
})(NotebookCellsChangeType || {});
var SelectionStateType = /* @__PURE__ */ ((SelectionStateType2) => {
  SelectionStateType2[SelectionStateType2["Handle"] = 0] = "Handle";
  SelectionStateType2[SelectionStateType2["Index"] = 1] = "Index";
  return SelectionStateType2;
})(SelectionStateType || {});
var CellEditType = /* @__PURE__ */ ((CellEditType2) => {
  CellEditType2[CellEditType2["Replace"] = 1] = "Replace";
  CellEditType2[CellEditType2["Output"] = 2] = "Output";
  CellEditType2[CellEditType2["Metadata"] = 3] = "Metadata";
  CellEditType2[CellEditType2["CellLanguage"] = 4] = "CellLanguage";
  CellEditType2[CellEditType2["DocumentMetadata"] = 5] = "DocumentMetadata";
  CellEditType2[CellEditType2["Move"] = 6] = "Move";
  CellEditType2[CellEditType2["OutputItems"] = 7] = "OutputItems";
  CellEditType2[CellEditType2["PartialMetadata"] = 8] = "PartialMetadata";
  CellEditType2[CellEditType2["PartialInternalMetadata"] = 9] = "PartialInternalMetadata";
  return CellEditType2;
})(CellEditType || {});
var NotebookMetadataUri;
((NotebookMetadataUri2) => {
  NotebookMetadataUri2.scheme = Schemas.vscodeNotebookMetadata;
  function generate(notebook) {
    return generateMetadataUri(notebook);
  }
  NotebookMetadataUri2.generate = generate;
  function parse(metadata) {
    return parseMetadataUri(metadata);
  }
  NotebookMetadataUri2.parse = parse;
})(NotebookMetadataUri || (NotebookMetadataUri = {}));
var CellUri;
((CellUri2) => {
  CellUri2.scheme = Schemas.vscodeNotebookCell;
  function generate(notebook, handle) {
    return generateUri(notebook, handle);
  }
  CellUri2.generate = generate;
  function parse(cell) {
    return parseUri(cell);
  }
  CellUri2.parse = parse;
  function generateCellOutputUriWithId(notebook, outputId) {
    return notebook.with({
      scheme: Schemas.vscodeNotebookCellOutput,
      query: new URLSearchParams({
        openIn: "editor",
        outputId: outputId ?? "",
        notebookScheme: notebook.scheme !== Schemas.file ? notebook.scheme : ""
      }).toString()
    });
  }
  CellUri2.generateCellOutputUriWithId = generateCellOutputUriWithId;
  function generateCellOutputUriWithIndex(notebook, cellUri, outputIndex) {
    return notebook.with({
      scheme: Schemas.vscodeNotebookCellOutput,
      fragment: cellUri.fragment,
      query: new URLSearchParams({
        openIn: "notebook",
        outputIndex: String(outputIndex)
      }).toString()
    });
  }
  CellUri2.generateCellOutputUriWithIndex = generateCellOutputUriWithIndex;
  function generateOutputEditorUri(notebook, cellId, cellIndex, outputId, outputIndex) {
    return notebook.with({
      scheme: Schemas.vscodeNotebookCellOutput,
      query: new URLSearchParams({
        openIn: "notebookOutputEditor",
        notebook: notebook.toString(),
        cellIndex: String(cellIndex),
        outputId,
        outputIndex: String(outputIndex)
      }).toString()
    });
  }
  CellUri2.generateOutputEditorUri = generateOutputEditorUri;
  function parseCellOutputUri(uri) {
    return extractCellOutputDetails(uri);
  }
  CellUri2.parseCellOutputUri = parseCellOutputUri;
  function generateCellPropertyUri(notebook, handle, scheme2) {
    return CellUri2.generate(notebook, handle).with({ scheme: scheme2 });
  }
  CellUri2.generateCellPropertyUri = generateCellPropertyUri;
  function parseCellPropertyUri(uri, propertyScheme) {
    if (uri.scheme !== propertyScheme) {
      return void 0;
    }
    return CellUri2.parse(uri.with({ scheme: CellUri2.scheme }));
  }
  CellUri2.parseCellPropertyUri = parseCellPropertyUri;
})(CellUri || (CellUri = {}));
const normalizeSlashes = (str) => isWindows ? str.replace(/\//g, "\\") : str;
class MimeTypeDisplayOrder {
  constructor(initialValue = [], defaultOrder = NOTEBOOK_DISPLAY_ORDER) {
    this.defaultOrder = defaultOrder;
    this.order = [...new Set(initialValue)].map((pattern) => ({
      pattern,
      matches: glob.parse(normalizeSlashes(pattern), { ignoreCase: true })
    }));
  }
  /**
   * Returns a sorted array of the input mimeTypes.
   */
  sort(mimeTypes) {
    const remaining = new Map(Iterable.map(mimeTypes, (m) => [m, normalizeSlashes(m)]));
    let sorted = [];
    for (const { matches } of this.order) {
      for (const [original, normalized] of remaining) {
        if (matches(normalized)) {
          sorted.push(original);
          remaining.delete(original);
          break;
        }
      }
    }
    if (remaining.size) {
      sorted = sorted.concat([...remaining.keys()].sort(
        (a, b) => this.defaultOrder.indexOf(a) - this.defaultOrder.indexOf(b)
      ));
    }
    return sorted;
  }
  /**
   * Records that the user selected the given mimetype over the other
   * possible mimeTypes, prioritizing it for future reference.
   */
  prioritize(chosenMimetype, otherMimeTypes) {
    const chosenIndex = this.findIndex(chosenMimetype);
    if (chosenIndex === -1) {
      this.order.unshift({ pattern: chosenMimetype, matches: glob.parse(normalizeSlashes(chosenMimetype), { ignoreCase: true }) });
      return;
    }
    const uniqueIndices = new Set(otherMimeTypes.map((m) => this.findIndex(m, chosenIndex)));
    uniqueIndices.delete(-1);
    const otherIndices = Array.from(uniqueIndices).sort((a, b) => a - b);
    this.order.splice(chosenIndex + 1, 0, ...otherIndices.map((i) => this.order[i]));
    for (let oi = otherIndices.length - 1; oi >= 0; oi--) {
      this.order.splice(otherIndices[oi], 1);
    }
  }
  /**
   * Gets an array of in-order mimetype preferences.
   */
  toArray() {
    return this.order.map((o) => o.pattern);
  }
  findIndex(mimeType, maxIndex = this.order.length) {
    const normalized = normalizeSlashes(mimeType);
    for (let i = 0; i < maxIndex; i++) {
      if (this.order[i].matches(normalized)) {
        return i;
      }
    }
    return -1;
  }
}
function diff(before, after, contains, equal = (a, b) => a === b) {
  const result = [];
  function pushSplice(start, deleteCount, toInsert) {
    if (deleteCount === 0 && toInsert.length === 0) {
      return;
    }
    const latest = result[result.length - 1];
    if (latest && latest.start + latest.deleteCount === start) {
      latest.deleteCount += deleteCount;
      latest.toInsert.push(...toInsert);
    } else {
      result.push({ start, deleteCount, toInsert });
    }
  }
  let beforeIdx = 0;
  let afterIdx = 0;
  while (true) {
    if (beforeIdx === before.length) {
      pushSplice(beforeIdx, 0, after.slice(afterIdx));
      break;
    }
    if (afterIdx === after.length) {
      pushSplice(beforeIdx, before.length - beforeIdx, []);
      break;
    }
    const beforeElement = before[beforeIdx];
    const afterElement = after[afterIdx];
    if (equal(beforeElement, afterElement)) {
      beforeIdx += 1;
      afterIdx += 1;
      continue;
    }
    if (contains(afterElement)) {
      pushSplice(beforeIdx, 1, []);
      beforeIdx += 1;
    } else {
      pushSplice(beforeIdx, 0, [afterElement]);
      afterIdx += 1;
    }
  }
  return result;
}
const NOTEBOOK_EDITOR_CURSOR_BOUNDARY = new RawContextKey("notebookEditorCursorAtBoundary", "none");
const NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY = new RawContextKey("notebookEditorCursorAtLineBoundary", "none");
var NotebookEditorPriority = /* @__PURE__ */ ((NotebookEditorPriority2) => {
  NotebookEditorPriority2["default"] = "default";
  NotebookEditorPriority2["option"] = "option";
  return NotebookEditorPriority2;
})(NotebookEditorPriority || {});
var NotebookFindScopeType = /* @__PURE__ */ ((NotebookFindScopeType2) => {
  NotebookFindScopeType2["Cells"] = "cells";
  NotebookFindScopeType2["Text"] = "text";
  NotebookFindScopeType2["None"] = "none";
  return NotebookFindScopeType2;
})(NotebookFindScopeType || {});
function isDocumentExcludePattern(filenamePattern) {
  const arg = filenamePattern;
  if ((typeof arg.include === "string" || glob.isRelativePattern(arg.include)) && (typeof arg.exclude === "string" || glob.isRelativePattern(arg.exclude))) {
    return true;
  }
  return false;
}
function notebookDocumentFilterMatch(filter, viewType, resource) {
  if (Array.isArray(filter.viewType) && filter.viewType.indexOf(viewType) >= 0) {
    return true;
  }
  if (filter.viewType === viewType) {
    return true;
  }
  if (filter.filenamePattern) {
    const filenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.include : filter.filenamePattern;
    const excludeFilenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.exclude : void 0;
    if (glob.match(filenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
      if (excludeFilenamePattern) {
        if (glob.match(excludeFilenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
          return false;
        }
      }
      return true;
    }
  }
  return false;
}
const NotebookSetting = {
  displayOrder: "notebook.displayOrder",
  cellToolbarLocation: "notebook.cellToolbarLocation",
  cellToolbarVisibility: "notebook.cellToolbarVisibility",
  showCellStatusBar: "notebook.showCellStatusBar",
  cellExecutionTimeVerbosity: "notebook.cellExecutionTimeVerbosity",
  textDiffEditorPreview: "notebook.diff.enablePreview",
  diffOverviewRuler: "notebook.diff.overviewRuler",
  experimentalInsertToolbarAlignment: "notebook.experimental.insertToolbarAlignment",
  compactView: "notebook.compactView",
  focusIndicator: "notebook.cellFocusIndicator",
  insertToolbarLocation: "notebook.insertToolbarLocation",
  globalToolbar: "notebook.globalToolbar",
  stickyScrollEnabled: "notebook.stickyScroll.enabled",
  stickyScrollMode: "notebook.stickyScroll.mode",
  undoRedoPerCell: "notebook.undoRedoPerCell",
  consolidatedOutputButton: "notebook.consolidatedOutputButton",
  openOutputInPreviewEditor: "notebook.output.openInPreviewEditor.enabled",
  showFoldingControls: "notebook.showFoldingControls",
  dragAndDropEnabled: "notebook.dragAndDropEnabled",
  cellEditorOptionsCustomizations: "notebook.editorOptionsCustomizations",
  consolidatedRunButton: "notebook.consolidatedRunButton",
  openGettingStarted: "notebook.experimental.openGettingStarted",
  globalToolbarShowLabel: "notebook.globalToolbarShowLabel",
  markupFontSize: "notebook.markup.fontSize",
  markdownLineHeight: "notebook.markdown.lineHeight",
  interactiveWindowCollapseCodeCells: "interactiveWindow.collapseCellInputCode",
  outputScrolling: "notebook.output.scrolling",
  textOutputLineLimit: "notebook.output.textLineLimit",
  LinkifyOutputFilePaths: "notebook.output.linkifyFilePaths",
  minimalErrorRendering: "notebook.output.minimalErrorRendering",
  formatOnSave: "notebook.formatOnSave.enabled",
  insertFinalNewline: "notebook.insertFinalNewline",
  defaultFormatter: "notebook.defaultFormatter",
  formatOnCellExecution: "notebook.formatOnCellExecution",
  codeActionsOnSave: "notebook.codeActionsOnSave",
  outputWordWrap: "notebook.output.wordWrap",
  outputLineHeight: "notebook.output.lineHeight",
  outputFontSize: "notebook.output.fontSize",
  outputFontFamily: "notebook.output.fontFamily",
  findFilters: "notebook.find.filters",
  logging: "notebook.logging",
  confirmDeleteRunningCell: "notebook.confirmDeleteRunningCell",
  remoteSaving: "notebook.experimental.remoteSave",
  gotoSymbolsAllSymbols: "notebook.gotoSymbols.showAllSymbols",
  outlineShowMarkdownHeadersOnly: "notebook.outline.showMarkdownHeadersOnly",
  outlineShowCodeCells: "notebook.outline.showCodeCells",
  outlineShowCodeCellSymbols: "notebook.outline.showCodeCellSymbols",
  breadcrumbsShowCodeCells: "notebook.breadcrumbs.showCodeCells",
  scrollToRevealCell: "notebook.scrolling.revealNextCellOnExecute",
  cellChat: "notebook.experimental.cellChat",
  cellGenerate: "notebook.experimental.generate",
  notebookVariablesView: "notebook.variablesView",
  notebookInlineValues: "notebook.inlineValues",
  InteractiveWindowPromptToSave: "interactiveWindow.promptToSaveOnClose",
  cellFailureDiagnostics: "notebook.cellFailureDiagnostics",
  outputBackupSizeLimit: "notebook.backup.sizeLimit",
  multiCursor: "notebook.multiCursor.enabled",
  markupFontFamily: "notebook.markup.fontFamily"
};
var CellStatusbarAlignment = /* @__PURE__ */ ((CellStatusbarAlignment2) => {
  CellStatusbarAlignment2[CellStatusbarAlignment2["Left"] = 1] = "Left";
  CellStatusbarAlignment2[CellStatusbarAlignment2["Right"] = 2] = "Right";
  return CellStatusbarAlignment2;
})(CellStatusbarAlignment || {});
const _NotebookWorkingCopyTypeIdentifier = class _NotebookWorkingCopyTypeIdentifier {
  static create(notebookType, viewType) {
    return `${_NotebookWorkingCopyTypeIdentifier._prefix}${notebookType}/${viewType ?? notebookType}`;
  }
  static parse(candidate) {
    if (candidate.startsWith(_NotebookWorkingCopyTypeIdentifier._prefix)) {
      const split = candidate.substring(_NotebookWorkingCopyTypeIdentifier._prefix.length).split("/");
      if (split.length === 2) {
        return { notebookType: split[0], viewType: split[1] };
      }
    }
    return void 0;
  }
};
_NotebookWorkingCopyTypeIdentifier._prefix = "notebook/";
let NotebookWorkingCopyTypeIdentifier = _NotebookWorkingCopyTypeIdentifier;
const textDecoder = new TextDecoder();
function compressOutputItemStreams(outputs) {
  const buffers = [];
  let startAppending = false;
  for (const output of outputs) {
    if (buffers.length === 0 || startAppending) {
      buffers.push(output);
      startAppending = true;
    }
  }
  let didCompression = compressStreamBuffer(buffers);
  const concatenated = VSBuffer.concat(buffers.map((buffer) => VSBuffer.wrap(buffer)));
  const data = formatStreamText(concatenated);
  didCompression = didCompression || data.byteLength !== concatenated.byteLength;
  return { data, didCompression };
}
const MOVE_CURSOR_1_LINE_COMMAND = `${String.fromCharCode(27)}[A`;
const MOVE_CURSOR_1_LINE_COMMAND_BYTES = MOVE_CURSOR_1_LINE_COMMAND.split("").map((c) => c.charCodeAt(0));
const LINE_FEED = 10;
function compressStreamBuffer(streams) {
  let didCompress = false;
  streams.forEach((stream, index) => {
    if (index === 0 || stream.length < MOVE_CURSOR_1_LINE_COMMAND.length) {
      return;
    }
    const previousStream = streams[index - 1];
    const command = stream.subarray(0, MOVE_CURSOR_1_LINE_COMMAND.length);
    if (command[0] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[0] && command[1] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[1] && command[2] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[2]) {
      const lastIndexOfLineFeed = previousStream.lastIndexOf(LINE_FEED);
      if (lastIndexOfLineFeed === -1) {
        return;
      }
      didCompress = true;
      streams[index - 1] = previousStream.subarray(0, lastIndexOfLineFeed);
      streams[index] = stream.subarray(MOVE_CURSOR_1_LINE_COMMAND.length);
    }
  });
  return didCompress;
}
function fixBackspace(txt) {
  let tmp = txt;
  do {
    txt = tmp;
    tmp = txt.replace(/[^\n]\x08/gm, "");
  } while (tmp.length < txt.length);
  return txt;
}
function fixCarriageReturn(txt) {
  txt = txt.replace(/\r+\n/gm, "\n");
  while (txt.search(/\r[^$]/g) > -1) {
    const base = txt.match(/^(.*)\r+/m)[1];
    let insert = txt.match(/\r+(.*)$/m)[1];
    insert = insert + base.slice(insert.length, base.length);
    txt = txt.replace(/\r+.*$/m, "\r").replace(/^.*\r/m, insert);
  }
  return txt;
}
const BACKSPACE_CHARACTER = "\b".charCodeAt(0);
const CARRIAGE_RETURN_CHARACTER = "\r".charCodeAt(0);
function formatStreamText(buffer) {
  if (!buffer.buffer.includes(BACKSPACE_CHARACTER) && !buffer.buffer.includes(CARRIAGE_RETURN_CHARACTER)) {
    return buffer;
  }
  return VSBuffer.fromString(fixCarriageReturn(fixBackspace(textDecoder.decode(buffer.buffer))));
}
export {
  ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER,
  CellEditType,
  CellKind,
  CellStatusbarAlignment,
  CellUri,
  EXECUTE_REPL_COMMAND_ID,
  INTERACTIVE_WINDOW_EDITOR_ID,
  MOVE_CURSOR_1_LINE_COMMAND,
  MimeTypeDisplayOrder,
  NOTEBOOK_DIFF_EDITOR_ID,
  NOTEBOOK_DISPLAY_ORDER,
  NOTEBOOK_EDITOR_CURSOR_BOUNDARY,
  NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY,
  NOTEBOOK_EDITOR_ID,
  NOTEBOOK_MULTI_DIFF_EDITOR_ID,
  NOTEBOOK_OUTPUT_EDITOR_ID,
  NotebookCellExecutionState,
  NotebookCellsChangeType,
  NotebookEditorPriority,
  NotebookExecutionState,
  NotebookFindScopeType,
  NotebookMetadataUri,
  NotebookRendererMatch,
  NotebookRunState,
  NotebookSetting,
  NotebookWorkingCopyTypeIdentifier,
  RENDERER_EQUIVALENT_EXTENSIONS,
  RENDERER_NOT_AVAILABLE,
  REPL_EDITOR_ID,
  RendererMessagingSpec,
  SelectionStateType,
  compressOutputItemStreams,
  diff,
  isDocumentExcludePattern,
  notebookDocumentFilterMatch
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxjb21tb25cXG5vdGVib29rQ29tbW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSURpZmZSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kaWZmL2RpZmYuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTcGxpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBlZGl0b3JDb21tb24gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgQ29tbWFuZCwgV29ya3NwYWNlRWRpdE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVJlYWRvbmx5VGV4dEJ1ZmZlciwgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVSZWFkTGltaXRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElDZWxsRXhlY3V0aW9uRXJyb3IgfSBmcm9tICcuL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1RleHRNb2RlbExpa2UgfSBmcm9tICcuL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2VsbFJhbmdlIH0gZnJvbSAnLi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlTWV0YWRhdGFVcmksIGdlbmVyYXRlIGFzIGdlbmVyYXRlVXJpLCBleHRyYWN0Q2VsbE91dHB1dERldGFpbHMsIHBhcnNlTWV0YWRhdGFVcmksIHBhcnNlIGFzIHBhcnNlVXJpIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cE1ldGEsIElXb3JraW5nQ29weVNhdmVFdmVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBTbmFwc2hvdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vZmlsZVdvcmtpbmdDb3B5LmpzJztcblxuZXhwb3J0IGNvbnN0IE5PVEVCT09LX0VESVRPUl9JRCA9ICd3b3JrYmVuY2guZWRpdG9yLm5vdGVib29rJztcbmV4cG9ydCBjb25zdCBOT1RFQk9PS19ESUZGX0VESVRPUl9JRCA9ICd3b3JrYmVuY2guZWRpdG9yLm5vdGVib29rVGV4dERpZmZFZGl0b3InO1xuZXhwb3J0IGNvbnN0IE5PVEVCT09LX01VTFRJX0RJRkZfRURJVE9SX0lEID0gJ3dvcmtiZW5jaC5lZGl0b3Iubm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yJztcbmV4cG9ydCBjb25zdCBJTlRFUkFDVElWRV9XSU5ET1dfRURJVE9SX0lEID0gJ3dvcmtiZW5jaC5lZGl0b3IuaW50ZXJhY3RpdmUnO1xuZXhwb3J0IGNvbnN0IFJFUExfRURJVE9SX0lEID0gJ3dvcmtiZW5jaC5lZGl0b3IucmVwbCc7XG5leHBvcnQgY29uc3QgTk9URUJPT0tfT1VUUFVUX0VESVRPUl9JRCA9ICd3b3JrYmVuY2guZWRpdG9yLm5vdGVib29rT3V0cHV0RWRpdG9yJztcblxuZXhwb3J0IGNvbnN0IEVYRUNVVEVfUkVQTF9DT01NQU5EX0lEID0gJ3JlcGxOb3RlYm9vay5pbnB1dC5leGVjdXRlJztcblxuZXhwb3J0IGVudW0gQ2VsbEtpbmQge1xuXHRNYXJrdXAgPSAxLFxuXHRDb2RlID0gMlxufVxuXG5leHBvcnQgY29uc3QgTk9URUJPT0tfRElTUExBWV9PUkRFUjogcmVhZG9ubHkgc3RyaW5nW10gPSBbXG5cdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0J2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnLFxuXHQndGV4dC9odG1sJyxcblx0J2ltYWdlL3N2Zyt4bWwnLFxuXHRNaW1lcy5sYXRleCxcblx0TWltZXMubWFya2Rvd24sXG5cdCdpbWFnZS9wbmcnLFxuXHQnaW1hZ2UvanBlZycsXG5cdE1pbWVzLnRleHRcbl07XG5cbmV4cG9ydCBjb25zdCBBQ0NFU1NJQkxFX05PVEVCT09LX0RJU1BMQVlfT1JERVI6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHRNaW1lcy5sYXRleCxcblx0TWltZXMubWFya2Rvd24sXG5cdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0J3RleHQvaHRtbCcsXG5cdCdpbWFnZS9zdmcreG1sJyxcblx0J2ltYWdlL3BuZycsXG5cdCdpbWFnZS9qcGVnJyxcblx0TWltZXMudGV4dCxcbl07XG5cbi8qKlxuICogQSBtYXBwaW5nIG9mIGV4dGVuc2lvbiBJRHMgd2hvIGNvbnRhaW4gcmVuZGVyZXJzLCB0byBub3RlYm9vayBpZHMgd2hvIHRoZXlcbiAqIHNob3VsZCBiZSB0cmVhdGVkIGFzIHRoZSBzYW1lIGluIHRoZSByZW5kZXJlciBzZWxlY3Rpb24gbG9naWMuIFRoaXMgaXMgdXNlZFxuICogdG8gcHJlZmVyIHRoZSAxc3QgcGFydHkgSnVweXRlciByZW5kZXJlcnMgZXZlbiB0aG91Z2ggdGhleSdyZSBpbiBhIHNlcGFyYXRlXG4gKiBleHRlbnNpb24sIGZvciBpbnN0YW5jZS4gU2VlICMxMzYyNDcuXG4gKi9cbmV4cG9ydCBjb25zdCBSRU5ERVJFUl9FUVVJVkFMRU5UX0VYVEVOU0lPTlM6IFJlYWRvbmx5TWFwPHN0cmluZywgUmVhZG9ubHlTZXQ8c3RyaW5nPj4gPSBuZXcgTWFwKFtcblx0Wydtcy10b29sc2FpLmp1cHl0ZXInLCBuZXcgU2V0KFsnanVweXRlci1ub3RlYm9vaycsICdpbnRlcmFjdGl2ZSddKV0sXG5cdFsnbXMtdG9vbHNhaS5qdXB5dGVyLXJlbmRlcmVycycsIG5ldyBTZXQoWydqdXB5dGVyLW5vdGVib29rJywgJ2ludGVyYWN0aXZlJ10pXSxcbl0pO1xuXG5leHBvcnQgY29uc3QgUkVOREVSRVJfTk9UX0FWQUlMQUJMRSA9ICdfbm90QXZhaWxhYmxlJztcblxuZXhwb3J0IHR5cGUgQ29udHJpYnV0ZWROb3RlYm9va1JlbmRlcmVyRW50cnlwb2ludCA9IHN0cmluZyB8IHsgcmVhZG9ubHkgZXh0ZW5kczogc3RyaW5nOyByZWFkb25seSBwYXRoOiBzdHJpbmcgfTtcblxuZXhwb3J0IGVudW0gTm90ZWJvb2tSdW5TdGF0ZSB7XG5cdFJ1bm5pbmcgPSAxLFxuXHRJZGxlID0gMlxufVxuXG5leHBvcnQgdHlwZSBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGEgPSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuZXhwb3J0IGVudW0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUge1xuXHRVbmNvbmZpcm1lZCA9IDEsXG5cdFBlbmRpbmcgPSAyLFxuXHRFeGVjdXRpbmcgPSAzXG59XG5leHBvcnQgZW51bSBOb3RlYm9va0V4ZWN1dGlvblN0YXRlIHtcblx0VW5jb25maXJtZWQgPSAxLFxuXHRQZW5kaW5nID0gMixcblx0RXhlY3V0aW5nID0gM1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0NlbGxQcmV2aW91c0V4ZWN1dGlvblJlc3VsdCB7XG5cdGV4ZWN1dGlvbk9yZGVyPzogbnVtYmVyO1xuXHRzdWNjZXNzPzogYm9vbGVhbjtcblx0ZHVyYXRpb24/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsTWV0YWRhdGEge1xuXHQvKipcblx0ICogY3VzdG9tIG1ldGFkYXRhXG5cdCAqL1xuXHRba2V5OiBzdHJpbmddOiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEge1xuXHQvKipcblx0ICogVXNlZCBvbmx5IGZvciBkaWZmaW5nIG9mIE5vdGVib29rcy5cblx0ICogVGhpcyBpcyBub3QgcGVyc2lzdGVkIGFuZCBnZW5lcmFsbHkgdXNlZnVsIG9ubHkgd2hlbiBkaWZmaW5nIHR3byBub3RlYm9va3MuXG5cdCAqIFVzZWZ1bCBvbmx5IGFmdGVyIHdlJ3ZlIG1hbnVhbGx5IG1hdGNoZWQgYSBmZXcgY2VsbHMgdG9nZXRoZXIgc28gd2Uga25vdyB3aGljaCBjZWxscyBhcmUgbWF0Y2hpbmcuXG5cdCAqL1xuXHRpbnRlcm5hbElkPzogc3RyaW5nO1xuXHRleGVjdXRpb25JZD86IHN0cmluZztcblx0ZXhlY3V0aW9uT3JkZXI/OiBudW1iZXI7XG5cdGxhc3RSdW5TdWNjZXNzPzogYm9vbGVhbjtcblx0cnVuU3RhcnRUaW1lPzogbnVtYmVyO1xuXHRydW5TdGFydFRpbWVBZGp1c3RtZW50PzogbnVtYmVyO1xuXHRydW5FbmRUaW1lPzogbnVtYmVyO1xuXHRyZW5kZXJEdXJhdGlvbj86IHsgW2tleTogc3RyaW5nXTogbnVtYmVyIH07XG5cdGVycm9yPzogSUNlbGxFeGVjdXRpb25FcnJvcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxDb2xsYXBzZVN0YXRlIHtcblx0aW5wdXRDb2xsYXBzZWQ/OiBib29sZWFuO1xuXHRvdXRwdXRDb2xsYXBzZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbERlZmF1bHRDb2xsYXBzZUNvbmZpZyB7XG5cdGNvZGVDZWxsPzogTm90ZWJvb2tDZWxsQ29sbGFwc2VTdGF0ZTtcblx0bWFya3VwQ2VsbD86IE5vdGVib29rQ2VsbENvbGxhcHNlU3RhdGU7XG59XG5cbmV4cG9ydCB0eXBlIEludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMgPSAnYWx3YXlzJyB8ICduZXZlcicgfCAnZnJvbUVkaXRvcic7XG5cbmV4cG9ydCB0eXBlIFRyYW5zaWVudENlbGxNZXRhZGF0YSA9IHsgcmVhZG9ubHkgW0sgaW4ga2V5b2YgTm90ZWJvb2tDZWxsTWV0YWRhdGFdPzogYm9vbGVhbiB9O1xuZXhwb3J0IHR5cGUgQ2VsbENvbnRlbnRNZXRhZGF0YSA9IHsgcmVhZG9ubHkgW0sgaW4ga2V5b2YgTm90ZWJvb2tDZWxsTWV0YWRhdGFdPzogYm9vbGVhbiB9O1xuZXhwb3J0IHR5cGUgVHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSA9IHsgcmVhZG9ubHkgW0sgaW4ga2V5b2YgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhXT86IGJvb2xlYW4gfTtcblxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2llbnRPcHRpb25zIHtcblx0cmVhZG9ubHkgdHJhbnNpZW50T3V0cHV0czogYm9vbGVhbjtcblx0cmVhZG9ubHkgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiBUcmFuc2llbnRDZWxsTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IFRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE7XG5cdHJlYWRvbmx5IGNlbGxDb250ZW50TWV0YWRhdGE6IENlbGxDb250ZW50TWV0YWRhdGE7XG59XG5cbi8qKiBOb3RlOiBlbnVtIHZhbHVlcyBhcmUgdXNlZCBmb3Igc29ydGluZyAqL1xuZXhwb3J0IGNvbnN0IGVudW0gTm90ZWJvb2tSZW5kZXJlck1hdGNoIHtcblx0LyoqIFJlbmRlcmVyIGhhcyBhIGhhcmQgZGVwZW5kZW5jeSBvbiBhbiBhdmFpbGFibGUga2VybmVsICovXG5cdFdpdGhIYXJkS2VybmVsRGVwZW5kZW5jeSA9IDAsXG5cdC8qKiBSZW5kZXJlciB3b3JrcyBiZXR0ZXIgd2l0aCBhbiBhdmFpbGFibGUga2VybmVsICovXG5cdFdpdGhPcHRpb25hbEtlcm5lbERlcGVuZGVuY3kgPSAxLFxuXHQvKiogUmVuZGVyZXIgaXMga2VybmVsLWFnbm9zdGljICovXG5cdFB1cmUgPSAyLFxuXHQvKiogUmVuZGVyZXIgaXMgZm9yIGEgZGlmZmVyZW50IG1pbWVUeXBlIG9yIGhhcyBhIGhhcmQgZGVwZW5kZW5jeSB3aGljaCBpcyB1bnNhdGlzZmllZCAqL1xuXHROZXZlciA9IDMsXG59XG5cbi8qKlxuICogUmVuZGVyZXIgbWVzc2FnaW5nIHJlcXVpcmVtZW50LiBXaGlsZSB0aGlzIGFsbG93cyBmb3IgJ29wdGlvbmFsJyBtZXNzYWdpbmcsXG4gKiBWUyBDb2RlIGVmZmVjdGl2ZWx5IHRyZWF0cyBpdCB0aGUgc2FtZSBhcyB0cnVlIHJpZ2h0IG5vdy4gXCJQYXJ0aWFsXG4gKiBhY3RpdmF0aW9uXCIgb2YgZXh0ZW5zaW9ucyBpcyBhIHZlcnkgdHJpY2t5IHByb2JsZW0sIHdoaWNoIGNvdWxkIGFsbG93XG4gKiBzb2x2aW5nIHRoaXMuIEJ1dCBmb3Igbm93LCBvcHRpb25hbCBpcyBtb3N0bHkgb25seSBob25vcmVkIGZvciBhem5iLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBSZW5kZXJlck1lc3NhZ2luZ1NwZWMge1xuXHRBbHdheXMgPSAnYWx3YXlzJyxcblx0TmV2ZXIgPSAnbmV2ZXInLFxuXHRPcHRpb25hbCA9ICdvcHRpb25hbCcsXG59XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rUmVuZGVyZXJFbnRyeXBvaW50ID0geyByZWFkb25seSBleHRlbmRzOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHJlYWRvbmx5IHBhdGg6IFVSSSB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va1JlbmRlcmVySW5mbyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVudHJ5cG9pbnQ6IE5vdGVib29rUmVuZGVyZXJFbnRyeXBvaW50O1xuXHRyZWFkb25seSBleHRlbnNpb25Mb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgbWVzc2FnaW5nOiBSZW5kZXJlck1lc3NhZ2luZ1NwZWM7XG5cblx0cmVhZG9ubHkgbWltZVR5cGVzOiByZWFkb25seSBzdHJpbmdbXTtcblxuXHRyZWFkb25seSBpc0J1aWx0aW46IGJvb2xlYW47XG5cblx0bWF0Y2hlc1dpdGhvdXRLZXJuZWwobWltZVR5cGU6IHN0cmluZyk6IE5vdGVib29rUmVuZGVyZXJNYXRjaDtcblx0bWF0Y2hlcyhtaW1lVHlwZTogc3RyaW5nLCBrZXJuZWxQcm92aWRlczogUmVhZG9ubHlBcnJheTxzdHJpbmc+KTogTm90ZWJvb2tSZW5kZXJlck1hdGNoO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va1N0YXRpY1ByZWxvYWRJbmZvIHtcblx0cmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBlbnRyeXBvaW50OiBVUkk7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbkxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IGxvY2FsUmVzb3VyY2VSb290czogcmVhZG9ubHkgVVJJW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9yZGVyZWRNaW1lVHlwZSB7XG5cdG1pbWVUeXBlOiBzdHJpbmc7XG5cdHJlbmRlcmVySWQ6IHN0cmluZztcblx0aXNUcnVzdGVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPdXRwdXRJdGVtRHRvIHtcblx0cmVhZG9ubHkgbWltZTogc3RyaW5nO1xuXHRyZWFkb25seSBkYXRhOiBWU0J1ZmZlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3V0cHV0RHRvIHtcblx0b3V0cHV0czogSU91dHB1dEl0ZW1EdG9bXTtcblx0b3V0cHV0SWQ6IHN0cmluZztcblx0bWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsT3V0cHV0IHtcblx0cmVhZG9ubHkgdmVyc2lvbklkOiBudW1iZXI7XG5cdG91dHB1dHM6IElPdXRwdXRJdGVtRHRvW107XG5cdG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgYW55Pjtcblx0b3V0cHV0SWQ6IHN0cmluZztcblx0LyoqXG5cdCAqIEFsdGVybmF0aXZlIG91dHB1dCBpZCB0aGF0J3MgcmV1c2VkIHdoZW4gdGhlIG91dHB1dCBpcyB1cGRhdGVkLlxuXHQgKi9cblx0YWx0ZXJuYXRpdmVPdXRwdXRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURhdGE6IEV2ZW50PHZvaWQ+O1xuXHRyZXBsYWNlRGF0YShpdGVtczogSU91dHB1dER0byk6IHZvaWQ7XG5cdGFwcGVuZERhdGEoaXRlbXM6IElPdXRwdXRJdGVtRHRvW10pOiB2b2lkO1xuXHRhcHBlbmRlZFNpbmNlVmVyc2lvbih2ZXJzaW9uSWQ6IG51bWJlciwgbWltZTogc3RyaW5nKTogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cdGFzRHRvKCk6IElPdXRwdXREdG87XG5cdGJ1bXBWZXJzaW9uKCk6IHZvaWQ7XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDZWxsSW50ZXJuYWxNZXRhZGF0YUNoYW5nZWRFdmVudCB7XG5cdHJlYWRvbmx5IGxhc3RSdW5TdWNjZXNzQ2hhbmdlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVRleHRNb2RlbCB7XG5cdC8qKlxuXHQgKiBOb3RlYm9vayBNZXRhZGF0YSBVcmkuXG5cdCAqL1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0LyoqXG5cdCAqIFRyaWdnZXJlZCB3aGVuIHRoZSBOb3RlYm9vayBNZXRhZGF0YSBjaGFuZ2VzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBtZXRhZGF0YTogUmVhZG9ubHk8Tm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhPjtcblx0cmVhZG9ubHkgdGV4dEJ1ZmZlcjogSVJlYWRvbmx5VGV4dEJ1ZmZlcjtcblx0LyoqXG5cdCAqIFRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIE5vdGVib29rIE1ldGFkYXRhXG5cdCAqL1xuXHRnZXRWYWx1ZSgpOiBzdHJpbmc7XG5cdGdldEhhc2goKTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsIHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRsYW5ndWFnZTogc3RyaW5nO1xuXHRjZWxsS2luZDogQ2VsbEtpbmQ7XG5cdG91dHB1dHM6IElDZWxsT3V0cHV0W107XG5cdG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YTtcblx0aW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YTtcblx0Z2V0SGFzaFZhbHVlKCk6IG51bWJlcjtcblx0dGV4dEJ1ZmZlcjogSVJlYWRvbmx5VGV4dEJ1ZmZlcjtcblx0dGV4dE1vZGVsPzogSVRleHRNb2RlbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUZXh0TW9kZWw6IEV2ZW50PHZvaWQ+O1xuXHRnZXRWYWx1ZSgpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3V0cHV0cz86IEV2ZW50PE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2U+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU91dHB1dEl0ZW1zPzogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2U6IEV2ZW50PHN0cmluZz47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWV0YWRhdGE6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUludGVybmFsTWV0YWRhdGE6IEV2ZW50PENlbGxJbnRlcm5hbE1ldGFkYXRhQ2hhbmdlZEV2ZW50Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tTbmFwc2hvdE9wdGlvbnMge1xuXHRjb250ZXh0OiBTbmFwc2hvdENvbnRleHQ7XG5cdG91dHB1dFNpemVMaW1pdDogbnVtYmVyO1xuXHR0cmFuc2llbnRPcHRpb25zPzogVHJhbnNpZW50T3B0aW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tUZXh0TW9kZWwgZXh0ZW5kcyBJTm90ZWJvb2tUZXh0TW9kZWxMaWtlLCBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG5vdGVib29rVHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nO1xuXHRtZXRhZGF0YTogTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhO1xuXHRyZWFkb25seSB0cmFuc2llbnRPcHRpb25zOiBUcmFuc2llbnRPcHRpb25zO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgdmVyc2lvbklkOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXHRyZWFkb25seSBjZWxsczogcmVhZG9ubHkgSUNlbGxbXTtcblx0cmVzZXQoY2VsbHM6IElDZWxsRHRvMltdLCBtZXRhZGF0YTogTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhLCB0cmFuc2llbnRPcHRpb25zOiBUcmFuc2llbnRPcHRpb25zKTogdm9pZDtcblx0Y3JlYXRlU25hcHNob3Qob3B0aW9uczogSU5vdGVib29rU25hcHNob3RPcHRpb25zKTogTm90ZWJvb2tEYXRhO1xuXHRyZXN0b3JlU25hcHNob3Qoc25hcHNob3Q6IE5vdGVib29rRGF0YSwgdHJhbnNpZW50T3B0aW9ucz86IFRyYW5zaWVudE9wdGlvbnMpOiB2b2lkO1xuXHRhcHBseUVkaXRzKHJhd0VkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSwgc3luY2hyb25vdXM6IGJvb2xlYW4sIGJlZ2luU2VsZWN0aW9uU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCwgZW5kU2VsZWN0aW9uc0NvbXB1dGVyOiAoKSA9PiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAgfCB1bmRlZmluZWQsIGNvbXB1dGVVbmRvUmVkbz86IGJvb2xlYW4pOiBib29sZWFuO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZTogRXZlbnQ8dm9pZD47XG59XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZTxUPiA9IFtcblx0c3RhcnQ6IG51bWJlcixcblx0ZGVsZXRlQ291bnQ6IG51bWJlcixcblx0bmV3SXRlbXM6IFRbXVxuXTtcblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tDZWxsT3V0cHV0c1NwbGljZSA9IHtcblx0c3RhcnQ6IG51bWJlciAvKiBzdGFydCAqLztcblx0ZGVsZXRlQ291bnQ6IG51bWJlciAvKiBkZWxldGUgY291bnQgKi87XG5cdG5ld091dHB1dHM6IElDZWxsT3V0cHV0W107XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElNYWluQ2VsbER0byB7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHR1cmw6IHN0cmluZztcblx0c291cmNlOiBzdHJpbmdbXTtcblx0ZW9sOiBzdHJpbmc7XG5cdHZlcnNpb25JZDogbnVtYmVyO1xuXHRsYW5ndWFnZTogc3RyaW5nO1xuXHRjZWxsS2luZDogQ2VsbEtpbmQ7XG5cdG91dHB1dHM6IElPdXRwdXREdG9bXTtcblx0bWV0YWRhdGE/OiBOb3RlYm9va0NlbGxNZXRhZGF0YTtcblx0aW50ZXJuYWxNZXRhZGF0YT86IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlIHtcblx0TW9kZWxDaGFuZ2UgPSAxLFxuXHRNb3ZlID0gMixcblx0Q2hhbmdlQ2VsbExhbmd1YWdlID0gNSxcblx0SW5pdGlhbGl6ZSA9IDYsXG5cdENoYW5nZUNlbGxNZXRhZGF0YSA9IDcsXG5cdE91dHB1dCA9IDgsXG5cdE91dHB1dEl0ZW0gPSA5LFxuXHRDaGFuZ2VDZWxsQ29udGVudCA9IDEwLFxuXHRDaGFuZ2VEb2N1bWVudE1ldGFkYXRhID0gMTEsXG5cdENoYW5nZUNlbGxJbnRlcm5hbE1ldGFkYXRhID0gMTIsXG5cdENoYW5nZUNlbGxNaW1lID0gMTMsXG5cdFVua25vd24gPSAxMDBcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxzSW5pdGlhbGl6ZUV2ZW50PFQ+IHtcblx0cmVhZG9ubHkga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuSW5pdGlhbGl6ZTtcblx0cmVhZG9ubHkgY2hhbmdlczogTm90ZWJvb2tDZWxsVGV4dE1vZGVsU3BsaWNlPFQ+W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsQ29udGVudENoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQ7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsc01vZGVsQ2hhbmdlZEV2ZW50PFQ+IHtcblx0cmVhZG9ubHkga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2U7XG5cdHJlYWRvbmx5IGNoYW5nZXM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZTxUPltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbHNNb2RlbE1vdmVFdmVudDxUPiB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmU7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXHRyZWFkb25seSBuZXdJZHg6IG51bWJlcjtcblx0cmVhZG9ubHkgY2VsbHM6IFRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va091dHB1dENoYW5nZWRFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dDtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0czogSU91dHB1dER0b1tdO1xuXHRyZWFkb25seSBhcHBlbmQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tPdXRwdXRJdGVtQ2hhbmdlZEV2ZW50IHtcblx0cmVhZG9ubHkga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuT3V0cHV0SXRlbTtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgb3V0cHV0SXRlbXM6IElPdXRwdXRJdGVtRHRvW107XG5cdHJlYWRvbmx5IGFwcGVuZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxzQ2hhbmdlTGFuZ3VhZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxMYW5ndWFnZTtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFuZ3VhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxzQ2hhbmdlTWltZUV2ZW50IHtcblx0cmVhZG9ubHkga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1pbWU7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxzQ2hhbmdlTWV0YWRhdGFFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNZXRhZGF0YTtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbHNDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YTtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgaW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0RvY3VtZW50Q2hhbmdlTWV0YWRhdGFFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZURvY3VtZW50TWV0YWRhdGE7XG5cdHJlYWRvbmx5IG1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tEb2N1bWVudFVua25vd25DaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLlVua25vd247XG59XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rUmF3Q29udGVudEV2ZW50RHRvID0gTm90ZWJvb2tDZWxsc0luaXRpYWxpemVFdmVudDxJTWFpbkNlbGxEdG8+IHwgTm90ZWJvb2tEb2N1bWVudENoYW5nZU1ldGFkYXRhRXZlbnQgfCBOb3RlYm9va0NlbGxDb250ZW50Q2hhbmdlRXZlbnQgfCBOb3RlYm9va0NlbGxzTW9kZWxDaGFuZ2VkRXZlbnQ8SU1haW5DZWxsRHRvPiB8IE5vdGVib29rQ2VsbHNNb2RlbE1vdmVFdmVudDxJTWFpbkNlbGxEdG8+IHwgTm90ZWJvb2tPdXRwdXRDaGFuZ2VkRXZlbnQgfCBOb3RlYm9va091dHB1dEl0ZW1DaGFuZ2VkRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlTGFuZ3VhZ2VFdmVudCB8IE5vdGVib29rQ2VsbHNDaGFuZ2VNaW1lRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlTWV0YWRhdGFFdmVudCB8IE5vdGVib29rQ2VsbHNDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhRXZlbnQgfCBOb3RlYm9va0RvY3VtZW50VW5rbm93bkNoYW5nZUV2ZW50O1xuXG5leHBvcnQgdHlwZSBOb3RlYm9va0NlbGxzQ2hhbmdlZEV2ZW50RHRvID0ge1xuXHRyZWFkb25seSByYXdFdmVudHM6IE5vdGVib29rUmF3Q29udGVudEV2ZW50RHRvW107XG5cdHJlYWRvbmx5IHZlcnNpb25JZDogbnVtYmVyO1xufTtcblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tSYXdDb250ZW50RXZlbnQgPSAoTm90ZWJvb2tDZWxsc0luaXRpYWxpemVFdmVudDxJQ2VsbD4gfCBOb3RlYm9va0RvY3VtZW50Q2hhbmdlTWV0YWRhdGFFdmVudCB8IE5vdGVib29rQ2VsbENvbnRlbnRDaGFuZ2VFdmVudCB8IE5vdGVib29rQ2VsbHNNb2RlbENoYW5nZWRFdmVudDxJQ2VsbD4gfCBOb3RlYm9va0NlbGxzTW9kZWxNb3ZlRXZlbnQ8SUNlbGw+IHwgTm90ZWJvb2tPdXRwdXRDaGFuZ2VkRXZlbnQgfCBOb3RlYm9va091dHB1dEl0ZW1DaGFuZ2VkRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlTGFuZ3VhZ2VFdmVudCB8IE5vdGVib29rQ2VsbHNDaGFuZ2VNaW1lRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlTWV0YWRhdGFFdmVudCB8IE5vdGVib29rQ2VsbHNDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhRXZlbnQgfCBOb3RlYm9va0RvY3VtZW50VW5rbm93bkNoYW5nZUV2ZW50KSAmIHsgdHJhbnNpZW50OiBib29sZWFuIH07XG5cbmV4cG9ydCBlbnVtIFNlbGVjdGlvblN0YXRlVHlwZSB7XG5cdEhhbmRsZSA9IDAsXG5cdEluZGV4ID0gMVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWxlY3Rpb25IYW5kbGVTdGF0ZSB7XG5cdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5IYW5kbGU7XG5cdHByaW1hcnk6IG51bWJlciB8IG51bGw7XG5cdHNlbGVjdGlvbnM6IG51bWJlcltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWxlY3Rpb25JbmRleFN0YXRlIHtcblx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4O1xuXHRmb2N1czogSUNlbGxSYW5nZTtcblx0c2VsZWN0aW9uczogSUNlbGxSYW5nZVtdO1xufVxuXG5leHBvcnQgdHlwZSBJU2VsZWN0aW9uU3RhdGUgPSBJU2VsZWN0aW9uSGFuZGxlU3RhdGUgfCBJU2VsZWN0aW9uSW5kZXhTdGF0ZTtcblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQgPSB7XG5cdHJlYWRvbmx5IHJhd0V2ZW50czogTm90ZWJvb2tSYXdDb250ZW50RXZlbnRbXTtcblx0cmVhZG9ubHkgdmVyc2lvbklkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHN5bmNocm9ub3VzOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBlbmRTZWxlY3Rpb25TdGF0ZTogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tUZXh0TW9kZWxXaWxsQWRkUmVtb3ZlRXZlbnQgPSB7XG5cdHJlYWRvbmx5IHJhd0V2ZW50OiBOb3RlYm9va0NlbGxzTW9kZWxDaGFuZ2VkRXZlbnQ8SUNlbGw+O1xufTtcblxuZXhwb3J0IGNvbnN0IGVudW0gQ2VsbEVkaXRUeXBlIHtcblx0UmVwbGFjZSA9IDEsXG5cdE91dHB1dCA9IDIsXG5cdE1ldGFkYXRhID0gMyxcblx0Q2VsbExhbmd1YWdlID0gNCxcblx0RG9jdW1lbnRNZXRhZGF0YSA9IDUsXG5cdE1vdmUgPSA2LFxuXHRPdXRwdXRJdGVtcyA9IDcsXG5cdFBhcnRpYWxNZXRhZGF0YSA9IDgsXG5cdFBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhID0gOSxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbER0bzIge1xuXHRzb3VyY2U6IHN0cmluZztcblx0bGFuZ3VhZ2U6IHN0cmluZztcblx0bWltZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjZWxsS2luZDogQ2VsbEtpbmQ7XG5cdG91dHB1dHM6IElPdXRwdXREdG9bXTtcblx0bWV0YWRhdGE/OiBOb3RlYm9va0NlbGxNZXRhZGF0YTtcblx0aW50ZXJuYWxNZXRhZGF0YT86IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG5cdGNvbGxhcHNlU3RhdGU/OiBOb3RlYm9va0NlbGxDb2xsYXBzZVN0YXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsUmVwbGFjZUVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2U7XG5cdGluZGV4OiBudW1iZXI7XG5cdGNvdW50OiBudW1iZXI7XG5cdGNlbGxzOiBJQ2VsbER0bzJbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbE91dHB1dEVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dDtcblx0aW5kZXg6IG51bWJlcjtcblx0b3V0cHV0czogSU91dHB1dER0b1tdO1xuXHRhcHBlbmQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsT3V0cHV0RWRpdEJ5SGFuZGxlIHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQ7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRvdXRwdXRzOiBJT3V0cHV0RHRvW107XG5cdGFwcGVuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxPdXRwdXRJdGVtRWRpdCB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXM7XG5cdG91dHB1dElkOiBzdHJpbmc7XG5cdGl0ZW1zOiBJT3V0cHV0SXRlbUR0b1tdO1xuXHRhcHBlbmQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsTWV0YWRhdGFFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YTtcblx0aW5kZXg6IG51bWJlcjtcblx0bWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhO1xufVxuXG4vLyBUaGVzZSB0eXBlcyBhcmUgbnVsbGFibGUgYmVjYXVzZSB3ZSBuZWVkIHRvIHVzZSAnbnVsbCcgb24gdGhlIEVIIHNpZGUgc28gaXQgaXMgSlNPTi1zdHJpbmdpZmllZFxuZXhwb3J0IHR5cGUgTnVsbGFibGVQYXJ0aWFsTm90ZWJvb2tDZWxsTWV0YWRhdGEgPSB7XG5cdFtLZXkgaW4ga2V5b2YgUGFydGlhbDxOb3RlYm9va0NlbGxNZXRhZGF0YT5dOiBOb3RlYm9va0NlbGxNZXRhZGF0YVtLZXldIHwgbnVsbFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlBhcnRpYWxNZXRhZGF0YTtcblx0aW5kZXg6IG51bWJlcjtcblx0bWV0YWRhdGE6IE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsUGFydGlhbE1ldGFkYXRhRWRpdEJ5SGFuZGxlIHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsTWV0YWRhdGE7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRtZXRhZGF0YTogTnVsbGFibGVQYXJ0aWFsTm90ZWJvb2tDZWxsTWV0YWRhdGE7XG59XG5cbmV4cG9ydCB0eXBlIE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEgPSB7XG5cdFtLZXkgaW4ga2V5b2YgUGFydGlhbDxOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhPl06IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGFbS2V5XSB8IG51bGxcbn07XG5leHBvcnQgaW50ZXJmYWNlIElDZWxsUGFydGlhbEludGVybmFsTWV0YWRhdGFFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YTtcblx0aW5kZXg6IG51bWJlcjtcblx0aW50ZXJuYWxNZXRhZGF0YTogTnVsbGFibGVQYXJ0aWFsTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbFBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhRWRpdEJ5SGFuZGxlIHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YTtcblx0aGFuZGxlOiBudW1iZXI7XG5cdGludGVybmFsTWV0YWRhdGE6IE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxMYW5ndWFnZUVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLkNlbGxMYW5ndWFnZTtcblx0aW5kZXg6IG51bWJlcjtcblx0bGFuZ3VhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRG9jdW1lbnRNZXRhZGF0YUVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLkRvY3VtZW50TWV0YWRhdGE7XG5cdG1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxNb3ZlRWRpdCB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTW92ZTtcblx0aW5kZXg6IG51bWJlcjtcblx0bGVuZ3RoOiBudW1iZXI7XG5cdG5ld0lkeDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBJSW1tZWRpYXRlQ2VsbEVkaXRPcGVyYXRpb24gPSBJQ2VsbE91dHB1dEVkaXRCeUhhbmRsZSB8IElDZWxsUGFydGlhbE1ldGFkYXRhRWRpdEJ5SGFuZGxlIHwgSUNlbGxPdXRwdXRJdGVtRWRpdCB8IElDZWxsUGFydGlhbEludGVybmFsTWV0YWRhdGFFZGl0IHwgSUNlbGxQYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YUVkaXRCeUhhbmRsZSB8IElDZWxsUGFydGlhbE1ldGFkYXRhRWRpdDtcbmV4cG9ydCB0eXBlIElDZWxsRWRpdE9wZXJhdGlvbiA9IElJbW1lZGlhdGVDZWxsRWRpdE9wZXJhdGlvbiB8IElDZWxsUmVwbGFjZUVkaXQgfCBJQ2VsbE91dHB1dEVkaXQgfCBJQ2VsbE1ldGFkYXRhRWRpdCB8IElDZWxsUGFydGlhbE1ldGFkYXRhRWRpdCB8IElDZWxsUGFydGlhbEludGVybmFsTWV0YWRhdGFFZGl0IHwgSURvY3VtZW50TWV0YWRhdGFFZGl0IHwgSUNlbGxNb3ZlRWRpdCB8IElDZWxsT3V0cHV0SXRlbUVkaXQgfCBJQ2VsbExhbmd1YWdlRWRpdDtcblxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VOb3RlYm9va0NlbGxFZGl0IHtcblx0bWV0YWRhdGE/OiBXb3Jrc3BhY2VFZGl0TWV0YWRhdGE7XG5cdHJlc291cmNlOiBVUkk7XG5cdG5vdGVib29rVmVyc2lvbklkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNlbGxFZGl0OiBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXQgfCBJRG9jdW1lbnRNZXRhZGF0YUVkaXQgfCBJQ2VsbFJlcGxhY2VFZGl0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VOb3RlYm9va0NlbGxFZGl0RHRvIHtcblx0bWV0YWRhdGE/OiBXb3Jrc3BhY2VFZGl0TWV0YWRhdGE7XG5cdHJlc291cmNlOiBVUkk7XG5cdG5vdGVib29rVmVyc2lvbklkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNlbGxFZGl0OiBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXQgfCBJRG9jdW1lbnRNZXRhZGF0YUVkaXQgfCBJQ2VsbFJlcGxhY2VFZGl0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rRGF0YSB7XG5cdHJlYWRvbmx5IGNlbGxzOiBJQ2VsbER0bzJbXTtcblx0cmVhZG9ubHkgbWV0YWRhdGE6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YTtcbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0NvbnRyaWJ1dGlvbkRhdGEge1xuXHRleHRlbnNpb24/OiBFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRwcm92aWRlckRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdGZpbGVuYW1lUGF0dGVybjogKHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiB8IElOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50RmlsdGVyKVtdO1xuXHRwcmlvcml0eT86IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBOb3RlYm9va01ldGFkYXRhVXJpIHtcblx0ZXhwb3J0IGNvbnN0IHNjaGVtZSA9IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tNZXRhZGF0YTtcblx0ZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlKG5vdGVib29rOiBVUkkpOiBVUkkge1xuXHRcdHJldHVybiBnZW5lcmF0ZU1ldGFkYXRhVXJpKG5vdGVib29rKTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2UobWV0YWRhdGE6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHBhcnNlTWV0YWRhdGFVcmkobWV0YWRhdGEpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2VsbFVyaSB7XG5cdGV4cG9ydCBjb25zdCBzY2hlbWUgPSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlKG5vdGVib29rOiBVUkksIGhhbmRsZTogbnVtYmVyKTogVVJJIHtcblx0XHRyZXR1cm4gZ2VuZXJhdGVVcmkobm90ZWJvb2ssIGhhbmRsZSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2UoY2VsbDogVVJJKTogeyBub3RlYm9vazogVVJJOyBoYW5kbGU6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gcGFyc2VVcmkoY2VsbCk7XG5cdH1cblxuXHQvKipcblx0ICogR2VuZXJhdGVzIGEgVVJJIGZvciBhIGNlbGwgb3V0cHV0IGluIGEgbm90ZWJvb2sgdXNpbmcgdGhlIG91dHB1dCBJRC5cblx0ICogVXNlZCB3aGVuIFVSSSBzaG91bGQgYmUgb3BlbmVkIGFzIHRleHQgaW4gdGhlIGVkaXRvci5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNlbGxPdXRwdXRVcmlXaXRoSWQobm90ZWJvb2s6IFVSSSwgb3V0cHV0SWQ/OiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbm90ZWJvb2sud2l0aCh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0LFxuXHRcdFx0cXVlcnk6IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xuXHRcdFx0XHRvcGVuSW46ICdlZGl0b3InLFxuXHRcdFx0XHRvdXRwdXRJZDogb3V0cHV0SWQgPz8gJycsXG5cdFx0XHRcdG5vdGVib29rU2NoZW1lOiBub3RlYm9vay5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSA/IG5vdGVib29rLnNjaGVtZSA6ICcnLFxuXHRcdFx0fSkudG9TdHJpbmcoKVxuXHRcdH0pO1xuXHR9XG5cdC8qKlxuXHQgKiBHZW5lcmF0ZXMgYSBVUkkgZm9yIGEgY2VsbCBvdXRwdXQgaW4gYSBub3RlYm9vayB1c2luZyB0aGUgb3V0cHV0IGluZGV4LlxuXHQgKiBVc2VkIHdoZW4gVVJJIHNob3VsZCBiZSBvcGVuZWQgaW4gbm90ZWJvb2sgZWRpdG9yLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2VsbE91dHB1dFVyaVdpdGhJbmRleChub3RlYm9vazogVVJJLCBjZWxsVXJpOiBVUkksIG91dHB1dEluZGV4OiBudW1iZXIpOiBVUkkge1xuXHRcdHJldHVybiBub3RlYm9vay53aXRoKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQsXG5cdFx0XHRmcmFnbWVudDogY2VsbFVyaS5mcmFnbWVudCxcblx0XHRcdHF1ZXJ5OiBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcblx0XHRcdFx0b3BlbkluOiAnbm90ZWJvb2snLFxuXHRcdFx0XHRvdXRwdXRJbmRleDogU3RyaW5nKG91dHB1dEluZGV4KSxcblx0XHRcdH0pLnRvU3RyaW5nKClcblx0XHR9KTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZU91dHB1dEVkaXRvclVyaShub3RlYm9vazogVVJJLCBjZWxsSWQ6IHN0cmluZywgY2VsbEluZGV4OiBudW1iZXIsIG91dHB1dElkOiBzdHJpbmcsIG91dHB1dEluZGV4OiBudW1iZXIpOiBVUkkge1xuXHRcdHJldHVybiBub3RlYm9vay53aXRoKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQsXG5cdFx0XHRxdWVyeTogbmV3IFVSTFNlYXJjaFBhcmFtcyh7XG5cdFx0XHRcdG9wZW5JbjogJ25vdGVib29rT3V0cHV0RWRpdG9yJyxcblx0XHRcdFx0bm90ZWJvb2s6IG5vdGVib29rLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNlbGxJbmRleDogU3RyaW5nKGNlbGxJbmRleCksXG5cdFx0XHRcdG91dHB1dElkOiBvdXRwdXRJZCxcblx0XHRcdFx0b3V0cHV0SW5kZXg6IFN0cmluZyhvdXRwdXRJbmRleCksXG5cdFx0XHR9KS50b1N0cmluZygpXG5cdFx0fSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2VDZWxsT3V0cHV0VXJpKHVyaTogVVJJKTogeyBub3RlYm9vazogVVJJOyBvcGVuSW46IHN0cmluZzsgb3V0cHV0SWQ/OiBzdHJpbmc7IGNlbGxGcmFnbWVudD86IHN0cmluZzsgb3V0cHV0SW5kZXg/OiBudW1iZXI7IGNlbGxIYW5kbGU/OiBudW1iZXI7IGNlbGxJbmRleD86IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZXh0cmFjdENlbGxPdXRwdXREZXRhaWxzKHVyaSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDZWxsUHJvcGVydHlVcmkobm90ZWJvb2s6IFVSSSwgaGFuZGxlOiBudW1iZXIsIHNjaGVtZTogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gQ2VsbFVyaS5nZW5lcmF0ZShub3RlYm9vaywgaGFuZGxlKS53aXRoKHsgc2NoZW1lOiBzY2hlbWUgfSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2VDZWxsUHJvcGVydHlVcmkodXJpOiBVUkksIHByb3BlcnR5U2NoZW1lOiBzdHJpbmcpIHtcblx0XHRpZiAodXJpLnNjaGVtZSAhPT0gcHJvcGVydHlTY2hlbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIENlbGxVcmkucGFyc2UodXJpLndpdGgoeyBzY2hlbWU6IHNjaGVtZSB9KSk7XG5cdH1cbn1cblxuY29uc3Qgbm9ybWFsaXplU2xhc2hlcyA9IChzdHI6IHN0cmluZykgPT4gaXNXaW5kb3dzID8gc3RyLnJlcGxhY2UoL1xcLy9nLCAnXFxcXCcpIDogc3RyO1xuXG5pbnRlcmZhY2UgSU1pbWVUeXBlV2l0aE1hdGNoZXIge1xuXHRwYXR0ZXJuOiBzdHJpbmc7XG5cdG1hdGNoZXM6IGdsb2IuUGFyc2VkUGF0dGVybjtcbn1cblxuZXhwb3J0IGNsYXNzIE1pbWVUeXBlRGlzcGxheU9yZGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBvcmRlcjogSU1pbWVUeXBlV2l0aE1hdGNoZXJbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpbml0aWFsVmFsdWU6IHJlYWRvbmx5IHN0cmluZ1tdID0gW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0T3JkZXIgPSBOT1RFQk9PS19ESVNQTEFZX09SREVSLFxuXHQpIHtcblx0XHR0aGlzLm9yZGVyID0gWy4uLm5ldyBTZXQoaW5pdGlhbFZhbHVlKV0ubWFwKHBhdHRlcm4gPT4gKHtcblx0XHRcdHBhdHRlcm4sXG5cdFx0XHRtYXRjaGVzOiBnbG9iLnBhcnNlKG5vcm1hbGl6ZVNsYXNoZXMocGF0dGVybiksIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgc29ydGVkIGFycmF5IG9mIHRoZSBpbnB1dCBtaW1lVHlwZXMuXG5cdCAqL1xuXHRwdWJsaWMgc29ydChtaW1lVHlwZXM6IEl0ZXJhYmxlPHN0cmluZz4pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVtYWluaW5nID0gbmV3IE1hcChJdGVyYWJsZS5tYXAobWltZVR5cGVzLCBtID0+IFttLCBub3JtYWxpemVTbGFzaGVzKG0pXSkpO1xuXHRcdGxldCBzb3J0ZWQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHsgbWF0Y2hlcyB9IG9mIHRoaXMub3JkZXIpIHtcblx0XHRcdGZvciAoY29uc3QgW29yaWdpbmFsLCBub3JtYWxpemVkXSBvZiByZW1haW5pbmcpIHtcblx0XHRcdFx0aWYgKG1hdGNoZXMobm9ybWFsaXplZCkpIHtcblx0XHRcdFx0XHRzb3J0ZWQucHVzaChvcmlnaW5hbCk7XG5cdFx0XHRcdFx0cmVtYWluaW5nLmRlbGV0ZShvcmlnaW5hbCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVtYWluaW5nLnNpemUpIHtcblx0XHRcdHNvcnRlZCA9IHNvcnRlZC5jb25jYXQoWy4uLnJlbWFpbmluZy5rZXlzKCldLnNvcnQoXG5cdFx0XHRcdChhLCBiKSA9PiB0aGlzLmRlZmF1bHRPcmRlci5pbmRleE9mKGEpIC0gdGhpcy5kZWZhdWx0T3JkZXIuaW5kZXhPZihiKSxcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzb3J0ZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkcyB0aGF0IHRoZSB1c2VyIHNlbGVjdGVkIHRoZSBnaXZlbiBtaW1ldHlwZSBvdmVyIHRoZSBvdGhlclxuXHQgKiBwb3NzaWJsZSBtaW1lVHlwZXMsIHByaW9yaXRpemluZyBpdCBmb3IgZnV0dXJlIHJlZmVyZW5jZS5cblx0ICovXG5cdHB1YmxpYyBwcmlvcml0aXplKGNob3Nlbk1pbWV0eXBlOiBzdHJpbmcsIG90aGVyTWltZVR5cGVzOiByZWFkb25seSBzdHJpbmdbXSkge1xuXHRcdGNvbnN0IGNob3NlbkluZGV4ID0gdGhpcy5maW5kSW5kZXgoY2hvc2VuTWltZXR5cGUpO1xuXHRcdGlmIChjaG9zZW5JbmRleCA9PT0gLTEpIHtcblx0XHRcdC8vIGFsd2F5cyBmaXJzdCwgbm90aGluZyBtb3JlIHRvIGRvXG5cdFx0XHR0aGlzLm9yZGVyLnVuc2hpZnQoeyBwYXR0ZXJuOiBjaG9zZW5NaW1ldHlwZSwgbWF0Y2hlczogZ2xvYi5wYXJzZShub3JtYWxpemVTbGFzaGVzKGNob3Nlbk1pbWV0eXBlKSwgeyBpZ25vcmVDYXNlOiB0cnVlIH0pIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgb3RoZXIgbWltZVR5cGVzIHRoYXQgYXJlIGJlZm9yZSB0aGUgY2hvc2VuTWltZXR5cGUuIFRoZW4sIG1vdmVcblx0XHQvLyB0aGVtIGFmdGVyIGl0LCByZXRhaW5pbmcgb3JkZXIuXG5cdFx0Y29uc3QgdW5pcXVlSW5kaWNlcyA9IG5ldyBTZXQob3RoZXJNaW1lVHlwZXMubWFwKG0gPT4gdGhpcy5maW5kSW5kZXgobSwgY2hvc2VuSW5kZXgpKSk7XG5cdFx0dW5pcXVlSW5kaWNlcy5kZWxldGUoLTEpO1xuXHRcdGNvbnN0IG90aGVySW5kaWNlcyA9IEFycmF5LmZyb20odW5pcXVlSW5kaWNlcykuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXHRcdHRoaXMub3JkZXIuc3BsaWNlKGNob3NlbkluZGV4ICsgMSwgMCwgLi4ub3RoZXJJbmRpY2VzLm1hcChpID0+IHRoaXMub3JkZXJbaV0pKTtcblxuXHRcdGZvciAobGV0IG9pID0gb3RoZXJJbmRpY2VzLmxlbmd0aCAtIDE7IG9pID49IDA7IG9pLS0pIHtcblx0XHRcdHRoaXMub3JkZXIuc3BsaWNlKG90aGVySW5kaWNlc1tvaV0sIDEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFuIGFycmF5IG9mIGluLW9yZGVyIG1pbWV0eXBlIHByZWZlcmVuY2VzLlxuXHQgKi9cblx0cHVibGljIHRvQXJyYXkoKSB7XG5cdFx0cmV0dXJuIHRoaXMub3JkZXIubWFwKG8gPT4gby5wYXR0ZXJuKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZEluZGV4KG1pbWVUeXBlOiBzdHJpbmcsIG1heEluZGV4ID0gdGhpcy5vcmRlci5sZW5ndGgpIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplU2xhc2hlcyhtaW1lVHlwZSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXhJbmRleDsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5vcmRlcltpXS5tYXRjaGVzKG5vcm1hbGl6ZWQpKSB7XG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU11dGFibGVTcGxpY2U8VD4gZXh0ZW5kcyBJU3BsaWNlPFQ+IHtcblx0cmVhZG9ubHkgdG9JbnNlcnQ6IFRbXTtcblx0ZGVsZXRlQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRpZmY8VD4oYmVmb3JlOiBUW10sIGFmdGVyOiBUW10sIGNvbnRhaW5zOiAoYTogVCkgPT4gYm9vbGVhbiwgZXF1YWw6IChhOiBULCBiOiBUKSA9PiBib29sZWFuID0gKGE6IFQsIGI6IFQpID0+IGEgPT09IGIpOiBJU3BsaWNlPFQ+W10ge1xuXHRjb25zdCByZXN1bHQ6IElNdXRhYmxlU3BsaWNlPFQ+W10gPSBbXTtcblxuXHRmdW5jdGlvbiBwdXNoU3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIHRvSW5zZXJ0OiBUW10pOiB2b2lkIHtcblx0XHRpZiAoZGVsZXRlQ291bnQgPT09IDAgJiYgdG9JbnNlcnQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF0ZXN0ID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcblxuXHRcdGlmIChsYXRlc3QgJiYgbGF0ZXN0LnN0YXJ0ICsgbGF0ZXN0LmRlbGV0ZUNvdW50ID09PSBzdGFydCkge1xuXHRcdFx0bGF0ZXN0LmRlbGV0ZUNvdW50ICs9IGRlbGV0ZUNvdW50O1xuXHRcdFx0bGF0ZXN0LnRvSW5zZXJ0LnB1c2goLi4udG9JbnNlcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHN0YXJ0LCBkZWxldGVDb3VudCwgdG9JbnNlcnQgfSk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGJlZm9yZUlkeCA9IDA7XG5cdGxldCBhZnRlcklkeCA9IDA7XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRpZiAoYmVmb3JlSWR4ID09PSBiZWZvcmUubGVuZ3RoKSB7XG5cdFx0XHRwdXNoU3BsaWNlKGJlZm9yZUlkeCwgMCwgYWZ0ZXIuc2xpY2UoYWZ0ZXJJZHgpKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChhZnRlcklkeCA9PT0gYWZ0ZXIubGVuZ3RoKSB7XG5cdFx0XHRwdXNoU3BsaWNlKGJlZm9yZUlkeCwgYmVmb3JlLmxlbmd0aCAtIGJlZm9yZUlkeCwgW10pO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmVmb3JlRWxlbWVudCA9IGJlZm9yZVtiZWZvcmVJZHhdO1xuXHRcdGNvbnN0IGFmdGVyRWxlbWVudCA9IGFmdGVyW2FmdGVySWR4XTtcblxuXHRcdGlmIChlcXVhbChiZWZvcmVFbGVtZW50LCBhZnRlckVsZW1lbnQpKSB7XG5cdFx0XHQvLyBlcXVhbFxuXHRcdFx0YmVmb3JlSWR4ICs9IDE7XG5cdFx0XHRhZnRlcklkeCArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRhaW5zKGFmdGVyRWxlbWVudCkpIHtcblx0XHRcdC8vIGBhZnRlckVsZW1lbnRgIGV4aXN0cyBiZWZvcmUsIHdoaWNoIG1lYW5zIHNvbWUgZWxlbWVudHMgYmVmb3JlIGBhZnRlckVsZW1lbnRgIGFyZSBkZWxldGVkXG5cdFx0XHRwdXNoU3BsaWNlKGJlZm9yZUlkeCwgMSwgW10pO1xuXHRcdFx0YmVmb3JlSWR4ICs9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGBhZnRlckVsZW1lbnRgIGFkZGVkXG5cdFx0XHRwdXNoU3BsaWNlKGJlZm9yZUlkeCwgMCwgW2FmdGVyRWxlbWVudF0pO1xuXHRcdFx0YWZ0ZXJJZHggKz0gMTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsRWRpdG9yVmlld1N0YXRlIHtcblx0c2VsZWN0aW9uczogZWRpdG9yQ29tbW9uLklDdXJzb3JTdGF0ZVtdO1xufVxuXG5leHBvcnQgY29uc3QgTk9URUJPT0tfRURJVE9SX0NVUlNPUl9CT1VOREFSWSA9IG5ldyBSYXdDb250ZXh0S2V5PCdub25lJyB8ICd0b3AnIHwgJ2JvdHRvbScgfCAnYm90aCc+KCdub3RlYm9va0VkaXRvckN1cnNvckF0Qm91bmRhcnknLCAnbm9uZScpO1xuXG5leHBvcnQgY29uc3QgTk9URUJPT0tfRURJVE9SX0NVUlNPUl9MSU5FX0JPVU5EQVJZID0gbmV3IFJhd0NvbnRleHRLZXk8J25vbmUnIHwgJ3N0YXJ0JyB8ICdlbmQnIHwgJ2JvdGgnPignbm90ZWJvb2tFZGl0b3JDdXJzb3JBdExpbmVCb3VuZGFyeScsICdub25lJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rTG9hZE9wdGlvbnMge1xuXHQvKipcblx0ICogR28gdG8gZGlzayBieXBhc3NpbmcgYW55IGNhY2hlIG9mIHRoZSBtb2RlbCBpZiBhbnkuXG5cdCAqL1xuXHRmb3JjZVJlYWRGcm9tRmlsZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBJZiBwcm92aWRlZCwgdGhlIHNpemUgb2YgdGhlIGZpbGUgd2lsbCBiZSBjaGVja2VkIGFnYWluc3QgdGhlIGxpbWl0c1xuXHQgKiBhbmQgYW4gZXJyb3Igd2lsbCBiZSB0aHJvd24gaWYgYW55IGxpbWl0IGlzIGV4Y2VlZGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgbGltaXRzPzogSUZpbGVSZWFkTGltaXRzO1xufVxuXG5leHBvcnQgdHlwZSBOb3RlYm9va0VkaXRvck1vZGVsQ3JlYXRpb25PcHRpb25zID0ge1xuXHRsaW1pdHM/OiBJRmlsZVJlYWRMaW1pdHM7XG5cdHNjcmF0Y2hwYWQ/OiBib29sZWFuO1xuXHR2aWV3VHlwZT86IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbCBleHRlbmRzIElOb3RlYm9va0VkaXRvck1vZGVsIHtcblx0bm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0VkaXRvck1vZGVsIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpcnR5OiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRTYXZlOiBFdmVudDxJV29ya2luZ0NvcHlTYXZlRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9ycGhhbmVkOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seTogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkUmV2ZXJ0VW50aXRsZWQ6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBub3RlYm9vazogSU5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBoYXNFcnJvclN0YXRlOiBib29sZWFuO1xuXHRpc1Jlc29sdmVkKCk6IGJvb2xlYW47XG5cdGlzRGlydHkoKTogYm9vbGVhbjtcblx0aXNNb2RpZmllZCgpOiBib29sZWFuO1xuXHRpc1JlYWRvbmx5KCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmc7XG5cdGlzT3JwaGFuZWQoKTogYm9vbGVhbjtcblx0aGFzQXNzb2NpYXRlZEZpbGVQYXRoKCk6IGJvb2xlYW47XG5cdGxvYWQob3B0aW9ucz86IElOb3RlYm9va0xvYWRPcHRpb25zKTogUHJvbWlzZTxJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsPjtcblx0c2F2ZShvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPjtcblx0c2F2ZUFzKHRhcmdldDogVVJJKTogUHJvbWlzZTxJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPjtcblx0cmV2ZXJ0KG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRGlmZkVkaXRvck1vZGVsIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRvcmlnaW5hbDogeyBub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWw7IHJlc291cmNlOiBVUkk7IHZpZXdUeXBlOiBzdHJpbmcgfTtcblx0bW9kaWZpZWQ6IHsgbm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsOyByZXNvdXJjZTogVVJJOyB2aWV3VHlwZTogc3RyaW5nIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tEb2N1bWVudEJhY2t1cERhdGEgZXh0ZW5kcyBJV29ya2luZ0NvcHlCYWNrdXBNZXRhIHtcblx0cmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgYmFja3VwSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG10aW1lPzogbnVtYmVyO1xufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va0VkaXRvclByaW9yaXR5IHtcblx0ZGVmYXVsdCA9ICdkZWZhdWx0Jyxcblx0b3B0aW9uID0gJ29wdGlvbicsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRmluZE9wdGlvbnMge1xuXHRyZWdleD86IGJvb2xlYW47XG5cdHdob2xlV29yZD86IGJvb2xlYW47XG5cdGNhc2VTZW5zaXRpdmU/OiBib29sZWFuO1xuXHR3b3JkU2VwYXJhdG9ycz86IHN0cmluZztcblx0aW5jbHVkZU1hcmt1cElucHV0PzogYm9vbGVhbjtcblx0aW5jbHVkZU1hcmt1cFByZXZpZXc/OiBib29sZWFuO1xuXHRpbmNsdWRlQ29kZUlucHV0PzogYm9vbGVhbjtcblx0aW5jbHVkZU91dHB1dD86IGJvb2xlYW47XG5cdGZpbmRTY29wZT86IElOb3RlYm9va0ZpbmRTY29wZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tGaW5kU2NvcGUge1xuXHRmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGU7XG5cdHNlbGVjdGVkQ2VsbFJhbmdlcz86IElDZWxsUmFuZ2VbXTtcblx0c2VsZWN0ZWRUZXh0UmFuZ2VzPzogUmFuZ2VbXTtcbn1cblxuZXhwb3J0IGVudW0gTm90ZWJvb2tGaW5kU2NvcGVUeXBlIHtcblx0Q2VsbHMgPSAnY2VsbHMnLFxuXHRUZXh0ID0gJ3RleHQnLFxuXHROb25lID0gJ25vbmUnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXIge1xuXHRpbmNsdWRlPzogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuO1xuXHRleGNsdWRlPzogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0RvY3VtZW50RmlsdGVyIHtcblx0dmlld1R5cGU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0ZmlsZW5hbWVQYXR0ZXJuPzogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuIHwgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXI7XG59XG5cbi8vVE9ET0ByZWJvcm5peCB0ZXN0XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RvY3VtZW50RXhjbHVkZVBhdHRlcm4oZmlsZW5hbWVQYXR0ZXJuOiBzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gfCBJTm90ZWJvb2tFeGNsdXNpdmVEb2N1bWVudEZpbHRlcik6IGZpbGVuYW1lUGF0dGVybiBpcyB7IGluY2x1ZGU6IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybjsgZXhjbHVkZTogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuIH0ge1xuXHRjb25zdCBhcmcgPSBmaWxlbmFtZVBhdHRlcm4gYXMgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXI7XG5cblx0aWYgKCh0eXBlb2YgYXJnLmluY2x1ZGUgPT09ICdzdHJpbmcnIHx8IGdsb2IuaXNSZWxhdGl2ZVBhdHRlcm4oYXJnLmluY2x1ZGUpKVxuXHRcdCYmICh0eXBlb2YgYXJnLmV4Y2x1ZGUgPT09ICdzdHJpbmcnIHx8IGdsb2IuaXNSZWxhdGl2ZVBhdHRlcm4oYXJnLmV4Y2x1ZGUpKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG5vdGVib29rRG9jdW1lbnRGaWx0ZXJNYXRjaChmaWx0ZXI6IElOb3RlYm9va0RvY3VtZW50RmlsdGVyLCB2aWV3VHlwZTogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdGlmIChBcnJheS5pc0FycmF5KGZpbHRlci52aWV3VHlwZSkgJiYgZmlsdGVyLnZpZXdUeXBlLmluZGV4T2Yodmlld1R5cGUpID49IDApIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChmaWx0ZXIudmlld1R5cGUgPT09IHZpZXdUeXBlKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoZmlsdGVyLmZpbGVuYW1lUGF0dGVybikge1xuXHRcdGNvbnN0IGZpbGVuYW1lUGF0dGVybiA9IGlzRG9jdW1lbnRFeGNsdWRlUGF0dGVybihmaWx0ZXIuZmlsZW5hbWVQYXR0ZXJuKSA/IGZpbHRlci5maWxlbmFtZVBhdHRlcm4uaW5jbHVkZSA6IChmaWx0ZXIuZmlsZW5hbWVQYXR0ZXJuIGFzIHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybik7XG5cdFx0Y29uc3QgZXhjbHVkZUZpbGVuYW1lUGF0dGVybiA9IGlzRG9jdW1lbnRFeGNsdWRlUGF0dGVybihmaWx0ZXIuZmlsZW5hbWVQYXR0ZXJuKSA/IGZpbHRlci5maWxlbmFtZVBhdHRlcm4uZXhjbHVkZSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmIChnbG9iLm1hdGNoKGZpbGVuYW1lUGF0dGVybiwgYmFzZW5hbWUocmVzb3VyY2UuZnNQYXRoKSwgeyBpZ25vcmVDYXNlOiB0cnVlIH0pKSB7XG5cdFx0XHRpZiAoZXhjbHVkZUZpbGVuYW1lUGF0dGVybikge1xuXHRcdFx0XHRpZiAoZ2xvYi5tYXRjaChleGNsdWRlRmlsZW5hbWVQYXR0ZXJuLCBiYXNlbmFtZShyZXNvdXJjZS5mc1BhdGgpLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHQvLyBzaG91bGQgZXhjbHVkZVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVByb3ZpZGVyIHtcblx0dmlld1R5cGU6IHN0cmluZztcblx0b25EaWRDaGFuZ2VTdGF0dXNCYXJJdGVtcz86IEV2ZW50PHZvaWQ+O1xuXHRwcm92aWRlQ2VsbFN0YXR1c0Jhckl0ZW1zKHVyaTogVVJJLCBpbmRleDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtTGlzdCB8IHVuZGVmaW5lZD47XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tEaWZmUmVzdWx0IHtcblx0Y2VsbHNEaWZmOiBJRGlmZlJlc3VsdDtcblx0bWV0YWRhdGFDaGFuZ2VkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtIHtcblx0cmVhZG9ubHkgYWxpZ25tZW50OiBDZWxsU3RhdHVzYmFyQWxpZ25tZW50O1xuXHRyZWFkb25seSBwcmlvcml0eT86IG51bWJlcjtcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSBjb2xvcj86IHN0cmluZyB8IFRoZW1lQ29sb3I7XG5cdHJlYWRvbmx5IGJhY2tncm91bmRDb2xvcj86IHN0cmluZyB8IFRoZW1lQ29sb3I7XG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmQ/OiBzdHJpbmcgfCBDb21tYW5kO1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24/OiBJQWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uO1xuXHRyZWFkb25seSBvcGFjaXR5Pzogc3RyaW5nO1xuXHRyZWFkb25seSBvbmx5U2hvd1doZW5BY3RpdmU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtTGlzdCB7XG5cdGl0ZW1zOiBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVtdO1xuXHRkaXNwb3NlPygpOiB2b2lkO1xufVxuXG5leHBvcnQgdHlwZSBTaG93Q2VsbFN0YXR1c0JhclR5cGUgPSAnaGlkZGVuJyB8ICd2aXNpYmxlJyB8ICd2aXNpYmxlQWZ0ZXJFeGVjdXRlJztcbmV4cG9ydCBjb25zdCBOb3RlYm9va1NldHRpbmcgPSB7XG5cdGRpc3BsYXlPcmRlcjogJ25vdGVib29rLmRpc3BsYXlPcmRlcicsXG5cdGNlbGxUb29sYmFyTG9jYXRpb246ICdub3RlYm9vay5jZWxsVG9vbGJhckxvY2F0aW9uJyxcblx0Y2VsbFRvb2xiYXJWaXNpYmlsaXR5OiAnbm90ZWJvb2suY2VsbFRvb2xiYXJWaXNpYmlsaXR5Jyxcblx0c2hvd0NlbGxTdGF0dXNCYXI6ICdub3RlYm9vay5zaG93Q2VsbFN0YXR1c0JhcicsXG5cdGNlbGxFeGVjdXRpb25UaW1lVmVyYm9zaXR5OiAnbm90ZWJvb2suY2VsbEV4ZWN1dGlvblRpbWVWZXJib3NpdHknLFxuXHR0ZXh0RGlmZkVkaXRvclByZXZpZXc6ICdub3RlYm9vay5kaWZmLmVuYWJsZVByZXZpZXcnLFxuXHRkaWZmT3ZlcnZpZXdSdWxlcjogJ25vdGVib29rLmRpZmYub3ZlcnZpZXdSdWxlcicsXG5cdGV4cGVyaW1lbnRhbEluc2VydFRvb2xiYXJBbGlnbm1lbnQ6ICdub3RlYm9vay5leHBlcmltZW50YWwuaW5zZXJ0VG9vbGJhckFsaWdubWVudCcsXG5cdGNvbXBhY3RWaWV3OiAnbm90ZWJvb2suY29tcGFjdFZpZXcnLFxuXHRmb2N1c0luZGljYXRvcjogJ25vdGVib29rLmNlbGxGb2N1c0luZGljYXRvcicsXG5cdGluc2VydFRvb2xiYXJMb2NhdGlvbjogJ25vdGVib29rLmluc2VydFRvb2xiYXJMb2NhdGlvbicsXG5cdGdsb2JhbFRvb2xiYXI6ICdub3RlYm9vay5nbG9iYWxUb29sYmFyJyxcblx0c3RpY2t5U2Nyb2xsRW5hYmxlZDogJ25vdGVib29rLnN0aWNreVNjcm9sbC5lbmFibGVkJyxcblx0c3RpY2t5U2Nyb2xsTW9kZTogJ25vdGVib29rLnN0aWNreVNjcm9sbC5tb2RlJyxcblx0dW5kb1JlZG9QZXJDZWxsOiAnbm90ZWJvb2sudW5kb1JlZG9QZXJDZWxsJyxcblx0Y29uc29saWRhdGVkT3V0cHV0QnV0dG9uOiAnbm90ZWJvb2suY29uc29saWRhdGVkT3V0cHV0QnV0dG9uJyxcblx0b3Blbk91dHB1dEluUHJldmlld0VkaXRvcjogJ25vdGVib29rLm91dHB1dC5vcGVuSW5QcmV2aWV3RWRpdG9yLmVuYWJsZWQnLFxuXHRzaG93Rm9sZGluZ0NvbnRyb2xzOiAnbm90ZWJvb2suc2hvd0ZvbGRpbmdDb250cm9scycsXG5cdGRyYWdBbmREcm9wRW5hYmxlZDogJ25vdGVib29rLmRyYWdBbmREcm9wRW5hYmxlZCcsXG5cdGNlbGxFZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnM6ICdub3RlYm9vay5lZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMnLFxuXHRjb25zb2xpZGF0ZWRSdW5CdXR0b246ICdub3RlYm9vay5jb25zb2xpZGF0ZWRSdW5CdXR0b24nLFxuXHRvcGVuR2V0dGluZ1N0YXJ0ZWQ6ICdub3RlYm9vay5leHBlcmltZW50YWwub3BlbkdldHRpbmdTdGFydGVkJyxcblx0Z2xvYmFsVG9vbGJhclNob3dMYWJlbDogJ25vdGVib29rLmdsb2JhbFRvb2xiYXJTaG93TGFiZWwnLFxuXHRtYXJrdXBGb250U2l6ZTogJ25vdGVib29rLm1hcmt1cC5mb250U2l6ZScsXG5cdG1hcmtkb3duTGluZUhlaWdodDogJ25vdGVib29rLm1hcmtkb3duLmxpbmVIZWlnaHQnLFxuXHRpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzOiAnaW50ZXJhY3RpdmVXaW5kb3cuY29sbGFwc2VDZWxsSW5wdXRDb2RlJyxcblx0b3V0cHV0U2Nyb2xsaW5nOiAnbm90ZWJvb2sub3V0cHV0LnNjcm9sbGluZycsXG5cdHRleHRPdXRwdXRMaW5lTGltaXQ6ICdub3RlYm9vay5vdXRwdXQudGV4dExpbmVMaW1pdCcsXG5cdExpbmtpZnlPdXRwdXRGaWxlUGF0aHM6ICdub3RlYm9vay5vdXRwdXQubGlua2lmeUZpbGVQYXRocycsXG5cdG1pbmltYWxFcnJvclJlbmRlcmluZzogJ25vdGVib29rLm91dHB1dC5taW5pbWFsRXJyb3JSZW5kZXJpbmcnLFxuXHRmb3JtYXRPblNhdmU6ICdub3RlYm9vay5mb3JtYXRPblNhdmUuZW5hYmxlZCcsXG5cdGluc2VydEZpbmFsTmV3bGluZTogJ25vdGVib29rLmluc2VydEZpbmFsTmV3bGluZScsXG5cdGRlZmF1bHRGb3JtYXR0ZXI6ICdub3RlYm9vay5kZWZhdWx0Rm9ybWF0dGVyJyxcblx0Zm9ybWF0T25DZWxsRXhlY3V0aW9uOiAnbm90ZWJvb2suZm9ybWF0T25DZWxsRXhlY3V0aW9uJyxcblx0Y29kZUFjdGlvbnNPblNhdmU6ICdub3RlYm9vay5jb2RlQWN0aW9uc09uU2F2ZScsXG5cdG91dHB1dFdvcmRXcmFwOiAnbm90ZWJvb2sub3V0cHV0LndvcmRXcmFwJyxcblx0b3V0cHV0TGluZUhlaWdodDogJ25vdGVib29rLm91dHB1dC5saW5lSGVpZ2h0Jyxcblx0b3V0cHV0Rm9udFNpemU6ICdub3RlYm9vay5vdXRwdXQuZm9udFNpemUnLFxuXHRvdXRwdXRGb250RmFtaWx5OiAnbm90ZWJvb2sub3V0cHV0LmZvbnRGYW1pbHknLFxuXHRmaW5kRmlsdGVyczogJ25vdGVib29rLmZpbmQuZmlsdGVycycsXG5cdGxvZ2dpbmc6ICdub3RlYm9vay5sb2dnaW5nJyxcblx0Y29uZmlybURlbGV0ZVJ1bm5pbmdDZWxsOiAnbm90ZWJvb2suY29uZmlybURlbGV0ZVJ1bm5pbmdDZWxsJyxcblx0cmVtb3RlU2F2aW5nOiAnbm90ZWJvb2suZXhwZXJpbWVudGFsLnJlbW90ZVNhdmUnLFxuXHRnb3RvU3ltYm9sc0FsbFN5bWJvbHM6ICdub3RlYm9vay5nb3RvU3ltYm9scy5zaG93QWxsU3ltYm9scycsXG5cdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogJ25vdGVib29rLm91dGxpbmUuc2hvd01hcmtkb3duSGVhZGVyc09ubHknLFxuXHRvdXRsaW5lU2hvd0NvZGVDZWxsczogJ25vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxscycsXG5cdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiAnbm90ZWJvb2sub3V0bGluZS5zaG93Q29kZUNlbGxTeW1ib2xzJyxcblx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiAnbm90ZWJvb2suYnJlYWRjcnVtYnMuc2hvd0NvZGVDZWxscycsXG5cdHNjcm9sbFRvUmV2ZWFsQ2VsbDogJ25vdGVib29rLnNjcm9sbGluZy5yZXZlYWxOZXh0Q2VsbE9uRXhlY3V0ZScsXG5cdGNlbGxDaGF0OiAnbm90ZWJvb2suZXhwZXJpbWVudGFsLmNlbGxDaGF0Jyxcblx0Y2VsbEdlbmVyYXRlOiAnbm90ZWJvb2suZXhwZXJpbWVudGFsLmdlbmVyYXRlJyxcblx0bm90ZWJvb2tWYXJpYWJsZXNWaWV3OiAnbm90ZWJvb2sudmFyaWFibGVzVmlldycsXG5cdG5vdGVib29rSW5saW5lVmFsdWVzOiAnbm90ZWJvb2suaW5saW5lVmFsdWVzJyxcblx0SW50ZXJhY3RpdmVXaW5kb3dQcm9tcHRUb1NhdmU6ICdpbnRlcmFjdGl2ZVdpbmRvdy5wcm9tcHRUb1NhdmVPbkNsb3NlJyxcblx0Y2VsbEZhaWx1cmVEaWFnbm9zdGljczogJ25vdGVib29rLmNlbGxGYWlsdXJlRGlhZ25vc3RpY3MnLFxuXHRvdXRwdXRCYWNrdXBTaXplTGltaXQ6ICdub3RlYm9vay5iYWNrdXAuc2l6ZUxpbWl0Jyxcblx0bXVsdGlDdXJzb3I6ICdub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJyxcblx0bWFya3VwRm9udEZhbWlseTogJ25vdGVib29rLm1hcmt1cC5mb250RmFtaWx5Jyxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBlbnVtIENlbGxTdGF0dXNiYXJBbGlnbm1lbnQge1xuXHRMZWZ0ID0gMSxcblx0UmlnaHQgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIF9wcmVmaXggPSAnbm90ZWJvb2svJztcblxuXHRzdGF0aWMgY3JlYXRlKG5vdGVib29rVHlwZTogc3RyaW5nLCB2aWV3VHlwZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke05vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5fcHJlZml4fSR7bm90ZWJvb2tUeXBlfS8ke3ZpZXdUeXBlID8/IG5vdGVib29rVHlwZX1gO1xuXHR9XG5cblx0c3RhdGljIHBhcnNlKGNhbmRpZGF0ZTogc3RyaW5nKTogeyBub3RlYm9va1R5cGU6IHN0cmluZzsgdmlld1R5cGU6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoY2FuZGlkYXRlLnN0YXJ0c1dpdGgoTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLl9wcmVmaXgpKSB7XG5cdFx0XHRjb25zdCBzcGxpdCA9IGNhbmRpZGF0ZS5zdWJzdHJpbmcoTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLl9wcmVmaXgubGVuZ3RoKS5zcGxpdCgnLycpO1xuXHRcdFx0aWYgKHNwbGl0Lmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRyZXR1cm4geyBub3RlYm9va1R5cGU6IHNwbGl0WzBdLCB2aWV3VHlwZTogc3BsaXRbMV0gfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rRXh0ZW5zaW9uRGVzY3JpcHRpb24ge1xuXHRyZWFkb25seSBpZDogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgbG9jYXRpb246IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IHRleHREZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG5cbi8qKlxuICogR2l2ZW4gYSBzdHJlYW0gb2YgaW5kaXZpZHVhbCBzdGRvdXQgb3V0cHV0cywgdGhpcyBmdW5jdGlvbiB3aWxsIHJldHVybiB0aGUgY29tcHJlc3NlZCBsaW5lcywgZXNjYXBpbmcgc29tZSBvZiB0aGUgY29tbW9uIHRlcm1pbmFsIGVzY2FwZSBjb2Rlcy5cbiAqIEUuZy4gc29tZSB0ZXJtaW5hbCBlc2NhcGUgY29kZXMgd291bGQgcmVzdWx0IGluIHRoZSBwcmV2aW91cyBsaW5lIGdldHRpbmcgY2xlYXJlZCwgc3VjaCBpZiB3ZSBoYWQgMyBsaW5lcyBhbmRcbiAqIGxhc3QgbGluZSBjb250YWluZWQgc3VjaCBhIGNvZGUsIHRoZW4gdGhlIHJlc3VsdCBzdHJpbmcgd291bGQgYmUganVzdCB0aGUgZmlyc3QgdHdvIGxpbmVzLlxuICogQHJldHVybnMgYSBzaW5nbGUgVlNCdWZmZXIgd2l0aCB0aGUgY29uY2F0ZW5hdGVkIGFuZCBjb21wcmVzc2VkIGRhdGEsIGFuZCB3aGV0aGVyIGFueSBjb21wcmVzc2lvbiB3YXMgZG9uZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXByZXNzT3V0cHV0SXRlbVN0cmVhbXMob3V0cHV0czogVWludDhBcnJheVtdKSB7XG5cdGNvbnN0IGJ1ZmZlcnM6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuXHRsZXQgc3RhcnRBcHBlbmRpbmcgPSBmYWxzZTtcblxuXHQvLyBQaWNrIHRoZSBmaXJzdCBzZXQgb2Ygb3V0cHV0cyB3aXRoIHRoZSBzYW1lIG1pbWUgdHlwZS5cblx0Zm9yIChjb25zdCBvdXRwdXQgb2Ygb3V0cHV0cykge1xuXHRcdGlmICgoYnVmZmVycy5sZW5ndGggPT09IDAgfHwgc3RhcnRBcHBlbmRpbmcpKSB7XG5cdFx0XHRidWZmZXJzLnB1c2gob3V0cHV0KTtcblx0XHRcdHN0YXJ0QXBwZW5kaW5nID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRsZXQgZGlkQ29tcHJlc3Npb24gPSBjb21wcmVzc1N0cmVhbUJ1ZmZlcihidWZmZXJzKTtcblx0Y29uc3QgY29uY2F0ZW5hdGVkID0gVlNCdWZmZXIuY29uY2F0KGJ1ZmZlcnMubWFwKGJ1ZmZlciA9PiBWU0J1ZmZlci53cmFwKGJ1ZmZlcikpKTtcblx0Y29uc3QgZGF0YSA9IGZvcm1hdFN0cmVhbVRleHQoY29uY2F0ZW5hdGVkKTtcblx0ZGlkQ29tcHJlc3Npb24gPSBkaWRDb21wcmVzc2lvbiB8fCBkYXRhLmJ5dGVMZW5ndGggIT09IGNvbmNhdGVuYXRlZC5ieXRlTGVuZ3RoO1xuXHRyZXR1cm4geyBkYXRhLCBkaWRDb21wcmVzc2lvbiB9O1xufVxuXG5leHBvcnQgY29uc3QgTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkQgPSBgJHtTdHJpbmcuZnJvbUNoYXJDb2RlKDI3KX1bQWA7XG5jb25zdCBNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORF9CWVRFUyA9IE1PVkVfQ1VSU09SXzFfTElORV9DT01NQU5ELnNwbGl0KCcnKS5tYXAoYyA9PiBjLmNoYXJDb2RlQXQoMCkpO1xuY29uc3QgTElORV9GRUVEID0gMTA7XG5mdW5jdGlvbiBjb21wcmVzc1N0cmVhbUJ1ZmZlcihzdHJlYW1zOiBVaW50OEFycmF5W10pIHtcblx0bGV0IGRpZENvbXByZXNzID0gZmFsc2U7XG5cdHN0cmVhbXMuZm9yRWFjaCgoc3RyZWFtLCBpbmRleCkgPT4ge1xuXHRcdGlmIChpbmRleCA9PT0gMCB8fCBzdHJlYW0ubGVuZ3RoIDwgTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNTdHJlYW0gPSBzdHJlYW1zW2luZGV4IC0gMV07XG5cblx0XHQvLyBSZW1vdmUgdGhlIHByZXZpb3VzIGxpbmUgaWYgcmVxdWlyZWQuXG5cdFx0Y29uc3QgY29tbWFuZCA9IHN0cmVhbS5zdWJhcnJheSgwLCBNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORC5sZW5ndGgpO1xuXHRcdGlmIChjb21tYW5kWzBdID09PSBNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORF9CWVRFU1swXSAmJiBjb21tYW5kWzFdID09PSBNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORF9CWVRFU1sxXSAmJiBjb21tYW5kWzJdID09PSBNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORF9CWVRFU1syXSkge1xuXHRcdFx0Y29uc3QgbGFzdEluZGV4T2ZMaW5lRmVlZCA9IHByZXZpb3VzU3RyZWFtLmxhc3RJbmRleE9mKExJTkVfRkVFRCk7XG5cdFx0XHRpZiAobGFzdEluZGV4T2ZMaW5lRmVlZCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRkaWRDb21wcmVzcyA9IHRydWU7XG5cdFx0XHRzdHJlYW1zW2luZGV4IC0gMV0gPSBwcmV2aW91c1N0cmVhbS5zdWJhcnJheSgwLCBsYXN0SW5kZXhPZkxpbmVGZWVkKTtcblx0XHRcdHN0cmVhbXNbaW5kZXhdID0gc3RyZWFtLnN1YmFycmF5KE1PVkVfQ1VSU09SXzFfTElORV9DT01NQU5ELmxlbmd0aCk7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIGRpZENvbXByZXNzO1xufVxuXG5cblxuLyoqXG4gKiBUb29rIHRoaXMgZnJvbSBqdXB5dGVyL25vdGVib29rXG4gKiBodHRwczovL2dpdGh1Yi5jb20vanVweXRlci9ub3RlYm9vay9ibG9iL2I4YjY2MzMyZTIwMjNlODNkMmVlMDRmODNkODgxNGY1NjdlMDFhNGUvbm90ZWJvb2svc3RhdGljL2Jhc2UvanMvdXRpbHMuanNcbiAqIFJlbW92ZSBjaGFyYWN0ZXJzIHRoYXQgYXJlIG92ZXJyaWRkZW4gYnkgYmFja3NwYWNlIGNoYXJhY3RlcnNcbiAqL1xuZnVuY3Rpb24gZml4QmFja3NwYWNlKHR4dDogc3RyaW5nKSB7XG5cdGxldCB0bXAgPSB0eHQ7XG5cdGRvIHtcblx0XHR0eHQgPSB0bXA7XG5cdFx0Ly8gQ2FuY2VsIG91dCBhbnl0aGluZy1idXQtbmV3bGluZSBmb2xsb3dlZCBieSBiYWNrc3BhY2Vcblx0XHR0bXAgPSB0eHQucmVwbGFjZSgvW15cXG5dXFx4MDgvZ20sICcnKTtcblx0fSB3aGlsZSAodG1wLmxlbmd0aCA8IHR4dC5sZW5ndGgpO1xuXHRyZXR1cm4gdHh0O1xufVxuXG4vKipcbiAqIFJlbW92ZSBjaHVua3MgdGhhdCBzaG91bGQgYmUgb3ZlcnJpZGRlbiBieSB0aGUgZWZmZWN0IG9mIGNhcnJpYWdlIHJldHVybiBjaGFyYWN0ZXJzXG4gKiBGcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9qdXB5dGVyL25vdGVib29rL2Jsb2IvbWFzdGVyL25vdGVib29rL3N0YXRpYy9iYXNlL2pzL3V0aWxzLmpzXG4gKi9cbmZ1bmN0aW9uIGZpeENhcnJpYWdlUmV0dXJuKHR4dDogc3RyaW5nKSB7XG5cdHR4dCA9IHR4dC5yZXBsYWNlKC9cXHIrXFxuL2dtLCAnXFxuJyk7IC8vIFxcciBmb2xsb3dlZCBieSBcXG4gLS0+IG5ld2xpbmVcblx0d2hpbGUgKHR4dC5zZWFyY2goL1xcclteJF0vZykgPiAtMSkge1xuXHRcdGNvbnN0IGJhc2UgPSB0eHQubWF0Y2goL14oLiopXFxyKy9tKSFbMV07XG5cdFx0bGV0IGluc2VydCA9IHR4dC5tYXRjaCgvXFxyKyguKikkL20pIVsxXTtcblx0XHRpbnNlcnQgPSBpbnNlcnQgKyBiYXNlLnNsaWNlKGluc2VydC5sZW5ndGgsIGJhc2UubGVuZ3RoKTtcblx0XHR0eHQgPSB0eHQucmVwbGFjZSgvXFxyKy4qJC9tLCAnXFxyJykucmVwbGFjZSgvXi4qXFxyL20sIGluc2VydCk7XG5cdH1cblx0cmV0dXJuIHR4dDtcbn1cblxuY29uc3QgQkFDS1NQQUNFX0NIQVJBQ1RFUiA9ICdcXGInLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBDQVJSSUFHRV9SRVRVUk5fQ0hBUkFDVEVSID0gJ1xccicuY2hhckNvZGVBdCgwKTtcbmZ1bmN0aW9uIGZvcm1hdFN0cmVhbVRleHQoYnVmZmVyOiBWU0J1ZmZlcik6IFZTQnVmZmVyIHtcblx0Ly8gV2UgaGF2ZSBzcGVjaWFsIGhhbmRsaW5nIGZvciBiYWNrc3BhY2UgYW5kIGNhcnJpYWdlIHJldHVybiBjaGFyYWN0ZXJzLlxuXHQvLyBEb24ndCB1bm5lY2Vzc2FyeSBkZWNvZGUgdGhlIGJ5dGVzIGlmIHdlIGRvbid0IG5lZWQgdG8gcGVyZm9ybSBhbnkgcHJvY2Vzc2luZy5cblx0aWYgKCFidWZmZXIuYnVmZmVyLmluY2x1ZGVzKEJBQ0tTUEFDRV9DSEFSQUNURVIpICYmICFidWZmZXIuYnVmZmVyLmluY2x1ZGVzKENBUlJJQUdFX1JFVFVSTl9DSEFSQUNURVIpKSB7XG5cdFx0cmV0dXJuIGJ1ZmZlcjtcblx0fVxuXHQvLyBEbyB0aGUgc2FtZSB0aGluZyBqdXB5dGVyIGlzIGRvaW5nXG5cdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKGZpeENhcnJpYWdlUmV0dXJuKGZpeEJhY2tzcGFjZSh0ZXh0RGVjb2Rlci5kZWNvZGUoYnVmZmVyLmJ1ZmZlcikpKSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rS2VybmVsU291cmNlQWN0aW9uIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldGFpbD86IHN0cmluZztcblx0cmVhZG9ubHkgY29tbWFuZD86IHN0cmluZyB8IENvbW1hbmQ7XG5cdHJlYWRvbmx5IGRvY3VtZW50YXRpb24/OiBVcmlDb21wb25lbnRzIHwgc3RyaW5nO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFJekIsWUFBWSxVQUFVO0FBRXRCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFTMUIsU0FBUyxxQkFBcUI7QUFVOUIsU0FBUyxxQkFBcUIsWUFBWSxhQUFhLDBCQUEwQixrQkFBa0IsU0FBUyxnQkFBZ0I7QUFJckgsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSwwQkFBMEI7QUFDaEMsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSwrQkFBK0I7QUFDckMsTUFBTSxpQkFBaUI7QUFDdkIsTUFBTSw0QkFBNEI7QUFFbEMsTUFBTSwwQkFBMEI7QUFFaEMsSUFBSyxXQUFMLGtCQUFLQSxjQUFMO0FBQ04sRUFBQUEsb0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsb0JBQUEsVUFBTyxLQUFQO0FBRlcsU0FBQUE7QUFBQSxHQUFBO0FBS0wsTUFBTSx5QkFBNEM7QUFBQSxFQUN4RDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0EsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsRUFDQSxNQUFNO0FBQ1A7QUFFTyxNQUFNLG9DQUF1RDtBQUFBLEVBQ25FLE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0EsTUFBTTtBQUNQO0FBUU8sTUFBTSxpQ0FBMkUsb0JBQUksSUFBSTtBQUFBLEVBQy9GLENBQUMsc0JBQXNCLG9CQUFJLElBQUksQ0FBQyxvQkFBb0IsYUFBYSxDQUFDLENBQUM7QUFBQSxFQUNuRSxDQUFDLGdDQUFnQyxvQkFBSSxJQUFJLENBQUMsb0JBQW9CLGFBQWEsQ0FBQyxDQUFDO0FBQzlFLENBQUM7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QVksU0FBUztBQUNoRSxVQUFJLHdCQUF3QixJQUFJO0FBQy9CO0FBQUEsTUFDRDtBQUVBLG9CQUFjO0FBQ2QsY0FBUSxRQUFRLENBQUMsSUFBSSxlQUFlLFNBQVMsR0FBRyxtQkFBbUI7QUFDbkUsY0FBUSxLQUFLLElBQUksT0FBTyxTQUFTLDJCQUEyQixNQUFNO0FBQUEsSUFDbkU7QUFBQSxFQUNELENBQUM7QUFDRCxTQUFPO0FBQ1I7QUFTQSxTQUFTLGFBQWEsS0FBYTtBQUNsQyxNQUFJLE1BQU07QUFDVixLQUFHO0FBQ0YsVUFBTTtBQUVOLFVBQU0sSUFBSSxRQUFRLGVBQWUsRUFBRTtBQUFBLEVBQ3BDLFNBQVMsSUFBSSxTQUFTLElBQUk7QUFDMUIsU0FBTztBQUNSO0FBTUEsU0FBUyxrQkFBa0IsS0FBYTtBQUN2QyxRQUFNLElBQUksUUFBUSxXQUFXLElBQUk7QUFDakMsU0FBTyxJQUFJLE9BQU8sU0FBUyxJQUFJLElBQUk7QUFDbEMsVUFBTSxPQUFPLElBQUksTUFBTSxXQUFXLEVBQUcsQ0FBQztBQUN0QyxRQUFJLFNBQVMsSUFBSSxNQUFNLFdBQVcsRUFBRyxDQUFDO0FBQ3RDLGFBQVMsU0FBUyxLQUFLLE1BQU0sT0FBTyxRQUFRLEtBQUssTUFBTTtBQUN2RCxVQUFNLElBQUksUUFBUSxXQUFXLElBQUksRUFBRSxRQUFRLFVBQVUsTUFBTTtBQUFBLEVBQzVEO0FBQ0EsU0FBTztBQUNSO0FBRUEsTUFBTSxzQkFBc0IsS0FBSyxXQUFXLENBQUM7QUFDN0MsTUFBTSw0QkFBNEIsS0FBSyxXQUFXLENBQUM7QUFDbkQsU0FBUyxpQkFBaUIsUUFBNEI7QUFHckQsTUFBSSxDQUFDLE9BQU8sT0FBTyxTQUFTLG1CQUFtQixLQUFLLENBQUMsT0FBTyxPQUFPLFNBQVMseUJBQXlCLEdBQUc7QUFDdkcsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPLFNBQVMsV0FBVyxrQkFBa0IsYUFBYSxZQUFZLE9BQU8sT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzlGOyIsCiAgIm5hbWVzIjogWyJDZWxsS2luZCIsICJOb3RlYm9va1J1blN0YXRlIiwgIk5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlIiwgIk5vdGVib29rRXhlY3V0aW9uU3RhdGUiLCAiTm90ZWJvb2tSZW5kZXJlck1hdGNoIiwgIlJlbmRlcmVyTWVzc2FnaW5nU3BlYyIsICJOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSIsICJTZWxlY3Rpb25TdGF0ZVR5cGUiLCAiQ2VsbEVkaXRUeXBlIiwgIk5vdGVib29rTWV0YWRhdGFVcmkiLCAiQ2VsbFVyaSIsICJzY2hlbWUiLCAiTm90ZWJvb2tFZGl0b3JQcmlvcml0eSIsICJOb3RlYm9va0ZpbmRTY29wZVR5cGUiLCAiQ2VsbFN0YXR1c2JhckFsaWdubWVudCJdCn0K
