import { isWindows } from "../../../../../base/common/platform.js";
import { isObject, isString } from "../../../../../base/common/types.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { registerTerminalAction } from "../../../terminal/browser/terminalActions.js";
var TerminalSendSignalCommandId = /* @__PURE__ */ ((TerminalSendSignalCommandId2) => {
  TerminalSendSignalCommandId2["SendSignal"] = "workbench.action.terminal.sendSignal";
  return TerminalSendSignalCommandId2;
})(TerminalSendSignalCommandId || {});
function toOptionalString(obj) {
  return isString(obj) ? obj : void 0;
}
const sendSignalString = localize2("sendSignal", "Send Signal");
registerTerminalAction({
  id: "workbench.action.terminal.sendSignal" /* SendSignal */,
  title: sendSignalString,
  f1: !isWindows,
  metadata: {
    description: sendSignalString.value,
    args: [{
      name: "args",
      schema: {
        type: "object",
        required: ["signal"],
        properties: {
          signal: {
            description: localize("sendSignal.signal.desc", "The signal to send to the terminal process (e.g., 'SIGTERM', 'SIGINT', 'SIGKILL')"),
            type: "string"
          }
        }
      }
    }]
  },
  run: async (c, accessor, args) => {
    const quickInputService = accessor.get(IQuickInputService);
    const instance = c.service.activeInstance;
    if (!instance) {
      return;
    }
    function isSignalArg(obj) {
      return isObject(obj) && "signal" in obj;
    }
    let signal = isSignalArg(args) ? toOptionalString(args.signal) : void 0;
    if (!signal) {
      const signalOptions = [
        { label: "SIGINT", description: localize("SIGINT", "Interrupt process (Ctrl+C)") },
        { label: "SIGTERM", description: localize("SIGTERM", "Terminate process gracefully") },
        { label: "SIGKILL", description: localize("SIGKILL", "Force kill process") },
        { label: "SIGSTOP", description: localize("SIGSTOP", "Stop process") },
        { label: "SIGCONT", description: localize("SIGCONT", "Continue process") },
        { label: "SIGHUP", description: localize("SIGHUP", "Hangup") },
        { label: "SIGQUIT", description: localize("SIGQUIT", "Quit process") },
        { label: "SIGUSR1", description: localize("SIGUSR1", "User-defined signal 1") },
        { label: "SIGUSR2", description: localize("SIGUSR2", "User-defined signal 2") },
        { type: "separator" },
        { label: localize("manualSignal", "Manually enter signal") }
      ];
      const selected = await quickInputService.pick(signalOptions, {
        placeHolder: localize("selectSignal", "Select signal to send to terminal process")
      });
      if (!selected) {
        return;
      }
      if (selected.label === localize("manualSignal", "Manually enter signal")) {
        const inputSignal = await quickInputService.input({
          prompt: localize("enterSignal", "Enter signal name (e.g., SIGTERM, SIGKILL)")
        });
        if (!inputSignal) {
          return;
        }
        signal = inputSignal;
      } else {
        signal = selected.label;
      }
    }
    await instance.sendSignal(signal);
  }
});
export {
  TerminalSendSignalCommandId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc2VuZFNpZ25hbFxcYnJvd3NlclxcdGVybWluYWwuc2VuZFNpZ25hbC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgdHlwZSBRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEFjdGlvbnMuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbFNlbmRTaWduYWxDb21tYW5kSWQge1xuXHRTZW5kU2lnbmFsID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VuZFNpZ25hbCcsXG59XG5cbmZ1bmN0aW9uIHRvT3B0aW9uYWxTdHJpbmcob2JqOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGlzU3RyaW5nKG9iaikgPyBvYmogOiB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IHNlbmRTaWduYWxTdHJpbmcgPSBsb2NhbGl6ZTIoJ3NlbmRTaWduYWwnLCBcIlNlbmQgU2lnbmFsXCIpO1xucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbFNlbmRTaWduYWxDb21tYW5kSWQuU2VuZFNpZ25hbCxcblx0dGl0bGU6IHNlbmRTaWduYWxTdHJpbmcsXG5cdGYxOiAhaXNXaW5kb3dzLFxuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiBzZW5kU2lnbmFsU3RyaW5nLnZhbHVlLFxuXHRcdGFyZ3M6IFt7XG5cdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3NpZ25hbCddLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0c2lnbmFsOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NlbmRTaWduYWwuc2lnbmFsLmRlc2MnLCBcIlRoZSBzaWduYWwgdG8gc2VuZCB0byB0aGUgdGVybWluYWwgcHJvY2VzcyAoZS5nLiwgJ1NJR1RFUk0nLCAnU0lHSU5UJywgJ1NJR0tJTEwnKVwiKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH1dXG5cdH0sXG5cdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGMuc2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gaXNTaWduYWxBcmcob2JqOiB1bmtub3duKTogb2JqIGlzIHsgc2lnbmFsOiBzdHJpbmcgfSB7XG5cdFx0XHRyZXR1cm4gaXNPYmplY3Qob2JqKSAmJiAnc2lnbmFsJyBpbiBvYmo7XG5cdFx0fVxuXHRcdGxldCBzaWduYWwgPSBpc1NpZ25hbEFyZyhhcmdzKSA/IHRvT3B0aW9uYWxTdHJpbmcoYXJncy5zaWduYWwpIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFzaWduYWwpIHtcblx0XHRcdGNvbnN0IHNpZ25hbE9wdGlvbnM6IFF1aWNrUGlja0l0ZW1bXSA9IFtcblx0XHRcdFx0eyBsYWJlbDogJ1NJR0lOVCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnU0lHSU5UJywgJ0ludGVycnVwdCBwcm9jZXNzIChDdHJsK0MpJykgfSxcblx0XHRcdFx0eyBsYWJlbDogJ1NJR1RFUk0nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1NJR1RFUk0nLCAnVGVybWluYXRlIHByb2Nlc3MgZ3JhY2VmdWxseScpIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdTSUdLSUxMJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdTSUdLSUxMJywgJ0ZvcmNlIGtpbGwgcHJvY2VzcycpIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdTSUdTVE9QJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdTSUdTVE9QJywgJ1N0b3AgcHJvY2VzcycpIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdTSUdDT05UJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdTSUdDT05UJywgJ0NvbnRpbnVlIHByb2Nlc3MnKSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnU0lHSFVQJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdTSUdIVVAnLCAnSGFuZ3VwJykgfSxcblx0XHRcdFx0eyBsYWJlbDogJ1NJR1FVSVQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1NJR1FVSVQnLCAnUXVpdCBwcm9jZXNzJykgfSxcblx0XHRcdFx0eyBsYWJlbDogJ1NJR1VTUjEnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1NJR1VTUjEnLCAnVXNlci1kZWZpbmVkIHNpZ25hbCAxJykgfSxcblx0XHRcdFx0eyBsYWJlbDogJ1NJR1VTUjInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1NJR1VTUjInLCAnVXNlci1kZWZpbmVkIHNpZ25hbCAyJykgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbWFudWFsU2lnbmFsJywgJ01hbnVhbGx5IGVudGVyIHNpZ25hbCcpIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhzaWduYWxPcHRpb25zLCB7XG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0U2lnbmFsJywgJ1NlbGVjdCBzaWduYWwgdG8gc2VuZCB0byB0ZXJtaW5hbCBwcm9jZXNzJylcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlbGVjdGVkLmxhYmVsID09PSBsb2NhbGl6ZSgnbWFudWFsU2lnbmFsJywgJ01hbnVhbGx5IGVudGVyIHNpZ25hbCcpKSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0U2lnbmFsID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRcdHByb21wdDogbG9jYWxpemUoJ2VudGVyU2lnbmFsJywgJ0VudGVyIHNpZ25hbCBuYW1lIChlLmcuLCBTSUdURVJNLCBTSUdLSUxMKScpLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIWlucHV0U2lnbmFsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2lnbmFsID0gaW5wdXRTaWduYWw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzaWduYWwgPSBzZWxlY3RlZC5sYWJlbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBpbnN0YW5jZS5zZW5kU2lnbmFsKHNpZ25hbCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsMEJBQThDO0FBQ3ZELFNBQVMsOEJBQThCO0FBRWhDLElBQVcsOEJBQVgsa0JBQVdBLGlDQUFYO0FBQ04sRUFBQUEsNkJBQUEsZ0JBQWE7QUFESSxTQUFBQTtBQUFBLEdBQUE7QUFJbEIsU0FBUyxpQkFBaUIsS0FBa0M7QUFDM0QsU0FBTyxTQUFTLEdBQUcsSUFBSSxNQUFNO0FBQzlCO0FBRUEsTUFBTSxtQkFBbUIsVUFBVSxjQUFjLGFBQWE7QUFDOUQsdUJBQXVCO0FBQUEsRUFDdEIsSUFBSTtBQUFBLEVBQ0osT0FBTztBQUFBLEVBQ1AsSUFBSSxDQUFDO0FBQUEsRUFDTCxVQUFVO0FBQUEsSUFDVCxhQUFhLGlCQUFpQjtBQUFBLElBQzlCLE1BQU0sQ0FBQztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxDQUFDLFFBQVE7QUFBQSxRQUNuQixZQUFZO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxhQUFhLFNBQVMsMEJBQTBCLG1GQUFtRjtBQUFBLFlBQ25JLE1BQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDQSxLQUFLLE9BQU8sR0FBRyxVQUFVLFNBQVM7QUFDakMsVUFBTSxvQkFBb0IsU0FBUyxJQUFJLGtCQUFrQjtBQUN6RCxVQUFNLFdBQVcsRUFBRSxRQUFRO0FBQzNCLFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsYUFBUyxZQUFZLEtBQXlDO0FBQzdELGFBQU8sU0FBUyxHQUFHLEtBQUssWUFBWTtBQUFBLElBQ3JDO0FBQ0EsUUFBSSxTQUFTLFlBQVksSUFBSSxJQUFJLGlCQUFpQixLQUFLLE1BQU0sSUFBSTtBQUVqRSxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sZ0JBQWlDO0FBQUEsUUFDdEMsRUFBRSxPQUFPLFVBQVUsYUFBYSxTQUFTLFVBQVUsNEJBQTRCLEVBQUU7QUFBQSxRQUNqRixFQUFFLE9BQU8sV0FBVyxhQUFhLFNBQVMsV0FBVyw4QkFBOEIsRUFBRTtBQUFBLFFBQ3JGLEVBQUUsT0FBTyxXQUFXLGFBQWEsU0FBUyxXQUFXLG9CQUFvQixFQUFFO0FBQUEsUUFDM0UsRUFBRSxPQUFPLFdBQVcsYUFBYSxTQUFTLFdBQVcsY0FBYyxFQUFFO0FBQUEsUUFDckUsRUFBRSxPQUFPLFdBQVcsYUFBYSxTQUFTLFdBQVcsa0JBQWtCLEVBQUU7QUFBQSxRQUN6RSxFQUFFLE9BQU8sVUFBVSxhQUFhLFNBQVMsVUFBVSxRQUFRLEVBQUU7QUFBQSxRQUM3RCxFQUFFLE9BQU8sV0FBVyxhQUFhLFNBQVMsV0FBVyxjQUFjLEVBQUU7QUFBQSxRQUNyRSxFQUFFLE9BQU8sV0FBVyxhQUFhLFNBQVMsV0FBVyx1QkFBdUIsRUFBRTtBQUFBLFFBQzlFLEVBQUUsT0FBTyxXQUFXLGFBQWEsU0FBUyxXQUFXLHVCQUF1QixFQUFFO0FBQUEsUUFDOUUsRUFBRSxNQUFNLFlBQVk7QUFBQSxRQUNwQixFQUFFLE9BQU8sU0FBUyxnQkFBZ0IsdUJBQXVCLEVBQUU7QUFBQSxNQUM1RDtBQUVBLFlBQU0sV0FBVyxNQUFNLGtCQUFrQixLQUFLLGVBQWU7QUFBQSxRQUM1RCxhQUFhLFNBQVMsZ0JBQWdCLDJDQUEyQztBQUFBLE1BQ2xGLENBQUM7QUFFRCxVQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsTUFDRDtBQUVBLFVBQUksU0FBUyxVQUFVLFNBQVMsZ0JBQWdCLHVCQUF1QixHQUFHO0FBQ3pFLGNBQU0sY0FBYyxNQUFNLGtCQUFrQixNQUFNO0FBQUEsVUFDakQsUUFBUSxTQUFTLGVBQWUsNENBQTRDO0FBQUEsUUFDN0UsQ0FBQztBQUVELFlBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsUUFDRDtBQUVBLGlCQUFTO0FBQUEsTUFDVixPQUFPO0FBQ04saUJBQVMsU0FBUztBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxXQUFXLE1BQU07QUFBQSxFQUNqQztBQUNELENBQUM7IiwKICAibmFtZXMiOiBbIlRlcm1pbmFsU2VuZFNpZ25hbENvbW1hbmRJZCJdCn0K
