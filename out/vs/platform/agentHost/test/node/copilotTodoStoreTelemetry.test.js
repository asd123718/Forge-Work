import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getCopilotTodoStoreOperationData } from "../../node/copilot/copilotTodoStoreTelemetry.js";
suite("copilotTodoStoreTelemetry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("classifies SQL operation and target", () => {
    const query = (value) => ({ query: value });
    assert.deepStrictEqual({
      readTodos: getCopilotTodoStoreOperationData("sql", query("SELECT * FROM todos")),
      writeTodoDeps: getCopilotTodoStoreOperationData("sql", query("DELETE FROM todo_deps WHERE todo_id = 1")),
      readBoth: getCopilotTodoStoreOperationData("sql", query("SELECT * FROM todos JOIN todo_deps ON todo_deps.todo_id = todos.id")),
      mixedBoth: getCopilotTodoStoreOperationData("sql", query("INSERT INTO todos SELECT * FROM todo_deps")),
      readTodosWhileWritingElsewhere: getCopilotTodoStoreOperationData("sql", query("INSERT INTO archive SELECT * FROM todos")),
      writeTodosWhileReadingElsewhere: getCopilotTodoStoreOperationData("sql", query("INSERT INTO todos SELECT * FROM archive")),
      quotedAndQualified: getCopilotTodoStoreOperationData("sql", query('SELECT * FROM main."todos", [todo_deps]')),
      derivedTableAlias: getCopilotTodoStoreOperationData("sql", query("SELECT * FROM (SELECT * FROM files) AS todos")),
      tableNameInLiteral: getCopilotTodoStoreOperationData("sql", query("SELECT 'todos', 'todo_deps'")),
      tableNameInInsertedLiteral: getCopilotTodoStoreOperationData("sql", query("INSERT INTO files(name) VALUES ('todos')")),
      verbInLiteral: getCopilotTodoStoreOperationData("sql", query("SELECT * FROM todos WHERE title = 'update todo_deps'")),
      namesInComments: getCopilotTodoStoreOperationData("sql", query("SELECT * FROM files -- JOIN todos\n/* UPDATE todo_deps */")),
      unclassified: getCopilotTodoStoreOperationData("sql", query("PRAGMA table_info(todos)")),
      unrelatedSql: getCopilotTodoStoreOperationData("sql", query("SELECT * FROM files")),
      unrelatedTool: getCopilotTodoStoreOperationData("bash", { command: "echo todos" })
    }, {
      readTodos: {
        operation: "read",
        target: "todos"
      },
      writeTodoDeps: {
        operation: "write",
        target: "todo_deps"
      },
      readBoth: {
        operation: "read",
        target: "both"
      },
      mixedBoth: {
        operation: "mixed",
        target: "both"
      },
      readTodosWhileWritingElsewhere: {
        operation: "read",
        target: "todos"
      },
      writeTodosWhileReadingElsewhere: {
        operation: "write",
        target: "todos"
      },
      quotedAndQualified: {
        operation: "read",
        target: "both"
      },
      derivedTableAlias: void 0,
      tableNameInLiteral: void 0,
      tableNameInInsertedLiteral: void 0,
      verbInLiteral: {
        operation: "read",
        target: "todos"
      },
      namesInComments: void 0,
      unclassified: void 0,
      unrelatedSql: void 0,
      unrelatedTool: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90VG9kb1N0b3JlVGVsZW1ldHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldENvcGlsb3RUb2RvU3RvcmVPcGVyYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RUb2RvU3RvcmVUZWxlbWV0cnkuanMnO1xuXG5zdWl0ZSgnY29waWxvdFRvZG9TdG9yZVRlbGVtZXRyeScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2xhc3NpZmllcyBTUUwgb3BlcmF0aW9uIGFuZCB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcXVlcnkgPSAodmFsdWU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+ICh7IHF1ZXJ5OiB2YWx1ZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlYWRUb2RvczogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHRvZG9zJykpLFxuXHRcdFx0d3JpdGVUb2RvRGVwczogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdERUxFVEUgRlJPTSB0b2RvX2RlcHMgV0hFUkUgdG9kb19pZCA9IDEnKSksXG5cdFx0XHRyZWFkQm90aDogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHRvZG9zIEpPSU4gdG9kb19kZXBzIE9OIHRvZG9fZGVwcy50b2RvX2lkID0gdG9kb3MuaWQnKSksXG5cdFx0XHRtaXhlZEJvdGg6IGdldENvcGlsb3RUb2RvU3RvcmVPcGVyYXRpb25EYXRhKCdzcWwnLCBxdWVyeSgnSU5TRVJUIElOVE8gdG9kb3MgU0VMRUNUICogRlJPTSB0b2RvX2RlcHMnKSksXG5cdFx0XHRyZWFkVG9kb3NXaGlsZVdyaXRpbmdFbHNld2hlcmU6IGdldENvcGlsb3RUb2RvU3RvcmVPcGVyYXRpb25EYXRhKCdzcWwnLCBxdWVyeSgnSU5TRVJUIElOVE8gYXJjaGl2ZSBTRUxFQ1QgKiBGUk9NIHRvZG9zJykpLFxuXHRcdFx0d3JpdGVUb2Rvc1doaWxlUmVhZGluZ0Vsc2V3aGVyZTogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdJTlNFUlQgSU5UTyB0b2RvcyBTRUxFQ1QgKiBGUk9NIGFyY2hpdmUnKSksXG5cdFx0XHRxdW90ZWRBbmRRdWFsaWZpZWQ6IGdldENvcGlsb3RUb2RvU3RvcmVPcGVyYXRpb25EYXRhKCdzcWwnLCBxdWVyeSgnU0VMRUNUICogRlJPTSBtYWluLlwidG9kb3NcIiwgW3RvZG9fZGVwc10nKSksXG5cdFx0XHRkZXJpdmVkVGFibGVBbGlhczogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIChTRUxFQ1QgKiBGUk9NIGZpbGVzKSBBUyB0b2RvcycpKSxcblx0XHRcdHRhYmxlTmFtZUluTGl0ZXJhbDogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgXFwndG9kb3NcXCcsIFxcJ3RvZG9fZGVwc1xcJycpKSxcblx0XHRcdHRhYmxlTmFtZUluSW5zZXJ0ZWRMaXRlcmFsOiBnZXRDb3BpbG90VG9kb1N0b3JlT3BlcmF0aW9uRGF0YSgnc3FsJywgcXVlcnkoJ0lOU0VSVCBJTlRPIGZpbGVzKG5hbWUpIFZBTFVFUyAoXFwndG9kb3NcXCcpJykpLFxuXHRcdFx0dmVyYkluTGl0ZXJhbDogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHRvZG9zIFdIRVJFIHRpdGxlID0gXFwndXBkYXRlIHRvZG9fZGVwc1xcJycpKSxcblx0XHRcdG5hbWVzSW5Db21tZW50czogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIGZpbGVzIC0tIEpPSU4gdG9kb3NcXG4vKiBVUERBVEUgdG9kb19kZXBzICovJykpLFxuXHRcdFx0dW5jbGFzc2lmaWVkOiBnZXRDb3BpbG90VG9kb1N0b3JlT3BlcmF0aW9uRGF0YSgnc3FsJywgcXVlcnkoJ1BSQUdNQSB0YWJsZV9pbmZvKHRvZG9zKScpKSxcblx0XHRcdHVucmVsYXRlZFNxbDogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ3NxbCcsIHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIGZpbGVzJykpLFxuXHRcdFx0dW5yZWxhdGVkVG9vbDogZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEoJ2Jhc2gnLCB7IGNvbW1hbmQ6ICdlY2hvIHRvZG9zJyB9KSxcblx0XHR9LCB7XG5cdFx0XHRyZWFkVG9kb3M6IHtcblx0XHRcdFx0b3BlcmF0aW9uOiAncmVhZCcsXG5cdFx0XHRcdHRhcmdldDogJ3RvZG9zJyxcblx0XHRcdH0sXG5cdFx0XHR3cml0ZVRvZG9EZXBzOiB7XG5cdFx0XHRcdG9wZXJhdGlvbjogJ3dyaXRlJyxcblx0XHRcdFx0dGFyZ2V0OiAndG9kb19kZXBzJyxcblx0XHRcdH0sXG5cdFx0XHRyZWFkQm90aDoge1xuXHRcdFx0XHRvcGVyYXRpb246ICdyZWFkJyxcblx0XHRcdFx0dGFyZ2V0OiAnYm90aCcsXG5cdFx0XHR9LFxuXHRcdFx0bWl4ZWRCb3RoOiB7XG5cdFx0XHRcdG9wZXJhdGlvbjogJ21peGVkJyxcblx0XHRcdFx0dGFyZ2V0OiAnYm90aCcsXG5cdFx0XHR9LFxuXHRcdFx0cmVhZFRvZG9zV2hpbGVXcml0aW5nRWxzZXdoZXJlOiB7XG5cdFx0XHRcdG9wZXJhdGlvbjogJ3JlYWQnLFxuXHRcdFx0XHR0YXJnZXQ6ICd0b2RvcycsXG5cdFx0XHR9LFxuXHRcdFx0d3JpdGVUb2Rvc1doaWxlUmVhZGluZ0Vsc2V3aGVyZToge1xuXHRcdFx0XHRvcGVyYXRpb246ICd3cml0ZScsXG5cdFx0XHRcdHRhcmdldDogJ3RvZG9zJyxcblx0XHRcdH0sXG5cdFx0XHRxdW90ZWRBbmRRdWFsaWZpZWQ6IHtcblx0XHRcdFx0b3BlcmF0aW9uOiAncmVhZCcsXG5cdFx0XHRcdHRhcmdldDogJ2JvdGgnLFxuXHRcdFx0fSxcblx0XHRcdGRlcml2ZWRUYWJsZUFsaWFzOiB1bmRlZmluZWQsXG5cdFx0XHR0YWJsZU5hbWVJbkxpdGVyYWw6IHVuZGVmaW5lZCxcblx0XHRcdHRhYmxlTmFtZUluSW5zZXJ0ZWRMaXRlcmFsOiB1bmRlZmluZWQsXG5cdFx0XHR2ZXJiSW5MaXRlcmFsOiB7XG5cdFx0XHRcdG9wZXJhdGlvbjogJ3JlYWQnLFxuXHRcdFx0XHR0YXJnZXQ6ICd0b2RvcycsXG5cdFx0XHR9LFxuXHRcdFx0bmFtZXNJbkNvbW1lbnRzOiB1bmRlZmluZWQsXG5cdFx0XHR1bmNsYXNzaWZpZWQ6IHVuZGVmaW5lZCxcblx0XHRcdHVucmVsYXRlZFNxbDogdW5kZWZpbmVkLFxuXHRcdFx0dW5yZWxhdGVkVG9vbDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0NBQXdDO0FBRWpELE1BQU0sNkJBQTZCLE1BQU07QUFDeEMsMENBQXdDO0FBRXhDLE9BQUssdUNBQXVDLE1BQU07QUFDakQsVUFBTSxRQUFRLENBQUMsV0FBNEMsRUFBRSxPQUFPLE1BQU07QUFDMUUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixXQUFXLGlDQUFpQyxPQUFPLE1BQU0scUJBQXFCLENBQUM7QUFBQSxNQUMvRSxlQUFlLGlDQUFpQyxPQUFPLE1BQU0seUNBQXlDLENBQUM7QUFBQSxNQUN2RyxVQUFVLGlDQUFpQyxPQUFPLE1BQU0sb0VBQW9FLENBQUM7QUFBQSxNQUM3SCxXQUFXLGlDQUFpQyxPQUFPLE1BQU0sMkNBQTJDLENBQUM7QUFBQSxNQUNyRyxnQ0FBZ0MsaUNBQWlDLE9BQU8sTUFBTSx5Q0FBeUMsQ0FBQztBQUFBLE1BQ3hILGlDQUFpQyxpQ0FBaUMsT0FBTyxNQUFNLHlDQUF5QyxDQUFDO0FBQUEsTUFDekgsb0JBQW9CLGlDQUFpQyxPQUFPLE1BQU0seUNBQXlDLENBQUM7QUFBQSxNQUM1RyxtQkFBbUIsaUNBQWlDLE9BQU8sTUFBTSw4Q0FBOEMsQ0FBQztBQUFBLE1BQ2hILG9CQUFvQixpQ0FBaUMsT0FBTyxNQUFNLDZCQUFpQyxDQUFDO0FBQUEsTUFDcEcsNEJBQTRCLGlDQUFpQyxPQUFPLE1BQU0sMENBQTRDLENBQUM7QUFBQSxNQUN2SCxlQUFlLGlDQUFpQyxPQUFPLE1BQU0sc0RBQXdELENBQUM7QUFBQSxNQUN0SCxpQkFBaUIsaUNBQWlDLE9BQU8sTUFBTSwyREFBMkQsQ0FBQztBQUFBLE1BQzNILGNBQWMsaUNBQWlDLE9BQU8sTUFBTSwwQkFBMEIsQ0FBQztBQUFBLE1BQ3ZGLGNBQWMsaUNBQWlDLE9BQU8sTUFBTSxxQkFBcUIsQ0FBQztBQUFBLE1BQ2xGLGVBQWUsaUNBQWlDLFFBQVEsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUFBLElBQ2xGLEdBQUc7QUFBQSxNQUNGLFdBQVc7QUFBQSxRQUNWLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxlQUFlO0FBQUEsUUFDZCxXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLFdBQVc7QUFBQSxRQUNWLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxnQ0FBZ0M7QUFBQSxRQUMvQixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsaUNBQWlDO0FBQUEsUUFDaEMsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLG9CQUFvQjtBQUFBLFFBQ25CLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxtQkFBbUI7QUFBQSxNQUNuQixvQkFBb0I7QUFBQSxNQUNwQiw0QkFBNEI7QUFBQSxNQUM1QixlQUFlO0FBQUEsUUFDZCxXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsTUFDakIsY0FBYztBQUFBLE1BQ2QsY0FBYztBQUFBLE1BQ2QsZUFBZTtBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
