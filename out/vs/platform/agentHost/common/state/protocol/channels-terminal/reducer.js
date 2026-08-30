import { ActionType } from "../common/actions.js";
import { softAssertNever } from "../common/reducer-helpers.js";
function terminalReducer(state, action, log) {
  switch (action.type) {
    case ActionType.TerminalData: {
      const content = [...state.content];
      const tail = content.length > 0 ? content[content.length - 1] : void 0;
      if (tail && tail.type === "command" && !tail.isComplete) {
        content[content.length - 1] = { ...tail, output: tail.output + action.data };
      } else if (tail && tail.type === "unclassified") {
        content[content.length - 1] = { ...tail, value: tail.value + action.data };
      } else {
        content.push({ type: "unclassified", value: action.data });
      }
      return { ...state, content };
    }
    case ActionType.TerminalInput:
      return state;
    case ActionType.TerminalResized:
      return { ...state, cols: action.cols, rows: action.rows };
    case ActionType.TerminalClaimed:
      return { ...state, claim: action.claim };
    case ActionType.TerminalTitleChanged:
      return { ...state, title: action.title };
    case ActionType.TerminalCwdChanged:
      return { ...state, cwd: action.cwd };
    case ActionType.TerminalExited:
      return { ...state, exitCode: action.exitCode };
    case ActionType.TerminalCleared:
      return { ...state, content: [] };
    case ActionType.TerminalCommandDetectionAvailable:
      return { ...state, supportsCommandDetection: true };
    case ActionType.TerminalCommandExecuted: {
      const part = {
        type: "command",
        commandId: action.commandId,
        commandLine: action.commandLine,
        output: "",
        timestamp: action.timestamp,
        isComplete: false
      };
      return {
        ...state,
        content: [...state.content, part],
        supportsCommandDetection: true
      };
    }
    case ActionType.TerminalCommandFinished: {
      const content = state.content.map((p) => {
        if (p.type === "command" && p.commandId === action.commandId) {
          return {
            ...p,
            isComplete: true,
            exitCode: action.exitCode,
            durationMs: action.durationMs
          };
        }
        return p;
      });
      return { ...state, content };
    }
    default:
      softAssertNever(action, log);
      return state;
  }
}
export {
  terminalReducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXHN0YXRlXFxwcm90b2NvbFxcY2hhbm5lbHMtdGVybWluYWxcXHJlZHVjZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBhbGxvdy1hbnktdW5pY29kZS1jb21tZW50LWZpbGVcbi8vIERPIE5PVCBFRElUIC0tIGF1dG8tZ2VuZXJhdGVkIGJ5IHNjcmlwdHMvc3luYy1hZ2VudC1ob3N0LXByb3RvY29sLnRzXG5cbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsU3RhdGUsIFRlcm1pbmFsQ29udGVudFBhcnQgfSBmcm9tICcuL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi9hY3Rpb24tb3JpZ2luLmdlbmVyYXRlZC5qcyc7XG5pbXBvcnQgeyBzb2Z0QXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi9jb21tb24vcmVkdWNlci1oZWxwZXJzLmpzJztcblxuLyoqXG4gKiBQdXJlIHJlZHVjZXIgZm9yIHRlcm1pbmFsIHN0YXRlLiBIYW5kbGVzIGFsbCB7QGxpbmsgVGVybWluYWxBY3Rpb259IHZhcmlhbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdGVybWluYWxSZWR1Y2VyKHN0YXRlOiBUZXJtaW5hbFN0YXRlLCBhY3Rpb246IFRlcm1pbmFsQWN0aW9uLCBsb2c/OiAobXNnOiBzdHJpbmcpID0+IHZvaWQpOiBUZXJtaW5hbFN0YXRlIHtcblx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbERhdGE6IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbLi4uc3RhdGUuY29udGVudF07XG5cdFx0XHRjb25zdCB0YWlsID0gY29udGVudC5sZW5ndGggPiAwID8gY29udGVudFtjb250ZW50Lmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRhaWwgJiYgdGFpbC50eXBlID09PSAnY29tbWFuZCcgJiYgIXRhaWwuaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRjb250ZW50W2NvbnRlbnQubGVuZ3RoIC0gMV0gPSB7IC4uLnRhaWwsIG91dHB1dDogdGFpbC5vdXRwdXQgKyBhY3Rpb24uZGF0YSB9O1xuXHRcdFx0fSBlbHNlIGlmICh0YWlsICYmIHRhaWwudHlwZSA9PT0gJ3VuY2xhc3NpZmllZCcpIHtcblx0XHRcdFx0Y29udGVudFtjb250ZW50Lmxlbmd0aCAtIDFdID0geyAuLi50YWlsLCB2YWx1ZTogdGFpbC52YWx1ZSArIGFjdGlvbi5kYXRhIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZW50LnB1c2goeyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6IGFjdGlvbi5kYXRhIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGNvbnRlbnQgfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxJbnB1dDpcblx0XHRcdC8vIFNpZGUtZWZmZWN0LW9ubHk6IHRoZSBzZXJ2ZXIgZm9yd2FyZHMgdG8gdGhlIHB0eS5cblx0XHRcdC8vIE5vIHN0YXRlIGNoYW5nZSBpbiB0aGUgcmVkdWNlci5cblx0XHRcdHJldHVybiBzdGF0ZTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbFJlc2l6ZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY29sczogYWN0aW9uLmNvbHMsIHJvd3M6IGFjdGlvbi5yb3dzIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxDbGFpbWVkOlxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGNsYWltOiBhY3Rpb24uY2xhaW0gfTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbFRpdGxlQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCB0aXRsZTogYWN0aW9uLnRpdGxlIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxDd2RDaGFuZ2VkOlxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGN3ZDogYWN0aW9uLmN3ZCB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsRXhpdGVkOlxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGV4aXRDb2RlOiBhY3Rpb24uZXhpdENvZGUgfTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENsZWFyZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY29udGVudDogW10gfTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmREZXRlY3Rpb25BdmFpbGFibGU6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uOiB0cnVlIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQ6IHtcblx0XHRcdGNvbnN0IHBhcnQ6IFRlcm1pbmFsQ29udGVudFBhcnQgPSB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZElkOiBhY3Rpb24uY29tbWFuZElkLFxuXHRcdFx0XHRjb21tYW5kTGluZTogYWN0aW9uLmNvbW1hbmRMaW5lLFxuXHRcdFx0XHRvdXRwdXQ6ICcnLFxuXHRcdFx0XHR0aW1lc3RhbXA6IGFjdGlvbi50aW1lc3RhbXAsXG5cdFx0XHRcdGlzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRjb250ZW50OiBbLi4uc3RhdGUuY29udGVudCwgcGFydF0sXG5cdFx0XHRcdHN1cHBvcnRzQ29tbWFuZERldGVjdGlvbjogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkOiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gc3RhdGUuY29udGVudC5tYXAocCA9PiB7XG5cdFx0XHRcdGlmIChwLnR5cGUgPT09ICdjb21tYW5kJyAmJiBwLmNvbW1hbmRJZCA9PT0gYWN0aW9uLmNvbW1hbmRJZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5wLFxuXHRcdFx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSBhcyBjb25zdCxcblx0XHRcdFx0XHRcdGV4aXRDb2RlOiBhY3Rpb24uZXhpdENvZGUsXG5cdFx0XHRcdFx0XHRkdXJhdGlvbk1zOiBhY3Rpb24uZHVyYXRpb25Ncyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY29udGVudCB9O1xuXHRcdH1cblxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRzb2Z0QXNzZXJ0TmV2ZXIoYWN0aW9uLCBsb2cpO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFRQSxTQUFTLGtCQUFrQjtBQUczQixTQUFTLHVCQUF1QjtBQUt6QixTQUFTLGdCQUFnQixP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
