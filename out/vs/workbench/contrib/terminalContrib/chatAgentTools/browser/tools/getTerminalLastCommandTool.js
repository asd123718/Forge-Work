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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ToolDataSource } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { TerminalToolId } from "./toolIds.js";
const GetTerminalLastCommandToolData = {
  id: TerminalToolId.TerminalLastCommand,
  toolReferenceName: "terminalLastCommand",
  legacyToolReferenceFullNames: ["runCommands/terminalLastCommand"],
  displayName: localize("terminalLastCommandTool.displayName", "Get Terminal Last Command"),
  modelDescription: "Get the last command run in the active terminal.",
  source: ToolDataSource.Internal,
  icon: Codicon.terminal
};
let GetTerminalLastCommandTool = class extends Disposable {
  constructor(_terminalService) {
    super();
    this._terminalService = _terminalService;
  }
  async prepareToolInvocation(context, token) {
    return {
      invocationMessage: localize("getTerminalLastCommand.progressive", "Getting last terminal command"),
      pastTenseMessage: localize("getTerminalLastCommand.past", "Got last terminal command")
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const activeInstance = this._terminalService.activeInstance;
    if (!activeInstance) {
      return {
        content: [{
          kind: "text",
          value: "No active terminal instance found."
        }]
      };
    }
    const commandDetection = activeInstance.capabilities.get(TerminalCapability.CommandDetection);
    if (!commandDetection) {
      return {
        content: [{
          kind: "text",
          value: "No command detection capability available in the active terminal."
        }]
      };
    }
    const executingCommand = commandDetection.executingCommand;
    if (executingCommand) {
      const userPrompt2 = [];
      userPrompt2.push("The following command is currently executing in the terminal:");
      userPrompt2.push(executingCommand);
      const cwd = commandDetection.cwd;
      if (cwd) {
        userPrompt2.push("It is running in the directory:");
        userPrompt2.push(cwd);
      }
      return {
        content: [{
          kind: "text",
          value: userPrompt2.join("\n")
        }]
      };
    }
    const commands = commandDetection.commands;
    if (!commands || commands.length === 0) {
      return {
        content: [{
          kind: "text",
          value: "No command has been run in the active terminal."
        }]
      };
    }
    const lastCommand = commands[commands.length - 1];
    const userPrompt = [];
    if (lastCommand.command) {
      userPrompt.push("The following is the last command run in the terminal:");
      userPrompt.push(lastCommand.command);
    }
    if (lastCommand.cwd) {
      userPrompt.push("It was run in the directory:");
      userPrompt.push(lastCommand.cwd);
    }
    if (lastCommand.exitCode !== void 0) {
      userPrompt.push(`It exited with code: ${lastCommand.exitCode}`);
    }
    if (lastCommand.hasOutput() && lastCommand.getOutput) {
      const output = lastCommand.getOutput();
      if (output && output.trim().length > 0) {
        userPrompt.push("It has the following output:");
        userPrompt.push(output);
      }
    }
    return {
      content: [{
        kind: "text",
        value: userPrompt.join("\n")
      }]
    };
  }
};
GetTerminalLastCommandTool = __decorateClass([
  __decorateParam(0, ITerminalService)
], GetTerminalLastCommandTool);
export {
  GetTerminalLastCommandTool,
  GetTerminalLastCommandToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxnZXRUZXJtaW5hbExhc3RDb21tYW5kVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIHR5cGUgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xEYXRhLCB0eXBlIElUb29sSW1wbCwgdHlwZSBJVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0eXBlIElUb29sUmVzdWx0LCB0eXBlIENvdW50VG9rZW5zQ2FsbGJhY2ssIHR5cGUgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4vdG9vbElkcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBHZXRUZXJtaW5hbExhc3RDb21tYW5kVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IFRlcm1pbmFsVG9vbElkLlRlcm1pbmFsTGFzdENvbW1hbmQsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAndGVybWluYWxMYXN0Q29tbWFuZCcsXG5cdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsncnVuQ29tbWFuZHMvdGVybWluYWxMYXN0Q29tbWFuZCddLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rlcm1pbmFsTGFzdENvbW1hbmRUb29sLmRpc3BsYXlOYW1lJywgJ0dldCBUZXJtaW5hbCBMYXN0IENvbW1hbmQnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ0dldCB0aGUgbGFzdCBjb21tYW5kIHJ1biBpbiB0aGUgYWN0aXZlIHRlcm1pbmFsLicsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGljb246IENvZGljb24udGVybWluYWwsXG59O1xuXG5leHBvcnQgY2xhc3MgR2V0VGVybWluYWxMYXN0Q29tbWFuZFRvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnZ2V0VGVybWluYWxMYXN0Q29tbWFuZC5wcm9ncmVzc2l2ZScsIFwiR2V0dGluZyBsYXN0IHRlcm1pbmFsIGNvbW1hbmRcIiksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnZ2V0VGVybWluYWxMYXN0Q29tbWFuZC5wYXN0JywgXCJHb3QgbGFzdCB0ZXJtaW5hbCBjb21tYW5kXCIpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0aWYgKCFhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6ICdObyBhY3RpdmUgdGVybWluYWwgaW5zdGFuY2UgZm91bmQuJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gYWN0aXZlSW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0aWYgKCFjb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ05vIGNvbW1hbmQgZGV0ZWN0aW9uIGNhcGFiaWxpdHkgYXZhaWxhYmxlIGluIHRoZSBhY3RpdmUgdGVybWluYWwuJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRpbmdDb21tYW5kID0gY29tbWFuZERldGVjdGlvbi5leGVjdXRpbmdDb21tYW5kO1xuXHRcdGlmIChleGVjdXRpbmdDb21tYW5kKSB7XG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0dXNlclByb21wdC5wdXNoKCdUaGUgZm9sbG93aW5nIGNvbW1hbmQgaXMgY3VycmVudGx5IGV4ZWN1dGluZyBpbiB0aGUgdGVybWluYWw6Jyk7XG5cdFx0XHR1c2VyUHJvbXB0LnB1c2goZXhlY3V0aW5nQ29tbWFuZCk7XG5cblx0XHRcdGNvbnN0IGN3ZCA9IGNvbW1hbmREZXRlY3Rpb24uY3dkO1xuXHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHR1c2VyUHJvbXB0LnB1c2goJ0l0IGlzIHJ1bm5pbmcgaW4gdGhlIGRpcmVjdG9yeTonKTtcblx0XHRcdFx0dXNlclByb21wdC5wdXNoKGN3ZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiB1c2VyUHJvbXB0LmpvaW4oJ1xcbicpXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRzID0gY29tbWFuZERldGVjdGlvbi5jb21tYW5kcztcblx0XHRpZiAoIWNvbW1hbmRzIHx8IGNvbW1hbmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6ICdObyBjb21tYW5kIGhhcyBiZWVuIHJ1biBpbiB0aGUgYWN0aXZlIHRlcm1pbmFsLidcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdENvbW1hbmQgPSBjb21tYW5kc1tjb21tYW5kcy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCB1c2VyUHJvbXB0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0aWYgKGxhc3RDb21tYW5kLmNvbW1hbmQpIHtcblx0XHRcdHVzZXJQcm9tcHQucHVzaCgnVGhlIGZvbGxvd2luZyBpcyB0aGUgbGFzdCBjb21tYW5kIHJ1biBpbiB0aGUgdGVybWluYWw6Jyk7XG5cdFx0XHR1c2VyUHJvbXB0LnB1c2gobGFzdENvbW1hbmQuY29tbWFuZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RDb21tYW5kLmN3ZCkge1xuXHRcdFx0dXNlclByb21wdC5wdXNoKCdJdCB3YXMgcnVuIGluIHRoZSBkaXJlY3Rvcnk6Jyk7XG5cdFx0XHR1c2VyUHJvbXB0LnB1c2gobGFzdENvbW1hbmQuY3dkKTtcblx0XHR9XG5cblx0XHRpZiAobGFzdENvbW1hbmQuZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dXNlclByb21wdC5wdXNoKGBJdCBleGl0ZWQgd2l0aCBjb2RlOiAke2xhc3RDb21tYW5kLmV4aXRDb2RlfWApO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0Q29tbWFuZC5oYXNPdXRwdXQoKSAmJiBsYXN0Q29tbWFuZC5nZXRPdXRwdXQpIHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IGxhc3RDb21tYW5kLmdldE91dHB1dCgpO1xuXHRcdFx0aWYgKG91dHB1dCAmJiBvdXRwdXQudHJpbSgpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dXNlclByb21wdC5wdXNoKCdJdCBoYXMgdGhlIGZvbGxvd2luZyBvdXRwdXQ6Jyk7XG5cdFx0XHRcdHVzZXJQcm9tcHQucHVzaChvdXRwdXQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdHZhbHVlOiB1c2VyUHJvbXB0LmpvaW4oJ1xcbicpXG5cdFx0XHR9XVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQWlOO0FBQzFOLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBRXhCLE1BQU0saUNBQTRDO0FBQUEsRUFDeEQsSUFBSSxlQUFlO0FBQUEsRUFDbkIsbUJBQW1CO0FBQUEsRUFDbkIsOEJBQThCLENBQUMsaUNBQWlDO0FBQUEsRUFDaEUsYUFBYSxTQUFTLHVDQUF1QywyQkFBMkI7QUFBQSxFQUN4RixrQkFBa0I7QUFBQSxFQUNsQixRQUFRLGVBQWU7QUFBQSxFQUN2QixNQUFNLFFBQVE7QUFDZjtBQUVPLElBQU0sNkJBQU4sY0FBeUMsV0FBZ0M7QUFBQSxFQUUvRSxZQUNvQyxrQkFDbEM7QUFDRCxVQUFNO0FBRjZCO0FBQUEsRUFHcEM7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFNBQTRDLE9BQXdFO0FBQy9JLFdBQU87QUFBQSxNQUNOLG1CQUFtQixTQUFTLHNDQUFzQywrQkFBK0I7QUFBQSxNQUNqRyxrQkFBa0IsU0FBUywrQkFBK0IsMkJBQTJCO0FBQUEsSUFDdEY7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
