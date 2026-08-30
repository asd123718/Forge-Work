import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { IQuickChatService } from "../chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
const ASK_QUICK_QUESTION_ACTION_ID = "workbench.action.quickchat.toggle";
function registerQuickChatActions() {
  registerAction2(QuickChatGlobalAction);
  registerAction2(AskQuickChatAction);
  registerAction2(class OpenInChatViewAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.quickchat.openInChatView",
        title: localize2("chat.openInChatView.label", "Open in Chat View"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.chatSparkle,
        menu: {
          id: MenuId.ChatInputSide,
          group: "navigation",
          order: 10
        }
      });
    }
    run(accessor) {
      const quickChatService = accessor.get(IQuickChatService);
      quickChatService.openInChatView();
    }
  });
  registerAction2(class CloseQuickChatAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.quickchat.close",
        title: localize2("chat.closeQuickChat.label", "Close Quick Chat"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.closeSmall,
        menu: {
          id: MenuId.ChatInputSide,
          group: "navigation",
          order: 20
        }
      });
    }
    run(accessor) {
      const quickChatService = accessor.get(IQuickChatService);
      quickChatService.close();
    }
  });
}
class QuickChatGlobalAction extends Action2 {
  constructor() {
    super({
      id: ASK_QUICK_QUESTION_ACTION_ID,
      title: localize2("quickChat", "Open Quick Chat"),
      precondition: ChatContextKeys.enabled,
      icon: Codicon.chatSparkle,
      f1: false,
      category: CHAT_CATEGORY,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyL
      },
      menu: {
        id: MenuId.ChatTitleBarMenu,
        group: "a_open",
        order: 4
      },
      metadata: {
        description: localize("toggle.desc", "Toggle the quick chat"),
        args: [{
          name: "args",
          schema: {
            anyOf: [
              {
                type: "object",
                required: ["query"],
                properties: {
                  query: {
                    description: localize("toggle.query", "The query to open the quick chat with"),
                    type: "string"
                  },
                  isPartialQuery: {
                    description: localize("toggle.isPartialQuery", "Whether the query is partial; it will wait for more user input"),
                    type: "boolean"
                  }
                }
              },
              {
                type: "string",
                description: localize("toggle.query", "The query to open the quick chat with")
              }
            ]
          }
        }]
      }
    });
  }
  run(accessor, query) {
    const quickChatService = accessor.get(IQuickChatService);
    let options;
    switch (typeof query) {
      case "string":
        options = { query };
        break;
      case "object":
        options = query;
        break;
    }
    if (options?.query) {
      options.selection = new Selection(1, options.query.length + 1, 1, options.query.length + 1);
    }
    quickChatService.toggle(options);
  }
}
class AskQuickChatAction extends Action2 {
  constructor() {
    super({
      id: `workbench.action.openQuickChat`,
      category: CHAT_CATEGORY,
      title: localize2("interactiveSession.open", "Open Quick Chat"),
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  run(accessor, query) {
    const quickChatService = accessor.get(IQuickChatService);
    quickChatService.toggle(query ? {
      query,
      selection: new Selection(1, query.length + 1, 1, query.length + 1)
    } : void 0);
  }
}
export {
  ASK_QUICK_QUESTION_ACTION_ID,
  registerQuickChatActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRRdWlja0lucHV0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlkgfSBmcm9tICcuL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0NoYXRPcGVuT3B0aW9ucywgSVF1aWNrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5cbmV4cG9ydCBjb25zdCBBU0tfUVVJQ0tfUVVFU1RJT05fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tjaGF0LnRvZ2dsZSc7XG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJRdWlja0NoYXRBY3Rpb25zKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoUXVpY2tDaGF0R2xvYmFsQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKEFza1F1aWNrQ2hhdEFjdGlvbik7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5JbkNoYXRWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja2NoYXQub3BlbkluQ2hhdFZpZXcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm9wZW5JbkNoYXRWaWV3LmxhYmVsJywgXCJPcGVuIGluIENoYXQgVmlld1wiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2lkZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHF1aWNrQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrQ2hhdFNlcnZpY2UpO1xuXHRcdFx0cXVpY2tDaGF0U2VydmljZS5vcGVuSW5DaGF0VmlldygpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsb3NlUXVpY2tDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja2NoYXQuY2xvc2UnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmNsb3NlUXVpY2tDaGF0LmxhYmVsJywgXCJDbG9zZSBRdWljayBDaGF0XCIpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlU21hbGwsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNpZGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMjBcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCBxdWlja0NoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0NoYXRTZXJ2aWNlKTtcblx0XHRcdHF1aWNrQ2hhdFNlcnZpY2UuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG59XG5cbmNsYXNzIFF1aWNrQ2hhdEdsb2JhbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQVNLX1FVSUNLX1FVRVNUSU9OX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3F1aWNrQ2hhdCcsICdPcGVuIFF1aWNrIENoYXQnKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUwsXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXRsZUJhck1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnYV9vcGVuJyxcblx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RvZ2dsZS5kZXNjJywgJ1RvZ2dsZSB0aGUgcXVpY2sgY2hhdCcpLFxuXHRcdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydxdWVyeSddLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHF1ZXJ5OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9nZ2xlLnF1ZXJ5JywgXCJUaGUgcXVlcnkgdG8gb3BlbiB0aGUgcXVpY2sgY2hhdCB3aXRoXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9nZ2xlLmlzUGFydGlhbFF1ZXJ5JywgXCJXaGV0aGVyIHRoZSBxdWVyeSBpcyBwYXJ0aWFsOyBpdCB3aWxsIHdhaXQgZm9yIG1vcmUgdXNlciBpbnB1dFwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9nZ2xlLnF1ZXJ5JywgXCJUaGUgcXVlcnkgdG8gb3BlbiB0aGUgcXVpY2sgY2hhdCB3aXRoXCIpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBxdWVyeT86IHN0cmluZyB8IE9taXQ8SVF1aWNrQ2hhdE9wZW5PcHRpb25zLCAnc2VsZWN0aW9uJz4pOiB2b2lkIHtcblx0XHRjb25zdCBxdWlja0NoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0NoYXRTZXJ2aWNlKTtcblx0XHRsZXQgb3B0aW9uczogSVF1aWNrQ2hhdE9wZW5PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAodHlwZW9mIHF1ZXJ5KSB7XG5cdFx0XHRjYXNlICdzdHJpbmcnOiBvcHRpb25zID0geyBxdWVyeSB9OyBicmVhaztcblx0XHRcdGNhc2UgJ29iamVjdCc6IG9wdGlvbnMgPSBxdWVyeTsgYnJlYWs7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5xdWVyeSkge1xuXHRcdFx0b3B0aW9ucy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKDEsIG9wdGlvbnMucXVlcnkubGVuZ3RoICsgMSwgMSwgb3B0aW9ucy5xdWVyeS5sZW5ndGggKyAxKTtcblx0XHR9XG5cdFx0cXVpY2tDaGF0U2VydmljZS50b2dnbGUob3B0aW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgQXNrUXVpY2tDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5vcGVuUXVpY2tDaGF0YCxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW4nLCBcIk9wZW4gUXVpY2sgQ2hhdFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBxdWVyeT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHF1aWNrQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrQ2hhdFNlcnZpY2UpO1xuXHRcdHF1aWNrQ2hhdFNlcnZpY2UudG9nZ2xlKHF1ZXJ5ID8ge1xuXHRcdFx0cXVlcnksXG5cdFx0XHRzZWxlY3Rpb246IG5ldyBTZWxlY3Rpb24oMSwgcXVlcnkubGVuZ3RoICsgMSwgMSwgcXVlcnkubGVuZ3RoICsgMSlcblx0XHR9IDogdW5kZWZpbmVkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBRWpELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQWdDLHlCQUF5QjtBQUN6RCxTQUFTLHVCQUF1QjtBQUV6QixNQUFNLCtCQUErQjtBQUNyQyxTQUFTLDJCQUEyQjtBQUMxQyxrQkFBZ0IscUJBQXFCO0FBQ3JDLGtCQUFnQixrQkFBa0I7QUFFbEMsa0JBQWdCLE1BQU0sNkJBQTZCLFFBQVE7QUFBQSxJQUMxRCxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLDZCQUE2QixtQkFBbUI7QUFBQSxRQUNqRSxJQUFJO0FBQUEsUUFDSixVQUFVO0FBQUEsUUFDVixNQUFNLFFBQVE7QUFBQSxRQUNkLE1BQU07QUFBQSxVQUNMLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFFBQ1I7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxJQUFJLFVBQTRCO0FBQy9CLFlBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFDdkQsdUJBQWlCLGVBQWU7QUFBQSxJQUNqQztBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDZCQUE2QixRQUFRO0FBQUEsSUFDMUQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSw2QkFBNkIsa0JBQWtCO0FBQUEsUUFDaEUsSUFBSTtBQUFBLFFBQ0osVUFBVTtBQUFBLFFBQ1YsTUFBTSxRQUFRO0FBQUEsUUFDZCxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFB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
