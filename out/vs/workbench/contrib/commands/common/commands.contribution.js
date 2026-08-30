import { safeStringify } from "../../../../base/common/objects.js";
import * as nls from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
class RunCommands extends Action2 {
  constructor() {
    super({
      id: "runCommands",
      title: nls.localize2("runCommands", "Run Commands"),
      f1: false,
      metadata: {
        description: nls.localize("runCommands.description", "Run several commands"),
        args: [
          {
            name: "args",
            schema: {
              type: "object",
              required: ["commands"],
              properties: {
                commands: {
                  type: "array",
                  description: nls.localize("runCommands.commands", "Commands to run"),
                  items: {
                    anyOf: [
                      {
                        $ref: "vscode://schemas/keybindings#/definitions/commandNames"
                      },
                      {
                        type: "string"
                      },
                      {
                        type: "object",
                        required: ["command"],
                        properties: {
                          command: {
                            "anyOf": [
                              {
                                $ref: "vscode://schemas/keybindings#/definitions/commandNames"
                              },
                              {
                                type: "string"
                              }
                            ]
                          }
                        },
                        $ref: "vscode://schemas/keybindings#/definitions/commandsSchemas"
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    });
  }
  // dev decisions:
  // - this command takes a single argument-object because
  //	- keybinding definitions don't allow running commands with several arguments
  //  - and we want to be able to take on different other arguments in future, e.g., `runMode : 'serial' | 'concurrent'`
  async run(accessor, args) {
    const notificationService = accessor.get(INotificationService);
    if (!this._isCommandArgs(args)) {
      notificationService.error(nls.localize("runCommands.invalidArgs", "'runCommands' has received an argument with incorrect type. Please, review the argument passed to the command."));
      return;
    }
    if (args.commands.length === 0) {
      notificationService.warn(nls.localize("runCommands.noCommandsToRun", "'runCommands' has not received commands to run. Did you forget to pass commands in the 'runCommands' argument?"));
      return;
    }
    const commandService = accessor.get(ICommandService);
    const logService = accessor.get(ILogService);
    let i = 0;
    try {
      for (; i < args.commands.length; ++i) {
        const cmd = args.commands[i];
        logService.debug(`runCommands: executing ${i}-th command: ${safeStringify(cmd)}`);
        await this._runCommand(commandService, cmd);
        logService.debug(`runCommands: executed ${i}-th command`);
      }
    } catch (err) {
      logService.debug(`runCommands: executing ${i}-th command resulted in an error: ${err instanceof Error ? err.message : safeStringify(err)}`);
      notificationService.error(err);
    }
  }
  _isCommandArgs(args) {
    if (!args || typeof args !== "object") {
      return false;
    }
    if (!("commands" in args) || !Array.isArray(args.commands)) {
      return false;
    }
    for (const cmd of args.commands) {
      if (typeof cmd === "string") {
        continue;
      }
      if (typeof cmd === "object" && typeof cmd.command === "string") {
        continue;
      }
      return false;
    }
    return true;
  }
  _runCommand(commandService, cmd) {
    let commandID, commandArgs;
    if (typeof cmd === "string") {
      commandID = cmd;
    } else {
      commandID = cmd.command;
      commandArgs = cmd.args;
    }
    if (commandArgs === void 0) {
      return commandService.executeCommand(commandID);
    } else {
      if (Array.isArray(commandArgs)) {
        return commandService.executeCommand(commandID, ...commandArgs);
      } else {
        return commandService.executeCommand(commandID, commandArgs);
      }
    }
  }
}
registerAction2(RunCommands);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1hbmRzXFxjb21tb25cXGNvbW1hbmRzLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNhZmVTdHJpbmdpZnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcblxudHlwZSBSdW5uYWJsZUNvbW1hbmQgPSBzdHJpbmcgfCB7IGNvbW1hbmQ6IHN0cmluZzsgYXJnczogYW55W10gfTtcblxudHlwZSBDb21tYW5kQXJncyA9IHtcblx0Y29tbWFuZHM6IFJ1bm5hYmxlQ29tbWFuZFtdO1xufTtcblxuLyoqIFJ1bnMgc2V2ZXJhbCBjb21tYW5kcyBwYXNzZWQgdG8gaXQgYXMgYW4gYXJndW1lbnQgKi9cbmNsYXNzIFJ1bkNvbW1hbmRzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdydW5Db21tYW5kcycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncnVuQ29tbWFuZHMnLCBcIlJ1biBDb21tYW5kc1wiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3J1bkNvbW1hbmRzLmRlc2NyaXB0aW9uJywgXCJSdW4gc2V2ZXJhbCBjb21tYW5kc1wiKSxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZHMnXSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmRzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVuQ29tbWFuZHMuY29tbWFuZHMnLCBcIkNvbW1hbmRzIHRvIHJ1blwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JHJlZjogJ3ZzY29kZTovL3NjaGVtYXMva2V5YmluZGluZ3MjL2RlZmluaXRpb25zL2NvbW1hbmROYW1lcydcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCRyZWY6ICd2c2NvZGU6Ly9zY2hlbWFzL2tleWJpbmRpbmdzIy9kZWZpbml0aW9ucy9jb21tYW5kTmFtZXMnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQkcmVmOiAndnNjb2RlOi8vc2NoZW1hcy9rZXliaW5kaW5ncyMvZGVmaW5pdGlvbnMvY29tbWFuZHNTY2hlbWFzJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gZGV2IGRlY2lzaW9uczpcblx0Ly8gLSB0aGlzIGNvbW1hbmQgdGFrZXMgYSBzaW5nbGUgYXJndW1lbnQtb2JqZWN0IGJlY2F1c2Vcblx0Ly9cdC0ga2V5YmluZGluZyBkZWZpbml0aW9ucyBkb24ndCBhbGxvdyBydW5uaW5nIGNvbW1hbmRzIHdpdGggc2V2ZXJhbCBhcmd1bWVudHNcblx0Ly8gIC0gYW5kIHdlIHdhbnQgdG8gYmUgYWJsZSB0byB0YWtlIG9uIGRpZmZlcmVudCBvdGhlciBhcmd1bWVudHMgaW4gZnV0dXJlLCBlLmcuLCBgcnVuTW9kZSA6ICdzZXJpYWwnIHwgJ2NvbmN1cnJlbnQnYFxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IHVua25vd24pIHtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKCF0aGlzLl9pc0NvbW1hbmRBcmdzKGFyZ3MpKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgncnVuQ29tbWFuZHMuaW52YWxpZEFyZ3MnLCBcIidydW5Db21tYW5kcycgaGFzIHJlY2VpdmVkIGFuIGFyZ3VtZW50IHdpdGggaW5jb3JyZWN0IHR5cGUuIFBsZWFzZSwgcmV2aWV3IHRoZSBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGNvbW1hbmQuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoYXJncy5jb21tYW5kcy5sZW5ndGggPT09IDApIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ3J1bkNvbW1hbmRzLm5vQ29tbWFuZHNUb1J1bicsIFwiJ3J1bkNvbW1hbmRzJyBoYXMgbm90IHJlY2VpdmVkIGNvbW1hbmRzIHRvIHJ1bi4gRGlkIHlvdSBmb3JnZXQgdG8gcGFzcyBjb21tYW5kcyBpbiB0aGUgJ3J1bkNvbW1hbmRzJyBhcmd1bWVudD9cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRsZXQgaSA9IDA7XG5cdFx0dHJ5IHtcblx0XHRcdGZvciAoOyBpIDwgYXJncy5jb21tYW5kcy5sZW5ndGg7ICsraSkge1xuXG5cdFx0XHRcdGNvbnN0IGNtZCA9IGFyZ3MuY29tbWFuZHNbaV07XG5cblx0XHRcdFx0bG9nU2VydmljZS5kZWJ1ZyhgcnVuQ29tbWFuZHM6IGV4ZWN1dGluZyAke2l9LXRoIGNvbW1hbmQ6ICR7c2FmZVN0cmluZ2lmeShjbWQpfWApO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX3J1bkNvbW1hbmQoY29tbWFuZFNlcnZpY2UsIGNtZCk7XG5cblx0XHRcdFx0bG9nU2VydmljZS5kZWJ1ZyhgcnVuQ29tbWFuZHM6IGV4ZWN1dGVkICR7aX0tdGggY29tbWFuZGApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bG9nU2VydmljZS5kZWJ1ZyhgcnVuQ29tbWFuZHM6IGV4ZWN1dGluZyAke2l9LXRoIGNvbW1hbmQgcmVzdWx0ZWQgaW4gYW4gZXJyb3I6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IHNhZmVTdHJpbmdpZnkoZXJyKX1gKTtcblxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzQ29tbWFuZEFyZ3MoYXJnczogdW5rbm93bik6IGFyZ3MgaXMgQ29tbWFuZEFyZ3Mge1xuXHRcdGlmICghYXJncyB8fCB0eXBlb2YgYXJncyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCEoJ2NvbW1hbmRzJyBpbiBhcmdzKSB8fCAhQXJyYXkuaXNBcnJheShhcmdzLmNvbW1hbmRzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNtZCBvZiBhcmdzLmNvbW1hbmRzKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNtZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGNtZCA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIGNtZC5jb21tYW5kID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9ydW5Db21tYW5kKGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsIGNtZDogUnVubmFibGVDb21tYW5kKSB7XG5cdFx0bGV0IGNvbW1hbmRJRDogc3RyaW5nLCBjb21tYW5kQXJncztcblxuXHRcdGlmICh0eXBlb2YgY21kID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29tbWFuZElEID0gY21kO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21tYW5kSUQgPSBjbWQuY29tbWFuZDtcblx0XHRcdGNvbW1hbmRBcmdzID0gY21kLmFyZ3M7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbW1hbmRBcmdzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSUQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjb21tYW5kQXJncykpIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJRCwgLi4uY29tbWFuZEFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJRCwgY29tbWFuZEFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoUnVuQ29tbWFuZHMpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxxQkFBcUI7QUFDOUIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFTckMsTUFBTSxvQkFBb0IsUUFBUTtBQUFBLEVBRWpDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSxlQUFlLGNBQWM7QUFBQSxNQUNsRCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsUUFDVCxhQUFhLElBQUksU0FBUywyQkFBMkIsc0JBQXNCO0FBQUEsUUFDM0UsTUFBTTtBQUFBLFVBQ0w7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFFBQVE7QUFBQSxjQUNQLE1BQU07QUFBQSxjQUNOLFVBQVUsQ0FBQyxVQUFVO0FBQUEsY0FDckIsWUFBWTtBQUFBLGdCQUNYLFVBQVU7QUFBQSxrQkFDVCxNQUFNO0FBQUEsa0JBQ04sYUFBYSxJQUFJLFNBQVMsd0JBQXdCLGlCQUFpQjtBQUFBLGtCQUNuRSxPQUFPO0FBQUEsb0JBQ04sT0FBTztBQUFBLHNCQUNOO0FB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
