import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { createTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { parseLanguageModelsProviderGroups } from "../../browser/languageModelsConfigurationService.js";
suite("LanguageModelsConfiguration", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("parseLanguageModelsConfiguration - empty", () => {
    const model = testDisposables.add(createTextModel("[]"));
    const result = parseLanguageModelsProviderGroups(model);
    assert.deepStrictEqual(result, []);
  });
  test("parseLanguageModelsConfiguration - simple", () => {
    const content = JSON.stringify([{
      vendor: "vendor",
      name: "group",
      configurations: []
    }], null, "	");
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "group");
    assert.strictEqual(result[0].vendor, "vendor");
    assert.ok(result[0].range);
  });
  test("parseLanguageModelsConfiguration - with configuration range", () => {
    const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": [
			{
				"configuration": {
					"foo": "bar"
				}
			}
		]
	}
]`;
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    const configurations = result[0].configurations;
    const config = configurations[0].configuration;
    assert.deepStrictEqual(config, { foo: "bar" });
  });
  test("parseLanguageModelsConfiguration - multiple vendors and groups", () => {
    const content = `[
	{ "vendor": "vendor1", "name": "g1", "configurations": [] },
	{ "vendor": "vendor1", "name": "g2", "configurations": [] },
	{ "vendor": "vendor2", "name": "g3", "configurations": [] }
]`;
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].name, "g1");
    assert.strictEqual(result[0].vendor, "vendor1");
    assert.strictEqual(result[1].name, "g2");
    assert.strictEqual(result[1].vendor, "vendor1");
    assert.strictEqual(result[2].name, "g3");
    assert.strictEqual(result[2].vendor, "vendor2");
  });
  test("parseLanguageModelsConfiguration - complex configuration values", () => {
    const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": [
			{
				"configuration": {
					"str": "value",
					"num": 123,
					"bool": true,
					"null": null,
					"arr": [1, 2],
					"obj": { "nested": "val" }
				}
			}
		]
	}
]`;
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    const configurations = result[0]?.configurations;
    const config = configurations[0].configuration;
    assert.strictEqual(config.str, "value");
    assert.strictEqual(config.num, 123);
    assert.strictEqual(config.bool, true);
    assert.strictEqual(config.null, null);
    assert.deepStrictEqual(config.arr, [1, 2]);
    assert.deepStrictEqual(config.obj, { nested: "val" });
  });
  test("parseLanguageModelsConfiguration - with comments", () => {
    const content = `[
	// This is a comment
	/* Block comment */
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": []
	}
]`;
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "group");
    assert.strictEqual(result[0].vendor, "vendor");
  });
  test("parseLanguageModelsConfiguration - ranges", () => {
    const content = `[
	{
		"vendor": "vendor",
		"name": "g1",
		"configurations": []
	},
	{
		"vendor": "vendor",
		"name": "g2",
		"configurations": []
	}
]`;
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    const g1 = result[0];
    const g2 = result[1];
    assert.ok(g1.range);
    assert.ok(g2.range);
    assert.strictEqual(g1.range.startLineNumber, 2);
    assert.strictEqual(g1.range.endLineNumber, 6);
    assert.strictEqual(g2.range.startLineNumber, 7);
    assert.strictEqual(g2.range.endLineNumber, 11);
  });
  test("parseLanguageModelsConfiguration - models range", () => {
    const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"models": [
			{ "id": "one" },
			{ "id": "two" }
		]
	}
]`;
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    assert.deepStrictEqual({
      startLineNumber: result[0].modelsRange?.startLineNumber,
      endLineNumber: result[0].modelsRange?.endLineNumber
    }, {
      startLineNumber: 5,
      endLineNumber: 8
    });
  });
  test("parseLanguageModelsConfiguration - empty models range", () => {
    const content = JSON.stringify([{
      vendor: "vendor",
      name: "group",
      models: []
    }], null, "	");
    const model = testDisposables.add(createTextModel(content));
    const result = parseLanguageModelsProviderGroups(model);
    assert.deepStrictEqual(result[0].modelsRange, {
      startLineNumber: 5,
      startColumn: 13,
      endLineNumber: 5,
      endColumn: 15
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBwYXJzZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgfSBmcm9tICcuLi8uLi9icm93c2VyL2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXJzZUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbiAtIGVtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoJ1tdJykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhtb2RlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24gLSBzaW1wbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KFt7XG5cdFx0XHR2ZW5kb3I6ICd2ZW5kb3InLFxuXHRcdFx0bmFtZTogJ2dyb3VwJyxcblx0XHRcdGNvbmZpZ3VyYXRpb25zOiBbXVxuXHRcdH1dLCBudWxsLCAnXFx0Jyk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdncm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0udmVuZG9yLCAndmVuZG9yJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdFswXS5yYW5nZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uIC0gd2l0aCBjb25maWd1cmF0aW9uIHJhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgW1xuXHR7XG5cdFx0XCJ2ZW5kb3JcIjogXCJ2ZW5kb3JcIixcblx0XHRcIm5hbWVcIjogXCJncm91cFwiLFxuXHRcdFwiY29uZmlndXJhdGlvbnNcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcImNvbmZpZ3VyYXRpb25cIjoge1xuXHRcdFx0XHRcdFwiZm9vXCI6IFwiYmFyXCJcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fVxuXWA7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKG1vZGVsKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25zID0gcmVzdWx0WzBdLmNvbmZpZ3VyYXRpb25zIGFzIHsgY29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25zWzBdLmNvbmZpZ3VyYXRpb247XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWcsIHsgZm9vOiAnYmFyJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24gLSBtdWx0aXBsZSB2ZW5kb3JzIGFuZCBncm91cHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGBbXG5cdHsgXCJ2ZW5kb3JcIjogXCJ2ZW5kb3IxXCIsIFwibmFtZVwiOiBcImcxXCIsIFwiY29uZmlndXJhdGlvbnNcIjogW10gfSxcblx0eyBcInZlbmRvclwiOiBcInZlbmRvcjFcIiwgXCJuYW1lXCI6IFwiZzJcIiwgXCJjb25maWd1cmF0aW9uc1wiOiBbXSB9LFxuXHR7IFwidmVuZG9yXCI6IFwidmVuZG9yMlwiLCBcIm5hbWVcIjogXCJnM1wiLCBcImNvbmZpZ3VyYXRpb25zXCI6IFtdIH1cbl1gO1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY29udGVudCkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhtb2RlbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5uYW1lLCAnZzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnZlbmRvciwgJ3ZlbmRvcjEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLm5hbWUsICdnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0udmVuZG9yLCAndmVuZG9yMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMl0ubmFtZSwgJ2czJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsyXS52ZW5kb3IsICd2ZW5kb3IyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uIC0gY29tcGxleCBjb25maWd1cmF0aW9uIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYFtcblx0e1xuXHRcdFwidmVuZG9yXCI6IFwidmVuZG9yXCIsXG5cdFx0XCJuYW1lXCI6IFwiZ3JvdXBcIixcblx0XHRcImNvbmZpZ3VyYXRpb25zXCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJjb25maWd1cmF0aW9uXCI6IHtcblx0XHRcdFx0XHRcInN0clwiOiBcInZhbHVlXCIsXG5cdFx0XHRcdFx0XCJudW1cIjogMTIzLFxuXHRcdFx0XHRcdFwiYm9vbFwiOiB0cnVlLFxuXHRcdFx0XHRcdFwibnVsbFwiOiBudWxsLFxuXHRcdFx0XHRcdFwiYXJyXCI6IFsxLCAyXSxcblx0XHRcdFx0XHRcIm9ialwiOiB7IFwibmVzdGVkXCI6IFwidmFsXCIgfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHR9XG5dYDtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNvbnRlbnQpKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMobW9kZWwpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbnMgPSByZXN1bHRbMF0/LmNvbmZpZ3VyYXRpb25zIGFzIHsgY29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25zWzBdLmNvbmZpZ3VyYXRpb247XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5zdHIsICd2YWx1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcubnVtLCAxMjMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuYm9vbCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5udWxsLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZy5hcnIsIFsxLCAyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWcub2JqLCB7IG5lc3RlZDogJ3ZhbCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uIC0gd2l0aCBjb21tZW50cycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYFtcblx0Ly8gVGhpcyBpcyBhIGNvbW1lbnRcblx0LyogQmxvY2sgY29tbWVudCAqL1xuXHR7XG5cdFx0XCJ2ZW5kb3JcIjogXCJ2ZW5kb3JcIixcblx0XHRcIm5hbWVcIjogXCJncm91cFwiLFxuXHRcdFwiY29uZmlndXJhdGlvbnNcIjogW11cblx0fVxuXWA7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdncm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0udmVuZG9yLCAndmVuZG9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uIC0gcmFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgW1xuXHR7XG5cdFx0XCJ2ZW5kb3JcIjogXCJ2ZW5kb3JcIixcblx0XHRcIm5hbWVcIjogXCJnMVwiLFxuXHRcdFwiY29uZmlndXJhdGlvbnNcIjogW11cblx0fSxcblx0e1xuXHRcdFwidmVuZG9yXCI6IFwidmVuZG9yXCIsXG5cdFx0XCJuYW1lXCI6IFwiZzJcIixcblx0XHRcImNvbmZpZ3VyYXRpb25zXCI6IFtdXG5cdH1cbl1gO1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY29udGVudCkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhtb2RlbCk7XG5cblx0XHRjb25zdCBnMSA9IHJlc3VsdFswXTtcblx0XHRjb25zdCBnMiA9IHJlc3VsdFsxXTtcblxuXHRcdGFzc2VydC5vayhnMS5yYW5nZSk7XG5cdFx0YXNzZXJ0Lm9rKGcyLnJhbmdlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZzEucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZzEucmFuZ2UuZW5kTGluZU51bWJlciwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGcyLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGcyLnJhbmdlLmVuZExpbmVOdW1iZXIsIDExKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24gLSBtb2RlbHMgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGBbXG5cdHtcblx0XHRcInZlbmRvclwiOiBcInZlbmRvclwiLFxuXHRcdFwibmFtZVwiOiBcImdyb3VwXCIsXG5cdFx0XCJtb2RlbHNcIjogW1xuXHRcdFx0eyBcImlkXCI6IFwib25lXCIgfSxcblx0XHRcdHsgXCJpZFwiOiBcInR3b1wiIH1cblx0XHRdXG5cdH1cbl1gO1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY29udGVudCkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhtb2RlbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogcmVzdWx0WzBdLm1vZGVsc1JhbmdlPy5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiByZXN1bHRbMF0ubW9kZWxzUmFuZ2U/LmVuZExpbmVOdW1iZXJcblx0XHR9LCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiA4XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uIC0gZW1wdHkgbW9kZWxzIHJhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShbe1xuXHRcdFx0dmVuZG9yOiAndmVuZG9yJyxcblx0XHRcdG5hbWU6ICdncm91cCcsXG5cdFx0XHRtb2RlbHM6IFtdXG5cdFx0fV0sIG51bGwsICdcXHQnKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNvbnRlbnQpKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0ubW9kZWxzUmFuZ2UsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNSxcblx0XHRcdHN0YXJ0Q29sdW1uOiAxMyxcblx0XHRcdGVuZExpbmVOdW1iZXI6IDUsXG5cdFx0XHRlbmRDb2x1bW46IDE1XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5Q0FBeUM7QUFFbEQsTUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxRQUFNLGtCQUFrQix3Q0FBd0M7QUFFaEUsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxVQUFNLFFBQVEsZ0JBQWdCLElBQUksZ0JBQWdCLElBQUksQ0FBQztBQUN2RCxVQUFNLFNBQVMsa0NBQWtDLEtBQUs7QUFDdEQsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsQyxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxVQUFNLFVBQVUsS0FBSyxVQUFVLENBQUM7QUFBQSxNQUMvQixRQUFRO0FBQUEsTUFDUixNQUFNO0FBQUEsTUFDTixnQkFBZ0IsQ0FBQztBQUFBLElBQ2xCLENBQUMsR0FBRyxNQUFNLEdBQUk7QUFDZCxVQUFNLFFBQVEsZ0JBQWdCLElBQUksZ0JBQWdCLE9BQU8sQ0FBQztBQUMxRCxVQUFNLFNBQVMsa0NBQWtDLEtBQUs7QUFFdEQsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLE9BQU87QUFDMUMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsUUFBUTtBQUM3QyxXQUFPLEdBQUcs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
