import assert from "assert";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { nullDocumentDiff } from "../../../../../../editor/common/diff/documentDiffProvider.js";
import { SaveReason } from "../../../../../common/editor.js";
import { CellEditType, CellKind, NotebookCellsChangeType } from "../../../../notebook/common/notebookCommon.js";
import { ChatEditingModifiedNotebookEntry } from "../../../browser/chatEditing/chatEditingModifiedNotebookEntry.js";
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingADeletedCell, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell } from "../../../browser/chatEditing/notebook/helpers.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { hash } from "../../../../../../base/common/hash.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
suite("ChatEditingModifiedNotebookEntry", function() {
  suite("Keep Inserted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
      return {
        diff,
        keep,
        undo,
        type: "unchanged",
        originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`),
        originalCellIndex,
        modifiedCellIndex,
        modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`)
      };
    }
    test("Keep first inserted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForKeepingAnInsertedCell(
        0,
        // eslint-disable-next-line local/code-no-any-casts
        cellsDiffInfo,
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:0`),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel(`InsertedModified:0`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Keep first inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForKeepingAnInsertedCell(
        0,
        // eslint-disable-next-line local/code-no-any-casts
        cellsDiffInfo,
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 3,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Keep second inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForKeepingAnInsertedCell(
        2,
        // eslint-disable-next-line local/code-no-any-casts
        cellsDiffInfo,
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 2, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 3,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
  });
  suite("Revert Inserted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    test("Delete first inserted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        0,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Delete first inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        0,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Delete second inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        2,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 2, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Delete second inserted with multiple cells (subsequent inserts)", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("4")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        2,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 2, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("4")
        }
      ]);
    });
  });
  suite("Keep Deleted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    test("Keep first deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForKeepingADeletedCell(
        0,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Keep second deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForKeepingADeletedCell(
        1,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 1, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Keep first deleted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForKeepingADeletedCell(
        1,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 1, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
  });
  suite("Revert Deleted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
      return {
        diff,
        keep,
        undo,
        type: "unchanged",
        originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`),
        originalCellIndex,
        modifiedCellIndex,
        modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`)
      };
    }
    test("Revert first deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForRevertingADeletedCell(
        0,
        cellsDiffInfo,
        // eslint-disable-next-line local/code-no-any-casts
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Revert second deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForRevertingADeletedCell(
        1,
        cellsDiffInfo,
        // eslint-disable-next-line local/code-no-any-casts
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Revert first deleted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForRevertingADeletedCell(
        1,
        cellsDiffInfo,
        // eslint-disable-next-line local/code-no-any-casts
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 3, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("InsertedModified:3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 5,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
  });
  suite("Cell Addition", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    function createICell(cellKind, source) {
      const handle = hash(generateUuid());
      return {
        uri: URI.parse(`file:///path/${handle}`),
        handle,
        cellKind,
        language: cellKind === CellKind.Markup ? "markdown" : "python",
        outputs: [],
        metadata: {},
        getHashValue: () => {
          return hash(`${handle}=>${cellKind}=>${source}`);
        },
        getValue: () => {
          return source;
        },
        internalMetadata: {}
      };
    }
    function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
      return {
        diff,
        keep,
        undo,
        type: "unchanged",
        originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`),
        originalCellIndex,
        modifiedCellIndex,
        modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`)
      };
    }
    test("Insert a new cell into an unchanged notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const cell = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [0, 0, [cell]],
        cellsDiffInfo,
        3,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 0,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:0`),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel(`InsertedModified:0`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Insert a new cell into a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("4")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "modified",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("6")
        }
      ];
      const cell = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell]],
        cellsDiffInfo,
        6,
        7,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 4,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:4"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("4")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "modified",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 7,
          modifiedCellIndex: 5,
          modifiedModel: createModifiedModel("6")
        }
      ]);
    });
    test("Insert 2 new cells into an notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const cell2 = createICell(CellKind.Code, 'print("Foo Bar")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell1, cell2]],
        cellsDiffInfo,
        4,
        6,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 4,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }, {
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell2.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:4`),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel(`InsertedModified:2`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:5`),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel(`InsertedModified:3`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 7,
          modifiedCellIndex: 5,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete a cell from an unchanged notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [0, 1, []],
        cellsDiffInfo,
        2,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 0,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete last cell from an unchanged notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 1, []],
        cellsDiffInfo,
        2,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Delete the first cell, then insert a new cell at the top", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [0, 0, [cell1]],
        cellsDiffInfo,
        2,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete a new cell from a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 1, [
          // createICell(CellKind.Code, 'print("Hello World")')
        ]],
        cellsDiffInfo,
        4,
        6,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, []);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete 2 cells from a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 2, []],
        cellsDiffInfo,
        4,
        6,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 4,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete 3 cells from a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "modified",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("6")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 3, []],
        cellsDiffInfo,
        5,
        7,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [],
          count: 1
        },
        {
          editType: CellEditType.Replace,
          index: 5,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("6")
        }
      ]);
    });
    test("Insert 1 cell at the bottom via chat, then user creats a new cell just below that", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell1]],
        cellsDiffInfo,
        3,
        1,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        }
      ]);
    });
    test("Insert 1 cell at the bottom via chat, then user creats anew cells above the previous new cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell1]],
        cellsDiffInfo,
        3,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 2,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("New1")
        }
      ]);
    });
    test("Insert 1 cell at the bottom via chat, then user inserts a new cells below the  previous new cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [3, 0, [cell1]],
        cellsDiffInfo,
        3,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 2,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("InsertedModified:3")
        }
      ]);
    });
  });
  suite("Cell Movements", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    test("Swap first two inserted cells in a previously empty notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 1
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Swap first two inserted cells in a notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 1
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ]);
    });
    test("Move first inserted cell to the very bottom of notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 3
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Move last cell to top of notebook after 2 cells were inserted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 3,
        length: 1,
        newIdx: 0
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 1,
          length: 1,
          newIdx: 0
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Move second inserted cell to the very bottom of notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 3
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Move second inserted cell to the second last position of notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 2
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ]);
    });
    test("Move first cell to the last position of notebook that had 3 cells deleted from the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 2
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 0,
          length: 1,
          newIdx: 5
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Move second cell to the last position of notebook that had 3 cells deleted from the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 2
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 1,
          length: 1,
          newIdx: 5
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Move second cell to the last position of notebook that had 3 cells deleted from middle and 1 inserted in the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 3
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 1,
          length: 1,
          newIdx: 5
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Move last cell to the second position of notebook that had 3 cells deleted from middle and 1 inserted in the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 3,
        length: 1,
        newIdx: 1
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 5,
          length: 1,
          newIdx: 1
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 5,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("New1")
        }
      ]);
    });
  });
  suite("Auto Save", function() {
    test("saves after the final notebook edit", async function() {
      const notebookUri = URI.from({ scheme: Schemas.file, path: "/test.ipynb" });
      let saveOptions;
      const entry = {
        modifiedURI: notebookUri,
        modifiedModel: { uri: notebookUri, cells: [] },
        originalModel: { uri: notebookUri, cells: [] },
        modifiedResourceRef: {
          object: {
            save: async (options) => {
              saveOptions = options;
              return true;
            }
          }
        },
        editedCells: new ResourceSet(),
        cellEntryMap: new ResourceMap(),
        _cellsDiffInfo: observableValue("diffInfo", []),
        _stateObs: observableValue("state", ModifiedFileEntryState.Modified),
        _rewriteRatioObs: observableValue("rewriteRatio", 0),
        _waitsForLastEdits: observableValue("waitsForLastEdits", false),
        _isCurrentlyBeingModifiedByObs: observableValue("isCurrentlyBeingModifiedBy", void 0),
        _applyEdits: async (operation) => operation(),
        _resetEditsState(tx) {
          this._isCurrentlyBeingModifiedByObs.set(void 0, tx);
          this._rewriteRatioObs.set(0, tx);
          this._waitsForLastEdits.set(false, tx);
        },
        _shouldAutoSave() {
          return this.modifiedURI.scheme !== Schemas.untitled;
        }
      };
      await ChatEditingModifiedNotebookEntry.prototype.acceptAgentEdits.call(entry, notebookUri, [], true, void 0);
      assert.deepStrictEqual(saveOptions, {
        reason: SaveReason.AUTO,
        skipSaveParticipants: true
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElUcmFuc2FjdGlvbiwgT2JzZXJ2YWJsZVByb21pc2UsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbnVsbERvY3VtZW50RGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxLaW5kLCBJQ2VsbCwgSUNlbGxFZGl0T3BlcmF0aW9uLCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkuanMnO1xuaW1wb3J0IHsgYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUsIGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzLCBhZGp1c3RDZWxsRGlmZkZvcktlZXBpbmdBRGVsZXRlZENlbGwsIGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FuSW5zZXJ0ZWRDZWxsLCBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FEZWxldGVkQ2VsbCwgYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBbkluc2VydGVkQ2VsbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdEVkaXRpbmcvbm90ZWJvb2svaGVscGVycy5qcyc7XG5pbXBvcnQgeyBJQ2VsbERpZmZJbmZvIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9ub3RlYm9va0NlbGxDaGFuZ2VzLmpzJztcbmltcG9ydCB7IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5cbnN1aXRlKCdDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeScsIGZ1bmN0aW9uICgpIHtcblx0c3VpdGUoJ0tlZXAgSW5zZXJ0ZWQgQ2VsbCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGtlZXAgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0Y29uc3QgdW5kbyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCBkaWZmID0gb2JzZXJ2YWJsZVZhbHVlKCdjZWxsMScsIG51bGxEb2N1bWVudERpZmYpO1xuXHRcdGNvbnN0IGFwcGxpZWRFZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMubGVuZ3RoID0gMDtcblx0XHR9KTtcblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0XHRmdW5jdGlvbiBjcmVhdGVNb2RpZmllZE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgTW9kaWZpZWQ6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBjcmVhdGVPcmlnaW5hbE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgT3JpZ2luYWw6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBhcHBseUVkaXRzKGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSk6IGJvb2xlYW4ge1xuXHRcdFx0YXBwbGllZEVkaXRzLnB1c2goLi4uZWRpdHMpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8obW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcik6IElDZWxsRGlmZkluZm8ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoYEluc2VydGVkT3JpZ2luYWw6JHtvcmlnaW5hbENlbGxJbmRleH1gKSwgb3JpZ2luYWxDZWxsSW5kZXgsXG5cdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKGBJbnNlcnRlZE1vZGlmaWVkOiR7bW9kaWZpZWRDZWxsSW5kZXh9YCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0ZXN0KCdLZWVwIGZpcnN0IGluc2VydGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FuSW5zZXJ0ZWRDZWxsKDAsXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCB7fSBhcyBhbnksXG5cdFx0XHRcdGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjZWxsczogW3t9XSwgY291bnQ6IDAgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKGBJbnNlcnRlZE9yaWdpbmFsOjBgKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoYEluc2VydGVkTW9kaWZpZWQ6MGApLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0tlZXAgZmlyc3QgaW5zZXJ0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQW5JbnNlcnRlZENlbGwoMCxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIHt9IGFzIGFueSxcblx0XHRcdFx0YXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNlbGxzOiBbe31dLCBjb3VudDogMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDowJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0tlZXAgc2Vjb25kIGluc2VydGVkIHdpdGggbXVsdGlwbGUgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FuSW5zZXJ0ZWRDZWxsKDIsXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCB7fSBhcyBhbnksXG5cdFx0XHRcdGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAyLCBjZWxsczogW3t9XSwgY291bnQ6IDAgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnSW5zZXJ0ZWRPcmlnaW5hbDoyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdJbnNlcnRlZE1vZGlmaWVkOjInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1JldmVydCBJbnNlcnRlZCBDZWxsJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2VlcCA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCB1bmRvID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IGRpZmYgPSBvYnNlcnZhYmxlVmFsdWUoJ2NlbGwxJywgbnVsbERvY3VtZW50RGlmZik7XG5cdFx0Y29uc3QgYXBwbGllZEVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFwcGxpZWRFZGl0cy5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBNb2RpZmllZDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU9yaWdpbmFsTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBPcmlnaW5hbDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGFwcGx5RWRpdHMoZWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMucHVzaCguLi5lZGl0cyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0ZXN0KCdEZWxldGUgZmlyc3QgaW5zZXJ0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBbkluc2VydGVkQ2VsbCgwLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIGZpcnN0IGluc2VydGVkIHdpdGggbXVsdGlwbGUgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQW5JbnNlcnRlZENlbGwoMCxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0YXBwbHlFZGl0cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY2VsbHM6IFtdLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdEZWxldGUgc2Vjb25kIGluc2VydGVkIHdpdGggbXVsdGlwbGUgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQW5JbnNlcnRlZENlbGwoMixcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0YXBwbHlFZGl0cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMiwgY2VsbHM6IFtdLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdEZWxldGUgc2Vjb25kIGluc2VydGVkIHdpdGggbXVsdGlwbGUgY2VsbHMgKHN1YnNlcXVlbnQgaW5zZXJ0cyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMycpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzQnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQW5JbnNlcnRlZENlbGwoMixcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0YXBwbHlFZGl0cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMiwgY2VsbHM6IFtdLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc0JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0tlZXAgRGVsZXRlZCBDZWxsJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2VlcCA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCB1bmRvID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IGRpZmYgPSBvYnNlcnZhYmxlVmFsdWUoJ2NlbGwxJywgbnVsbERvY3VtZW50RGlmZik7XG5cdFx0Y29uc3QgYXBwbGllZEVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFwcGxpZWRFZGl0cy5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBNb2RpZmllZDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU9yaWdpbmFsTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBPcmlnaW5hbDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGFwcGx5RWRpdHMoZWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMucHVzaCguLi5lZGl0cyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0ZXN0KCdLZWVwIGZpcnN0IGRlbGV0ZWQgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkZvcktlZXBpbmdBRGVsZXRlZENlbGwoMCxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0YXBwbHlFZGl0cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY2VsbHM6IFtdLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0tlZXAgc2Vjb25kIGRlbGV0ZWQgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkZvcktlZXBpbmdBRGVsZXRlZENlbGwoMSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0YXBwbHlFZGl0cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY2VsbHM6IFtdLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnS2VlcCBmaXJzdCBkZWxldGVkIHdpdGggbXVsdGlwbGUgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FEZWxldGVkQ2VsbCgxLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmV2ZXJ0IERlbGV0ZWQgQ2VsbCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGtlZXAgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0Y29uc3QgdW5kbyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCBkaWZmID0gb2JzZXJ2YWJsZVZhbHVlKCdjZWxsMScsIG51bGxEb2N1bWVudERpZmYpO1xuXHRcdGNvbnN0IGFwcGxpZWRFZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMubGVuZ3RoID0gMDtcblx0XHR9KTtcblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0XHRmdW5jdGlvbiBjcmVhdGVNb2RpZmllZE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgTW9kaWZpZWQ6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBjcmVhdGVPcmlnaW5hbE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgT3JpZ2luYWw6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBhcHBseUVkaXRzKGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSk6IGJvb2xlYW4ge1xuXHRcdFx0YXBwbGllZEVkaXRzLnB1c2goLi4uZWRpdHMpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKG1vZGlmaWVkQ2VsbEluZGV4OiBudW1iZXIsIG9yaWdpbmFsQ2VsbEluZGV4OiBudW1iZXIpOiBJQ2VsbERpZmZJbmZvIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKGBJbnNlcnRlZE9yaWdpbmFsOiR7b3JpZ2luYWxDZWxsSW5kZXh9YCksIG9yaWdpbmFsQ2VsbEluZGV4LFxuXHRcdFx0XHRtb2RpZmllZENlbGxJbmRleCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbChgSW5zZXJ0ZWRNb2RpZmllZDoke21vZGlmaWVkQ2VsbEluZGV4fWApLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdSZXZlcnQgZmlyc3QgZGVsZXRlZCBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQURlbGV0ZWRDZWxsKDAsXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHR7fSBhcyBhbnksXG5cdFx0XHRcdGFwcGx5RWRpdHMsXG5cdFx0XHRcdGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjZWxsczogW3t9XSwgY291bnQ6IDAgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ1JldmVydCBzZWNvbmQgZGVsZXRlZCBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQURlbGV0ZWRDZWxsKDEsXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHR7fSBhcyBhbnksXG5cdFx0XHRcdGFwcGx5RWRpdHMsXG5cdFx0XHRcdGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjZWxsczogW3t9XSwgY291bnQ6IDAgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUmV2ZXJ0IGZpcnN0IGRlbGV0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBRGVsZXRlZENlbGwoMSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHt9IGFzIGFueSxcblx0XHRcdFx0YXBwbHlFZGl0cyxcblx0XHRcdFx0Y3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDMsIGNlbGxzOiBbe31dLCBjb3VudDogMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MycpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDUsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2VsbCBBZGRpdGlvbicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGtlZXAgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0Y29uc3QgdW5kbyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCBkaWZmID0gb2JzZXJ2YWJsZVZhbHVlKCdjZWxsMScsIG51bGxEb2N1bWVudERpZmYpO1xuXHRcdGNvbnN0IGFwcGxpZWRFZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMubGVuZ3RoID0gMDtcblx0XHR9KTtcblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0XHRmdW5jdGlvbiBjcmVhdGVNb2RpZmllZE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgTW9kaWZpZWQ6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBjcmVhdGVPcmlnaW5hbE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgT3JpZ2luYWw6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBhcHBseUVkaXRzKGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSk6IGJvb2xlYW4ge1xuXHRcdFx0YXBwbGllZEVkaXRzLnB1c2goLi4uZWRpdHMpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlSUNlbGwoY2VsbEtpbmQ6IENlbGxLaW5kLCBzb3VyY2U6IHN0cmluZyk6IElDZWxsIHtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGhhc2goZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgZmlsZTovLy9wYXRoLyR7aGFuZGxlfWApLFxuXHRcdFx0XHRoYW5kbGUsXG5cdFx0XHRcdGNlbGxLaW5kLFxuXHRcdFx0XHRsYW5ndWFnZTogY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCA/ICdtYXJrZG93bicgOiAncHl0aG9uJyxcblx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0Z2V0SGFzaFZhbHVlOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGhhc2goYCR7aGFuZGxlfT0+JHtjZWxsS2luZH09PiR7c291cmNlfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRWYWx1ZTogKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBzb3VyY2U7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHt9LFxuXHRcdFx0fSBhcyBhbnk7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKG1vZGlmaWVkQ2VsbEluZGV4OiBudW1iZXIsIG9yaWdpbmFsQ2VsbEluZGV4OiBudW1iZXIpOiBJQ2VsbERpZmZJbmZvIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKGBJbnNlcnRlZE9yaWdpbmFsOiR7b3JpZ2luYWxDZWxsSW5kZXh9YCksIG9yaWdpbmFsQ2VsbEluZGV4LFxuXHRcdFx0XHRtb2RpZmllZENlbGxJbmRleCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbChgSW5zZXJ0ZWRNb2RpZmllZDoke21vZGlmaWVkQ2VsbEluZGV4fWApLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0dGVzdCgnSW5zZXJ0IGEgbmV3IGNlbGwgaW50byBhbiB1bmNoYW5nZWQgbm90ZWJvb2snLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGNlbGwgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzAsIDAsIFtjZWxsXV0sXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIDMsIDIsIGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwuZ2V0VmFsdWUoKSxcblx0XHRcdFx0XHR9XSwgY291bnQ6IDBcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoYEluc2VydGVkT3JpZ2luYWw6MGApLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbChgSW5zZXJ0ZWRNb2RpZmllZDowYCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0luc2VydCBhIG5ldyBjZWxsIGludG8gYSBub3RlYm9vayB3aXRoIDMgY2VsbHMgZGVsZXRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdtb2RpZmllZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzYnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDYsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzYnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBjZWxsID0gY3JlYXRlSUNlbGwoQ2VsbEtpbmQuQ29kZSwgJ3ByaW50KFwiSGVsbG8gV29ybGRcIiknKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKFsyLCAwLCBbY2VsbF1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCA2LCA3LCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDQsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwuZ2V0VmFsdWUoKSxcblx0XHRcdFx0XHR9XSwgY291bnQ6IDBcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6NCcpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDoyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDYsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdtb2RpZmllZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzYnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDcsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDUsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzYnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0luc2VydCAyIG5ldyBjZWxscyBpbnRvIGFuIG5vdGVib29rIHdpdGggMyBjZWxscyBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGNlbGwxID0gY3JlYXRlSUNlbGwoQ2VsbEtpbmQuQ29kZSwgJ3ByaW50KFwiSGVsbG8gV29ybGRcIiknKTtcblx0XHRcdGNvbnN0IGNlbGwyID0gY3JlYXRlSUNlbGwoQ2VsbEtpbmQuQ29kZSwgJ3ByaW50KFwiRm9vIEJhclwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzIsIDAsIFtjZWxsMSwgY2VsbDJdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgNCwgNiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiA0LFxuXHRcdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0c291cmNlOiBjZWxsMS5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdHNvdXJjZTogY2VsbDIuZ2V0VmFsdWUoKSxcblx0XHRcdFx0XHR9XSwgY291bnQ6IDBcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoYEluc2VydGVkT3JpZ2luYWw6NGApLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbChgSW5zZXJ0ZWRNb2RpZmllZDoyYCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbChgSW5zZXJ0ZWRPcmlnaW5hbDo1YCksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKGBJbnNlcnRlZE1vZGlmaWVkOjNgKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA2LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiA0LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIGEgY2VsbCBmcm9tIGFuIHVuY2hhbmdlZCBub3RlYm9vaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzAsIDEsIFtdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgMiwgMiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdGNlbGxzOiBbXSwgY291bnQ6IDFcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIGxhc3QgY2VsbCBmcm9tIGFuIHVuY2hhbmdlZCBub3RlYm9vaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzEsIDEsIFtdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgMiwgMiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRjZWxsczogW10sIGNvdW50OiAxXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RlbGV0ZSB0aGUgZmlyc3QgY2VsbCwgdGhlbiBpbnNlcnQgYSBuZXcgY2VsbCBhdCB0aGUgdG9wJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGNlbGwxID0gY3JlYXRlSUNlbGwoQ2VsbEtpbmQuQ29kZSwgJ3ByaW50KFwiSGVsbG8gV29ybGRcIiknKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKFswLCAwLCBbY2VsbDFdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgMiwgMiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0c291cmNlOiBjZWxsMS5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdH1dLCBjb3VudDogMFxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RlbGV0ZSBhIG5ldyBjZWxsIGZyb20gYSBub3RlYm9vayB3aXRoIDMgY2VsbHMgZGVsZXRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKFsxLCAxLCBbXG5cdFx0XHRcdC8vIGNyZWF0ZUlDZWxsKENlbGxLaW5kLkNvZGUsICdwcmludChcIkhlbGxvIFdvcmxkXCIpJylcblx0XHRcdF1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCA0LCA2LCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RlbGV0ZSAyIGNlbGxzIGZyb20gYSBub3RlYm9vayB3aXRoIDMgY2VsbHMgZGVsZXRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKFsxLCAyLCBbXG5cdFx0XHRdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgNCwgNiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiA0LFxuXHRcdFx0XHRcdGNlbGxzOiBbXSwgY291bnQ6IDFcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RlbGV0ZSAzIGNlbGxzIGZyb20gYSBub3RlYm9vayB3aXRoIDMgY2VsbHMgZGVsZXRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnbW9kaWZpZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzYnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDYsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzYnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKFsxLCAzLCBbXG5cdFx0XHRdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgNSwgNywgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdGNlbGxzOiBbXSwgY291bnQ6IDFcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogNSxcblx0XHRcdFx0XHRjZWxsczogW10sIGNvdW50OiAxXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc2JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc2JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0luc2VydCAxIGNlbGwgYXQgdGhlIGJvdHRvbSB2aWEgY2hhdCwgdGhlbiB1c2VyIGNyZWF0cyBhIG5ldyBjZWxsIGp1c3QgYmVsb3cgdGhhdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgY2VsbDEgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzIsIDAsIFtjZWxsMV1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCAzLCAxLCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwxLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0fV0sIGNvdW50OiAwXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnSW5zZXJ0IDEgY2VsbCBhdCB0aGUgYm90dG9tIHZpYSBjaGF0LCB0aGVuIHVzZXIgY3JlYXRzIGFuZXcgY2VsbHMgYWJvdmUgdGhlIHByZXZpb3VzIG5ldyBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgY2VsbDEgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzIsIDAsIFtjZWxsMV1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCAzLCAyLCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDIsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwxLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0fV0sIGNvdW50OiAwXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnSW5zZXJ0ZWRPcmlnaW5hbDoyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdJbnNlcnRlZE1vZGlmaWVkOjInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0luc2VydCAxIGNlbGwgYXQgdGhlIGJvdHRvbSB2aWEgY2hhdCwgdGhlbiB1c2VyIGluc2VydHMgYSBuZXcgY2VsbHMgYmVsb3cgdGhlICBwcmV2aW91cyBuZXcgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGNlbGwxID0gY3JlYXRlSUNlbGwoQ2VsbEtpbmQuQ29kZSwgJ3ByaW50KFwiSGVsbG8gV29ybGRcIiknKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKFszLCAwLCBbY2VsbDFdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgMywgMiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiAyLFxuXHRcdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0c291cmNlOiBjZWxsMS5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdH1dLCBjb3VudDogMFxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDozJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NlbGwgTW92ZW1lbnRzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2VlcCA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCB1bmRvID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IGRpZmYgPSBvYnNlcnZhYmxlVmFsdWUoJ2NlbGwxJywgbnVsbERvY3VtZW50RGlmZik7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0XHRmdW5jdGlvbiBjcmVhdGVNb2RpZmllZE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgTW9kaWZpZWQ6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHRmdW5jdGlvbiBjcmVhdGVPcmlnaW5hbE1vZGVsKGlkOiBzdHJpbmcpOiBPYnNlcnZhYmxlUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiBgT3JpZ2luYWw6JHtpZH1gIGFzIGFueTtcblxuXHRcdH1cblx0XHR0ZXN0KCdTd2FwIGZpcnN0IHR3byBpbnNlcnRlZCBjZWxscyBpbiBhIHByZXZpb3VzbHkgZW1wdHkgbm90ZWJvb2snLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDAsIGxlbmd0aDogMSwgbmV3SWR4OiAxXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnU3dhcCBmaXJzdCB0d28gaW5zZXJ0ZWQgY2VsbHMgaW4gYSBub3RlYm9vayB0aGF0IGhhZCAyIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDAsIGxlbmd0aDogMSwgbmV3SWR4OiAxXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ01vdmUgZmlyc3QgaW5zZXJ0ZWQgY2VsbCB0byB0aGUgdmVyeSBib3R0b20gb2Ygbm90ZWJvb2sgdGhhdCBoYWQgMiBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMycpLFxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxNb3ZlbWVudHMoe1xuXHRcdFx0XHRjZWxsczogW10sIGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUsXG5cdFx0XHRcdGluZGV4OiAwLCBsZW5ndGg6IDEsIG5ld0lkeDogM1xuXHRcdFx0fSwgY2VsbHNEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMycpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnTW92ZSBsYXN0IGNlbGwgdG8gdG9wIG9mIG5vdGVib29rIGFmdGVyIDIgY2VsbHMgd2VyZSBpbnNlcnRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMycpLFxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxNb3ZlbWVudHMoe1xuXHRcdFx0XHRjZWxsczogW10sIGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUsXG5cdFx0XHRcdGluZGV4OiAzLCBsZW5ndGg6IDEsIG5ld0lkeDogMFxuXHRcdFx0fSwgY2VsbHNEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMV0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTW92ZSxcblx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRsZW5ndGg6IDEsXG5cdFx0XHRcdFx0bmV3SWR4OiAwXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdNb3ZlIHNlY29uZCBpbnNlcnRlZCBjZWxsIHRvIHRoZSB2ZXJ5IGJvdHRvbSBvZiBub3RlYm9vayB0aGF0IGhhZCAyIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDEsIGxlbmd0aDogMSwgbmV3SWR4OiAzXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdNb3ZlIHNlY29uZCBpbnNlcnRlZCBjZWxsIHRvIHRoZSBzZWNvbmQgbGFzdCBwb3NpdGlvbiBvZiBub3RlYm9vayB0aGF0IGhhZCAyIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDEsIGxlbmd0aDogMSwgbmV3SWR4OiAyXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ01vdmUgZmlyc3QgY2VsbCB0byB0aGUgbGFzdCBwb3NpdGlvbiBvZiBub3RlYm9vayB0aGF0IGhhZCAzIGNlbGxzIGRlbGV0ZWQgZnJvbSB0aGUgbWlkZGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMCwgbGVuZ3RoOiAxLCBuZXdJZHg6IDJcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzFdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1vdmUsXG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0bGVuZ3RoOiAxLFxuXHRcdFx0XHRcdG5ld0lkeDogNVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdNb3ZlIHNlY29uZCBjZWxsIHRvIHRoZSBsYXN0IHBvc2l0aW9uIG9mIG5vdGVib29rIHRoYXQgaGFkIDMgY2VsbHMgZGVsZXRlZCBmcm9tIHRoZSBtaWRkbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxNb3ZlbWVudHMoe1xuXHRcdFx0XHRjZWxsczogW10sIGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUsXG5cdFx0XHRcdGluZGV4OiAxLCBsZW5ndGg6IDEsIG5ld0lkeDogMlxuXHRcdFx0fSwgY2VsbHNEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMV0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTW92ZSxcblx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRsZW5ndGg6IDEsXG5cdFx0XHRcdFx0bmV3SWR4OiA1XG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnTW92ZSBzZWNvbmQgY2VsbCB0byB0aGUgbGFzdCBwb3NpdGlvbiBvZiBub3RlYm9vayB0aGF0IGhhZCAzIGNlbGxzIGRlbGV0ZWQgZnJvbSBtaWRkbGUgYW5kIDEgaW5zZXJ0ZWQgaW4gdGhlIG1pZGRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDEsIGxlbmd0aDogMSwgbmV3SWR4OiAzXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsxXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdGxlbmd0aDogMSxcblx0XHRcdFx0XHRuZXdJZHg6IDVcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnTW92ZSBsYXN0IGNlbGwgdG8gdGhlIHNlY29uZCBwb3NpdGlvbiBvZiBub3RlYm9vayB0aGF0IGhhZCAzIGNlbGxzIGRlbGV0ZWQgZnJvbSBtaWRkbGUgYW5kIDEgaW5zZXJ0ZWQgaW4gdGhlIG1pZGRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDMsIGxlbmd0aDogMSwgbmV3SWR4OiAxXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsxXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRcdGluZGV4OiA1LFxuXHRcdFx0XHRcdGxlbmd0aDogMSxcblx0XHRcdFx0XHRuZXdJZHg6IDFcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBdXRvIFNhdmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnc2F2ZXMgYWZ0ZXIgdGhlIGZpbmFsIG5vdGVib29rIGVkaXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvdGVzdC5pcHluYicgfSk7XG5cdFx0XHRsZXQgc2F2ZU9wdGlvbnM6IHsgcmVhc29uOiBTYXZlUmVhc29uOyBza2lwU2F2ZVBhcnRpY2lwYW50czogYm9vbGVhbiB9IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IHtcblx0XHRcdFx0bW9kaWZpZWRVUkk6IG5vdGVib29rVXJpLFxuXHRcdFx0XHRtb2RpZmllZE1vZGVsOiB7IHVyaTogbm90ZWJvb2tVcmksIGNlbGxzOiBbXSB9LFxuXHRcdFx0XHRvcmlnaW5hbE1vZGVsOiB7IHVyaTogbm90ZWJvb2tVcmksIGNlbGxzOiBbXSB9LFxuXHRcdFx0XHRtb2RpZmllZFJlc291cmNlUmVmOiB7XG5cdFx0XHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdFx0XHRzYXZlOiBhc3luYyAob3B0aW9uczogeyByZWFzb246IFNhdmVSZWFzb247IHNraXBTYXZlUGFydGljaXBhbnRzOiBib29sZWFuIH0pID0+IHtcblx0XHRcdFx0XHRcdFx0c2F2ZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVkaXRlZENlbGxzOiBuZXcgUmVzb3VyY2VTZXQoKSxcblx0XHRcdFx0Y2VsbEVudHJ5TWFwOiBuZXcgUmVzb3VyY2VNYXAoKSxcblx0XHRcdFx0X2NlbGxzRGlmZkluZm86IG9ic2VydmFibGVWYWx1ZTxJQ2VsbERpZmZJbmZvW10+KCdkaWZmSW5mbycsIFtdKSxcblx0XHRcdFx0X3N0YXRlT2JzOiBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCksXG5cdFx0XHRcdF9yZXdyaXRlUmF0aW9PYnM6IG9ic2VydmFibGVWYWx1ZSgncmV3cml0ZVJhdGlvJywgMCksXG5cdFx0XHRcdF93YWl0c0Zvckxhc3RFZGl0czogb2JzZXJ2YWJsZVZhbHVlKCd3YWl0c0Zvckxhc3RFZGl0cycsIGZhbHNlKSxcblx0XHRcdFx0X2lzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5T2JzOiBvYnNlcnZhYmxlVmFsdWUoJ2lzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5JywgdW5kZWZpbmVkKSxcblx0XHRcdFx0X2FwcGx5RWRpdHM6IGFzeW5jIChvcGVyYXRpb246ICgpID0+IFByb21pc2U8dm9pZD4pID0+IG9wZXJhdGlvbigpLFxuXHRcdFx0XHRfcmVzZXRFZGl0c1N0YXRlKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeU9icy5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdFx0dGhpcy5fcmV3cml0ZVJhdGlvT2JzLnNldCgwLCB0eCk7XG5cdFx0XHRcdFx0dGhpcy5fd2FpdHNGb3JMYXN0RWRpdHMuc2V0KGZhbHNlLCB0eCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdF9zaG91bGRBdXRvU2F2ZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RpZmllZFVSSS5zY2hlbWUgIT09IFNjaGVtYXMudW50aXRsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LnByb3RvdHlwZS5hY2NlcHRBZ2VudEVkaXRzLmNhbGwoZW50cnksIG5vdGVib29rVXJpLCBbXSwgdHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzYXZlT3B0aW9ucywge1xuXHRcdFx0XHRyZWFzb246IFNhdmVSZWFzb24uQVVUTyxcblx0XHRcdFx0c2tpcFNhdmVQYXJ0aWNpcGFudHM6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxlQUFlO0FBQ3hCLFNBQTBDLHVCQUF1QjtBQUNqRSxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjLFVBQXFDLCtCQUErQjtBQUMzRixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLG9EQUFvRCxvREFBb0Qsc0NBQXNDLHdDQUF3Qyx3Q0FBd0MsZ0RBQWdEO0FBRXZSLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsWUFBWTtBQUNyQixTQUFTLG9CQUFvQjtBQUU3QixNQUFNLG9DQUFvQyxXQUFZO0FBQ3JELFFBQU0sc0JBQXNCLFdBQVk7QUFFdkMsVUFBTSxPQUFPLE1BQU0sUUFBUSxRQUFRLElBQUk7QUFDdkMsVUFBTSxPQUFPLE1BQU0sUUFBUSxRQUFRLElBQUk7QUFDdkMsVUFBTSxPQUFPLGdCQUFnQixTQUFTLGdCQUFnQjtBQUN0RCxVQUFNLGVBQXFDLENBQUM7QUFDNUMsVUFBTSxNQUFNO0FBQ1gsbUJBQWEsU0FBUztBQUFBLElBQ3ZCLENBQUM7QUFDRCw0Q0FBd0M7QUFDeEMsYUFBUyxvQkFBb0IsSUFBMkM7QUFFdkUsYUFBTyxZQUFZLEVBQUU7QUFBQSxJQUV0QjtBQUNBLGFBQVMsb0JBQW9CLElBQTJDO0FBRXZFLGFBQU8sWUFBWSxFQUFFO0FBQUEsSUFFdEI7QUFDQSxhQUFTLFdBQVcsT0FBc0M7QUFDekQsbUJBQWEsS0FBSyxHQUFHLEtB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
