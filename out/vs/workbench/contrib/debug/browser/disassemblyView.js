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
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { $, addStandardDisposableListener, append } from "../../../../base/browser/dom.js";
import { binarySearch2 } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { Constants } from "../../../../base/common/uint.js";
import { URI } from "../../../../base/common/uri.js";
import { applyFontInfo } from "../../../../editor/browser/config/domFontInfo.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { createBareFontInfoFromRawSettings } from "../../../../editor/common/config/fontInfoFromSettings.js";
import { Range } from "../../../../editor/common/core/range.js";
import { StringBuilder } from "../../../../editor/common/core/stringBuilder.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { focusedStackFrameColor, topStackFrameColor } from "./callStackEditorContribution.js";
import * as icons from "./debugIcons.js";
import { CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, DISASSEMBLY_VIEW_ID, IDebugService, State } from "../common/debug.js";
import { InstructionBreakpoint } from "../common/debugModel.js";
import { getUriFromSource } from "../common/debugSource.js";
import { isUriString, sourcesEqual } from "../common/debugUtils.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { COPY_ADDRESS_ID, COPY_ADDRESS_LABEL } from "../../../../workbench/contrib/debug/browser/debugCommands.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
const disassemblyNotAvailable = {
  allowBreakpoint: false,
  isBreakpointSet: false,
  isBreakpointEnabled: false,
  instructionReference: "",
  instructionOffset: 0,
  instructionReferenceOffset: 0,
  address: 0n,
  instruction: {
    address: "-1",
    instruction: localize("instructionNotAvailable", "Disassembly not available.")
  }
};
let DisassemblyView = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, _configurationService, _instantiationService, _debugService, _contextMenuService, menuService, contextKeyService) {
    super(DISASSEMBLY_VIEW_ID, group, telemetryService, themeService, storageService);
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._debugService = _debugService;
    this._contextMenuService = _contextMenuService;
    this._instructionBpList = [];
    this._enableSourceCodeRender = true;
    this._loadingLock = false;
    this._referenceToMemoryAddress = /* @__PURE__ */ new Map();
    this.menu = menuService.createMenu(MenuId.DebugDisassemblyContext, contextKeyService);
    this._register(this.menu);
    this._disassembledInstructions = void 0;
    this._onDidChangeStackFrame = this._register(new Emitter({ leakWarningThreshold: 1e3, leakWarningName: "DisassemblyView._onDidChangeStackFrame" }));
    this._previousDebuggingState = _debugService.state;
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug")) {
        const newValue = this._configurationService.getValue("debug").disassemblyView.showSourceCode;
        if (this._enableSourceCodeRender !== newValue) {
          this._enableSourceCodeRender = newValue;
        } else {
          this._disassembledInstructions?.rerender();
        }
      }
    }));
  }
  get fontInfo() {
    if (!this._fontInfo) {
      this._fontInfo = this.createFontInfo();
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("editor")) {
          this._fontInfo = this.createFontInfo();
        }
      }));
    }
    return this._fontInfo;
  }
  createFontInfo() {
    return createBareFontInfoFromRawSettings(this._configurationService.getValue("editor"), PixelRatio.getInstance(this.window).value);
  }
  get currentInstructionAddresses() {
    return this._debugService.getModel().getSessions(false).map((session) => session.getAllThreads()).reduce((prev, curr) => prev.concat(curr), []).map((thread) => thread.getTopStackFrame()).map((frame) => frame?.instructionPointerReference).map((ref) => ref ? this.getReferenceAddress(ref) : void 0);
  }
  // Instruction reference of the top stack frame of the focused stack
  get focusedCurrentInstructionReference() {
    return this._debugService.getViewModel().focusedStackFrame?.thread.getTopStackFrame()?.instructionPointerReference;
  }
  get focusedCurrentInstructionAddress() {
    const ref = this.focusedCurrentInstructionReference;
    return ref ? this.getReferenceAddress(ref) : void 0;
  }
  get focusedInstructionReference() {
    return this._debugService.getViewModel().focusedStackFrame?.instructionPointerReference;
  }
  get focusedInstructionAddress() {
    const ref = this.focusedInstructionReference;
    return ref ? this.getReferenceAddress(ref) : void 0;
  }
  get isSourceCodeRender() {
    return this._enableSourceCodeRender;
  }
  get debugSession() {
    return this._debugService.getViewModel().focusedSession;
  }
  get onDidChangeStackFrame() {
    return this._onDidChangeStackFrame.event;
  }
  get focusedAddressAndOffset() {
    const element = this._disassembledInstructions?.getFocusedElements()[0];
    if (!element) {
      return void 0;
    }
    return this.getAddressAndOffset(element);
  }
  getAddressAndOffset(element) {
    const reference = element.instructionReference;
    const offset = Number(element.address - this.getReferenceAddress(reference));
    return { reference, offset, address: element.address };
  }
  createEditor(parent) {
    this._enableSourceCodeRender = this._configurationService.getValue("debug").disassemblyView.showSourceCode;
    const lineHeight = this.fontInfo.lineHeight;
    const thisOM = this;
    const delegate = new class {
      constructor() {
        this.headerRowHeight = 0;
      }
      // No header
      getHeight(row) {
        if (thisOM.isSourceCodeRender && row.showSourceLocation && row.instruction.location?.path && row.instruction.line) {
          if (row.instruction.endLine) {
            return lineHeight * Math.max(2, row.instruction.endLine - row.instruction.line + 2);
          } else {
            return lineHeight * 2;
          }
        }
        return lineHeight;
      }
    }();
    const instructionRenderer = this._register(this._instantiationService.createInstance(InstructionRenderer, this));
    this._disassembledInstructions = this._register(this._instantiationService.createInstance(
      WorkbenchTable,
      "DisassemblyView",
      parent,
      delegate,
      [
        {
          label: "",
          tooltip: "",
          weight: 0,
          minimumWidth: this.fontInfo.lineHeight,
          maximumWidth: this.fontInfo.lineHeight,
          templateId: BreakpointRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("disassemblyTableColumnLabel", "instructions"),
          tooltip: "",
          weight: 0.3,
          templateId: InstructionRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this._instantiationService.createInstance(BreakpointRenderer, this),
        instructionRenderer
      ],
      {
        identityProvider: { getId: (e) => e.instruction.address },
        horizontalScrolling: false,
        overrideStyles: {
          listBackground: editorBackground
        },
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        openOnSingleClick: false,
        accessibilityProvider: new AccessibilityProvider(),
        mouseSupport: false
      }
    ));
    this._disassembledInstructions.domNode.classList.add("disassembly-view");
    if (this.focusedInstructionReference) {
      this.reloadDisassembly(this.focusedInstructionReference, 0);
    }
    this._register(this._disassembledInstructions.onDidScroll((e) => {
      if (this._disassembledInstructions?.row(0) === disassemblyNotAvailable) {
        return;
      }
      if (this._loadingLock) {
        return;
      }
      if (e.oldScrollTop > e.scrollTop && e.scrollTop < e.height) {
        this._loadingLock = true;
        const prevTop = Math.floor(e.scrollTop / this.fontInfo.lineHeight);
        this.scrollUp_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD).then((loaded) => {
          if (loaded > 0) {
            this._disassembledInstructions.reveal(prevTop + loaded, 0);
          }
        }).finally(() => {
          this._loadingLock = false;
        });
      } else if (e.oldScrollTop < e.scrollTop && e.scrollTop + e.height > e.scrollHeight - e.height) {
        this._loadingLock = true;
        this.scrollDown_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD).finally(() => {
          this._loadingLock = false;
        });
      }
    }));
    this._register(this._disassembledInstructions.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this._debugService.getViewModel().onDidFocusStackFrame(({ stackFrame }) => {
      if (this._disassembledInstructions && stackFrame?.instructionPointerReference) {
        this.goToInstructionAndOffset(stackFrame.instructionPointerReference, 0);
      }
      this._onDidChangeStackFrame.fire();
    }));
    this._register(this._debugService.getModel().onDidChangeBreakpoints((bpEvent) => {
      if (bpEvent && this._disassembledInstructions) {
        let changed = false;
        bpEvent.added?.forEach((bp) => {
          if (bp instanceof InstructionBreakpoint) {
            const index = this.getIndexFromReferenceAndOffset(bp.instructionReference, bp.offset);
            if (index >= 0) {
              this._disassembledInstructions.row(index).isBreakpointSet = true;
              this._disassembledInstructions.row(index).isBreakpointEnabled = bp.enabled;
              changed = true;
            }
          }
        });
        bpEvent.removed?.forEach((bp) => {
          if (bp instanceof InstructionBreakpoint) {
            const index = this.getIndexFromReferenceAndOffset(bp.instructionReference, bp.offset);
            if (index >= 0) {
              this._disassembledInstructions.row(index).isBreakpointSet = false;
              changed = true;
            }
          }
        });
        bpEvent.changed?.forEach((bp) => {
          if (bp instanceof InstructionBreakpoint) {
            const index = this.getIndexFromReferenceAndOffset(bp.instructionReference, bp.offset);
            if (index >= 0) {
              if (this._disassembledInstructions.row(index).isBreakpointEnabled !== bp.enabled) {
                this._disassembledInstructions.row(index).isBreakpointEnabled = bp.enabled;
                changed = true;
              }
            }
          }
        });
        this._instructionBpList = this._debugService.getModel().getInstructionBreakpoints();
        for (const bp of this._instructionBpList) {
          this.primeMemoryReference(bp.instructionReference);
        }
        if (changed) {
          this._onDidChangeStackFrame.fire();
        }
      }
    }));
    this._register(this._debugService.onDidChangeState((e) => {
      if ((e === State.Running || e === State.Stopped) && (this._previousDebuggingState !== State.Running && this._previousDebuggingState !== State.Stopped)) {
        this.clear();
        this._enableSourceCodeRender = this._configurationService.getValue("debug").disassemblyView.showSourceCode;
      }
      this._previousDebuggingState = e;
      this._onDidChangeStackFrame.fire();
    }));
  }
  layout(dimension) {
    this._disassembledInstructions?.layout(dimension.height);
  }
  async goToInstructionAndOffset(instructionReference, offset, focus) {
    let addr = this._referenceToMemoryAddress.get(instructionReference);
    if (addr === void 0) {
      await this.loadDisassembledInstructions(instructionReference, 0, -DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 2);
      addr = this._referenceToMemoryAddress.get(instructionReference);
    }
    if (addr) {
      this.goToAddress(addr + BigInt(offset), focus);
    }
  }
  /** Gets the address associated with the instruction reference. */
  getReferenceAddress(instructionReference) {
    return this._referenceToMemoryAddress.get(instructionReference);
  }
  /**
   * Go to the address provided. If no address is provided, reveal the address of the currently focused stack frame. Returns false if that address is not available.
   */
  goToAddress(address, focus) {
    if (!this._disassembledInstructions) {
      return false;
    }
    if (!address) {
      return false;
    }
    const index = this.getIndexFromAddress(address);
    if (index >= 0) {
      this._disassembledInstructions.reveal(index);
      if (focus) {
        this._disassembledInstructions.domFocus();
        this._disassembledInstructions.setFocus([index]);
      }
      return true;
    }
    return false;
  }
  async scrollUp_LoadDisassembledInstructions(instructionCount) {
    const first = this._disassembledInstructions?.row(0);
    if (first) {
      return this.loadDisassembledInstructions(
        first.instructionReference,
        first.instructionReferenceOffset,
        first.instructionOffset - instructionCount,
        instructionCount
      );
    }
    return 0;
  }
  async scrollDown_LoadDisassembledInstructions(instructionCount) {
    const last = this._disassembledInstructions?.row(this._disassembledInstructions?.length - 1);
    if (last) {
      return this.loadDisassembledInstructions(
        last.instructionReference,
        last.instructionReferenceOffset,
        last.instructionOffset + 1,
        instructionCount
      );
    }
    return 0;
  }
  /**
   * Sets the memory reference address. We don't just loadDisassembledInstructions
   * for this, since we can't really deal with discontiguous ranges (we can't
   * detect _if_ a range is discontiguous since we don't know how much memory
   * comes between instructions.)
   */
  async primeMemoryReference(instructionReference) {
    if (this._referenceToMemoryAddress.has(instructionReference)) {
      return true;
    }
    const s = await this.debugSession?.disassemble(instructionReference, 0, 0, 1);
    if (s && s.length > 0) {
      try {
        this._referenceToMemoryAddress.set(instructionReference, BigInt(s[0].address));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  /** Loads disasembled instructions. Returns the number of instructions that were loaded. */
  async loadDisassembledInstructions(instructionReference, offset, instructionOffset, instructionCount) {
    const session = this.debugSession;
    const resultEntries = await session?.disassemble(instructionReference, offset, instructionOffset, instructionCount);
    if (!this._referenceToMemoryAddress.has(instructionReference) && instructionOffset !== 0) {
      await this.loadDisassembledInstructions(instructionReference, 0, 0, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD);
    }
    if (session && resultEntries && this._disassembledInstructions) {
      const newEntries = [];
      let lastLocation;
      let lastLine;
      for (let i = 0; i < resultEntries.length; i++) {
        const instruction = resultEntries[i];
        const thisInstructionOffset = instructionOffset + i;
        if (instruction.location) {
          lastLocation = instruction.location;
          lastLine = void 0;
        }
        if (instruction.line) {
          const currentLine = {
            startLineNumber: instruction.line,
            startColumn: instruction.column ?? 0,
            endLineNumber: instruction.endLine ?? instruction.line,
            endColumn: instruction.endColumn ?? 0
          };
          if (!Range.equalsRange(currentLine, lastLine ?? null)) {
            lastLine = currentLine;
            instruction.location = lastLocation;
          }
        }
        let address;
        try {
          address = BigInt(instruction.address);
        } catch {
          console.error(`Could not parse disassembly address ${instruction.address} (in ${JSON.stringify(instruction)})`);
          continue;
        }
        if (address === -1n) {
          continue;
        }
        const entry = {
          allowBreakpoint: true,
          isBreakpointSet: false,
          isBreakpointEnabled: false,
          instructionReference,
          instructionReferenceOffset: offset,
          instructionOffset: thisInstructionOffset,
          instruction,
          address
        };
        newEntries.push(entry);
        if (offset === 0 && thisInstructionOffset === 0) {
          this._referenceToMemoryAddress.set(instructionReference, address);
        }
      }
      if (newEntries.length === 0) {
        return 0;
      }
      const refBaseAddress = this._referenceToMemoryAddress.get(instructionReference);
      const bps = this._instructionBpList.map((p) => {
        const base = this._referenceToMemoryAddress.get(p.instructionReference);
        if (!base) {
          return void 0;
        }
        return {
          enabled: p.enabled,
          address: base + BigInt(p.offset || 0)
        };
      });
      if (refBaseAddress !== void 0) {
        for (const entry of newEntries) {
          const bp = bps.find((p) => p?.address === entry.address);
          if (bp) {
            entry.isBreakpointSet = true;
            entry.isBreakpointEnabled = bp.enabled;
          }
        }
      }
      const da = this._disassembledInstructions;
      if (da.length === 1 && this._disassembledInstructions.row(0) === disassemblyNotAvailable) {
        da.splice(0, 1);
      }
      const firstAddr = newEntries[0].address;
      const lastAddr = newEntries[newEntries.length - 1].address;
      const startN = binarySearch2(da.length, (i) => Number(da.row(i).address - firstAddr));
      const start = startN < 0 ? ~startN : startN;
      const endN = binarySearch2(da.length, (i) => Number(da.row(i).address - lastAddr));
      const end = endN < 0 ? ~endN : endN + 1;
      const toDelete = end - start;
      let lastLocated;
      for (let i = start - 1; i >= 0; i--) {
        const { instruction } = da.row(i);
        if (instruction.location && instruction.line !== void 0) {
          lastLocated = instruction;
          break;
        }
      }
      const shouldShowLocation = (instruction) => instruction.line !== void 0 && instruction.location !== void 0 && (!lastLocated || !sourcesEqual(instruction.location, lastLocated.location) || instruction.line !== lastLocated.line);
      for (const entry of newEntries) {
        if (shouldShowLocation(entry.instruction)) {
          entry.showSourceLocation = true;
          lastLocated = entry.instruction;
        }
      }
      da.splice(start, toDelete, newEntries);
      return newEntries.length - toDelete;
    }
    return 0;
  }
  getIndexFromReferenceAndOffset(instructionReference, offset) {
    const addr = this._referenceToMemoryAddress.get(instructionReference);
    if (addr === void 0) {
      return -1;
    }
    return this.getIndexFromAddress(addr + BigInt(offset));
  }
  getIndexFromAddress(address) {
    const disassembledInstructions = this._disassembledInstructions;
    if (disassembledInstructions && disassembledInstructions.length > 0) {
      return binarySearch2(disassembledInstructions.length, (index) => {
        const row = disassembledInstructions.row(index);
        return Number(row.address - address);
      });
    }
    return -1;
  }
  /**
   * Clears the table and reload instructions near the target address
   */
  reloadDisassembly(instructionReference, offset) {
    if (!this._disassembledInstructions) {
      return;
    }
    this._loadingLock = true;
    this.clear();
    this._instructionBpList = this._debugService.getModel().getInstructionBreakpoints();
    this.loadDisassembledInstructions(instructionReference, offset, -DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 4, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 8).then(() => {
      if (this._disassembledInstructions.length > 0) {
        let targetIndex = void 0;
        const refBaseAddress = this._referenceToMemoryAddress.get(instructionReference);
        if (refBaseAddress !== void 0) {
          const da = this._disassembledInstructions;
          targetIndex = binarySearch2(da.length, (i) => Number(da.row(i).address - refBaseAddress));
          if (targetIndex < 0) {
            targetIndex = ~targetIndex;
          }
        }
        if (targetIndex === void 0) {
          targetIndex = Math.floor(this._disassembledInstructions.length / 2);
        }
        this._disassembledInstructions.reveal(targetIndex, 0.5);
        this._disassembledInstructions.domFocus();
        this._disassembledInstructions.setFocus([targetIndex]);
      }
      this._loadingLock = false;
    });
  }
  clear() {
    this._referenceToMemoryAddress.clear();
    this._disassembledInstructions?.splice(0, this._disassembledInstructions.length, [disassemblyNotAvailable]);
  }
  onContextMenu(e) {
    const actions = getFlatContextMenuActions(this.menu.getActions({ shouldForwardArgs: true }));
    this._contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      getActionsContext: () => e.element
    });
  }
};
DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD = 50;
DisassemblyView = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IDebugService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService)
], DisassemblyView);
let BreakpointRenderer = class {
  constructor(_disassemblyView, _debugService) {
    this._disassemblyView = _disassemblyView;
    this._debugService = _debugService;
    this.templateId = BreakpointRenderer.TEMPLATE_ID;
    this._breakpointIcon = "codicon-" + icons.breakpoint.regular.id;
    this._breakpointDisabledIcon = "codicon-" + icons.breakpoint.disabled.id;
    this._breakpointHintIcon = "codicon-" + icons.debugBreakpointHint.id;
    this._debugStackframe = "codicon-" + icons.debugStackframe.id;
    this._debugStackframeFocused = "codicon-" + icons.debugStackframeFocused.id;
  }
  renderTemplate(container) {
    container.style.alignSelf = "flex-end";
    const icon = append(container, $(".codicon"));
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.height = this._disassemblyView.fontInfo.lineHeight + "px";
    const currentElement = { element: void 0 };
    const disposables = [
      this._disassemblyView.onDidChangeStackFrame(() => this.rerenderDebugStackframe(icon, currentElement.element)),
      addStandardDisposableListener(container, "mouseover", () => {
        if (currentElement.element?.allowBreakpoint) {
          icon.classList.add(this._breakpointHintIcon);
        }
      }),
      addStandardDisposableListener(container, "mouseout", () => {
        if (currentElement.element?.allowBreakpoint) {
          icon.classList.remove(this._breakpointHintIcon);
        }
      }),
      addStandardDisposableListener(container, "click", () => {
        if (currentElement.element?.allowBreakpoint) {
          icon.classList.add(this._breakpointHintIcon);
          const reference = currentElement.element.instructionReference;
          const address = currentElement.element.address;
          const offset = Number(address - this._disassemblyView.getReferenceAddress(reference));
          if (currentElement.element.isBreakpointSet) {
            this._debugService.removeInstructionBreakpoints(reference, offset, address);
          } else if (currentElement.element.allowBreakpoint && !currentElement.element.isBreakpointSet) {
            this._debugService.addInstructionBreakpoint({ instructionReference: reference, offset, address, canPersist: false });
          }
        }
      })
    ];
    return { currentElement, icon, disposables };
  }
  renderElement(element, index, templateData) {
    templateData.currentElement.element = element;
    this.rerenderDebugStackframe(templateData.icon, element);
  }
  disposeTemplate(templateData) {
    dispose(templateData.disposables);
    templateData.disposables = [];
  }
  rerenderDebugStackframe(icon, element) {
    if (element?.address === this._disassemblyView.focusedCurrentInstructionAddress) {
      icon.classList.add(this._debugStackframe);
    } else if (element?.address === this._disassemblyView.focusedInstructionAddress) {
      icon.classList.add(this._debugStackframeFocused);
    } else {
      icon.classList.remove(this._debugStackframe);
      icon.classList.remove(this._debugStackframeFocused);
    }
    icon.classList.remove(this._breakpointHintIcon);
    if (element?.isBreakpointSet) {
      if (element.isBreakpointEnabled) {
        icon.classList.add(this._breakpointIcon);
        icon.classList.remove(this._breakpointDisabledIcon);
      } else {
        icon.classList.remove(this._breakpointIcon);
        icon.classList.add(this._breakpointDisabledIcon);
      }
    } else {
      icon.classList.remove(this._breakpointIcon);
      icon.classList.remove(this._breakpointDisabledIcon);
    }
  }
};
BreakpointRenderer.TEMPLATE_ID = "breakpoint";
BreakpointRenderer = __decorateClass([
  __decorateParam(1, IDebugService)
], BreakpointRenderer);
let InstructionRenderer = class extends Disposable {
  constructor(_disassemblyView, themeService, editorService, textModelService, uriService, logService) {
    super();
    this._disassemblyView = _disassemblyView;
    this.editorService = editorService;
    this.textModelService = textModelService;
    this.uriService = uriService;
    this.logService = logService;
    this.templateId = InstructionRenderer.TEMPLATE_ID;
    this._topStackFrameColor = themeService.getColorTheme().getColor(topStackFrameColor);
    this._focusedStackFrameColor = themeService.getColorTheme().getColor(focusedStackFrameColor);
    this._register(themeService.onDidColorThemeChange((e) => {
      this._topStackFrameColor = e.getColor(topStackFrameColor);
      this._focusedStackFrameColor = e.getColor(focusedStackFrameColor);
    }));
  }
  renderTemplate(container) {
    const sourcecode = append(container, $(".sourcecode"));
    const instruction = append(container, $(".instruction"));
    this.applyFontInfo(sourcecode);
    this.applyFontInfo(instruction);
    const currentElement = { element: void 0 };
    const cellDisposable = [];
    const disposables = [
      this._disassemblyView.onDidChangeStackFrame(() => this.rerenderBackground(instruction, sourcecode, currentElement.element)),
      addStandardDisposableListener(sourcecode, "dblclick", () => this.openSourceCode(currentElement.element?.instruction))
    ];
    return { currentElement, instruction, sourcecode, cellDisposable, disposables };
  }
  renderElement(element, index, templateData) {
    this.renderElementInner(element, index, templateData);
  }
  async renderElementInner(element, index, templateData) {
    templateData.currentElement.element = element;
    const instruction = element.instruction;
    templateData.sourcecode.innerText = "";
    const sb = new StringBuilder(1e3);
    if (this._disassemblyView.isSourceCodeRender && element.showSourceLocation && instruction.location?.path && instruction.line !== void 0) {
      const sourceURI = this.getUriFromSource(instruction);
      if (sourceURI) {
        let textModel = void 0;
        const sourceSB = new StringBuilder(1e4);
        const ref = await this.textModelService.createModelReference(sourceURI);
        if (templateData.currentElement.element !== element) {
          ref.dispose();
          return;
        }
        textModel = ref.object.textEditorModel;
        templateData.cellDisposable.push(ref);
        if (textModel && templateData.currentElement.element === element) {
          let lineNumber = instruction.line;
          while (lineNumber && lineNumber >= 1 && lineNumber <= textModel.getLineCount()) {
            const lineContent = textModel.getLineContent(lineNumber);
            sourceSB.appendString(`  ${lineNumber}: `);
            sourceSB.appendString(lineContent + "\n");
            if (instruction.endLine && lineNumber < instruction.endLine) {
              lineNumber++;
              continue;
            }
            break;
          }
          templateData.sourcecode.innerText = sourceSB.build();
        }
      }
    }
    let spacesToAppend = 10;
    if (instruction.address !== "-1") {
      sb.appendString(instruction.address);
      if (instruction.address.length < InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH) {
        spacesToAppend = InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH - instruction.address.length;
      }
      for (let i = 0; i < spacesToAppend; i++) {
        sb.appendString(" ");
      }
    }
    if (instruction.instructionBytes) {
      sb.appendString(instruction.instructionBytes);
      spacesToAppend = 10;
      if (instruction.instructionBytes.length < InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH) {
        spacesToAppend = InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH - instruction.instructionBytes.length;
      }
      for (let i = 0; i < spacesToAppend; i++) {
        sb.appendString(" ");
      }
    }
    sb.appendString(instruction.instruction);
    templateData.instruction.innerText = sb.build();
    this.rerenderBackground(templateData.instruction, templateData.sourcecode, element);
  }
  disposeElement(element, index, templateData) {
    dispose(templateData.cellDisposable);
    templateData.cellDisposable = [];
  }
  disposeTemplate(templateData) {
    dispose(templateData.disposables);
    templateData.disposables = [];
  }
  rerenderBackground(instruction, sourceCode, element) {
    if (element && this._disassemblyView.currentInstructionAddresses.includes(element.address)) {
      instruction.style.background = this._topStackFrameColor?.toString() || "transparent";
    } else if (element?.address === this._disassemblyView.focusedInstructionAddress) {
      instruction.style.background = this._focusedStackFrameColor?.toString() || "transparent";
    } else {
      instruction.style.background = "transparent";
    }
  }
  openSourceCode(instruction) {
    if (instruction) {
      const sourceURI = this.getUriFromSource(instruction);
      const selection = instruction.endLine ? {
        startLineNumber: instruction.line,
        endLineNumber: instruction.endLine,
        startColumn: instruction.column || 1,
        endColumn: instruction.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
      } : {
        startLineNumber: instruction.line,
        endLineNumber: instruction.line,
        startColumn: instruction.column || 1,
        endColumn: instruction.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
      };
      this.editorService.openEditor({
        resource: sourceURI,
        description: localize("editorOpenedFromDisassemblyDescription", "from disassembly"),
        options: {
          preserveFocus: false,
          selection,
          revealIfOpened: true,
          selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
          pinned: false
        }
      });
    }
  }
  getUriFromSource(instruction) {
    const path = instruction.location.path;
    if (path && isUriString(path)) {
      return this.uriService.asCanonicalUri(URI.parse(path));
    }
    if (path && isAbsolute(path)) {
      return this.uriService.asCanonicalUri(URI.file(path));
    }
    return getUriFromSource(instruction.location, instruction.location.path, this._disassemblyView.debugSession.getId(), this.uriService, this.logService);
  }
  applyFontInfo(element) {
    applyFontInfo(element, this._disassemblyView.fontInfo);
    element.style.whiteSpace = "pre";
  }
};
InstructionRenderer.TEMPLATE_ID = "instruction";
InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH = 25;
InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH = 30;
InstructionRenderer = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILogService)
], InstructionRenderer);
class AccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("disassemblyView", "Disassembly View");
  }
  getAriaLabel(element) {
    let label = "";
    const instruction = element.instruction;
    if (instruction.address !== "-1") {
      label += `${localize("instructionAddress", "Address")}: ${instruction.address}`;
    }
    if (instruction.instructionBytes) {
      label += `, ${localize("instructionBytes", "Bytes")}: ${instruction.instructionBytes}`;
    }
    label += `, ${localize(`instructionText`, "Instruction")}: ${instruction.instruction}`;
    return label;
  }
}
let DisassemblyViewContribution = class {
  constructor(editorService, debugService, contextKeyService) {
    contextKeyService.bufferChangeEvents(() => {
      this._languageSupportsDisassembleRequest = CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST.bindTo(contextKeyService);
    });
    const onDidActiveEditorChangeListener = () => {
      if (this._onDidChangeModelLanguage) {
        this._onDidChangeModelLanguage.dispose();
        this._onDidChangeModelLanguage = void 0;
      }
      const activeTextEditorControl = editorService.activeTextEditorControl;
      if (isCodeEditor(activeTextEditorControl)) {
        const language = activeTextEditorControl.getModel()?.getLanguageId();
        this._languageSupportsDisassembleRequest?.set(!!language && debugService.getAdapterManager().someDebuggerInterestedInLanguage(language));
        this._onDidChangeModelLanguage = activeTextEditorControl.onDidChangeModelLanguage((e) => {
          this._languageSupportsDisassembleRequest?.set(debugService.getAdapterManager().someDebuggerInterestedInLanguage(e.newLanguage));
        });
      } else {
        this._languageSupportsDisassembleRequest?.set(false);
      }
    };
    onDidActiveEditorChangeListener();
    this._onDidActiveEditorChangeListener = editorService.onDidActiveEditorChange(onDidActiveEditorChangeListener);
  }
  dispose() {
    this._onDidActiveEditorChangeListener.dispose();
    this._onDidChangeModelLanguage?.dispose();
  }
};
DisassemblyViewContribution = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextKeyService)
], DisassemblyViewContribution);
CommandsRegistry.registerCommand({
  metadata: {
    description: COPY_ADDRESS_LABEL
  },
  id: COPY_ADDRESS_ID,
  handler: async (accessor, entry) => {
    if (entry?.instruction?.address) {
      const clipboardService = accessor.get(IClipboardService);
      clipboardService.writeText(entry.instruction.address);
    }
  }
});
export {
  DisassemblyView,
  DisassemblyViewContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkaXNhc3NlbWJseVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQaXhlbFJhdGlvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3BpeGVsUmF0aW8uanMnO1xuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRhYmxlQ29udGV4dE1lbnVFdmVudCwgSVRhYmxlUmVuZGVyZXIsIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBiaW5hcnlTZWFyY2gyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFwcGx5Rm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZG9tRm9udEluZm8uanMnO1xuaW1wb3J0IHsgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBCYXJlRm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mb0Zyb21TZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFN0cmluZ0J1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc3RyaW5nQnVpbGRlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBmb2N1c2VkU3RhY2tGcmFtZUNvbG9yLCB0b3BTdGFja0ZyYW1lQ29sb3IgfSBmcm9tICcuL2NhbGxTdGFja0VkaXRvckNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9MQU5HVUFHRV9TVVBQT1JUU19ESVNBU1NFTUJMRV9SRVFVRVNULCBESVNBU1NFTUJMWV9WSUVXX0lELCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50LCBTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJbnN0cnVjdGlvbkJyZWFrcG9pbnQgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRVcmlGcm9tU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnU291cmNlLmpzJztcbmltcG9ydCB7IGlzVXJpU3RyaW5nLCBzb3VyY2VzRXF1YWwgfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENPUFlfQUREUkVTU19JRCwgQ09QWV9BRERSRVNTX0xBQkVMIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IHtcblx0YWxsb3dCcmVha3BvaW50OiBib29sZWFuO1xuXHRpc0JyZWFrcG9pbnRTZXQ6IGJvb2xlYW47XG5cdGlzQnJlYWtwb2ludEVuYWJsZWQ6IGJvb2xlYW47XG5cdC8qKiBJbnN0cnVjdGlvbiByZWZlcmVuY2UgZnJvbSB0aGUgREEgKi9cblx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHN0cmluZztcblx0LyoqIE9mZnNldCBmcm9tIHRoZSBpbnN0cnVjdGlvblJlZmVyZW5jZSB0aGF0J3MgdGhlIGJhc2lzIGZvciB0aGUgYGluc3RydWN0aW9uT2Zmc2V0YCAqL1xuXHRpbnN0cnVjdGlvblJlZmVyZW5jZU9mZnNldDogbnVtYmVyO1xuXHQvKiogVGhlIG51bWJlciBvZiBpbnN0cnVjdGlvbnMgKCsvLSkgYXdheSBmcm9tIHRoZSBpbnN0cnVjdGlvblJlZmVyZW5jZSBhbmQgaW5zdHJ1Y3Rpb25SZWZlcmVuY2VPZmZzZXQgdGhpcyBpbnN0cnVjdGlvbiBsaWVzICovXG5cdGluc3RydWN0aW9uT2Zmc2V0OiBudW1iZXI7XG5cdC8qKiBXaGV0aGVyIHRoaXMgaXMgdGhlIGZpcnN0IGluc3RydWN0aW9uIG9uIHRoZSB0YXJnZXQgbGluZS4gKi9cblx0c2hvd1NvdXJjZUxvY2F0aW9uPzogYm9vbGVhbjtcblx0LyoqIE9yaWdpbmFsIGluc3RydWN0aW9uIGZyb20gdGhlIGRlYnVnZ2VyICovXG5cdGluc3RydWN0aW9uOiBEZWJ1Z1Byb3RvY29sLkRpc2Fzc2VtYmxlZEluc3RydWN0aW9uO1xuXHQvKiogUGFyc2VkIGluc3RydWN0aW9uIGFkZHJlc3MgKi9cblx0YWRkcmVzczogYmlnaW50O1xufVxuXG4vLyBTcGVjaWFsIGVudHJ5IGFzIGEgcGxhY2Vob2xlciB3aGVuIGRpc2Fzc2VtYmx5IGlzIG5vdCBhdmFpbGFibGVcbmNvbnN0IGRpc2Fzc2VtYmx5Tm90QXZhaWxhYmxlOiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSA9IHtcblx0YWxsb3dCcmVha3BvaW50OiBmYWxzZSxcblx0aXNCcmVha3BvaW50U2V0OiBmYWxzZSxcblx0aXNCcmVha3BvaW50RW5hYmxlZDogZmFsc2UsXG5cdGluc3RydWN0aW9uUmVmZXJlbmNlOiAnJyxcblx0aW5zdHJ1Y3Rpb25PZmZzZXQ6IDAsXG5cdGluc3RydWN0aW9uUmVmZXJlbmNlT2Zmc2V0OiAwLFxuXHRhZGRyZXNzOiAwbixcblx0aW5zdHJ1Y3Rpb246IHtcblx0XHRhZGRyZXNzOiAnLTEnLFxuXHRcdGluc3RydWN0aW9uOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25Ob3RBdmFpbGFibGUnLCBcIkRpc2Fzc2VtYmx5IG5vdCBhdmFpbGFibGUuXCIpXG5cdH0sXG59O1xuXG5leHBvcnQgY2xhc3MgRGlzYXNzZW1ibHlWaWV3IGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTlVNX0lOU1RSVUNUSU9OU19UT19MT0FEID0gNTA7XG5cblx0Ly8gVXNlZCBpbiBpbnN0cnVjdGlvbiByZW5kZXJlclxuXHRwcml2YXRlIF9mb250SW5mbzogQmFyZUZvbnRJbmZvIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM6IFdvcmtiZW5jaFRhYmxlPElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTdGFja0ZyYW1lOiBFbWl0dGVyPHZvaWQ+O1xuXHRwcml2YXRlIF9wcmV2aW91c0RlYnVnZ2luZ1N0YXRlOiBTdGF0ZTtcblx0cHJpdmF0ZSBfaW5zdHJ1Y3Rpb25CcExpc3Q6IHJlYWRvbmx5IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRbXSA9IFtdO1xuXHRwcml2YXRlIF9lbmFibGVTb3VyY2VDb2RlUmVuZGVyOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBfbG9hZGluZ0xvY2s6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzID0gbmV3IE1hcDxzdHJpbmcsIGJpZ2ludD4oKTtcblx0cHJpdmF0ZSBtZW51OiBJTWVudTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihESVNBU1NFTUJMWV9WSUVXX0lELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLm1lbnUgPSBtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5EZWJ1Z0Rpc2Fzc2VtYmx5Q29udGV4dCwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudSk7XG5cdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhY2tGcmFtZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHsgbGVha1dhcm5pbmdUaHJlc2hvbGQ6IDEwMDAsIGxlYWtXYXJuaW5nTmFtZTogJ0Rpc2Fzc2VtYmx5Vmlldy5fb25EaWRDaGFuZ2VTdGFja0ZyYW1lJyB9KSk7XG5cdFx0dGhpcy5fcHJldmlvdXNEZWJ1Z2dpbmdTdGF0ZSA9IF9kZWJ1Z1NlcnZpY2Uuc3RhdGU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1ZycpKSB7XG5cdFx0XHRcdC8vIHNob3cvaGlkZSBzb3VyY2UgY29kZSByZXF1aXJlcyBjaGFuZ2luZyBoZWlnaHQgd2hpY2ggV29ya2JlbmNoVGFibGUgZG9lc24ndCBzdXBwb3J0IGR5bmFtaWMgaGVpZ2h0LCB0aHVzIGZvcmNlIGEgdG90YWwgcmVsb2FkLlxuXHRcdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmRpc2Fzc2VtYmx5Vmlldy5zaG93U291cmNlQ29kZTtcblx0XHRcdFx0aWYgKHRoaXMuX2VuYWJsZVNvdXJjZUNvZGVSZW5kZXIgIT09IG5ld1ZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fZW5hYmxlU291cmNlQ29kZVJlbmRlciA9IG5ld1ZhbHVlO1xuXHRcdFx0XHRcdC8vIHRvZG86IHRyaWdnZXIgcmVyZW5kZXJcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/LnJlcmVuZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXQgZm9udEluZm8oKSB7XG5cdFx0aWYgKCF0aGlzLl9mb250SW5mbykge1xuXHRcdFx0dGhpcy5fZm9udEluZm8gPSB0aGlzLmNyZWF0ZUZvbnRJbmZvKCk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvcicpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZm9udEluZm8gPSB0aGlzLmNyZWF0ZUZvbnRJbmZvKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZm9udEluZm87XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZvbnRJbmZvKCkge1xuXHRcdHJldHVybiBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3ModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvcicpLCBQaXhlbFJhdGlvLmdldEluc3RhbmNlKHRoaXMud2luZG93KS52YWx1ZSk7XG5cdH1cblxuXHRnZXQgY3VycmVudEluc3RydWN0aW9uQWRkcmVzc2VzKCkge1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucyhmYWxzZSkuXG5cdFx0XHRtYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLmdldEFsbFRocmVhZHMoKSkuXG5cdFx0XHRyZWR1Y2UoKHByZXYsIGN1cnIpID0+IHByZXYuY29uY2F0KGN1cnIpLCBbXSkuXG5cdFx0XHRtYXAodGhyZWFkID0+IHRocmVhZC5nZXRUb3BTdGFja0ZyYW1lKCkpLlxuXHRcdFx0bWFwKGZyYW1lID0+IGZyYW1lPy5pbnN0cnVjdGlvblBvaW50ZXJSZWZlcmVuY2UpLlxuXHRcdFx0bWFwKHJlZiA9PiByZWYgPyB0aGlzLmdldFJlZmVyZW5jZUFkZHJlc3MocmVmKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyBJbnN0cnVjdGlvbiByZWZlcmVuY2Ugb2YgdGhlIHRvcCBzdGFjayBmcmFtZSBvZiB0aGUgZm9jdXNlZCBzdGFja1xuXHRnZXQgZm9jdXNlZEN1cnJlbnRJbnN0cnVjdGlvblJlZmVyZW5jZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lPy50aHJlYWQuZ2V0VG9wU3RhY2tGcmFtZSgpPy5pbnN0cnVjdGlvblBvaW50ZXJSZWZlcmVuY2U7XG5cdH1cblxuXHRnZXQgZm9jdXNlZEN1cnJlbnRJbnN0cnVjdGlvbkFkZHJlc3MoKSB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5mb2N1c2VkQ3VycmVudEluc3RydWN0aW9uUmVmZXJlbmNlO1xuXHRcdHJldHVybiByZWYgPyB0aGlzLmdldFJlZmVyZW5jZUFkZHJlc3MocmVmKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBmb2N1c2VkSW5zdHJ1Y3Rpb25SZWZlcmVuY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZT8uaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlO1xuXHR9XG5cblx0Z2V0IGZvY3VzZWRJbnN0cnVjdGlvbkFkZHJlc3MoKSB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5mb2N1c2VkSW5zdHJ1Y3Rpb25SZWZlcmVuY2U7XG5cdFx0cmV0dXJuIHJlZiA/IHRoaXMuZ2V0UmVmZXJlbmNlQWRkcmVzcyhyZWYpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IGlzU291cmNlQ29kZVJlbmRlcigpIHsgcmV0dXJuIHRoaXMuX2VuYWJsZVNvdXJjZUNvZGVSZW5kZXI7IH1cblxuXHRnZXQgZGVidWdTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VTdGFja0ZyYW1lKCkgeyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VTdGFja0ZyYW1lLmV2ZW50OyB9XG5cblx0Z2V0IGZvY3VzZWRBZGRyZXNzQW5kT2Zmc2V0KCkge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/LmdldEZvY3VzZWRFbGVtZW50cygpWzBdO1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRBZGRyZXNzQW5kT2Zmc2V0KGVsZW1lbnQpO1xuXHR9XG5cblx0Z2V0QWRkcmVzc0FuZE9mZnNldChlbGVtZW50OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSkge1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IGVsZW1lbnQuaW5zdHJ1Y3Rpb25SZWZlcmVuY2U7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gTnVtYmVyKGVsZW1lbnQuYWRkcmVzcyAtIHRoaXMuZ2V0UmVmZXJlbmNlQWRkcmVzcyhyZWZlcmVuY2UpISk7XG5cdFx0cmV0dXJuIHsgcmVmZXJlbmNlLCBvZmZzZXQsIGFkZHJlc3M6IGVsZW1lbnQuYWRkcmVzcyB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fZW5hYmxlU291cmNlQ29kZVJlbmRlciA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmRpc2Fzc2VtYmx5Vmlldy5zaG93U291cmNlQ29kZTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5mb250SW5mby5saW5lSGVpZ2h0O1xuXHRcdGNvbnN0IHRoaXNPTSA9IHRoaXM7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJVGFibGVWaXJ0dWFsRGVsZWdhdGU8SURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnk+IHtcblx0XHRcdGhlYWRlclJvd0hlaWdodDogbnVtYmVyID0gMDsgLy8gTm8gaGVhZGVyXG5cdFx0XHRnZXRIZWlnaHQocm93OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSk6IG51bWJlciB7XG5cdFx0XHRcdGlmICh0aGlzT00uaXNTb3VyY2VDb2RlUmVuZGVyICYmIHJvdy5zaG93U291cmNlTG9jYXRpb24gJiYgcm93Lmluc3RydWN0aW9uLmxvY2F0aW9uPy5wYXRoICYmIHJvdy5pbnN0cnVjdGlvbi5saW5lKSB7XG5cdFx0XHRcdFx0Ly8gaW5zdHJ1Y3Rpb24gbGluZSArIHNvdXJjZSBsaW5lc1xuXHRcdFx0XHRcdGlmIChyb3cuaW5zdHJ1Y3Rpb24uZW5kTGluZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxpbmVIZWlnaHQgKiBNYXRoLm1heCgyLCAocm93Lmluc3RydWN0aW9uLmVuZExpbmUgLSByb3cuaW5zdHJ1Y3Rpb24ubGluZSArIDIpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gc291cmNlIGlzIG9ubHkgYSBzaW5nbGUgbGluZS5cblx0XHRcdFx0XHRcdHJldHVybiBsaW5lSGVpZ2h0ICogMjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBqdXN0IGluc3RydWN0aW9uIGxpbmVcblx0XHRcdFx0cmV0dXJuIGxpbmVIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RydWN0aW9uUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0cnVjdGlvblJlbmRlcmVyLCB0aGlzKSk7XG5cblx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUYWJsZSxcblx0XHRcdCdEaXNhc3NlbWJseVZpZXcnLCBwYXJlbnQsIGRlbGVnYXRlLFxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMCxcblx0XHRcdFx0XHRtaW5pbXVtV2lkdGg6IHRoaXMuZm9udEluZm8ubGluZUhlaWdodCxcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IHRoaXMuZm9udEluZm8ubGluZUhlaWdodCxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBCcmVha3BvaW50UmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KTogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Rpc2Fzc2VtYmx5VGFibGVDb2x1bW5MYWJlbCcsIFwiaW5zdHJ1Y3Rpb25zXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMC4zLFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IEluc3RydWN0aW9uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KTogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmVha3BvaW50UmVuZGVyZXIsIHRoaXMpLFxuXHRcdFx0XHRpbnN0cnVjdGlvblJlbmRlcmVyLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogeyBnZXRJZDogKGU6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KSA9PiBlLmluc3RydWN0aW9uLmFkZHJlc3MgfSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmRcblx0XHRcdFx0fSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdG1vdXNlU3VwcG9ydDogZmFsc2Vcblx0XHRcdH1cblx0XHQpKSBhcyBXb3JrYmVuY2hUYWJsZTxJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeT47XG5cblx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdkaXNhc3NlbWJseS12aWV3Jyk7XG5cblx0XHRpZiAodGhpcy5mb2N1c2VkSW5zdHJ1Y3Rpb25SZWZlcmVuY2UpIHtcblx0XHRcdHRoaXMucmVsb2FkRGlzYXNzZW1ibHkodGhpcy5mb2N1c2VkSW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIDApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5vbkRpZFNjcm9sbChlID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/LnJvdygwKSA9PT0gZGlzYXNzZW1ibHlOb3RBdmFpbGFibGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2xvYWRpbmdMb2NrKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUub2xkU2Nyb2xsVG9wID4gZS5zY3JvbGxUb3AgJiYgZS5zY3JvbGxUb3AgPCBlLmhlaWdodCkge1xuXHRcdFx0XHR0aGlzLl9sb2FkaW5nTG9jayA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHByZXZUb3AgPSBNYXRoLmZsb29yKGUuc2Nyb2xsVG9wIC8gdGhpcy5mb250SW5mby5saW5lSGVpZ2h0KTtcblx0XHRcdFx0dGhpcy5zY3JvbGxVcF9Mb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKERpc2Fzc2VtYmx5Vmlldy5OVU1fSU5TVFJVQ1RJT05TX1RPX0xPQUQpLnRoZW4oKGxvYWRlZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChsb2FkZWQgPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLnJldmVhbChwcmV2VG9wICsgbG9hZGVkLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4geyB0aGlzLl9sb2FkaW5nTG9jayA9IGZhbHNlOyB9KTtcblx0XHRcdH0gZWxzZSBpZiAoZS5vbGRTY3JvbGxUb3AgPCBlLnNjcm9sbFRvcCAmJiBlLnNjcm9sbFRvcCArIGUuaGVpZ2h0ID4gZS5zY3JvbGxIZWlnaHQgLSBlLmhlaWdodCkge1xuXHRcdFx0XHR0aGlzLl9sb2FkaW5nTG9jayA9IHRydWU7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsRG93bl9Mb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKERpc2Fzc2VtYmx5Vmlldy5OVU1fSU5TVFJVQ1RJT05TX1RPX0xPQUQpLmZpbmFsbHkoKCkgPT4geyB0aGlzLl9sb2FkaW5nTG9jayA9IGZhbHNlOyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTdGFja0ZyYW1lKCh7IHN0YWNrRnJhbWUgfSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyAmJiBzdGFja0ZyYW1lPy5pbnN0cnVjdGlvblBvaW50ZXJSZWZlcmVuY2UpIHtcblx0XHRcdFx0dGhpcy5nb1RvSW5zdHJ1Y3Rpb25BbmRPZmZzZXQoc3RhY2tGcmFtZS5pbnN0cnVjdGlvblBvaW50ZXJSZWZlcmVuY2UsIDApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGFja0ZyYW1lLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyByZWZyZXNoIGJyZWFrcG9pbnRzIHZpZXdcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKGJwRXZlbnQgPT4ge1xuXHRcdFx0aWYgKGJwRXZlbnQgJiYgdGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRcdC8vIGRyYXcgdmlld2FibGUgQlBcblx0XHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdFx0YnBFdmVudC5hZGRlZD8uZm9yRWFjaCgoYnApID0+IHtcblx0XHRcdFx0XHRpZiAoYnAgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJbmRleEZyb21SZWZlcmVuY2VBbmRPZmZzZXQoYnAuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIGJwLm9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLnJvdyhpbmRleCkuaXNCcmVha3BvaW50U2V0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5yb3coaW5kZXgpLmlzQnJlYWtwb2ludEVuYWJsZWQgPSBicC5lbmFibGVkO1xuXHRcdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGJwRXZlbnQucmVtb3ZlZD8uZm9yRWFjaCgoYnApID0+IHtcblx0XHRcdFx0XHRpZiAoYnAgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJbmRleEZyb21SZWZlcmVuY2VBbmRPZmZzZXQoYnAuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIGJwLm9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLnJvdyhpbmRleCkuaXNCcmVha3BvaW50U2V0ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YnBFdmVudC5jaGFuZ2VkPy5mb3JFYWNoKChicCkgPT4ge1xuXHRcdFx0XHRcdGlmIChicCBpbnN0YW5jZW9mIEluc3RydWN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEluZGV4RnJvbVJlZmVyZW5jZUFuZE9mZnNldChicC5pbnN0cnVjdGlvblJlZmVyZW5jZSwgYnAub2Zmc2V0KTtcblx0XHRcdFx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLnJvdyhpbmRleCkuaXNCcmVha3BvaW50RW5hYmxlZCAhPT0gYnAuZW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEucm93KGluZGV4KS5pc0JyZWFrcG9pbnRFbmFibGVkID0gYnAuZW5hYmxlZDtcblx0XHRcdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gZ2V0IGFuIHVwZGF0ZWQgbGlzdCBzbyB0aGF0IGl0ZW1zIGJleW9uZCB0aGUgY3VycmVudCByYW5nZSB3b3VsZCByZW5kZXIgd2hlbiByZWFjaGVkLlxuXHRcdFx0XHR0aGlzLl9pbnN0cnVjdGlvbkJwTGlzdCA9IHRoaXMuX2RlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEluc3RydWN0aW9uQnJlYWtwb2ludHMoKTtcblxuXHRcdFx0XHQvLyBicmVha3BvaW50cyByZXN0b3JlZCBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbiBjYW4gYmUgYmFzZWQgb24gbWVtb3J5XG5cdFx0XHRcdC8vIHJlZmVyZW5jZXMgdGhhdCBtYXkgbm8gbG9uZ2VyIGV4aXN0IGluIHRoZSBjdXJyZW50IHNlc3Npb24uIFJlcXVlc3Rcblx0XHRcdFx0Ly8gdGhvc2UgaW5zdHJ1Y3Rpb25zIHRvIGJlIGxvYWRlZCBzbyB0aGUgQlAgY2FuIGJlIGRpc3BsYXllZC5cblx0XHRcdFx0Zm9yIChjb25zdCBicCBvZiB0aGlzLl9pbnN0cnVjdGlvbkJwTGlzdCkge1xuXHRcdFx0XHRcdHRoaXMucHJpbWVNZW1vcnlSZWZlcmVuY2UoYnAuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YWNrRnJhbWUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVidWdTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoZSA9PiB7XG5cdFx0XHRpZiAoKGUgPT09IFN0YXRlLlJ1bm5pbmcgfHwgZSA9PT0gU3RhdGUuU3RvcHBlZCkgJiZcblx0XHRcdFx0KHRoaXMuX3ByZXZpb3VzRGVidWdnaW5nU3RhdGUgIT09IFN0YXRlLlJ1bm5pbmcgJiYgdGhpcy5fcHJldmlvdXNEZWJ1Z2dpbmdTdGF0ZSAhPT0gU3RhdGUuU3RvcHBlZCkpIHtcblx0XHRcdFx0Ly8gSnVzdCBzdGFydGVkIGRlYnVnZ2luZywgY2xlYXIgdGhlIHZpZXdcblx0XHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9lbmFibGVTb3VyY2VDb2RlUmVuZGVyID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuZGlzYXNzZW1ibHlWaWV3LnNob3dTb3VyY2VDb2RlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcmV2aW91c0RlYnVnZ2luZ1N0YXRlID0gZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhY2tGcmFtZS5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zPy5sYXlvdXQoZGltZW5zaW9uLmhlaWdodCk7XG5cdH1cblxuXHRhc3luYyBnb1RvSW5zdHJ1Y3Rpb25BbmRPZmZzZXQoaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGZvY3VzPzogYm9vbGVhbikge1xuXHRcdGxldCBhZGRyID0gdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmdldChpbnN0cnVjdGlvblJlZmVyZW5jZSk7XG5cdFx0aWYgKGFkZHIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uUmVmZXJlbmNlLCAwLCAtRGlzYXNzZW1ibHlWaWV3Lk5VTV9JTlNUUlVDVElPTlNfVE9fTE9BRCwgRGlzYXNzZW1ibHlWaWV3Lk5VTV9JTlNUUlVDVElPTlNfVE9fTE9BRCAqIDIpO1xuXHRcdFx0YWRkciA9IHRoaXMuX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcy5nZXQoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHRcdH1cblxuXHRcdGlmIChhZGRyKSB7XG5cdFx0XHR0aGlzLmdvVG9BZGRyZXNzKGFkZHIgKyBCaWdJbnQob2Zmc2V0KSwgZm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBHZXRzIHRoZSBhZGRyZXNzIGFzc29jaWF0ZWQgd2l0aCB0aGUgaW5zdHJ1Y3Rpb24gcmVmZXJlbmNlLiAqL1xuXHRnZXRSZWZlcmVuY2VBZGRyZXNzKGluc3RydWN0aW9uUmVmZXJlbmNlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmdldChpbnN0cnVjdGlvblJlZmVyZW5jZSk7XG5cdH1cblxuXHQvKipcblx0ICogR28gdG8gdGhlIGFkZHJlc3MgcHJvdmlkZWQuIElmIG5vIGFkZHJlc3MgaXMgcHJvdmlkZWQsIHJldmVhbCB0aGUgYWRkcmVzcyBvZiB0aGUgY3VycmVudGx5IGZvY3VzZWQgc3RhY2sgZnJhbWUuIFJldHVybnMgZmFsc2UgaWYgdGhhdCBhZGRyZXNzIGlzIG5vdCBhdmFpbGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIGdvVG9BZGRyZXNzKGFkZHJlc3M6IGJpZ2ludCwgZm9jdXM/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWFkZHJlc3MpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SW5kZXhGcm9tQWRkcmVzcyhhZGRyZXNzKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLnJldmVhbChpbmRleCk7XG5cblx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMuZG9tRm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY3JvbGxVcF9Mb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uQ291bnQ6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgZmlyc3QgPSB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/LnJvdygwKTtcblx0XHRpZiAoZmlyc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLmxvYWREaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMoXG5cdFx0XHRcdGZpcnN0Lmluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdFx0XHRmaXJzdC5pbnN0cnVjdGlvblJlZmVyZW5jZU9mZnNldCxcblx0XHRcdFx0Zmlyc3QuaW5zdHJ1Y3Rpb25PZmZzZXQgLSBpbnN0cnVjdGlvbkNvdW50LFxuXHRcdFx0XHRpbnN0cnVjdGlvbkNvdW50LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2Nyb2xsRG93bl9Mb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uQ291bnQ6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgbGFzdCA9IHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucz8ucm93KHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucz8ubGVuZ3RoIC0gMSk7XG5cdFx0aWYgKGxhc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLmxvYWREaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMoXG5cdFx0XHRcdGxhc3QuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsXG5cdFx0XHRcdGxhc3QuaW5zdHJ1Y3Rpb25SZWZlcmVuY2VPZmZzZXQsXG5cdFx0XHRcdGxhc3QuaW5zdHJ1Y3Rpb25PZmZzZXQgKyAxLFxuXHRcdFx0XHRpbnN0cnVjdGlvbkNvdW50LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBtZW1vcnkgcmVmZXJlbmNlIGFkZHJlc3MuIFdlIGRvbid0IGp1c3QgbG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9uc1xuXHQgKiBmb3IgdGhpcywgc2luY2Ugd2UgY2FuJ3QgcmVhbGx5IGRlYWwgd2l0aCBkaXNjb250aWd1b3VzIHJhbmdlcyAod2UgY2FuJ3Rcblx0ICogZGV0ZWN0IF9pZl8gYSByYW5nZSBpcyBkaXNjb250aWd1b3VzIHNpbmNlIHdlIGRvbid0IGtub3cgaG93IG11Y2ggbWVtb3J5XG5cdCAqIGNvbWVzIGJldHdlZW4gaW5zdHJ1Y3Rpb25zLilcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcHJpbWVNZW1vcnlSZWZlcmVuY2UoaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3MuaGFzKGluc3RydWN0aW9uUmVmZXJlbmNlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcyA9IGF3YWl0IHRoaXMuZGVidWdTZXNzaW9uPy5kaXNhc3NlbWJsZShpbnN0cnVjdGlvblJlZmVyZW5jZSwgMCwgMCwgMSk7XG5cdFx0aWYgKHMgJiYgcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3Muc2V0KGluc3RydWN0aW9uUmVmZXJlbmNlLCBCaWdJbnQoc1swXS5hZGRyZXNzKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKiogTG9hZHMgZGlzYXNlbWJsZWQgaW5zdHJ1Y3Rpb25zLiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgaW5zdHJ1Y3Rpb25zIHRoYXQgd2VyZSBsb2FkZWQuICovXG5cdHByaXZhdGUgYXN5bmMgbG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhpbnN0cnVjdGlvblJlZmVyZW5jZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgaW5zdHJ1Y3Rpb25PZmZzZXQ6IG51bWJlciwgaW5zdHJ1Y3Rpb25Db3VudDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1Nlc3Npb247XG5cdFx0Y29uc3QgcmVzdWx0RW50cmllcyA9IGF3YWl0IHNlc3Npb24/LmRpc2Fzc2VtYmxlKGluc3RydWN0aW9uUmVmZXJlbmNlLCBvZmZzZXQsIGluc3RydWN0aW9uT2Zmc2V0LCBpbnN0cnVjdGlvbkNvdW50KTtcblxuXHRcdC8vIEVuc3VyZSB3ZSBhbHdheXMgbG9hZCB0aGUgYmFzZWxpbmUgaW5zdHJ1Y3Rpb25zIHNvIHdlIGtub3cgd2hhdCBhZGRyZXNzIHRoZSBpbnN0cnVjdGlvblJlZmVyZW5jZSByZWZlcnMgdG8uXG5cdFx0aWYgKCF0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3MuaGFzKGluc3RydWN0aW9uUmVmZXJlbmNlKSAmJiBpbnN0cnVjdGlvbk9mZnNldCAhPT0gMCkge1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uUmVmZXJlbmNlLCAwLCAwLCBEaXNhc3NlbWJseVZpZXcuTlVNX0lOU1RSVUNUSU9OU19UT19MT0FEKTtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbiAmJiByZXN1bHRFbnRyaWVzICYmIHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucykge1xuXHRcdFx0Y29uc3QgbmV3RW50cmllczogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnlbXSA9IFtdO1xuXG5cdFx0XHRsZXQgbGFzdExvY2F0aW9uOiBEZWJ1Z1Byb3RvY29sLlNvdXJjZSB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBsYXN0TGluZTogSVJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXN1bHRFbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGluc3RydWN0aW9uID0gcmVzdWx0RW50cmllc1tpXTtcblx0XHRcdFx0Y29uc3QgdGhpc0luc3RydWN0aW9uT2Zmc2V0ID0gaW5zdHJ1Y3Rpb25PZmZzZXQgKyBpO1xuXG5cdFx0XHRcdC8vIEZvcndhcmQgZmlsbCB0aGUgbWlzc2luZyBsb2NhdGlvbiBhcyBkZXRhaWxlZCBpbiB0aGUgREFQIHNwZWMuXG5cdFx0XHRcdGlmIChpbnN0cnVjdGlvbi5sb2NhdGlvbikge1xuXHRcdFx0XHRcdGxhc3RMb2NhdGlvbiA9IGluc3RydWN0aW9uLmxvY2F0aW9uO1xuXHRcdFx0XHRcdGxhc3RMaW5lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGluc3RydWN0aW9uLmxpbmUpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50TGluZTogSVJhbmdlID0ge1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBpbnN0cnVjdGlvbi5saW5lLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IGluc3RydWN0aW9uLmNvbHVtbiA/PyAwLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogaW5zdHJ1Y3Rpb24uZW5kTGluZSA/PyBpbnN0cnVjdGlvbi5saW5lLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiBpbnN0cnVjdGlvbi5lbmRDb2x1bW4gPz8gMCxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Ly8gQWRkIGxvY2F0aW9uIG9ubHkgdG8gdGhlIGZpcnN0IHVuaXF1ZSByYW5nZS4gVGhpcyB3aWxsIGdpdmUgdGhlIGFwcGVhcmFuY2Ugb2YgZ3JvdXBpbmcgb2YgaW5zdHJ1Y3Rpb25zLlxuXHRcdFx0XHRcdGlmICghUmFuZ2UuZXF1YWxzUmFuZ2UoY3VycmVudExpbmUsIGxhc3RMaW5lID8/IG51bGwpKSB7XG5cdFx0XHRcdFx0XHRsYXN0TGluZSA9IGN1cnJlbnRMaW5lO1xuXHRcdFx0XHRcdFx0aW5zdHJ1Y3Rpb24ubG9jYXRpb24gPSBsYXN0TG9jYXRpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGFkZHJlc3M6IGJpZ2ludDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhZGRyZXNzID0gQmlnSW50KGluc3RydWN0aW9uLmFkZHJlc3MpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBDb3VsZCBub3QgcGFyc2UgZGlzYXNzZW1ibHkgYWRkcmVzcyAke2luc3RydWN0aW9uLmFkZHJlc3N9IChpbiAke0pTT04uc3RyaW5naWZ5KGluc3RydWN0aW9uKX0pYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWRkcmVzcyA9PT0gLTFuKSB7XG5cdFx0XHRcdFx0Ly8gSWdub3JlIGludmFsaWQgaW5zdHJ1Y3Rpb25zIHJldHVybmVkIGJ5IHRoZSBhZGFwdGVyLlxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZW50cnk6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5ID0ge1xuXHRcdFx0XHRcdGFsbG93QnJlYWtwb2ludDogdHJ1ZSxcblx0XHRcdFx0XHRpc0JyZWFrcG9pbnRTZXQ6IGZhbHNlLFxuXHRcdFx0XHRcdGlzQnJlYWtwb2ludEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdFx0XHRcdGluc3RydWN0aW9uUmVmZXJlbmNlT2Zmc2V0OiBvZmZzZXQsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25PZmZzZXQ6IHRoaXNJbnN0cnVjdGlvbk9mZnNldCxcblx0XHRcdFx0XHRpbnN0cnVjdGlvbixcblx0XHRcdFx0XHRhZGRyZXNzLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdG5ld0VudHJpZXMucHVzaChlbnRyeSk7XG5cblx0XHRcdFx0Ly8gaWYgd2UganVzdCBsb2FkZWQgdGhlIGZpcnN0IGluc3RydWN0aW9uIGZvciB0aGlzIHJlZmVyZW5jZSwgbWFyayBpdHMgYWRkcmVzcy5cblx0XHRcdFx0aWYgKG9mZnNldCA9PT0gMCAmJiB0aGlzSW5zdHJ1Y3Rpb25PZmZzZXQgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3Muc2V0KGluc3RydWN0aW9uUmVmZXJlbmNlLCBhZGRyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV3RW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlZkJhc2VBZGRyZXNzID0gdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmdldChpbnN0cnVjdGlvblJlZmVyZW5jZSk7XG5cdFx0XHRjb25zdCBicHMgPSB0aGlzLl9pbnN0cnVjdGlvbkJwTGlzdC5tYXAocCA9PiB7XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3MuZ2V0KHAuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHRcdFx0XHRpZiAoIWJhc2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogcC5lbmFibGVkLFxuXHRcdFx0XHRcdGFkZHJlc3M6IGJhc2UgKyBCaWdJbnQocC5vZmZzZXQgfHwgMCksXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHJlZkJhc2VBZGRyZXNzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBuZXdFbnRyaWVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgYnAgPSBicHMuZmluZChwID0+IHA/LmFkZHJlc3MgPT09IGVudHJ5LmFkZHJlc3MpO1xuXHRcdFx0XHRcdGlmIChicCkge1xuXHRcdFx0XHRcdFx0ZW50cnkuaXNCcmVha3BvaW50U2V0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGVudHJ5LmlzQnJlYWtwb2ludEVuYWJsZWQgPSBicC5lbmFibGVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkYSA9IHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucztcblx0XHRcdGlmIChkYS5sZW5ndGggPT09IDEgJiYgdGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLnJvdygwKSA9PT0gZGlzYXNzZW1ibHlOb3RBdmFpbGFibGUpIHtcblx0XHRcdFx0ZGEuc3BsaWNlKDAsIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaXJzdEFkZHIgPSBuZXdFbnRyaWVzWzBdLmFkZHJlc3M7XG5cdFx0XHRjb25zdCBsYXN0QWRkciA9IG5ld0VudHJpZXNbbmV3RW50cmllcy5sZW5ndGggLSAxXS5hZGRyZXNzO1xuXG5cdFx0XHRjb25zdCBzdGFydE4gPSBiaW5hcnlTZWFyY2gyKGRhLmxlbmd0aCwgaSA9PiBOdW1iZXIoZGEucm93KGkpLmFkZHJlc3MgLSBmaXJzdEFkZHIpKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gc3RhcnROIDwgMCA/IH5zdGFydE4gOiBzdGFydE47XG5cdFx0XHRjb25zdCBlbmROID0gYmluYXJ5U2VhcmNoMihkYS5sZW5ndGgsIGkgPT4gTnVtYmVyKGRhLnJvdyhpKS5hZGRyZXNzIC0gbGFzdEFkZHIpKTtcblx0XHRcdGNvbnN0IGVuZCA9IGVuZE4gPCAwID8gfmVuZE4gOiBlbmROICsgMTtcblx0XHRcdGNvbnN0IHRvRGVsZXRlID0gZW5kIC0gc3RhcnQ7XG5cblx0XHRcdC8vIEdvIHRocm91Z2ggZXZlcnl0aGluZyB3ZSdyZSBhYm91dCB0byBhZGQsIGFuZCBvbmx5IHNob3cgdGhlIHNvdXJjZVxuXHRcdFx0Ly8gbG9jYXRpb24gaWYgaXQncyBkaWZmZXJlbnQgZnJvbSB0aGUgcHJldmlvdXMgb25lLCBcImdyb3VwaW5nXCIgaW5zdHJ1Y3Rpb25zIGJ5IGxpbmVcblx0XHRcdGxldCBsYXN0TG9jYXRlZDogdW5kZWZpbmVkIHwgRGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZWRJbnN0cnVjdGlvbjtcblx0XHRcdGZvciAobGV0IGkgPSBzdGFydCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IHsgaW5zdHJ1Y3Rpb24gfSA9IGRhLnJvdyhpKTtcblx0XHRcdFx0aWYgKGluc3RydWN0aW9uLmxvY2F0aW9uICYmIGluc3RydWN0aW9uLmxpbmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGxhc3RMb2NhdGVkID0gaW5zdHJ1Y3Rpb247XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hvdWxkU2hvd0xvY2F0aW9uID0gKGluc3RydWN0aW9uOiBEZWJ1Z1Byb3RvY29sLkRpc2Fzc2VtYmxlZEluc3RydWN0aW9uKSA9PlxuXHRcdFx0XHRpbnN0cnVjdGlvbi5saW5lICE9PSB1bmRlZmluZWQgJiYgaW5zdHJ1Y3Rpb24ubG9jYXRpb24gIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0XHQoIWxhc3RMb2NhdGVkIHx8ICFzb3VyY2VzRXF1YWwoaW5zdHJ1Y3Rpb24ubG9jYXRpb24sIGxhc3RMb2NhdGVkLmxvY2F0aW9uKSB8fCBpbnN0cnVjdGlvbi5saW5lICE9PSBsYXN0TG9jYXRlZC5saW5lKTtcblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBuZXdFbnRyaWVzKSB7XG5cdFx0XHRcdGlmIChzaG91bGRTaG93TG9jYXRpb24oZW50cnkuaW5zdHJ1Y3Rpb24pKSB7XG5cdFx0XHRcdFx0ZW50cnkuc2hvd1NvdXJjZUxvY2F0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRsYXN0TG9jYXRlZCA9IGVudHJ5Lmluc3RydWN0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGRhLnNwbGljZShzdGFydCwgdG9EZWxldGUsIG5ld0VudHJpZXMpO1xuXG5cdFx0XHRyZXR1cm4gbmV3RW50cmllcy5sZW5ndGggLSB0b0RlbGV0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXhGcm9tUmVmZXJlbmNlQW5kT2Zmc2V0KGluc3RydWN0aW9uUmVmZXJlbmNlOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBhZGRyID0gdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmdldChpbnN0cnVjdGlvblJlZmVyZW5jZSk7XG5cdFx0aWYgKGFkZHIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldEluZGV4RnJvbUFkZHJlc3MoYWRkciArIEJpZ0ludChvZmZzZXQpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXhGcm9tQWRkcmVzcyhhZGRyZXNzOiBiaWdpbnQpOiBudW1iZXIge1xuXHRcdGNvbnN0IGRpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyA9IHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucztcblx0XHRpZiAoZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zICYmIGRpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gYmluYXJ5U2VhcmNoMihkaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMubGVuZ3RoLCBpbmRleCA9PiB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IGRpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5yb3coaW5kZXgpO1xuXHRcdFx0XHRyZXR1cm4gTnVtYmVyKHJvdy5hZGRyZXNzIC0gYWRkcmVzcyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIHRoZSB0YWJsZSBhbmQgcmVsb2FkIGluc3RydWN0aW9ucyBuZWFyIHRoZSB0YXJnZXQgYWRkcmVzc1xuXHQgKi9cblx0cHJpdmF0ZSByZWxvYWREaXNhc3NlbWJseShpbnN0cnVjdGlvblJlZmVyZW5jZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9hZGluZ0xvY2sgPSB0cnVlOyAvLyBzdG9wIHNjcm9sbGluZyBkdXJpbmcgdGhlIGxvYWQuXG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuX2luc3RydWN0aW9uQnBMaXN0ID0gdGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpO1xuXHRcdHRoaXMubG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhpbnN0cnVjdGlvblJlZmVyZW5jZSwgb2Zmc2V0LCAtRGlzYXNzZW1ibHlWaWV3Lk5VTV9JTlNUUlVDVElPTlNfVE9fTE9BRCAqIDQsIERpc2Fzc2VtYmx5Vmlldy5OVU1fSU5TVFJVQ1RJT05TX1RPX0xPQUQgKiA4KS50aGVuKCgpID0+IHtcblx0XHRcdC8vIG9uIGxvYWQsIHNldCB0aGUgdGFyZ2V0IGluc3RydWN0aW9uIGFzIHRoZSBjdXJyZW50IGluc3RydWN0aW9uUmVmZXJlbmNlLlxuXHRcdFx0aWYgKHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRsZXQgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmVmQmFzZUFkZHJlc3MgPSB0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3MuZ2V0KGluc3RydWN0aW9uUmVmZXJlbmNlKTtcblx0XHRcdFx0aWYgKHJlZkJhc2VBZGRyZXNzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBkYSA9IHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyE7XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXggPSBiaW5hcnlTZWFyY2gyKGRhLmxlbmd0aCwgaSA9PiBOdW1iZXIoZGEucm93KGkpLmFkZHJlc3MgLSByZWZCYXNlQWRkcmVzcykpO1xuXHRcdFx0XHRcdGlmICh0YXJnZXRJbmRleCA8IDApIHtcblx0XHRcdFx0XHRcdHRhcmdldEluZGV4ID0gfnRhcmdldEluZGV4OyAvLyBzaG91bGRuJ3QgaGFwcGVuLCBidXQgZmFpbCBncmFjZWZ1bGx5IGlmIGl0IGRvZXNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiBkaWRuJ3QgZmluZCB0aGUgaW5zdHJ1Y3RvblJlZmVyZW5jZSwgc2V0IHRoZSB0YXJnZXQgaW5zdHJ1Y3Rpb24gaW4gdGhlIG1pZGRsZSBvZiB0aGUgcGFnZS5cblx0XHRcdFx0aWYgKHRhcmdldEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IE1hdGguZmxvb3IodGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5sZW5ndGggLyAyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEucmV2ZWFsKHRhcmdldEluZGV4LCAwLjUpO1xuXG5cdFx0XHRcdC8vIEFsd2F5cyBmb2N1cyB0aGUgdGFyZ2V0IGFkZHJlc3Mgb24gcmVsb2FkLCBvciBhcnJvdyBrZXkgbmF2aWdhdGlvbiB3b3VsZCBsb29rIHRlcnJpYmxlXG5cdFx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEuZG9tRm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5zZXRGb2N1cyhbdGFyZ2V0SW5kZXhdKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvYWRpbmdMb2NrID0gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCkge1xuXHRcdHRoaXMuX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcy5jbGVhcigpO1xuXHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucz8uc3BsaWNlKDAsIHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5sZW5ndGgsIFtkaXNhc3NlbWJseU5vdEF2YWlsYWJsZV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElUYWJsZUNvbnRleHRNZW51RXZlbnQ8SURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnk+KTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlLmVsZW1lbnRcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUJyZWFrcG9pbnRDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRjdXJyZW50RWxlbWVudDogeyBlbGVtZW50PzogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkgfTtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xufVxuXG5jbGFzcyBCcmVha3BvaW50UmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSwgSUJyZWFrcG9pbnRDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYnJlYWtwb2ludCc7XG5cblx0dGVtcGxhdGVJZDogc3RyaW5nID0gQnJlYWtwb2ludFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyZWFrcG9pbnRJY29uID0gJ2NvZGljb24tJyArIGljb25zLmJyZWFrcG9pbnQucmVndWxhci5pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYnJlYWtwb2ludERpc2FibGVkSWNvbiA9ICdjb2RpY29uLScgKyBpY29ucy5icmVha3BvaW50LmRpc2FibGVkLmlkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9icmVha3BvaW50SGludEljb24gPSAnY29kaWNvbi0nICsgaWNvbnMuZGVidWdCcmVha3BvaW50SGludC5pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdTdGFja2ZyYW1lID0gJ2NvZGljb24tJyArIGljb25zLmRlYnVnU3RhY2tmcmFtZS5pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdTdGFja2ZyYW1lRm9jdXNlZCA9ICdjb2RpY29uLScgKyBpY29ucy5kZWJ1Z1N0YWNrZnJhbWVGb2N1c2VkLmlkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc2Fzc2VtYmx5VmlldzogRGlzYXNzZW1ibHlWaWV3LFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU2VydmljZTogSURlYnVnU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQnJlYWtwb2ludENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Ly8gYWxpZ24gZnJvbSB0aGUgYm90dG9tIHNvIHRoYXQgaXQgbGluZXMgdXAgd2l0aCBpbnN0cnVjdGlvbiB3aGVuIHNvdXJjZSBjb2RlIGlzIHByZXNlbnQuXG5cdFx0Y29udGFpbmVyLnN0eWxlLmFsaWduU2VsZiA9ICdmbGV4LWVuZCc7XG5cblx0XHRjb25zdCBpY29uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvZGljb24nKSk7XG5cdFx0aWNvbi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGljb24uc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXHRcdGljb24uc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnY2VudGVyJztcblx0XHRpY29uLnN0eWxlLmhlaWdodCA9IHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5mb250SW5mby5saW5lSGVpZ2h0ICsgJ3B4JztcblxuXHRcdGNvbnN0IGN1cnJlbnRFbGVtZW50OiB7IGVsZW1lbnQ/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSB9ID0geyBlbGVtZW50OiB1bmRlZmluZWQgfTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gW1xuXHRcdFx0dGhpcy5fZGlzYXNzZW1ibHlWaWV3Lm9uRGlkQ2hhbmdlU3RhY2tGcmFtZSgoKSA9PiB0aGlzLnJlcmVuZGVyRGVidWdTdGFja2ZyYW1lKGljb24sIGN1cnJlbnRFbGVtZW50LmVsZW1lbnQpKSxcblx0XHRcdGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ21vdXNlb3ZlcicsICgpID0+IHtcblx0XHRcdFx0aWYgKGN1cnJlbnRFbGVtZW50LmVsZW1lbnQ/LmFsbG93QnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCh0aGlzLl9icmVha3BvaW50SGludEljb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ21vdXNlb3V0JywgKCkgPT4ge1xuXHRcdFx0XHRpZiAoY3VycmVudEVsZW1lbnQuZWxlbWVudD8uYWxsb3dCcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2JyZWFrcG9pbnRIaW50SWNvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0YWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdGlmIChjdXJyZW50RWxlbWVudC5lbGVtZW50Py5hbGxvd0JyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHQvLyBjbGljayBzaG93IGhpbnQgd2hpbGUgd2FpdGluZyBmb3IgQlAgdG8gcmVzb2x2ZS5cblx0XHRcdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQodGhpcy5fYnJlYWtwb2ludEhpbnRJY29uKTtcblx0XHRcdFx0XHRjb25zdCByZWZlcmVuY2UgPSBjdXJyZW50RWxlbWVudC5lbGVtZW50Lmluc3RydWN0aW9uUmVmZXJlbmNlO1xuXHRcdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBjdXJyZW50RWxlbWVudC5lbGVtZW50LmFkZHJlc3M7XG5cdFx0XHRcdFx0Y29uc3Qgb2Zmc2V0ID0gTnVtYmVyKGFkZHJlc3MgLSB0aGlzLl9kaXNhc3NlbWJseVZpZXcuZ2V0UmVmZXJlbmNlQWRkcmVzcyhyZWZlcmVuY2UpISk7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRFbGVtZW50LmVsZW1lbnQuaXNCcmVha3BvaW50U2V0KSB7XG5cdFx0XHRcdFx0XHQvLyBJZGVudGlmeSB0aGUgYnJlYWtwb2ludCBieSBpdHMgcmVzb2x2ZWQgbWVtb3J5IGFkZHJlc3M6XG5cdFx0XHRcdFx0XHQvLyB0aGUgZGVidWcgYWRhcHRlciBtYXkgaGFuZCBvdXQgYSBuZXcgYGluc3RydWN0aW9uUmVmZXJlbmNlYFxuXHRcdFx0XHRcdFx0Ly8gZm9yIHRoZSBzYW1lIGxvY2F0aW9uIGFmdGVyIHN5bWJvbCByZWxvYWRzIC8gY2VydGFpbiBzdGVwcyxcblx0XHRcdFx0XHRcdC8vIHNvIGEgcmVmZXJlbmNlK29mZnNldCBsb29rdXAgd291bGQgb3RoZXJ3aXNlIGZhaWwgdG8gcmVtb3ZlXG5cdFx0XHRcdFx0XHQvLyB0aGUgYnJlYWtwb2ludCAobWljcm9zb2Z0L3ZzY29kZSMyODk2NzgpLlxuXHRcdFx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMocmVmZXJlbmNlLCBvZmZzZXQsIGFkZHJlc3MpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY3VycmVudEVsZW1lbnQuZWxlbWVudC5hbGxvd0JyZWFrcG9pbnQgJiYgIWN1cnJlbnRFbGVtZW50LmVsZW1lbnQuaXNCcmVha3BvaW50U2V0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2UuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KHsgaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHJlZmVyZW5jZSwgb2Zmc2V0LCBhZGRyZXNzLCBjYW5QZXJzaXN0OiBmYWxzZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0XTtcblxuXHRcdHJldHVybiB7IGN1cnJlbnRFbGVtZW50LCBpY29uLCBkaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQnJlYWtwb2ludENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudC5lbGVtZW50ID0gZWxlbWVudDtcblx0XHR0aGlzLnJlcmVuZGVyRGVidWdTdGFja2ZyYW1lKHRlbXBsYXRlRGF0YS5pY29uLCBlbGVtZW50KTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElCcmVha3BvaW50Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcyA9IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSByZXJlbmRlckRlYnVnU3RhY2tmcmFtZShpY29uOiBIVE1MRWxlbWVudCwgZWxlbWVudD86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KSB7XG5cdFx0aWYgKGVsZW1lbnQ/LmFkZHJlc3MgPT09IHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5mb2N1c2VkQ3VycmVudEluc3RydWN0aW9uQWRkcmVzcykge1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKHRoaXMuX2RlYnVnU3RhY2tmcmFtZSk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50Py5hZGRyZXNzID09PSB0aGlzLl9kaXNhc3NlbWJseVZpZXcuZm9jdXNlZEluc3RydWN0aW9uQWRkcmVzcykge1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKHRoaXMuX2RlYnVnU3RhY2tmcmFtZUZvY3VzZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fZGVidWdTdGFja2ZyYW1lKTtcblx0XHRcdGljb24uY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9kZWJ1Z1N0YWNrZnJhbWVGb2N1c2VkKTtcblx0XHR9XG5cblx0XHRpY29uLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fYnJlYWtwb2ludEhpbnRJY29uKTtcblxuXHRcdGlmIChlbGVtZW50Py5pc0JyZWFrcG9pbnRTZXQpIHtcblx0XHRcdGlmIChlbGVtZW50LmlzQnJlYWtwb2ludEVuYWJsZWQpIHtcblx0XHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKHRoaXMuX2JyZWFrcG9pbnRJY29uKTtcblx0XHRcdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2JyZWFrcG9pbnREaXNhYmxlZEljb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2JyZWFrcG9pbnRJY29uKTtcblx0XHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKHRoaXMuX2JyZWFrcG9pbnREaXNhYmxlZEljb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fYnJlYWtwb2ludEljb24pO1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2JyZWFrcG9pbnREaXNhYmxlZEljb24pO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0Y3VycmVudEVsZW1lbnQ6IHsgZWxlbWVudD86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IH07XG5cdC8vIFRPRE86IGhvdmVyIHdpZGdldD9cblx0aW5zdHJ1Y3Rpb246IEhUTUxFbGVtZW50O1xuXHRzb3VyY2Vjb2RlOiBIVE1MRWxlbWVudDtcblx0Ly8gZGlzcG9zZWQgd2hlbiBjZWxsIGlzIGNsb3NlZC5cblx0Y2VsbERpc3Bvc2FibGU6IElEaXNwb3NhYmxlW107XG5cdC8vIGRpc3Bvc2VkIHdoZW4gdGVtcGxhdGUgaXMgY2xvc2VkLlxuXHRkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcbn1cblxuY2xhc3MgSW5zdHJ1Y3Rpb25SZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSwgSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2luc3RydWN0aW9uJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJTlNUUlVDVElPTl9BRERSX01JTl9MRU5HVEggPSAyNTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSU5TVFJVQ1RJT05fQllURVNfTUlOX0xFTkdUSCA9IDMwO1xuXG5cdHRlbXBsYXRlSWQ6IHN0cmluZyA9IEluc3RydWN0aW9uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cHJpdmF0ZSBfdG9wU3RhY2tGcmFtZUNvbG9yOiBDb2xvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9jdXNlZFN0YWNrRnJhbWVDb2xvcjogQ29sb3IgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlzYXNzZW1ibHlWaWV3OiBEaXNhc3NlbWJseVZpZXcsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpU2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3RvcFN0YWNrRnJhbWVDb2xvciA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IodG9wU3RhY2tGcmFtZUNvbG9yKTtcblx0XHR0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZUNvbG9yID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihmb2N1c2VkU3RhY2tGcmFtZUNvbG9yKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLl90b3BTdGFja0ZyYW1lQ29sb3IgPSBlLmdldENvbG9yKHRvcFN0YWNrRnJhbWVDb2xvcik7XG5cdFx0XHR0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZUNvbG9yID0gZS5nZXRDb2xvcihmb2N1c2VkU3RhY2tGcmFtZUNvbG9yKTtcblx0XHR9KSk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBzb3VyY2Vjb2RlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNvdXJjZWNvZGUnKSk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuaW5zdHJ1Y3Rpb24nKSk7XG5cdFx0dGhpcy5hcHBseUZvbnRJbmZvKHNvdXJjZWNvZGUpO1xuXHRcdHRoaXMuYXBwbHlGb250SW5mbyhpbnN0cnVjdGlvbik7XG5cdFx0Y29uc3QgY3VycmVudEVsZW1lbnQ6IHsgZWxlbWVudD86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IH0gPSB7IGVsZW1lbnQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IGNlbGxEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IFtcblx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5vbkRpZENoYW5nZVN0YWNrRnJhbWUoKCkgPT4gdGhpcy5yZXJlbmRlckJhY2tncm91bmQoaW5zdHJ1Y3Rpb24sIHNvdXJjZWNvZGUsIGN1cnJlbnRFbGVtZW50LmVsZW1lbnQpKSxcblx0XHRcdGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHNvdXJjZWNvZGUsICdkYmxjbGljaycsICgpID0+IHRoaXMub3BlblNvdXJjZUNvZGUoY3VycmVudEVsZW1lbnQuZWxlbWVudD8uaW5zdHJ1Y3Rpb24pKSxcblx0XHRdO1xuXG5cdFx0cmV0dXJuIHsgY3VycmVudEVsZW1lbnQsIGluc3RydWN0aW9uLCBzb3VyY2Vjb2RlLCBjZWxsRGlzcG9zYWJsZSwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJFbGVtZW50SW5uZXIoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlckVsZW1lbnRJbm5lcihlbGVtZW50OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJSW5zdHJ1Y3Rpb25Db2x1bW5UZW1wbGF0ZURhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQuZWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb24gPSBlbGVtZW50Lmluc3RydWN0aW9uO1xuXHRcdHRlbXBsYXRlRGF0YS5zb3VyY2Vjb2RlLmlubmVyVGV4dCA9ICcnO1xuXHRcdGNvbnN0IHNiID0gbmV3IFN0cmluZ0J1aWxkZXIoMTAwMCk7XG5cblx0XHRpZiAodGhpcy5fZGlzYXNzZW1ibHlWaWV3LmlzU291cmNlQ29kZVJlbmRlciAmJiBlbGVtZW50LnNob3dTb3VyY2VMb2NhdGlvbiAmJiBpbnN0cnVjdGlvbi5sb2NhdGlvbj8ucGF0aCAmJiBpbnN0cnVjdGlvbi5saW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHNvdXJjZVVSSSA9IHRoaXMuZ2V0VXJpRnJvbVNvdXJjZShpbnN0cnVjdGlvbik7XG5cblx0XHRcdGlmIChzb3VyY2VVUkkpIHtcblx0XHRcdFx0bGV0IHRleHRNb2RlbDogSVRleHRNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qgc291cmNlU0IgPSBuZXcgU3RyaW5nQnVpbGRlcigxMDAwMCk7XG5cdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShzb3VyY2VVUkkpO1xuXHRcdFx0XHRpZiAodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmVsZW1lbnQgIT09IGVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZWYuZGlzcG9zZSgpOyAvLyBhdm9pZCBhIGxlYWsgd2hlbiBlbGVtZW50IHdlbnQgc3RhbGUgZHVyaW5nIGFzeW5jLCAjMTkyODMxXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRleHRNb2RlbCA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY2VsbERpc3Bvc2FibGUucHVzaChyZWYpO1xuXG5cdFx0XHRcdC8vIHRlbXBsYXRlRGF0YSBjb3VsZCBoYXZlIG1vdmVkIG9uIGR1cmluZyBhc3luYy4gIERvdWJsZSBjaGVjayBpZiBpdCBpcyBzdGlsbCB0aGUgc2FtZSBzb3VyY2UuXG5cdFx0XHRcdGlmICh0ZXh0TW9kZWwgJiYgdGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdFx0XHRsZXQgbGluZU51bWJlciA9IGluc3RydWN0aW9uLmxpbmU7XG5cblx0XHRcdFx0XHR3aGlsZSAobGluZU51bWJlciAmJiBsaW5lTnVtYmVyID49IDEgJiYgbGluZU51bWJlciA8PSB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0c291cmNlU0IuYXBwZW5kU3RyaW5nKGAgICR7bGluZU51bWJlcn06IGApO1xuXHRcdFx0XHRcdFx0c291cmNlU0IuYXBwZW5kU3RyaW5nKGxpbmVDb250ZW50ICsgJ1xcbicpO1xuXG5cdFx0XHRcdFx0XHRpZiAoaW5zdHJ1Y3Rpb24uZW5kTGluZSAmJiBsaW5lTnVtYmVyIDwgaW5zdHJ1Y3Rpb24uZW5kTGluZSkge1xuXHRcdFx0XHRcdFx0XHRsaW5lTnVtYmVyKys7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlY29kZS5pbm5lclRleHQgPSBzb3VyY2VTQi5idWlsZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHNwYWNlc1RvQXBwZW5kID0gMTA7XG5cblx0XHRpZiAoaW5zdHJ1Y3Rpb24uYWRkcmVzcyAhPT0gJy0xJykge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKGluc3RydWN0aW9uLmFkZHJlc3MpO1xuXHRcdFx0aWYgKGluc3RydWN0aW9uLmFkZHJlc3MubGVuZ3RoIDwgSW5zdHJ1Y3Rpb25SZW5kZXJlci5JTlNUUlVDVElPTl9BRERSX01JTl9MRU5HVEgpIHtcblx0XHRcdFx0c3BhY2VzVG9BcHBlbmQgPSBJbnN0cnVjdGlvblJlbmRlcmVyLklOU1RSVUNUSU9OX0FERFJfTUlOX0xFTkdUSCAtIGluc3RydWN0aW9uLmFkZHJlc3MubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzcGFjZXNUb0FwcGVuZDsgaSsrKSB7XG5cdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnICcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpbnN0cnVjdGlvbi5pbnN0cnVjdGlvbkJ5dGVzKSB7XG5cdFx0XHRzYi5hcHBlbmRTdHJpbmcoaW5zdHJ1Y3Rpb24uaW5zdHJ1Y3Rpb25CeXRlcyk7XG5cdFx0XHRzcGFjZXNUb0FwcGVuZCA9IDEwO1xuXHRcdFx0aWYgKGluc3RydWN0aW9uLmluc3RydWN0aW9uQnl0ZXMubGVuZ3RoIDwgSW5zdHJ1Y3Rpb25SZW5kZXJlci5JTlNUUlVDVElPTl9CWVRFU19NSU5fTEVOR1RIKSB7XG5cdFx0XHRcdHNwYWNlc1RvQXBwZW5kID0gSW5zdHJ1Y3Rpb25SZW5kZXJlci5JTlNUUlVDVElPTl9CWVRFU19NSU5fTEVOR1RIIC0gaW5zdHJ1Y3Rpb24uaW5zdHJ1Y3Rpb25CeXRlcy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNwYWNlc1RvQXBwZW5kOyBpKyspIHtcblx0XHRcdFx0c2IuYXBwZW5kU3RyaW5nKCcgJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2IuYXBwZW5kU3RyaW5nKGluc3RydWN0aW9uLmluc3RydWN0aW9uKTtcblx0XHR0ZW1wbGF0ZURhdGEuaW5zdHJ1Y3Rpb24uaW5uZXJUZXh0ID0gc2IuYnVpbGQoKTtcblxuXHRcdHRoaXMucmVyZW5kZXJCYWNrZ3JvdW5kKHRlbXBsYXRlRGF0YS5pbnN0cnVjdGlvbiwgdGVtcGxhdGVEYXRhLnNvdXJjZWNvZGUsIGVsZW1lbnQpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0ZW1wbGF0ZURhdGEuY2VsbERpc3Bvc2FibGUpO1xuXHRcdHRlbXBsYXRlRGF0YS5jZWxsRGlzcG9zYWJsZSA9IFtdO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcyA9IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSByZXJlbmRlckJhY2tncm91bmQoaW5zdHJ1Y3Rpb246IEhUTUxFbGVtZW50LCBzb3VyY2VDb2RlOiBIVE1MRWxlbWVudCwgZWxlbWVudD86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KSB7XG5cdFx0aWYgKGVsZW1lbnQgJiYgdGhpcy5fZGlzYXNzZW1ibHlWaWV3LmN1cnJlbnRJbnN0cnVjdGlvbkFkZHJlc3Nlcy5pbmNsdWRlcyhlbGVtZW50LmFkZHJlc3MpKSB7XG5cdFx0XHRpbnN0cnVjdGlvbi5zdHlsZS5iYWNrZ3JvdW5kID0gdGhpcy5fdG9wU3RhY2tGcmFtZUNvbG9yPy50b1N0cmluZygpIHx8ICd0cmFuc3BhcmVudCc7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50Py5hZGRyZXNzID09PSB0aGlzLl9kaXNhc3NlbWJseVZpZXcuZm9jdXNlZEluc3RydWN0aW9uQWRkcmVzcykge1xuXHRcdFx0aW5zdHJ1Y3Rpb24uc3R5bGUuYmFja2dyb3VuZCA9IHRoaXMuX2ZvY3VzZWRTdGFja0ZyYW1lQ29sb3I/LnRvU3RyaW5nKCkgfHwgJ3RyYW5zcGFyZW50Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5zdHJ1Y3Rpb24uc3R5bGUuYmFja2dyb3VuZCA9ICd0cmFuc3BhcmVudCc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuU291cmNlQ29kZShpbnN0cnVjdGlvbjogRGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZWRJbnN0cnVjdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChpbnN0cnVjdGlvbikge1xuXHRcdFx0Y29uc3Qgc291cmNlVVJJID0gdGhpcy5nZXRVcmlGcm9tU291cmNlKGluc3RydWN0aW9uKTtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGluc3RydWN0aW9uLmVuZExpbmUgPyB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogaW5zdHJ1Y3Rpb24ubGluZSEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGluc3RydWN0aW9uLmVuZExpbmUsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBpbnN0cnVjdGlvbi5jb2x1bW4gfHwgMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiBpbnN0cnVjdGlvbi5lbmRDb2x1bW4gfHwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0XHR9IDoge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGluc3RydWN0aW9uLmxpbmUhLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBpbnN0cnVjdGlvbi5saW5lISxcblx0XHRcdFx0c3RhcnRDb2x1bW46IGluc3RydWN0aW9uLmNvbHVtbiB8fCAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IGluc3RydWN0aW9uLmVuZENvbHVtbiB8fCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNvdXJjZVVSSSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlZGl0b3JPcGVuZWRGcm9tRGlzYXNzZW1ibHlEZXNjcmlwdGlvbicsIFwiZnJvbSBkaXNhc3NlbWJseVwiKSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjogc2VsZWN0aW9uLFxuXHRcdFx0XHRcdHJldmVhbElmT3BlbmVkOiB0cnVlLFxuXHRcdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0XHRcdHBpbm5lZDogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VXJpRnJvbVNvdXJjZShpbnN0cnVjdGlvbjogRGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZWRJbnN0cnVjdGlvbik6IFVSSSB7XG5cdFx0Ly8gVHJ5IHRvIHJlc29sdmUgcGF0aCBiZWZvcmUgY29uc3VsdGluZyB0aGUgZGVidWdTZXNzaW9uLlxuXHRcdGNvbnN0IHBhdGggPSBpbnN0cnVjdGlvbi5sb2NhdGlvbiEucGF0aDtcblx0XHRpZiAocGF0aCAmJiBpc1VyaVN0cmluZyhwYXRoKSkge1x0Ly8gcGF0aCBsb29rcyBsaWtlIGEgdXJpXG5cdFx0XHRyZXR1cm4gdGhpcy51cmlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKFVSSS5wYXJzZShwYXRoKSk7XG5cdFx0fVxuXHRcdC8vIGFzc3VtZSBhIGZpbGVzeXN0ZW0gcGF0aFxuXHRcdGlmIChwYXRoICYmIGlzQWJzb2x1dGUocGF0aCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnVyaVNlcnZpY2UuYXNDYW5vbmljYWxVcmkoVVJJLmZpbGUocGF0aCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXRVcmlGcm9tU291cmNlKGluc3RydWN0aW9uLmxvY2F0aW9uISwgaW5zdHJ1Y3Rpb24ubG9jYXRpb24hLnBhdGgsIHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5kZWJ1Z1Nlc3Npb24hLmdldElkKCksIHRoaXMudXJpU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlGb250SW5mbyhlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdGFwcGx5Rm9udEluZm8oZWxlbWVudCwgdGhpcy5fZGlzYXNzZW1ibHlWaWV3LmZvbnRJbmZvKTtcblx0XHRlbGVtZW50LnN0eWxlLndoaXRlU3BhY2UgPSAncHJlJztcblx0fVxufVxuXG5jbGFzcyBBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeT4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnZGlzYXNzZW1ibHlWaWV3JywgXCJEaXNhc3NlbWJseSBWaWV3XCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0bGV0IGxhYmVsID0gJyc7XG5cblx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IGVsZW1lbnQuaW5zdHJ1Y3Rpb247XG5cdFx0aWYgKGluc3RydWN0aW9uLmFkZHJlc3MgIT09ICctMScpIHtcblx0XHRcdGxhYmVsICs9IGAke2xvY2FsaXplKCdpbnN0cnVjdGlvbkFkZHJlc3MnLCBcIkFkZHJlc3NcIil9OiAke2luc3RydWN0aW9uLmFkZHJlc3N9YDtcblx0XHR9XG5cdFx0aWYgKGluc3RydWN0aW9uLmluc3RydWN0aW9uQnl0ZXMpIHtcblx0XHRcdGxhYmVsICs9IGAsICR7bG9jYWxpemUoJ2luc3RydWN0aW9uQnl0ZXMnLCBcIkJ5dGVzXCIpfTogJHtpbnN0cnVjdGlvbi5pbnN0cnVjdGlvbkJ5dGVzfWA7XG5cdFx0fVxuXHRcdGxhYmVsICs9IGAsICR7bG9jYWxpemUoYGluc3RydWN0aW9uVGV4dGAsIFwiSW5zdHJ1Y3Rpb25cIil9OiAke2luc3RydWN0aW9uLmluc3RydWN0aW9ufWA7XG5cblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2Fzc2VtYmx5Vmlld0NvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2U6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYW5ndWFnZVN1cHBvcnRzRGlzYXNzZW1ibGVSZXF1ZXN0OiBJQ29udGV4dEtleTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRjb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTdXBwb3J0c0Rpc2Fzc2VtYmxlUmVxdWVzdCA9IENPTlRFWFRfTEFOR1VBR0VfU1VQUE9SVFNfRElTQVNTRU1CTEVfUkVRVUVTVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZSA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGVsKCk/LmdldExhbmd1YWdlSWQoKTtcblx0XHRcdFx0Ly8gVE9ETzogaW5zdGVhZCBvZiB1c2luZyBpZERlYnVnZ2VySW50ZXJlc3RlZEluTGFuZ3VhZ2UsIGhhdmUgYSBzcGVjaWZpYyBleHQgcG9pbnQgZm9yIGxhbmd1YWdlc1xuXHRcdFx0XHQvLyBzdXBwb3J0IGRpc2Fzc2VtYmx5XG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlU3VwcG9ydHNEaXNhc3NlbWJsZVJlcXVlc3Q/LnNldCghIWxhbmd1YWdlICYmIGRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLnNvbWVEZWJ1Z2dlckludGVyZXN0ZWRJbkxhbmd1YWdlKGxhbmd1YWdlKSk7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlU3VwcG9ydHNEaXNhc3NlbWJsZVJlcXVlc3Q/LnNldChkZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5zb21lRGVidWdnZXJJbnRlcmVzdGVkSW5MYW5ndWFnZShlLm5ld0xhbmd1YWdlKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VTdXBwb3J0c0Rpc2Fzc2VtYmxlUmVxdWVzdD8uc2V0KGZhbHNlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0b25EaWRBY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lcigpO1xuXHRcdHRoaXMuX29uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIgPSBlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2U/LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdG1ldGFkYXRhOiB7XG5cdFx0ZGVzY3JpcHRpb246IENPUFlfQUREUkVTU19MQUJFTCxcblx0fSxcblx0aWQ6IENPUFlfQUREUkVTU19JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlbnRyeT86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KSA9PiB7XG5cdFx0aWYgKGVudHJ5Py5pbnN0cnVjdGlvbj8uYWRkcmVzcykge1xuXHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChlbnRyeS5pbnN0cnVjdGlvbi5hZGRyZXNzKTtcblx0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
