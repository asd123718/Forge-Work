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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import {
  ToolDataSource,
  ToolInvocationPresentation
} from "../languageModelToolsService.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IChatTodoListService } from "../chatTodoListService.js";
import { localize } from "../../../../../../nls.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
const ManageTodoListToolToolId = "manage_todo_list";
function createManageTodoListToolData() {
  const inputSchema = {
    type: "object",
    properties: {
      todoList: {
        type: "array",
        description: "Complete array of all todo items. Must include ALL items - both existing and new.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Unique identifier for the todo. Use sequential numbers starting from 1."
            },
            title: {
              type: "string",
              description: "Concise action-oriented todo label (3-7 words). Displayed in UI."
            },
            status: {
              type: "string",
              enum: ["not-started", "in-progress", "completed"],
              description: "not-started: Not begun | in-progress: Currently working (max 1) | completed: Fully finished with no blockers"
            }
          },
          required: ["id", "title", "status"]
        }
      }
    },
    required: ["todoList"]
  };
  return {
    id: ManageTodoListToolToolId,
    toolReferenceName: "todo",
    legacyToolReferenceFullNames: ["todos"],
    canBeReferencedInPrompt: true,
    icon: ThemeIcon.fromId(Codicon.checklist.id),
    displayName: localize("tool.manageTodoList.displayName", "Manage and track todo items for task planning"),
    userDescription: localize("tool.manageTodoList.userDescription", "Manage and track todo items for task planning"),
    modelDescription: "Manage a structured todo list to track progress and plan tasks throughout your coding session. Use this tool VERY frequently to ensure task visibility and proper planning.\n\nWhen to use this tool:\n- Complex multi-step work requiring planning and tracking\n- When user provides multiple tasks or requests (numbered/comma-separated)\n- After receiving new instructions that require multiple steps\n- BEFORE starting work on any todo (mark as in-progress)\n- IMMEDIATELY after completing each todo (mark completed individually)\n- When breaking down larger tasks into smaller actionable steps\n- To give users visibility into your progress and planning\n\nWhen NOT to use:\n- Single, trivial tasks that can be completed in one step\n- Purely conversational/informational requests\n- When just reading files or performing simple searches\n\nCRITICAL workflow:\n1. Plan tasks by writing todo list with specific, actionable items\n2. Mark ONE todo as in-progress before starting work\n3. Complete the work for that specific todo\n4. Mark that todo as completed IMMEDIATELY\n5. Move to next todo and repeat\n\nTodo states:\n- not-started: Todo not yet begun\n- in-progress: Currently working (limit ONE at a time)\n- completed: Finished successfully\n\nIMPORTANT: Mark todos completed as soon as they are done. Do not batch completions.",
    source: ToolDataSource.Internal,
    inputSchema
  };
}
const ManageTodoListToolData = createManageTodoListToolData();
let ManageTodoListTool = class extends Disposable {
  constructor(chatTodoListService, logService, telemetryService) {
    super();
    this.chatTodoListService = chatTodoListService;
    this.logService = logService;
    this.telemetryService = telemetryService;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke(invocation, _countTokens, _progress, _token) {
    const args = invocation.parameters;
    let chatSessionResource = invocation.context?.sessionResource;
    if (!chatSessionResource && args.operation === "read" && args.chatSessionResource) {
      try {
        chatSessionResource = URI.parse(args.chatSessionResource);
      } catch (error) {
        this.logService.error("ManageTodoListTool: Invalid chatSessionResource URI", error);
      }
    }
    if (!chatSessionResource) {
      return {
        content: [{
          kind: "text",
          value: "Error: No session resource available"
        }]
      };
    }
    this.logService.debug(`ManageTodoListTool: Invoking with options ${JSON.stringify(args)}`);
    try {
      if (args.operation === "read") {
        return this.handleReadOperation(chatSessionResource);
      } else {
        return this.handleWriteOperation(args, chatSessionResource);
      }
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      return {
        content: [{
          kind: "text",
          value: errorMessage
        }]
      };
    }
  }
  async prepareToolInvocation(context, _token) {
    const args = context.parameters;
    const chatSessionResource = context.chatSessionResource;
    if (!chatSessionResource) {
      return void 0;
    }
    const currentTodoItems = this.chatTodoListService.getTodos(chatSessionResource);
    let message;
    if (args.operation === "read") {
      message = localize("todo.readOperation", "Read todo list");
    } else if (args.todoList) {
      message = this.generatePastTenseMessage(currentTodoItems, args.todoList);
    }
    const items = args.todoList ?? currentTodoItems;
    const todoList = items.map((todo) => ({
      id: todo.id.toString(),
      title: todo.title,
      status: todo.status
    }));
    const invocationLabel = message?.replace(/^(Starting|Completed): /i, "") ?? localize("todo.updatingList", "Updating todo list");
    const invocationMessage = new MarkdownString(invocationLabel);
    return {
      invocationMessage,
      presentation: items.length ? void 0 : ToolInvocationPresentation.Hidden,
      pastTenseMessage: new MarkdownString(message ?? localize("todo.updatedList", "Updated todo list")),
      toolSpecificData: {
        kind: "todoList",
        todoList
      }
    };
  }
  generatePastTenseMessage(currentTodos, newTodos) {
    if (currentTodos.length === 0 && newTodos.length > 0) {
      return newTodos.length === 1 ? localize("todo.created.single", "Created 1 todo") : localize("todo.created.multiple", "Created {0} todos", newTodos.length);
    }
    const currentTodoMap = new Map(currentTodos.map((todo) => [todo.id, todo]));
    const startedTodos = newTodos.filter((newTodo) => {
      const currentTodo = currentTodoMap.get(newTodo.id);
      return currentTodo && currentTodo.status !== "in-progress" && newTodo.status === "in-progress";
    });
    if (startedTodos.length > 0) {
      const startedTodo = startedTodos[0];
      const totalTodos = newTodos.length;
      const currentPosition = newTodos.findIndex((todo) => todo.id === startedTodo.id) + 1;
      return localize("todo.starting", "Starting: *{0}* ({1}/{2})", startedTodo.title, currentPosition, totalTodos);
    }
    const completedTodos = newTodos.filter((newTodo) => {
      const currentTodo = currentTodoMap.get(newTodo.id);
      return currentTodo && currentTodo.status !== "completed" && newTodo.status === "completed";
    });
    if (completedTodos.length > 0) {
      const completedTodo = completedTodos[0];
      const totalTodos = newTodos.length;
      const currentPosition = newTodos.findIndex((todo) => todo.id === completedTodo.id) + 1;
      return localize("todo.completed", "Completed: *{0}* ({1}/{2})", completedTodo.title, currentPosition, totalTodos);
    }
    const addedTodos = newTodos.filter((newTodo) => !currentTodoMap.has(newTodo.id));
    if (addedTodos.length > 0) {
      return addedTodos.length === 1 ? localize("todo.added.single", "Added 1 todo") : localize("todo.added.multiple", "Added {0} todos", addedTodos.length);
    }
    return localize("todo.updated", "Updated todo list");
  }
  handleRead(todoItems, sessionResource) {
    if (todoItems.length === 0) {
      return "No todo list found.";
    }
    const markdownTaskList = this.formatTodoListAsMarkdownTaskList(todoItems);
    return `# Todo List

${markdownTaskList}`;
  }
  handleReadOperation(chatSessionResource) {
    const todoItems = this.chatTodoListService.getTodos(chatSessionResource);
    const readResult = this.handleRead(todoItems, chatSessionResource);
    const statusCounts = this.calculateStatusCounts(todoItems);
    this.telemetryService.publicLog2(
      "todoListToolInvoked",
      {
        operation: "read",
        notStartedCount: statusCounts.notStartedCount,
        inProgressCount: statusCounts.inProgressCount,
        completedCount: statusCounts.completedCount
      }
    );
    return {
      content: [{
        kind: "text",
        value: readResult
      }]
    };
  }
  handleWriteOperation(args, chatSessionResource) {
    if (!args.todoList) {
      return {
        content: [{
          kind: "text",
          value: "Error: todoList is required for write operation"
        }]
      };
    }
    const todoList = args.todoList.map((parsedTodo) => ({
      id: parsedTodo.id,
      title: parsedTodo.title,
      status: parsedTodo.status
    }));
    const existingTodos = this.chatTodoListService.getTodos(chatSessionResource);
    const changes = this.calculateTodoChanges(existingTodos, todoList);
    this.chatTodoListService.setTodos(chatSessionResource, todoList);
    const statusCounts = this.calculateStatusCounts(todoList);
    const warnings = [];
    if (todoList.length < 3) {
      warnings.push("Warning: Small todo list (<3 items). This task might not need a todo list.");
    } else if (todoList.length > 10) {
      warnings.push("Warning: Large todo list (>10 items). Consider keeping the list focused and actionable.");
    }
    if (changes > 3) {
      warnings.push("Warning: Did you mean to update so many todos at the same time? Consider working on them one by one.");
    }
    this.telemetryService.publicLog2(
      "todoListToolInvoked",
      {
        operation: "write",
        notStartedCount: statusCounts.notStartedCount,
        inProgressCount: statusCounts.inProgressCount,
        completedCount: statusCounts.completedCount
      }
    );
    return {
      content: [{
        kind: "text",
        value: `Successfully wrote todo list${warnings.length ? "\n\n" + warnings.join("\n") : ""}`
      }],
      toolMetadata: {
        warnings
      }
    };
  }
  calculateStatusCounts(todos) {
    const notStartedCount = todos.filter((todo) => todo.status === "not-started").length;
    const inProgressCount = todos.filter((todo) => todo.status === "in-progress").length;
    const completedCount = todos.filter((todo) => todo.status === "completed").length;
    return { notStartedCount, inProgressCount, completedCount };
  }
  formatTodoListAsMarkdownTaskList(todoList) {
    if (todoList.length === 0) {
      return "";
    }
    return todoList.map((todo) => {
      let checkbox;
      switch (todo.status) {
        case "completed":
          checkbox = "[x]";
          break;
        case "in-progress":
          checkbox = "[-]";
          break;
        case "not-started":
        default:
          checkbox = "[ ]";
          break;
      }
      const lines = [`- ${checkbox} ${todo.title}`];
      return lines.join("\n");
    }).join("\n");
  }
  calculateTodoChanges(oldList, newList) {
    let modified = 0;
    const minLen = Math.min(oldList.length, newList.length);
    for (let i = 0; i < minLen; i++) {
      const o = oldList[i];
      const n = newList[i];
      if (o.title !== n.title || o.status !== n.status) {
        modified++;
      }
    }
    const added = Math.max(0, newList.length - oldList.length);
    const removed = Math.max(0, oldList.length - newList.length);
    const totalChanges = added + removed + modified;
    return totalChanges;
  }
};
ManageTodoListTool = __decorateClass([
  __decorateParam(0, IChatTodoListService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ITelemetryService)
], ManageTodoListTool);
export {
  ManageTodoListTool,
  ManageTodoListToolData,
  ManageTodoListToolToolId,
  createManageTodoListToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcbWFuYWdlVG9kb0xpc3RUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHtcblx0SVRvb2xEYXRhLFxuXHRJVG9vbEltcGwsXG5cdElUb29sSW52b2NhdGlvbixcblx0SVRvb2xSZXN1bHQsXG5cdFRvb2xEYXRhU291cmNlLFxuXHRJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsXG5cdElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLFxuXHRUb29sSW52b2NhdGlvblByZXNlbnRhdGlvblxufSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvZG8sIElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdFRvZG9MaXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmV4cG9ydCBjb25zdCBNYW5hZ2VUb2RvTGlzdFRvb2xUb29sSWQgPSAnbWFuYWdlX3RvZG9fbGlzdCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNYW5hZ2VUb2RvTGlzdFRvb2xEYXRhKCk6IElUb29sRGF0YSB7XG5cdGNvbnN0IGlucHV0U2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgcHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgfSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR0b2RvTGlzdDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlIGFycmF5IG9mIGFsbCB0b2RvIGl0ZW1zLiBNdXN0IGluY2x1ZGUgQUxMIGl0ZW1zIC0gYm90aCBleGlzdGluZyBhbmQgbmV3LicsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSB0b2RvLiBVc2Ugc2VxdWVudGlhbCBudW1iZXJzIHN0YXJ0aW5nIGZyb20gMS4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29uY2lzZSBhY3Rpb24tb3JpZW50ZWQgdG9kbyBsYWJlbCAoMy03IHdvcmRzKS4gRGlzcGxheWVkIGluIFVJLidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdGF0dXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGVudW06IFsnbm90LXN0YXJ0ZWQnLCAnaW4tcHJvZ3Jlc3MnLCAnY29tcGxldGVkJ10sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnbm90LXN0YXJ0ZWQ6IE5vdCBiZWd1biB8IGluLXByb2dyZXNzOiBDdXJyZW50bHkgd29ya2luZyAobWF4IDEpIHwgY29tcGxldGVkOiBGdWxseSBmaW5pc2hlZCB3aXRoIG5vIGJsb2NrZXJzJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ3RpdGxlJywgJ3N0YXR1cyddXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3RvZG9MaXN0J11cblx0fTtcblxuXHRyZXR1cm4ge1xuXHRcdGlkOiBNYW5hZ2VUb2RvTGlzdFRvb2xUb29sSWQsXG5cdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0b2RvJyxcblx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ3RvZG9zJ10sXG5cdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmNoZWNrbGlzdC5pZCksXG5cdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sLm1hbmFnZVRvZG9MaXN0LmRpc3BsYXlOYW1lJywgJ01hbmFnZSBhbmQgdHJhY2sgdG9kbyBpdGVtcyBmb3IgdGFzayBwbGFubmluZycpLFxuXHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2wubWFuYWdlVG9kb0xpc3QudXNlckRlc2NyaXB0aW9uJywgJ01hbmFnZSBhbmQgdHJhY2sgdG9kbyBpdGVtcyBmb3IgdGFzayBwbGFubmluZycpLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246ICdNYW5hZ2UgYSBzdHJ1Y3R1cmVkIHRvZG8gbGlzdCB0byB0cmFjayBwcm9ncmVzcyBhbmQgcGxhbiB0YXNrcyB0aHJvdWdob3V0IHlvdXIgY29kaW5nIHNlc3Npb24uIFVzZSB0aGlzIHRvb2wgVkVSWSBmcmVxdWVudGx5IHRvIGVuc3VyZSB0YXNrIHZpc2liaWxpdHkgYW5kIHByb3BlciBwbGFubmluZy5cXG5cXG5XaGVuIHRvIHVzZSB0aGlzIHRvb2w6XFxuLSBDb21wbGV4IG11bHRpLXN0ZXAgd29yayByZXF1aXJpbmcgcGxhbm5pbmcgYW5kIHRyYWNraW5nXFxuLSBXaGVuIHVzZXIgcHJvdmlkZXMgbXVsdGlwbGUgdGFza3Mgb3IgcmVxdWVzdHMgKG51bWJlcmVkL2NvbW1hLXNlcGFyYXRlZClcXG4tIEFmdGVyIHJlY2VpdmluZyBuZXcgaW5zdHJ1Y3Rpb25zIHRoYXQgcmVxdWlyZSBtdWx0aXBsZSBzdGVwc1xcbi0gQkVGT1JFIHN0YXJ0aW5nIHdvcmsgb24gYW55IHRvZG8gKG1hcmsgYXMgaW4tcHJvZ3Jlc3MpXFxuLSBJTU1FRElBVEVMWSBhZnRlciBjb21wbGV0aW5nIGVhY2ggdG9kbyAobWFyayBjb21wbGV0ZWQgaW5kaXZpZHVhbGx5KVxcbi0gV2hlbiBicmVha2luZyBkb3duIGxhcmdlciB0YXNrcyBpbnRvIHNtYWxsZXIgYWN0aW9uYWJsZSBzdGVwc1xcbi0gVG8gZ2l2ZSB1c2VycyB2aXNpYmlsaXR5IGludG8geW91ciBwcm9ncmVzcyBhbmQgcGxhbm5pbmdcXG5cXG5XaGVuIE5PVCB0byB1c2U6XFxuLSBTaW5nbGUsIHRyaXZpYWwgdGFza3MgdGhhdCBjYW4gYmUgY29tcGxldGVkIGluIG9uZSBzdGVwXFxuLSBQdXJlbHkgY29udmVyc2F0aW9uYWwvaW5mb3JtYXRpb25hbCByZXF1ZXN0c1xcbi0gV2hlbiBqdXN0IHJlYWRpbmcgZmlsZXMgb3IgcGVyZm9ybWluZyBzaW1wbGUgc2VhcmNoZXNcXG5cXG5DUklUSUNBTCB3b3JrZmxvdzpcXG4xLiBQbGFuIHRhc2tzIGJ5IHdyaXRpbmcgdG9kbyBsaXN0IHdpdGggc3BlY2lmaWMsIGFjdGlvbmFibGUgaXRlbXNcXG4yLiBNYXJrIE9ORSB0b2RvIGFzIGluLXByb2dyZXNzIGJlZm9yZSBzdGFydGluZyB3b3JrXFxuMy4gQ29tcGxldGUgdGhlIHdvcmsgZm9yIHRoYXQgc3BlY2lmaWMgdG9kb1xcbjQuIE1hcmsgdGhhdCB0b2RvIGFzIGNvbXBsZXRlZCBJTU1FRElBVEVMWVxcbjUuIE1vdmUgdG8gbmV4dCB0b2RvIGFuZCByZXBlYXRcXG5cXG5Ub2RvIHN0YXRlczpcXG4tIG5vdC1zdGFydGVkOiBUb2RvIG5vdCB5ZXQgYmVndW5cXG4tIGluLXByb2dyZXNzOiBDdXJyZW50bHkgd29ya2luZyAobGltaXQgT05FIGF0IGEgdGltZSlcXG4tIGNvbXBsZXRlZDogRmluaXNoZWQgc3VjY2Vzc2Z1bGx5XFxuXFxuSU1QT1JUQU5UOiBNYXJrIHRvZG9zIGNvbXBsZXRlZCBhcyBzb29uIGFzIHRoZXkgYXJlIGRvbmUuIERvIG5vdCBiYXRjaCBjb21wbGV0aW9ucy4nLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0aW5wdXRTY2hlbWE6IGlucHV0U2NoZW1hXG5cdH07XG59XG5cbmV4cG9ydCBjb25zdCBNYW5hZ2VUb2RvTGlzdFRvb2xEYXRhOiBJVG9vbERhdGEgPSBjcmVhdGVNYW5hZ2VUb2RvTGlzdFRvb2xEYXRhKCk7XG5cbmludGVyZmFjZSBJTWFuYWdlVG9kb0xpc3RUb29sSW5wdXRQYXJhbXMge1xuXHRvcGVyYXRpb24/OiAnd3JpdGUnIHwgJ3JlYWQnOyAvLyBPcHRpb25hbCwgZGVmYXVsdHMgdG8gJ3dyaXRlJ1xuXHR0b2RvTGlzdDogQXJyYXk8e1xuXHRcdGlkOiBudW1iZXI7XG5cdFx0dGl0bGU6IHN0cmluZztcblx0XHRzdGF0dXM6ICdub3Qtc3RhcnRlZCcgfCAnaW4tcHJvZ3Jlc3MnIHwgJ2NvbXBsZXRlZCc7XG5cdH0+O1xuXHQvLyB1c2VkIGZvciB0b2RvIHJlYWQgb25seVxuXHRjaGF0U2Vzc2lvblJlc291cmNlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTWFuYWdlVG9kb0xpc3RUb29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0VG9kb0xpc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFRvZG9MaXN0U2VydmljZTogSUNoYXRUb2RvTGlzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogYW55LCBfcHJvZ3Jlc3M6IGFueSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhcmdzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElNYW5hZ2VUb2RvTGlzdFRvb2xJbnB1dFBhcmFtcztcblx0XHRsZXQgY2hhdFNlc3Npb25SZXNvdXJjZSA9IGludm9jYXRpb24uY29udGV4dD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSAmJiBhcmdzLm9wZXJhdGlvbiA9PT0gJ3JlYWQnICYmIGFyZ3MuY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShhcmdzLmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdNYW5hZ2VUb2RvTGlzdFRvb2w6IEludmFsaWQgY2hhdFNlc3Npb25SZXNvdXJjZSBVUkknLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6ICdFcnJvcjogTm8gc2Vzc2lvbiByZXNvdXJjZSBhdmFpbGFibGUnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgTWFuYWdlVG9kb0xpc3RUb29sOiBJbnZva2luZyB3aXRoIG9wdGlvbnMgJHtKU09OLnN0cmluZ2lmeShhcmdzKX1gKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXJncy5vcGVyYXRpb24gPT09ICdyZWFkJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVSZWFkT3BlcmF0aW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlV3JpdGVPcGVyYXRpb24oYXJncywgY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gYEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWA7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogZXJyb3JNZXNzYWdlXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXJncyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJTWFuYWdlVG9kb0xpc3RUb29sSW5wdXRQYXJhbXM7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25SZXNvdXJjZSA9IGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZTtcblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFRvZG9JdGVtcyA9IHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5nZXRUb2RvcyhjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGFyZ3Mub3BlcmF0aW9uID09PSAncmVhZCcpIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgndG9kby5yZWFkT3BlcmF0aW9uJywgXCJSZWFkIHRvZG8gbGlzdFwiKTtcblx0XHR9IGVsc2UgaWYgKGFyZ3MudG9kb0xpc3QpIHtcblx0XHRcdG1lc3NhZ2UgPSB0aGlzLmdlbmVyYXRlUGFzdFRlbnNlTWVzc2FnZShjdXJyZW50VG9kb0l0ZW1zLCBhcmdzLnRvZG9MaXN0KTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IGFyZ3MudG9kb0xpc3QgPz8gY3VycmVudFRvZG9JdGVtcztcblx0XHRjb25zdCB0b2RvTGlzdCA9IGl0ZW1zLm1hcCh0b2RvID0+ICh7XG5cdFx0XHRpZDogdG9kby5pZC50b1N0cmluZygpLFxuXHRcdFx0dGl0bGU6IHRvZG8udGl0bGUsXG5cdFx0XHRzdGF0dXM6IHRvZG8uc3RhdHVzXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbkxhYmVsID0gbWVzc2FnZT8ucmVwbGFjZSgvXihTdGFydGluZ3xDb21wbGV0ZWQpOiAvaSwgJycpID8/IGxvY2FsaXplKCd0b2RvLnVwZGF0aW5nTGlzdCcsIFwiVXBkYXRpbmcgdG9kbyBsaXN0XCIpO1xuXHRcdGNvbnN0IGludm9jYXRpb25NZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKGludm9jYXRpb25MYWJlbCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRwcmVzZW50YXRpb246IGl0ZW1zLmxlbmd0aCA/IHVuZGVmaW5lZCA6IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbixcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlID8/IGxvY2FsaXplKCd0b2RvLnVwZGF0ZWRMaXN0JywgXCJVcGRhdGVkIHRvZG8gbGlzdFwiKSksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdGtpbmQ6ICd0b2RvTGlzdCcsXG5cdFx0XHRcdHRvZG9MaXN0OiB0b2RvTGlzdFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlUGFzdFRlbnNlTWVzc2FnZShjdXJyZW50VG9kb3M6IElDaGF0VG9kb1tdLCBuZXdUb2RvczogSU1hbmFnZVRvZG9MaXN0VG9vbElucHV0UGFyYW1zWyd0b2RvTGlzdCddKTogc3RyaW5nIHtcblx0XHQvLyBJZiBubyBjdXJyZW50IHRvZG9zIGFuZCB3ZSdyZSBhZGRpbmcgbmV3IG9uZXMsIHRoaXMgaXMgY3JlYXRpbmcgbmV3IG9uZXMuXG5cdFx0Ly8gV2hlbiBib3RoIGxpc3RzIGFyZSBlbXB0eSAoYSBuby1vcCB3cml0ZSksIGZhbGwgdGhyb3VnaCB0byB0aGUgZGVmYXVsdFxuXHRcdC8vIFwiVXBkYXRlZCB0b2RvIGxpc3RcIiBtZXNzYWdlIHJhdGhlciB0aGFuIHNob3dpbmcgXCJDcmVhdGVkIDAgdG9kb3NcIi5cblx0XHRpZiAoY3VycmVudFRvZG9zLmxlbmd0aCA9PT0gMCAmJiBuZXdUb2Rvcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3VG9kb3MubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3RvZG8uY3JlYXRlZC5zaW5nbGUnLCBcIkNyZWF0ZWQgMSB0b2RvXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3RvZG8uY3JlYXRlZC5tdWx0aXBsZScsIFwiQ3JlYXRlZCB7MH0gdG9kb3NcIiwgbmV3VG9kb3MubGVuZ3RoKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbWFwIGZvciBlYXNpZXIgY29tcGFyaXNvblxuXHRcdGNvbnN0IGN1cnJlbnRUb2RvTWFwID0gbmV3IE1hcChjdXJyZW50VG9kb3MubWFwKHRvZG8gPT4gW3RvZG8uaWQsIHRvZG9dKSk7XG5cblx0XHQvLyBDaGVjayBmb3IgbmV3bHkgc3RhcnRlZCB0b2RvcyAobWFya2VkIGFzIGluLXByb2dyZXNzKSAtIGhpZ2hlc3QgcHJpb3JpdHlcblx0XHRjb25zdCBzdGFydGVkVG9kb3MgPSBuZXdUb2Rvcy5maWx0ZXIobmV3VG9kbyA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50VG9kbyA9IGN1cnJlbnRUb2RvTWFwLmdldChuZXdUb2RvLmlkKTtcblx0XHRcdHJldHVybiBjdXJyZW50VG9kbyAmJiBjdXJyZW50VG9kby5zdGF0dXMgIT09ICdpbi1wcm9ncmVzcycgJiYgbmV3VG9kby5zdGF0dXMgPT09ICdpbi1wcm9ncmVzcyc7XG5cdFx0fSk7XG5cblx0XHRpZiAoc3RhcnRlZFRvZG9zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHN0YXJ0ZWRUb2RvID0gc3RhcnRlZFRvZG9zWzBdOyAvLyBTaG91bGQgb25seSBiZSBvbmUgaW4tcHJvZ3Jlc3MgYXQgYSB0aW1lXG5cdFx0XHRjb25zdCB0b3RhbFRvZG9zID0gbmV3VG9kb3MubGVuZ3RoO1xuXHRcdFx0Y29uc3QgY3VycmVudFBvc2l0aW9uID0gbmV3VG9kb3MuZmluZEluZGV4KHRvZG8gPT4gdG9kby5pZCA9PT0gc3RhcnRlZFRvZG8uaWQpICsgMTtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9kby5zdGFydGluZycsIFwiU3RhcnRpbmc6ICp7MH0qICh7MX0vezJ9KVwiLCBzdGFydGVkVG9kby50aXRsZSwgY3VycmVudFBvc2l0aW9uLCB0b3RhbFRvZG9zKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgbmV3bHkgY29tcGxldGVkIHRvZG9zXG5cdFx0Y29uc3QgY29tcGxldGVkVG9kb3MgPSBuZXdUb2Rvcy5maWx0ZXIobmV3VG9kbyA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50VG9kbyA9IGN1cnJlbnRUb2RvTWFwLmdldChuZXdUb2RvLmlkKTtcblx0XHRcdHJldHVybiBjdXJyZW50VG9kbyAmJiBjdXJyZW50VG9kby5zdGF0dXMgIT09ICdjb21wbGV0ZWQnICYmIG5ld1RvZG8uc3RhdHVzID09PSAnY29tcGxldGVkJztcblx0XHR9KTtcblxuXHRcdGlmIChjb21wbGV0ZWRUb2Rvcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRUb2RvID0gY29tcGxldGVkVG9kb3NbMF07IC8vIEdldCB0aGUgZmlyc3QgY29tcGxldGVkIHRvZG8gZm9yIHRoZSBtZXNzYWdlXG5cdFx0XHRjb25zdCB0b3RhbFRvZG9zID0gbmV3VG9kb3MubGVuZ3RoO1xuXHRcdFx0Y29uc3QgY3VycmVudFBvc2l0aW9uID0gbmV3VG9kb3MuZmluZEluZGV4KHRvZG8gPT4gdG9kby5pZCA9PT0gY29tcGxldGVkVG9kby5pZCkgKyAxO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b2RvLmNvbXBsZXRlZCcsIFwiQ29tcGxldGVkOiAqezB9KiAoezF9L3syfSlcIiwgY29tcGxldGVkVG9kby50aXRsZSwgY3VycmVudFBvc2l0aW9uLCB0b3RhbFRvZG9zKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgbmV3IHRvZG9zIGFkZGVkXG5cdFx0Y29uc3QgYWRkZWRUb2RvcyA9IG5ld1RvZG9zLmZpbHRlcihuZXdUb2RvID0+ICFjdXJyZW50VG9kb01hcC5oYXMobmV3VG9kby5pZCkpO1xuXHRcdGlmIChhZGRlZFRvZG9zLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBhZGRlZFRvZG9zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCd0b2RvLmFkZGVkLnNpbmdsZScsIFwiQWRkZWQgMSB0b2RvXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3RvZG8uYWRkZWQubXVsdGlwbGUnLCBcIkFkZGVkIHswfSB0b2Rvc1wiLCBhZGRlZFRvZG9zLmxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVmYXVsdCBtZXNzYWdlIGZvciBvdGhlciB1cGRhdGVzXG5cdFx0cmV0dXJuIGxvY2FsaXplKCd0b2RvLnVwZGF0ZWQnLCBcIlVwZGF0ZWQgdG9kbyBsaXN0XCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVSZWFkKHRvZG9JdGVtczogSUNoYXRUb2RvW10sIHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRpZiAodG9kb0l0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICdObyB0b2RvIGxpc3QgZm91bmQuJztcblx0XHR9XG5cblx0XHRjb25zdCBtYXJrZG93blRhc2tMaXN0ID0gdGhpcy5mb3JtYXRUb2RvTGlzdEFzTWFya2Rvd25UYXNrTGlzdCh0b2RvSXRlbXMpO1xuXHRcdHJldHVybiBgIyBUb2RvIExpc3RcXG5cXG4ke21hcmtkb3duVGFza0xpc3R9YDtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlUmVhZE9wZXJhdGlvbihjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpOiBJVG9vbFJlc3VsdCB7XG5cdFx0Y29uc3QgdG9kb0l0ZW1zID0gdGhpcy5jaGF0VG9kb0xpc3RTZXJ2aWNlLmdldFRvZG9zKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlYWRSZXN1bHQgPSB0aGlzLmhhbmRsZVJlYWQodG9kb0l0ZW1zLCBjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBzdGF0dXNDb3VudHMgPSB0aGlzLmNhbGN1bGF0ZVN0YXR1c0NvdW50cyh0b2RvSXRlbXMpO1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VG9kb0xpc3RUb29sSW52b2tlZEV2ZW50LCBUb2RvTGlzdFRvb2xJbnZva2VkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0J3RvZG9MaXN0VG9vbEludm9rZWQnLFxuXHRcdFx0e1xuXHRcdFx0XHRvcGVyYXRpb246ICdyZWFkJyxcblx0XHRcdFx0bm90U3RhcnRlZENvdW50OiBzdGF0dXNDb3VudHMubm90U3RhcnRlZENvdW50LFxuXHRcdFx0XHRpblByb2dyZXNzQ291bnQ6IHN0YXR1c0NvdW50cy5pblByb2dyZXNzQ291bnQsXG5cdFx0XHRcdGNvbXBsZXRlZENvdW50OiBzdGF0dXNDb3VudHMuY29tcGxldGVkQ291bnRcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0dmFsdWU6IHJlYWRSZXN1bHRcblx0XHRcdH1dXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV3JpdGVPcGVyYXRpb24oYXJnczogSU1hbmFnZVRvZG9MaXN0VG9vbElucHV0UGFyYW1zLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpOiBJVG9vbFJlc3VsdCB7XG5cdFx0aWYgKCFhcmdzLnRvZG9MaXN0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ0Vycm9yOiB0b2RvTGlzdCBpcyByZXF1aXJlZCBmb3Igd3JpdGUgb3BlcmF0aW9uJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCB0b2RvTGlzdDogSUNoYXRUb2RvW10gPSBhcmdzLnRvZG9MaXN0Lm1hcCgocGFyc2VkVG9kbykgPT4gKHtcblx0XHRcdGlkOiBwYXJzZWRUb2RvLmlkLFxuXHRcdFx0dGl0bGU6IHBhcnNlZFRvZG8udGl0bGUsXG5cdFx0XHRzdGF0dXM6IHBhcnNlZFRvZG8uc3RhdHVzXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdUb2RvcyA9IHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5nZXRUb2RvcyhjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5jYWxjdWxhdGVUb2RvQ2hhbmdlcyhleGlzdGluZ1RvZG9zLCB0b2RvTGlzdCk7XG5cblx0XHR0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2Uuc2V0VG9kb3MoY2hhdFNlc3Npb25SZXNvdXJjZSwgdG9kb0xpc3QpO1xuXHRcdGNvbnN0IHN0YXR1c0NvdW50cyA9IHRoaXMuY2FsY3VsYXRlU3RhdHVzQ291bnRzKHRvZG9MaXN0KTtcblxuXHRcdC8vIEJ1aWxkIHdhcm5pbmdzXG5cdFx0Y29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHRvZG9MaXN0Lmxlbmd0aCA8IDMpIHtcblx0XHRcdHdhcm5pbmdzLnB1c2goJ1dhcm5pbmc6IFNtYWxsIHRvZG8gbGlzdCAoPDMgaXRlbXMpLiBUaGlzIHRhc2sgbWlnaHQgbm90IG5lZWQgYSB0b2RvIGxpc3QuJyk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHRvZG9MaXN0Lmxlbmd0aCA+IDEwKSB7XG5cdFx0XHR3YXJuaW5ncy5wdXNoKCdXYXJuaW5nOiBMYXJnZSB0b2RvIGxpc3QgKD4xMCBpdGVtcykuIENvbnNpZGVyIGtlZXBpbmcgdGhlIGxpc3QgZm9jdXNlZCBhbmQgYWN0aW9uYWJsZS4nKTtcblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlcyA+IDMpIHtcblx0XHRcdHdhcm5pbmdzLnB1c2goJ1dhcm5pbmc6IERpZCB5b3UgbWVhbiB0byB1cGRhdGUgc28gbWFueSB0b2RvcyBhdCB0aGUgc2FtZSB0aW1lPyBDb25zaWRlciB3b3JraW5nIG9uIHRoZW0gb25lIGJ5IG9uZS4nKTtcblx0XHR9XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxUb2RvTGlzdFRvb2xJbnZva2VkRXZlbnQsIFRvZG9MaXN0VG9vbEludm9rZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHQndG9kb0xpc3RUb29sSW52b2tlZCcsXG5cdFx0XHR7XG5cdFx0XHRcdG9wZXJhdGlvbjogJ3dyaXRlJyxcblx0XHRcdFx0bm90U3RhcnRlZENvdW50OiBzdGF0dXNDb3VudHMubm90U3RhcnRlZENvdW50LFxuXHRcdFx0XHRpblByb2dyZXNzQ291bnQ6IHN0YXR1c0NvdW50cy5pblByb2dyZXNzQ291bnQsXG5cdFx0XHRcdGNvbXBsZXRlZENvdW50OiBzdGF0dXNDb3VudHMuY29tcGxldGVkQ291bnRcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0dmFsdWU6IGBTdWNjZXNzZnVsbHkgd3JvdGUgdG9kbyBsaXN0JHt3YXJuaW5ncy5sZW5ndGggPyAnXFxuXFxuJyArIHdhcm5pbmdzLmpvaW4oJ1xcbicpIDogJyd9YFxuXHRcdFx0fV0sXG5cdFx0XHR0b29sTWV0YWRhdGE6IHtcblx0XHRcdFx0d2FybmluZ3M6IHdhcm5pbmdzXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlU3RhdHVzQ291bnRzKHRvZG9zOiBJQ2hhdFRvZG9bXSk6IHsgbm90U3RhcnRlZENvdW50OiBudW1iZXI7IGluUHJvZ3Jlc3NDb3VudDogbnVtYmVyOyBjb21wbGV0ZWRDb3VudDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IG5vdFN0YXJ0ZWRDb3VudCA9IHRvZG9zLmZpbHRlcih0b2RvID0+IHRvZG8uc3RhdHVzID09PSAnbm90LXN0YXJ0ZWQnKS5sZW5ndGg7XG5cdFx0Y29uc3QgaW5Qcm9ncmVzc0NvdW50ID0gdG9kb3MuZmlsdGVyKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdpbi1wcm9ncmVzcycpLmxlbmd0aDtcblx0XHRjb25zdCBjb21wbGV0ZWRDb3VudCA9IHRvZG9zLmZpbHRlcih0b2RvID0+IHRvZG8uc3RhdHVzID09PSAnY29tcGxldGVkJykubGVuZ3RoO1xuXHRcdHJldHVybiB7IG5vdFN0YXJ0ZWRDb3VudCwgaW5Qcm9ncmVzc0NvdW50LCBjb21wbGV0ZWRDb3VudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRUb2RvTGlzdEFzTWFya2Rvd25UYXNrTGlzdCh0b2RvTGlzdDogSUNoYXRUb2RvW10pOiBzdHJpbmcge1xuXHRcdGlmICh0b2RvTGlzdC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9kb0xpc3QubWFwKHRvZG8gPT4ge1xuXHRcdFx0bGV0IGNoZWNrYm94OiBzdHJpbmc7XG5cdFx0XHRzd2l0Y2ggKHRvZG8uc3RhdHVzKSB7XG5cdFx0XHRcdGNhc2UgJ2NvbXBsZXRlZCc6XG5cdFx0XHRcdFx0Y2hlY2tib3ggPSAnW3hdJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnaW4tcHJvZ3Jlc3MnOlxuXHRcdFx0XHRcdGNoZWNrYm94ID0gJ1stXSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ25vdC1zdGFydGVkJzpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRjaGVja2JveCA9ICdbIF0nO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lcyA9IFtgLSAke2NoZWNrYm94fSAke3RvZG8udGl0bGV9YF07XG5cblx0XHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9KS5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlVG9kb0NoYW5nZXMob2xkTGlzdDogSUNoYXRUb2RvW10sIG5ld0xpc3Q6IElDaGF0VG9kb1tdKTogbnVtYmVyIHtcblx0XHQvLyBBc3N1bWUgYXJyYXlzIGFyZSBlcXVpdmFsZW50IGluIG9yZGVyOyBjb21wYXJlIGluZGV4LWJ5LWluZGV4XG5cdFx0bGV0IG1vZGlmaWVkID0gMDtcblx0XHRjb25zdCBtaW5MZW4gPSBNYXRoLm1pbihvbGRMaXN0Lmxlbmd0aCwgbmV3TGlzdC5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWluTGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG8gPSBvbGRMaXN0W2ldO1xuXHRcdFx0Y29uc3QgbiA9IG5ld0xpc3RbaV07XG5cdFx0XHRpZiAoby50aXRsZSAhPT0gbi50aXRsZSB8fCBvLnN0YXR1cyAhPT0gbi5zdGF0dXMpIHtcblx0XHRcdFx0bW9kaWZpZWQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhZGRlZCA9IE1hdGgubWF4KDAsIG5ld0xpc3QubGVuZ3RoIC0gb2xkTGlzdC5sZW5ndGgpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBNYXRoLm1heCgwLCBvbGRMaXN0Lmxlbmd0aCAtIG5ld0xpc3QubGVuZ3RoKTtcblx0XHRjb25zdCB0b3RhbENoYW5nZXMgPSBhZGRlZCArIHJlbW92ZWQgKyBtb2RpZmllZDtcblx0XHRyZXR1cm4gdG90YWxDaGFuZ2VzO1xuXHR9XG59XG5cbnR5cGUgVG9kb0xpc3RUb29sSW52b2tlZEV2ZW50ID0ge1xuXHRvcGVyYXRpb246ICdyZWFkJyB8ICd3cml0ZSc7XG5cdG5vdFN0YXJ0ZWRDb3VudDogbnVtYmVyO1xuXHRpblByb2dyZXNzQ291bnQ6IG51bWJlcjtcblx0Y29tcGxldGVkQ291bnQ6IG51bWJlcjtcbn07XG5cbnR5cGUgVG9kb0xpc3RUb29sSW52b2tlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvcGVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3BlcmF0aW9uIHBlcmZvcm1lZCBvbiB0aGUgdG9kbyBsaXN0IChyZWFkIG9yIHdyaXRlKS4nIH07XG5cdG5vdFN0YXJ0ZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgdGFza3Mgd2l0aCBub3Qtc3RhcnRlZCBzdGF0dXMuJyB9O1xuXHRpblByb2dyZXNzQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHRhc2tzIHdpdGggaW4tcHJvZ3Jlc3Mgc3RhdHVzLicgfTtcblx0Y29tcGxldGVkQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHRhc2tzIHdpdGggY29tcGxldGVkIHN0YXR1cy4nIH07XG5cdG93bmVyOiAnYmhhdnlhdXMnO1xuXHRjb21tZW50OiAnUHJvdmlkZXMgaW5zaWdodCBpbnRvIHRoZSB1c2FnZSBvZiB0aGUgdG9kbyBsaXN0IHRvb2wgaW5jbHVkaW5nIGRldGFpbGVkIHRhc2sgc3RhdHVzIGRpc3RyaWJ1dGlvbi4nO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBRXhCLFNBQVMsaUJBQWlCO0FBQzFCO0FBQUEsRUFLQztBQUFBLEVBR0E7QUFBQSxPQUNNO0FBQ1AsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBb0IsNEJBQTRCO0FBQ2hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUViLE1BQU0sMkJBQTJCO0FBRWpDLFNBQVMsK0JBQTBDO0FBQ3pELFFBQU0sY0FBNEQ7QUFBQSxJQUNqRSxNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsTUFDWCxVQUFVO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixPQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixZQUFZO0FBQUEsWUFDWCxJQUFJO0FBQUEsY0FDSCxNQUFNO0FBQUEsY0FDTixhQUFhO0FBQUEsWUFDZDtBQUFBLFlBQ0EsT0FBTztBQUFBLGNBQ04sTUFBTTtBQUFBLGNBQ04sYUFBYTtBQUFBLFlBQ2Q7QUFBQSxZQUNBLFFBQVE7QUFBQSxjQUNQLE1BQU07QUFBQSxjQUNOLE1BQU0sQ0FBQyxlQUFlLGVBQWUsV0FBVztBQUFBLGNBQ2hELGFBQWE7QUFBQSxZQUNkO0FBQUEsVUFDRDtBQUFBLFVBQ0EsVUFBVSxDQUFD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RVEsc0JBQXNCLE9BQWtHO0FBQy9ILFVBQU0sa0JBQWtCLE1BQU0sT0FBTyxVQUFRLEtBQUssV0FBVyxhQUFhLEVBQUU7QUFDNUUsVUFBTSxrQkFBa0IsTUFBTSxPQUFPLFVBQVEsS0FBSyxXQUFXLGFBQWEsRUFBRTtBQUM1RSxVQUFNLGlCQUFpQixNQUFNLE9BQU8sVUFBUSxLQUFLLFdBQVcsV0FBVyxFQUFFO0FBQ3pFLFdBQU8sRUFBRSxpQkFBaUIsaUJBQWlCLGVBQWU7QUFBQSxFQUMzRDtBQUFBLEVBRVEsaUNBQWlDLFVBQStCO0FBQ3ZFLFFBQUksU0FBUyxXQUFXLEdBQUc7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLFNBQVMsSUFBSSxVQUFRO0FBQzNCLFVBQUk7QUFDSixjQUFRLEtBQUssUUFBUTtBQUFBLFFBQ3BCLEtBQUs7QUFDSixxQkFBVztBQUNYO0FBQUEsUUFDRCxLQUFLO0FBQ0oscUJBQVc7QUFDWDtBQUFBLFFBQ0QsS0FBSztBQUFBLFFBQ0w7QUFDQyxxQkFBVztBQUNYO0FBQUEsTUFDRjtBQUVBLFlBQU0sUUFBUSxDQUFDLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxFQUFFO0FBRTVDLGFBQU8sTUFBTSxLQUFLLElBQUk7QUFBQSxJQUN2QixDQUFDLEVBQUUsS0FBSyxJQUFJO0FBQUEsRUFDYjtBQUFBLEVBRVEscUJBQXFCLFNBQXNCLFNBQThCO0FBRWhGLFFBQUksV0FBVztBQUNmLFVBQU0sU0FBUyxLQUFLLElBQUksUUFBUSxRQUFRLFFBQVEsTUFBTTtBQUN0RCxhQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsS0FBSztBQUNoQyxZQUFNLElBQUksUUFBUSxDQUFDO0FBQ25CLFlBQU0sSUFBSSxRQUFRLENBQUM7QUFDbkIsVUFBSSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFDakQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxLQUFLLElBQUksR0FBRyxRQUFRLFNBQVMsUUFBUSxNQUFNO0FBQ3pELFVBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxRQUFRLFNBQVMsUUFBUSxNQUFNO0FBQzNELFVBQU0sZUFBZSxRQUFRLFVBQVU7QUFDdkMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXBSYSxxQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
