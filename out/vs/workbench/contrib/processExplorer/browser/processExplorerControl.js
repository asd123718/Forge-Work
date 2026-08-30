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
import "./media/processExplorer.css";
import { localize } from "../../../../nls.js";
import { $, append, getDocument } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { isRemoteDiagnosticError } from "../../../../platform/diagnostics/common/diagnostics.js";
import { ByteSize } from "../../../../platform/files/common/files.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { WorkbenchDataTree } from "../../../../platform/list/browser/listService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { Delayer } from "../../../../base/common/async.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { isWeb } from "../../../../base/common/platform.js";
const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;
function isMachineProcessInformation(item) {
  const candidate = item;
  return !!candidate?.name && !!candidate?.rootProcess;
}
function isProcessInformation(item) {
  const candidate = item;
  return !!candidate?.processRoots;
}
function isProcessItem(item) {
  const candidate = item;
  return typeof candidate?.pid === "number";
}
class ProcessListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId(element) {
    if (isProcessItem(element)) {
      return "process";
    }
    if (isMachineProcessInformation(element)) {
      return "machine";
    }
    if (isRemoteDiagnosticError(element)) {
      return "error";
    }
    if (isProcessInformation(element)) {
      return "header";
    }
    return "";
  }
}
class ProcessTreeDataSource {
  hasChildren(element) {
    if (isRemoteDiagnosticError(element)) {
      return false;
    }
    if (isProcessItem(element)) {
      return !!element.children?.length;
    }
    return true;
  }
  getChildren(element) {
    if (isProcessItem(element)) {
      return element.children ?? [];
    }
    if (isRemoteDiagnosticError(element)) {
      return [];
    }
    if (isProcessInformation(element)) {
      if (element.processRoots.length > 1) {
        return element.processRoots;
      }
      if (element.processRoots.length > 0) {
        return [element.processRoots[0].rootProcess];
      }
      return [];
    }
    if (isMachineProcessInformation(element)) {
      return [element.rootProcess];
    }
    return element.processes ? [element.processes] : [];
  }
}
function createRow(container, extraClass) {
  const row = append(container, $(".row"));
  if (extraClass) {
    row.classList.add(extraClass);
  }
  const name = append(row, $(".cell.name"));
  const cpu = append(row, $(".cell.cpu"));
  const memory = append(row, $(".cell.memory"));
  const pid = append(row, $(".cell.pid"));
  return { name, cpu, memory, pid };
}
class ProcessHeaderTreeRenderer {
  constructor() {
    this.templateId = "header";
  }
  renderTemplate(container) {
    container.previousElementSibling?.classList.add("force-no-twistie");
    return createRow(container, "header");
  }
  renderElement(node, index, templateData) {
    templateData.name.textContent = localize("processName", "Process Name");
    templateData.cpu.textContent = localize("processCpu", "CPU (%)");
    templateData.pid.textContent = localize("processPid", "PID");
    templateData.memory.textContent = localize("processMemory", "Memory (MB)");
  }
  disposeTemplate(templateData) {
  }
}
class MachineRenderer {
  constructor() {
    this.templateId = "machine";
  }
  renderTemplate(container) {
    return createRow(container);
  }
  renderElement(node, index, templateData) {
    templateData.name.textContent = node.element.name;
  }
  disposeTemplate(templateData) {
  }
}
class ErrorRenderer {
  constructor() {
    this.templateId = "error";
  }
  renderTemplate(container) {
    return createRow(container);
  }
  renderElement(node, index, templateData) {
    templateData.name.textContent = node.element.errorMessage;
  }
  disposeTemplate(templateData) {
  }
}
let ProcessItemHover = class extends Disposable {
  constructor(container, hoverService) {
    super();
    this.content = "";
    this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), container, this.content));
  }
  update(content) {
    if (this.content !== content) {
      this.content = content;
      this.hover.update(content);
    }
  }
};
ProcessItemHover = __decorateClass([
  __decorateParam(1, IHoverService)
], ProcessItemHover);
let ProcessRenderer = class {
  constructor(model, hoverService) {
    this.model = model;
    this.hoverService = hoverService;
    this.templateId = "process";
  }
  renderTemplate(container) {
    const row = createRow(container);
    return {
      name: row.name,
      cpu: row.cpu,
      memory: row.memory,
      pid: row.pid,
      hover: new ProcessItemHover(row.name, this.hoverService)
    };
  }
  renderElement(node, index, templateData) {
    const { element } = node;
    const pid = element.pid.toFixed(0);
    templateData.name.textContent = this.model.getName(element.pid, element.name);
    templateData.cpu.textContent = element.load.toFixed(0);
    templateData.memory.textContent = (element.mem / ByteSize.MB).toFixed(0);
    templateData.pid.textContent = pid;
    templateData.pid.parentElement.id = `pid-${pid}`;
    templateData.hover?.update(element.cmd);
  }
  disposeTemplate(templateData) {
    templateData.hover?.dispose();
  }
};
ProcessRenderer = __decorateClass([
  __decorateParam(1, IHoverService)
], ProcessRenderer);
class ProcessAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("processExplorer", "Process Explorer");
  }
  getAriaLabel(element) {
    if (isProcessItem(element) || isMachineProcessInformation(element)) {
      return element.name;
    }
    if (isRemoteDiagnosticError(element)) {
      return element.hostName;
    }
    return null;
  }
}
class ProcessIdentityProvider {
  getId(element) {
    if (isProcessItem(element)) {
      return element.pid.toString();
    }
    if (isRemoteDiagnosticError(element)) {
      return element.hostName;
    }
    if (isProcessInformation(element)) {
      return "processes";
    }
    if (isMachineProcessInformation(element)) {
      return element.name;
    }
    return "header";
  }
}
let ProcessExplorerControl = class extends Disposable {
  constructor(instantiationService, productService, contextMenuService, commandService, clipboardService) {
    super();
    this.instantiationService = instantiationService;
    this.productService = productService;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.clipboardService = clipboardService;
    this.dimensions = void 0;
    this.delayer = this._register(new Delayer(1e3));
    this.model = new ProcessExplorerModel(this.productService);
  }
  create(container) {
    this.createProcessTree(container);
    this.update();
  }
  createProcessTree(container) {
    container.classList.add("process-explorer");
    container.id = "process-explorer";
    const renderers = [
      this.instantiationService.createInstance(ProcessRenderer, this.model),
      new ProcessHeaderTreeRenderer(),
      new MachineRenderer(),
      new ErrorRenderer()
    ];
    this.tree = this._register(this.instantiationService.createInstance(
      WorkbenchDataTree,
      "processExplorer",
      container,
      new ProcessListDelegate(),
      renderers,
      new ProcessTreeDataSource(),
      {
        accessibilityProvider: new ProcessAccessibilityProvider(),
        identityProvider: new ProcessIdentityProvider(),
        expandOnlyOnTwistieClick: true,
        renderIndentGuides: RenderIndentGuides.OnHover
      }
    ));
    this._register(this.tree.onKeyDown((e) => this.onTreeKeyDown(e)));
    this._register(this.tree.onContextMenu((e) => this.onTreeContextMenu(container, e)));
    this.tree.setInput(this.model);
    this.layoutTree();
  }
  async onTreeKeyDown(e) {
    const event = new StandardKeyboardEvent(e);
    if (event.keyCode === KeyCode.KeyE && event.altKey) {
      const selectionPids = this.getSelectedPids();
      await Promise.all(selectionPids.map((pid) => this.killProcess?.(pid, "SIGTERM")));
    }
  }
  onTreeContextMenu(container, e) {
    if (!isProcessItem(e.element)) {
      return;
    }
    const item = e.element;
    const pid = Number(item.pid);
    const actions = [];
    if (typeof this.killProcess === "function") {
      actions.push(toAction({ id: "killProcess", label: localize("killProcess", "Kill Process"), run: () => this.killProcess?.(pid, "SIGTERM") }));
      actions.push(toAction({ id: "forceKillProcess", label: localize("forceKillProcess", "Force Kill Process"), run: () => this.killProcess?.(pid, "SIGKILL") }));
      actions.push(new Separator());
    }
    actions.push(toAction({
      id: "copy",
      label: localize("copy", "Copy"),
      run: () => {
        const selectionPids = this.getSelectedPids();
        if (!selectionPids?.includes(pid)) {
          selectionPids.length = 0;
          selectionPids.push(pid);
        }
        const rows = selectionPids?.map((e2) => getDocument(container).getElementById(`pid-${e2}`)).filter((e2) => !!e2);
        if (rows) {
          const text = rows.map((e2) => e2.innerText).filter((e2) => !!e2);
          this.clipboardService.writeText(text.join("\n"));
        }
      }
    }));
    actions.push(toAction({
      id: "copyAll",
      label: localize("copyAll", "Copy All"),
      run: () => {
        const processList = getDocument(container).getElementById("process-explorer");
        if (processList) {
          this.clipboardService.writeText(processList.innerText);
        }
      }
    }));
    if (this.isDebuggable(item.cmd)) {
      actions.push(new Separator());
      actions.push(toAction({ id: "debug", label: localize("debug", "Debug"), run: () => this.attachTo(item) }));
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions
    });
  }
  isDebuggable(cmd) {
    if (isWeb) {
      return false;
    }
    const matches = DEBUG_FLAGS_PATTERN.exec(cmd);
    return matches && matches.groups.port !== "0" || cmd.indexOf("node ") >= 0 || cmd.indexOf("node.exe") >= 0;
  }
  attachTo(item) {
    const config = {
      type: "node",
      request: "attach",
      name: `process ${item.pid}`
    };
    let matches = DEBUG_FLAGS_PATTERN.exec(item.cmd);
    if (matches) {
      config.port = Number(matches.groups.port);
    } else {
      config.processId = String(item.pid);
    }
    matches = DEBUG_PORT_PATTERN.exec(item.cmd);
    if (matches) {
      config.port = Number(matches.groups.port);
    }
    this.commandService.executeCommand("debug.startFromConfig", config);
  }
  getSelectedPids() {
    return coalesce(this.tree?.getSelection()?.map((e) => {
      if (!isProcessItem(e)) {
        return void 0;
      }
      return e.pid;
    }) ?? []);
  }
  async update() {
    const { processes, pidToNames } = await this.resolveProcesses();
    this.model.update(processes, pidToNames);
    this.tree?.updateChildren();
    this.layoutTree();
    this.delayer.trigger(() => this.update());
  }
  focus() {
    this.tree?.domFocus();
  }
  layout(dimension) {
    this.dimensions = dimension;
    this.layoutTree();
  }
  layoutTree() {
    if (this.dimensions && this.tree) {
      this.tree.layout(this.dimensions.height, this.dimensions.width);
    }
  }
};
ProcessExplorerControl = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IClipboardService)
], ProcessExplorerControl);
let ProcessExplorerModel = class {
  constructor(productService) {
    this.productService = productService;
    this.processes = { processRoots: [] };
    this.mapPidToName = /* @__PURE__ */ new Map();
  }
  update(processRoots, pidToNames) {
    this.mapPidToName.clear();
    for (const [pid, name] of pidToNames) {
      this.mapPidToName.set(pid, name);
    }
    processRoots.forEach((info, index) => {
      if (isProcessItem(info.rootProcess)) {
        info.rootProcess.name = index === 0 ? this.productService.applicationName : "remote-server";
      }
    });
    this.processes = { processRoots };
  }
  getName(pid, fallback) {
    return this.mapPidToName.get(pid) ?? fallback;
  }
};
ProcessExplorerModel = __decorateClass([
  __decorateParam(0, IProductService)
], ProcessExplorerModel);
let BrowserProcessExplorerControl = class extends ProcessExplorerControl {
  constructor(container, instantiationService, productService, contextMenuService, commandService, clipboardService, remoteAgentService, labelService) {
    super(instantiationService, productService, contextMenuService, commandService, clipboardService);
    this.remoteAgentService = remoteAgentService;
    this.labelService = labelService;
    this.create(container);
  }
  async resolveProcesses() {
    const connection = this.remoteAgentService.getConnection();
    if (!connection) {
      return { pidToNames: [], processes: [] };
    }
    const processes = [];
    const hostName = this.labelService.getHostLabel(Schemas.vscodeRemote, connection.remoteAuthority);
    const result = await this.remoteAgentService.getDiagnosticInfo({ includeProcesses: true });
    if (result) {
      if (isRemoteDiagnosticError(result)) {
        processes.push({ name: result.hostName, rootProcess: result });
      } else if (result.processes) {
        processes.push({ name: hostName, rootProcess: result.processes });
      }
    }
    return { pidToNames: [], processes };
  }
};
BrowserProcessExplorerControl = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IClipboardService),
  __decorateParam(6, IRemoteAgentService),
  __decorateParam(7, ILabelService)
], BrowserProcessExplorerControl);
export {
  BrowserProcessExplorerControl,
  ProcessExplorerControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByb2Nlc3NFeHBsb3JlclxcYnJvd3NlclxccHJvY2Vzc0V4cGxvcmVyQ29udHJvbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9wcm9jZXNzRXhwbG9yZXIuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgRGltZW5zaW9uLCBnZXREb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJRGF0YVNvdXJjZSwgSVRyZWVSZW5kZXJlciwgSVRyZWVOb2RlLCBJVHJlZUNvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFByb2Nlc3NJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzc2VzLmpzJztcbmltcG9ydCB7IElSZW1vdGVEaWFnbm9zdGljRXJyb3IsIGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhZ25vc3RpY3MvY29tbW9uL2RpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IEJ5dGVTaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaERhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBSZW5kZXJJbmRlbnRHdWlkZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkUHJvY2Vzc0luZm9ybWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvY2Vzcy9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuY29uc3QgREVCVUdfRkxBR1NfUEFUVEVSTiA9IC9cXHMtLWluc3BlY3QoPzotYnJrfHBvcnQpPz0oPzxwb3J0PlxcZCspPy87XG5jb25zdCBERUJVR19QT1JUX1BBVFRFUk4gPSAvXFxzLS1pbnNwZWN0LXBvcnQ9KD88cG9ydD5cXGQrKS87XG5cbi8vI3JlZ2lvbiAtLS0gcHJvY2VzcyBleHBsb3JlciB0cmVlXG5cbmludGVyZmFjZSBJUHJvY2Vzc1RyZWUge1xuXHRyZWFkb25seSBwcm9jZXNzZXM6IElQcm9jZXNzSW5mb3JtYXRpb247XG59XG5cbmludGVyZmFjZSBJUHJvY2Vzc0luZm9ybWF0aW9uIHtcblx0cmVhZG9ubHkgcHJvY2Vzc1Jvb3RzOiBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbltdO1xufVxuXG5pbnRlcmZhY2UgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24ge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJvb3RQcm9jZXNzOiBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I7XG59XG5cbmZ1bmN0aW9uIGlzTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbihpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGl0ZW0gYXMgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhY2FuZGlkYXRlPy5uYW1lICYmICEhY2FuZGlkYXRlPy5yb290UHJvY2Vzcztcbn1cblxuZnVuY3Rpb24gaXNQcm9jZXNzSW5mb3JtYXRpb24oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSVByb2Nlc3NJbmZvcm1hdGlvbiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGl0ZW0gYXMgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISFjYW5kaWRhdGU/LnByb2Nlc3NSb290cztcbn1cblxuZnVuY3Rpb24gaXNQcm9jZXNzSXRlbShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBQcm9jZXNzSXRlbSB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGl0ZW0gYXMgUHJvY2Vzc0l0ZW0gfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGU/LnBpZCA9PT0gJ251bWJlcic7XG59XG5cbmNsYXNzIFByb2Nlc3NMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcj4ge1xuXG5cdGdldEhlaWdodCgpIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElQcm9jZXNzSW5mb3JtYXRpb24gfCBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcikge1xuXHRcdGlmIChpc1Byb2Nlc3NJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gJ3Byb2Nlc3MnO1xuXHRcdH1cblxuXHRcdGlmIChpc01hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiAnbWFjaGluZSc7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gJ2Vycm9yJztcblx0XHR9XG5cblx0XHRpZiAoaXNQcm9jZXNzSW5mb3JtYXRpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiAnaGVhZGVyJztcblx0XHR9XG5cblx0XHRyZXR1cm4gJyc7XG5cdH1cbn1cblxuY2xhc3MgUHJvY2Vzc1RyZWVEYXRhU291cmNlIGltcGxlbWVudHMgSURhdGFTb3VyY2U8SVByb2Nlc3NUcmVlLCBJUHJvY2Vzc0luZm9ybWF0aW9uIHwgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I+IHtcblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBJUHJvY2Vzc1RyZWUgfCBJUHJvY2Vzc0luZm9ybWF0aW9uIHwgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3IpOiBib29sZWFuIHtcblx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNQcm9jZXNzSXRlbShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuICEhZWxlbWVudC5jaGlsZHJlbj8ubGVuZ3RoO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogSVByb2Nlc3NUcmVlIHwgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgUHJvY2Vzc0l0ZW0gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yKSB7XG5cdFx0aWYgKGlzUHJvY2Vzc0l0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuID8/IFtdO1xuXHRcdH1cblxuXHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChpc1Byb2Nlc3NJbmZvcm1hdGlvbihlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQucHJvY2Vzc1Jvb3RzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucHJvY2Vzc1Jvb3RzOyAvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvY2VzcyByb290cywgcmV0dXJuIHRoZXNlLCBvdGhlcndpc2UgZ28gZGlyZWN0bHkgdG8gdGhlIHJvb3QgcHJvY2Vzc1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC5wcm9jZXNzUm9vdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gW2VsZW1lbnQucHJvY2Vzc1Jvb3RzWzBdLnJvb3RQcm9jZXNzXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChpc01hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBbZWxlbWVudC5yb290UHJvY2Vzc107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnQucHJvY2Vzc2VzID8gW2VsZW1lbnQucHJvY2Vzc2VzXSA6IFtdO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJvdyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRyYUNsYXNzPzogc3RyaW5nKSB7XG5cdGNvbnN0IHJvdyA9IGFwcGVuZChjb250YWluZXIsICQoJy5yb3cnKSk7XG5cdGlmIChleHRyYUNsYXNzKSB7XG5cdFx0cm93LmNsYXNzTGlzdC5hZGQoZXh0cmFDbGFzcyk7XG5cdH1cblxuXHRjb25zdCBuYW1lID0gYXBwZW5kKHJvdywgJCgnLmNlbGwubmFtZScpKTtcblx0Y29uc3QgY3B1ID0gYXBwZW5kKHJvdywgJCgnLmNlbGwuY3B1JykpO1xuXHRjb25zdCBtZW1vcnkgPSBhcHBlbmQocm93LCAkKCcuY2VsbC5tZW1vcnknKSk7XG5cdGNvbnN0IHBpZCA9IGFwcGVuZChyb3csICQoJy5jZWxsLnBpZCcpKTtcblxuXHRyZXR1cm4geyBuYW1lLCBjcHUsIG1lbW9yeSwgcGlkIH07XG59XG5cbmludGVyZmFjZSBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVByb2Nlc3NJdGVtVGVtcGxhdGVEYXRhIGV4dGVuZHMgSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjcHU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBtZW1vcnk6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBwaWQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBob3Zlcj86IFByb2Nlc3NJdGVtSG92ZXI7XG59XG5cbmNsYXNzIFByb2Nlc3NIZWFkZXJUcmVlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElQcm9jZXNzSW5mb3JtYXRpb24sIHZvaWQsIElQcm9jZXNzSXRlbVRlbXBsYXRlRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdoZWFkZXInO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5wcmV2aW91c0VsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuYWRkKCdmb3JjZS1uby10d2lzdGllJyk7IC8vIGhhY2ssIGJ1dCBubyBBUEkgZm9yIGhpZGluZyB0d2lzdGllIG9uIHRyZWVcblxuXHRcdHJldHVybiBjcmVhdGVSb3coY29udGFpbmVyLCAnaGVhZGVyJyk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJUHJvY2Vzc0luZm9ybWF0aW9uLCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwcm9jZXNzTmFtZScsIFwiUHJvY2VzcyBOYW1lXCIpO1xuXHRcdHRlbXBsYXRlRGF0YS5jcHUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJvY2Vzc0NwdScsIFwiQ1BVICglKVwiKTtcblx0XHR0ZW1wbGF0ZURhdGEucGlkLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Byb2Nlc3NQaWQnLCBcIlBJRFwiKTtcblx0XHR0ZW1wbGF0ZURhdGEubWVtb3J5LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Byb2Nlc3NNZW1vcnknLCBcIk1lbW9yeSAoTUIpXCIpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogdW5rbm93bik6IHZvaWQge1xuXHRcdC8vIE5vdGhpbmcgdG8gZG9cblx0fVxufVxuXG5jbGFzcyBNYWNoaW5lUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uLCB2b2lkLCBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdtYWNoaW5lJztcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGEge1xuXHRcdHJldHVybiBjcmVhdGVSb3coY29udGFpbmVyKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uLCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gbm9kZS5lbGVtZW50Lm5hbWU7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIE5vdGhpbmcgdG8gZG9cblx0fVxufVxuXG5jbGFzcyBFcnJvclJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJUmVtb3RlRGlhZ25vc3RpY0Vycm9yLCB2b2lkLCBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdlcnJvcic7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElQcm9jZXNzUm93VGVtcGxhdGVEYXRhIHtcblx0XHRyZXR1cm4gY3JlYXRlUm93KGNvbnRhaW5lcik7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJUmVtb3RlRGlhZ25vc3RpY0Vycm9yLCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gbm9kZS5lbGVtZW50LmVycm9yTWVzc2FnZTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElQcm9jZXNzUm93VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gTm90aGluZyB0byBkb1xuXHR9XG59XG5cbmNsYXNzIFByb2Nlc3NJdGVtSG92ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGhvdmVyOiBJTWFuYWdlZEhvdmVyO1xuXHRwcml2YXRlIGNvbnRlbnQgPSAnJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5ob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgY29udGFpbmVyLCB0aGlzLmNvbnRlbnQpKTtcblx0fVxuXG5cdHVwZGF0ZShjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZW50ICE9PSBjb250ZW50KSB7XG5cdFx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0dGhpcy5ob3Zlci51cGRhdGUoY29udGVudCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFByb2Nlc3NSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8UHJvY2Vzc0l0ZW0sIHZvaWQsIElQcm9jZXNzSXRlbVRlbXBsYXRlRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdwcm9jZXNzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1vZGVsOiBQcm9jZXNzRXhwbG9yZXJNb2RlbCxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHJvdyA9IGNyZWF0ZVJvdyhjb250YWluZXIpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHJvdy5uYW1lLFxuXHRcdFx0Y3B1OiByb3cuY3B1LFxuXHRcdFx0bWVtb3J5OiByb3cubWVtb3J5LFxuXHRcdFx0cGlkOiByb3cucGlkLFxuXHRcdFx0aG92ZXI6IG5ldyBQcm9jZXNzSXRlbUhvdmVyKHJvdy5uYW1lLCB0aGlzLmhvdmVyU2VydmljZSlcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8UHJvY2Vzc0l0ZW0sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQcm9jZXNzSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZWxlbWVudCB9ID0gbm9kZTtcblxuXHRcdGNvbnN0IHBpZCA9IGVsZW1lbnQucGlkLnRvRml4ZWQoMCk7XG5cblx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IHRoaXMubW9kZWwuZ2V0TmFtZShlbGVtZW50LnBpZCwgZWxlbWVudC5uYW1lKTtcblx0XHR0ZW1wbGF0ZURhdGEuY3B1LnRleHRDb250ZW50ID0gZWxlbWVudC5sb2FkLnRvRml4ZWQoMCk7XG5cdFx0dGVtcGxhdGVEYXRhLm1lbW9yeS50ZXh0Q29udGVudCA9IChlbGVtZW50Lm1lbSAvIEJ5dGVTaXplLk1CKS50b0ZpeGVkKDApO1xuXHRcdHRlbXBsYXRlRGF0YS5waWQudGV4dENvbnRlbnQgPSBwaWQ7XG5cdFx0dGVtcGxhdGVEYXRhLnBpZC5wYXJlbnRFbGVtZW50IS5pZCA9IGBwaWQtJHtwaWR9YDtcblxuXHRcdHRlbXBsYXRlRGF0YS5ob3Zlcj8udXBkYXRlKGVsZW1lbnQuY21kKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElQcm9jZXNzSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5ob3Zlcj8uZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFByb2Nlc3NBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcj4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgncHJvY2Vzc0V4cGxvcmVyJywgXCJQcm9jZXNzIEV4cGxvcmVyXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgUHJvY2Vzc0l0ZW0gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGlzUHJvY2Vzc0l0ZW0oZWxlbWVudCkgfHwgaXNNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5uYW1lO1xuXHRcdH1cblxuXHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaG9zdE5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuY2xhc3MgUHJvY2Vzc0lkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcj4ge1xuXG5cdGdldElkKGVsZW1lbnQ6IElSZW1vdGVEaWFnbm9zdGljRXJyb3IgfCBQcm9jZXNzSXRlbSB8IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0aWYgKGlzUHJvY2Vzc0l0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnBpZC50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaG9zdE5hbWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUHJvY2Vzc0luZm9ybWF0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gJ3Byb2Nlc3Nlcyc7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQubmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gJ2hlYWRlcic7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBQcm9jZXNzRXhwbG9yZXJDb250cm9sIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBkaW1lbnNpb25zOiBEaW1lbnNpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogUHJvY2Vzc0V4cGxvcmVyTW9kZWw7XG5cdHByaXZhdGUgdHJlZTogV29ya2JlbmNoRGF0YVRyZWU8SVByb2Nlc3NUcmVlLCBJUHJvY2Vzc1RyZWUgfCBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKDEwMDApKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5tb2RlbCA9IG5ldyBQcm9jZXNzRXhwbG9yZXJNb2RlbCh0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBraWxsUHJvY2Vzcz8ocGlkOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlc29sdmVQcm9jZXNzZXMoKTogUHJvbWlzZTxJUmVzb2x2ZWRQcm9jZXNzSW5mb3JtYXRpb24+O1xuXG5cdHByb3RlY3RlZCBjcmVhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuY3JlYXRlUHJvY2Vzc1RyZWUoY29udGFpbmVyKTtcblxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByb2Nlc3NUcmVlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgncHJvY2Vzcy1leHBsb3JlcicpO1xuXHRcdGNvbnRhaW5lci5pZCA9ICdwcm9jZXNzLWV4cGxvcmVyJztcblxuXHRcdGNvbnN0IHJlbmRlcmVycyA9IFtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvY2Vzc1JlbmRlcmVyLCB0aGlzLm1vZGVsKSxcblx0XHRcdG5ldyBQcm9jZXNzSGVhZGVyVHJlZVJlbmRlcmVyKCksXG5cdFx0XHRuZXcgTWFjaGluZVJlbmRlcmVyKCksXG5cdFx0XHRuZXcgRXJyb3JSZW5kZXJlcigpXG5cdFx0XTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hEYXRhVHJlZTxJUHJvY2Vzc1RyZWUsIElQcm9jZXNzVHJlZSB8IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgUHJvY2Vzc0l0ZW0gfCBJUHJvY2Vzc0luZm9ybWF0aW9uIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcj4sXG5cdFx0XHQncHJvY2Vzc0V4cGxvcmVyJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdG5ldyBQcm9jZXNzTGlzdERlbGVnYXRlKCksXG5cdFx0XHRyZW5kZXJlcnMsXG5cdFx0XHRuZXcgUHJvY2Vzc1RyZWVEYXRhU291cmNlKCksXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFByb2Nlc3NBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IFByb2Nlc3NJZGVudGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdFx0cmVuZGVySW5kZW50R3VpZGVzOiBSZW5kZXJJbmRlbnRHdWlkZXMuT25Ib3ZlclxuXHRcdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uS2V5RG93bihlID0+IHRoaXMub25UcmVlS2V5RG93bihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vblRyZWVDb250ZXh0TWVudShjb250YWluZXIsIGUpKSk7XG5cblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy5tb2RlbCk7XG5cdFx0dGhpcy5sYXlvdXRUcmVlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uVHJlZUtleURvd24oZTogS2V5Ym9hcmRFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5LZXlFICYmIGV2ZW50LmFsdEtleSkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uUGlkcyA9IHRoaXMuZ2V0U2VsZWN0ZWRQaWRzKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChzZWxlY3Rpb25QaWRzLm1hcChwaWQgPT4gdGhpcy5raWxsUHJvY2Vzcz8uKHBpZCwgJ1NJR1RFUk0nKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25UcmVlQ29udGV4dE1lbnUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PElQcm9jZXNzVHJlZSB8IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgUHJvY2Vzc0l0ZW0gfCBJUHJvY2Vzc0luZm9ybWF0aW9uIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvciB8IG51bGw+KTogdm9pZCB7XG5cdFx0aWYgKCFpc1Byb2Nlc3NJdGVtKGUuZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gZS5lbGVtZW50O1xuXHRcdGNvbnN0IHBpZCA9IE51bWJlcihpdGVtLnBpZCk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdGlmICh0eXBlb2YgdGhpcy5raWxsUHJvY2VzcyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6ICdraWxsUHJvY2VzcycsIGxhYmVsOiBsb2NhbGl6ZSgna2lsbFByb2Nlc3MnLCBcIktpbGwgUHJvY2Vzc1wiKSwgcnVuOiAoKSA9PiB0aGlzLmtpbGxQcm9jZXNzPy4ocGlkLCAnU0lHVEVSTScpIH0pKTtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiAnZm9yY2VLaWxsUHJvY2VzcycsIGxhYmVsOiBsb2NhbGl6ZSgnZm9yY2VLaWxsUHJvY2VzcycsIFwiRm9yY2UgS2lsbCBQcm9jZXNzXCIpLCBydW46ICgpID0+IHRoaXMua2lsbFByb2Nlc3M/LihwaWQsICdTSUdLSUxMJykgfSkpO1xuXG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cblx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdjb3B5Jyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29weScsIFwiQ29weVwiKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25QaWRzID0gdGhpcy5nZXRTZWxlY3RlZFBpZHMoKTtcblxuXHRcdFx0XHRpZiAoIXNlbGVjdGlvblBpZHM/LmluY2x1ZGVzKHBpZCkpIHtcblx0XHRcdFx0XHRzZWxlY3Rpb25QaWRzLmxlbmd0aCA9IDA7IC8vIElmIHRoZSBzZWxlY3Rpb24gZG9lcyBub3QgY29udGFpbiB0aGUgcmlnaHQgY2xpY2tlZCBpdGVtLCBjb3B5IHRoZSByaWdodCBjbGlja2VkIGl0ZW0gb25seS5cblx0XHRcdFx0XHRzZWxlY3Rpb25QaWRzLnB1c2gocGlkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCByb3dzID0gc2VsZWN0aW9uUGlkcz8ubWFwKGUgPT4gZ2V0RG9jdW1lbnQoY29udGFpbmVyKS5nZXRFbGVtZW50QnlJZChgcGlkLSR7ZX1gKSkuZmlsdGVyKGUgPT4gISFlKTtcblx0XHRcdFx0aWYgKHJvd3MpIHtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gcm93cy5tYXAoZSA9PiBlLmlubmVyVGV4dCkuZmlsdGVyKGUgPT4gISFlKTtcblx0XHRcdFx0XHR0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRleHQuam9pbignXFxuJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnY29weUFsbCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvcHlBbGwnLCBcIkNvcHkgQWxsXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBwcm9jZXNzTGlzdCA9IGdldERvY3VtZW50KGNvbnRhaW5lcikuZ2V0RWxlbWVudEJ5SWQoJ3Byb2Nlc3MtZXhwbG9yZXInKTtcblx0XHRcdFx0aWYgKHByb2Nlc3NMaXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChwcm9jZXNzTGlzdC5pbm5lclRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuaXNEZWJ1Z2dhYmxlKGl0ZW0uY21kKSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ2RlYnVnJywgbGFiZWw6IGxvY2FsaXplKCdkZWJ1ZycsIFwiRGVidWdcIiksIHJ1bjogKCkgPT4gdGhpcy5hdHRhY2hUbyhpdGVtKSB9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGlzRGVidWdnYWJsZShjbWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZXMgPSBERUJVR19GTEFHU19QQVRURVJOLmV4ZWMoY21kKTtcblxuXHRcdHJldHVybiAobWF0Y2hlcyAmJiBtYXRjaGVzLmdyb3VwcyEucG9ydCAhPT0gJzAnKSB8fCBjbWQuaW5kZXhPZignbm9kZSAnKSA+PSAwIHx8IGNtZC5pbmRleE9mKCdub2RlLmV4ZScpID49IDA7XG5cdH1cblxuXHRwcml2YXRlIGF0dGFjaFRvKGl0ZW06IFByb2Nlc3NJdGVtKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnOiB7IHR5cGU6IHN0cmluZzsgcmVxdWVzdDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IHBvcnQ/OiBudW1iZXI7IHByb2Nlc3NJZD86IHN0cmluZyB9ID0ge1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2F0dGFjaCcsXG5cdFx0XHRuYW1lOiBgcHJvY2VzcyAke2l0ZW0ucGlkfWBcblx0XHR9O1xuXG5cdFx0bGV0IG1hdGNoZXMgPSBERUJVR19GTEFHU19QQVRURVJOLmV4ZWMoaXRlbS5jbWQpO1xuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRjb25maWcucG9ydCA9IE51bWJlcihtYXRjaGVzLmdyb3VwcyEucG9ydCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbmZpZy5wcm9jZXNzSWQgPSBTdHJpbmcoaXRlbS5waWQpOyAvLyBubyBwb3J0IC0+IHRyeSB0byBhdHRhY2ggdmlhIHBpZCAoc2VuZCBTSUdVU1IxKVxuXHRcdH1cblxuXHRcdC8vIGEgZGVidWctcG9ydD1uIG9yIGluc3BlY3QtcG9ydD1uIG92ZXJyaWRlcyB0aGUgcG9ydFxuXHRcdG1hdGNoZXMgPSBERUJVR19QT1JUX1BBVFRFUk4uZXhlYyhpdGVtLmNtZCk7XG5cdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdGNvbmZpZy5wb3J0ID0gTnVtYmVyKG1hdGNoZXMuZ3JvdXBzIS5wb3J0KTsgLy8gb3ZlcnJpZGUgcG9ydFxuXHRcdH1cblxuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2RlYnVnLnN0YXJ0RnJvbUNvbmZpZycsIGNvbmZpZyk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGVkUGlkcygpOiBudW1iZXJbXSB7XG5cdFx0cmV0dXJuIGNvYWxlc2NlKHRoaXMudHJlZT8uZ2V0U2VsZWN0aW9uKCk/Lm1hcChlID0+IHtcblx0XHRcdGlmICghaXNQcm9jZXNzSXRlbShlKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZS5waWQ7XG5cdFx0fSkgPz8gW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBwcm9jZXNzZXMsIHBpZFRvTmFtZXMgfSA9IGF3YWl0IHRoaXMucmVzb2x2ZVByb2Nlc3NlcygpO1xuXG5cdFx0dGhpcy5tb2RlbC51cGRhdGUocHJvY2Vzc2VzLCBwaWRUb05hbWVzKTtcblxuXHRcdHRoaXMudHJlZT8udXBkYXRlQ2hpbGRyZW4oKTtcblx0XHR0aGlzLmxheW91dFRyZWUoKTtcblxuXHRcdHRoaXMuZGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMudXBkYXRlKCkpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlPy5kb21Gb2N1cygpO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb25zID0gZGltZW5zaW9uO1xuXG5cdFx0dGhpcy5sYXlvdXRUcmVlKCk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFRyZWUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9ucyAmJiB0aGlzLnRyZWUpIHtcblx0XHRcdHRoaXMudHJlZS5sYXlvdXQodGhpcy5kaW1lbnNpb25zLmhlaWdodCwgdGhpcy5kaW1lbnNpb25zLndpZHRoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUHJvY2Vzc0V4cGxvcmVyTW9kZWwgaW1wbGVtZW50cyBJUHJvY2Vzc1RyZWUge1xuXG5cdHByb2Nlc3NlczogSVByb2Nlc3NJbmZvcm1hdGlvbiA9IHsgcHJvY2Vzc1Jvb3RzOiBbXSB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwUGlkVG9OYW1lID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3RvcihASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSkgeyB9XG5cblx0dXBkYXRlKHByb2Nlc3NSb290czogSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb25bXSwgcGlkVG9OYW1lczogW251bWJlciwgc3RyaW5nXVtdKTogdm9pZCB7XG5cblx0XHQvLyBQSUQgdG8gTmFtZXNcblx0XHR0aGlzLm1hcFBpZFRvTmFtZS5jbGVhcigpO1xuXG5cdFx0Zm9yIChjb25zdCBbcGlkLCBuYW1lXSBvZiBwaWRUb05hbWVzKSB7XG5cdFx0XHR0aGlzLm1hcFBpZFRvTmFtZS5zZXQocGlkLCBuYW1lKTtcblx0XHR9XG5cblx0XHQvLyBQcm9jZXNzZXNcblx0XHRwcm9jZXNzUm9vdHMuZm9yRWFjaCgoaW5mbywgaW5kZXgpID0+IHtcblx0XHRcdGlmIChpc1Byb2Nlc3NJdGVtKGluZm8ucm9vdFByb2Nlc3MpKSB7XG5cdFx0XHRcdGluZm8ucm9vdFByb2Nlc3MubmFtZSA9IGluZGV4ID09PSAwID8gdGhpcy5wcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWUgOiAncmVtb3RlLXNlcnZlcic7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnByb2Nlc3NlcyA9IHsgcHJvY2Vzc1Jvb3RzIH07XG5cdH1cblxuXHRnZXROYW1lKHBpZDogbnVtYmVyLCBmYWxsYmFjazogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5tYXBQaWRUb05hbWUuZ2V0KHBpZCkgPz8gZmFsbGJhY2s7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJQcm9jZXNzRXhwbG9yZXJDb250cm9sIGV4dGVuZHMgUHJvY2Vzc0V4cGxvcmVyQ29udHJvbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgY2xpcGJvYXJkU2VydmljZSk7XG5cblx0XHR0aGlzLmNyZWF0ZShjb250YWluZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJlc29sdmVQcm9jZXNzZXMoKTogUHJvbWlzZTxJUmVzb2x2ZWRQcm9jZXNzSW5mb3JtYXRpb24+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHsgcGlkVG9OYW1lczogW10sIHByb2Nlc3NlczogW10gfTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9jZXNzZXM6IHsgbmFtZTogc3RyaW5nOyByb290UHJvY2VzczogUHJvY2Vzc0l0ZW0gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yIH1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgaG9zdE5hbWUgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIGNvbm5lY3Rpb24ucmVtb3RlQXV0aG9yaXR5KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXREaWFnbm9zdGljSW5mbyh7IGluY2x1ZGVQcm9jZXNzZXM6IHRydWUgfSk7XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0aWYgKGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yKHJlc3VsdCkpIHtcblx0XHRcdFx0cHJvY2Vzc2VzLnB1c2goeyBuYW1lOiByZXN1bHQuaG9zdE5hbWUsIHJvb3RQcm9jZXNzOiByZXN1bHQgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc3VsdC5wcm9jZXNzZXMpIHtcblx0XHRcdFx0cHJvY2Vzc2VzLnB1c2goeyBuYW1lOiBob3N0TmFtZSwgcm9vdFByb2Nlc3M6IHJlc3VsdC5wcm9jZXNzZXMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgcGlkVG9OYW1lczogW10sIHByb2Nlc3NlcyB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLEdBQUcsUUFBbUIsbUJBQW1CO0FBQ2xELFNBQVMsNkJBQTZCO0FBSXRDLFNBQWlDLCtCQUErQjtBQUNoRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFFdEIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxxQkFBcUI7QUFpQjNCLFNBQVMsNEJBQTRCLE1BQW1EO0FBQ3ZGLFFBQU0sWUFBWTtBQUVsQixTQUFPLENBQUMsQ0FBQyxXQUFXLFFBQVEsQ0FBQyxDQUFDLFdBQVc7QUFDMUM7QUFFQSxTQUFTLHFCQUFx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
