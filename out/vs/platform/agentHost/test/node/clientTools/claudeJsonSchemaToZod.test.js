import assert from "assert";
import { z } from "zod";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { jsonSchemaToZodRawShape } from "../../../node/claude/clientTools/claudeJsonSchemaToZod.js";
function parse(shape, value) {
  return z.object(shape).safeParse(value);
}
suite("claudeJsonSchemaToZod", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty / undefined schema returns empty shape", () => {
    assert.deepStrictEqual(Object.keys(jsonSchemaToZodRawShape(void 0)), []);
    assert.deepStrictEqual(Object.keys(jsonSchemaToZodRawShape({ type: "object" })), []);
  });
  test("primitives + required vs optional wrapping", () => {
    const shape = jsonSchemaToZodRawShape({
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
        c: { type: "integer" },
        d: { type: "boolean" }
      },
      required: ["a"]
    });
    assert.strictEqual(parse(shape, { a: "x" }).success, true, "omitting optional props OK");
    assert.strictEqual(parse(shape, {}).success, false, "missing required a fails");
    assert.strictEqual(parse(shape, { a: "x", c: 1.5 }).success, false, "integer rejects float");
    assert.strictEqual(parse(shape, { a: "x", c: 1, b: 2, d: true }).success, true);
  });
  test("arrays + nested objects + enum + oneOf + null", () => {
    const shape = jsonSchemaToZodRawShape({
      type: "object",
      properties: {
        list: { type: "array", items: { type: "string" } },
        nested: {
          type: "object",
          properties: { inner: { type: "number" } },
          required: ["inner"]
        },
        color: { enum: ["red", "blue", "green"] },
        one: { enum: ["only"] },
        either: { oneOf: [{ type: "string" }, { type: "number" }] },
        nope: { type: "null" }
      },
      required: ["list", "nested", "color", "one", "either", "nope"]
    });
    const ok = parse(shape, {
      list: ["a", "b"],
      nested: { inner: 1 },
      color: "red",
      one: "only",
      either: "hi",
      nope: null
    });
    assert.strictEqual(ok.success, true);
    assert.strictEqual(parse(shape, { list: [1], nested: { inner: 1 }, color: "red", one: "only", either: "x", nope: null }).success, false, "array items typed");
    assert.strictEqual(parse(shape, { list: [], nested: { inner: 1 }, color: "purple", one: "only", either: "x", nope: null }).success, false, "enum rejects unknown");
    assert.strictEqual(parse(shape, { list: [], nested: { inner: 1 }, color: "red", one: "only", either: true, nope: null }).success, false, "oneOf rejects out-of-union");
  });
  test("nullable + description + default survive conversion", () => {
    const shape = jsonSchemaToZodRawShape({
      type: "object",
      properties: {
        n: { type: "string", nullable: true, description: "a thing", default: "d" }
      },
      required: ["n"]
    });
    assert.strictEqual(parse(shape, { n: null }).success, true, "nullable accepts null");
    assert.strictEqual(parse(shape, { n: "hi" }).success, true);
    assert.strictEqual(parse(shape, { n: 7 }).success, false);
    const withDefault = parse(shape, {});
    assert.strictEqual(withDefault.success, true, "default fills in missing");
    assert.strictEqual(withDefault.success && withDefault.data.n, "d");
  });
  test("unsupported property schema falls back to z.any() \u2014 never rejects the tool", () => {
    const shape = jsonSchemaToZodRawShape({
      type: "object",
      properties: {
        weird: { type: "totally-bogus" },
        worse: null
      },
      required: ["weird"]
    });
    assert.strictEqual(parse(shape, { weird: 42 }).success, true, "any accepts anything");
    assert.strictEqual(parse(shape, { weird: { nested: true }, worse: "also fine" }).success, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGllbnRUb29sc1xcY2xhdWRlSnNvblNjaGVtYVRvWm9kLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsganNvblNjaGVtYVRvWm9kUmF3U2hhcGUgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NsYXVkZS9jbGllbnRUb29scy9jbGF1ZGVKc29uU2NoZW1hVG9ab2QuanMnO1xuXG5mdW5jdGlvbiBwYXJzZShzaGFwZTogUmVjb3JkPHN0cmluZywgei5ab2RUeXBlQW55PiwgdmFsdWU6IHVua25vd24pIHtcblx0cmV0dXJuIHoub2JqZWN0KHNoYXBlKS5zYWZlUGFyc2UodmFsdWUpO1xufVxuXG5zdWl0ZSgnY2xhdWRlSnNvblNjaGVtYVRvWm9kJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtcHR5IC8gdW5kZWZpbmVkIHNjaGVtYSByZXR1cm5zIGVtcHR5IHNoYXBlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoanNvblNjaGVtYVRvWm9kUmF3U2hhcGUodW5kZWZpbmVkKSksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5rZXlzKGpzb25TY2hlbWFUb1pvZFJhd1NoYXBlKHsgdHlwZTogJ29iamVjdCcgfSkpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1pdGl2ZXMgKyByZXF1aXJlZCB2cyBvcHRpb25hbCB3cmFwcGluZycsICgpID0+IHtcblx0XHRjb25zdCBzaGFwZSA9IGpzb25TY2hlbWFUb1pvZFJhd1NoYXBlKHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRhOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGI6IHsgdHlwZTogJ251bWJlcicgfSxcblx0XHRcdFx0YzogeyB0eXBlOiAnaW50ZWdlcicgfSxcblx0XHRcdFx0ZDogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydhJ10sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlKHNoYXBlLCB7IGE6ICd4JyB9KS5zdWNjZXNzLCB0cnVlLCAnb21pdHRpbmcgb3B0aW9uYWwgcHJvcHMgT0snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2Uoc2hhcGUsIHt9KS5zdWNjZXNzLCBmYWxzZSwgJ21pc3NpbmcgcmVxdWlyZWQgYSBmYWlscycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZShzaGFwZSwgeyBhOiAneCcsIGM6IDEuNSB9KS5zdWNjZXNzLCBmYWxzZSwgJ2ludGVnZXIgcmVqZWN0cyBmbG9hdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZShzaGFwZSwgeyBhOiAneCcsIGM6IDEsIGI6IDIsIGQ6IHRydWUgfSkuc3VjY2VzcywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FycmF5cyArIG5lc3RlZCBvYmplY3RzICsgZW51bSArIG9uZU9mICsgbnVsbCcsICgpID0+IHtcblx0XHRjb25zdCBzaGFwZSA9IGpzb25TY2hlbWFUb1pvZFJhd1NoYXBlKHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRsaXN0OiB7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcblx0XHRcdFx0bmVzdGVkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczogeyBpbm5lcjogeyB0eXBlOiAnbnVtYmVyJyB9IH0sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaW5uZXInXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29sb3I6IHsgZW51bTogWydyZWQnLCAnYmx1ZScsICdncmVlbiddIH0sXG5cdFx0XHRcdG9uZTogeyBlbnVtOiBbJ29ubHknXSB9LFxuXHRcdFx0XHRlaXRoZXI6IHsgb25lT2Y6IFt7IHR5cGU6ICdzdHJpbmcnIH0sIHsgdHlwZTogJ251bWJlcicgfV0gfSxcblx0XHRcdFx0bm9wZTogeyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydsaXN0JywgJ25lc3RlZCcsICdjb2xvcicsICdvbmUnLCAnZWl0aGVyJywgJ25vcGUnXSxcblx0XHR9KTtcblx0XHRjb25zdCBvayA9IHBhcnNlKHNoYXBlLCB7XG5cdFx0XHRsaXN0OiBbJ2EnLCAnYiddLFxuXHRcdFx0bmVzdGVkOiB7IGlubmVyOiAxIH0sXG5cdFx0XHRjb2xvcjogJ3JlZCcsXG5cdFx0XHRvbmU6ICdvbmx5Jyxcblx0XHRcdGVpdGhlcjogJ2hpJyxcblx0XHRcdG5vcGU6IG51bGwsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9rLnN1Y2Nlc3MsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZShzaGFwZSwgeyBsaXN0OiBbMV0sIG5lc3RlZDogeyBpbm5lcjogMSB9LCBjb2xvcjogJ3JlZCcsIG9uZTogJ29ubHknLCBlaXRoZXI6ICd4Jywgbm9wZTogbnVsbCB9KS5zdWNjZXNzLCBmYWxzZSwgJ2FycmF5IGl0ZW1zIHR5cGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlKHNoYXBlLCB7IGxpc3Q6IFtdLCBuZXN0ZWQ6IHsgaW5uZXI6IDEgfSwgY29sb3I6ICdwdXJwbGUnLCBvbmU6ICdvbmx5JywgZWl0aGVyOiAneCcsIG5vcGU6IG51bGwgfSkuc3VjY2VzcywgZmFsc2UsICdlbnVtIHJlamVjdHMgdW5rbm93bicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZShzaGFwZSwgeyBsaXN0OiBbXSwgbmVzdGVkOiB7IGlubmVyOiAxIH0sIGNvbG9yOiAncmVkJywgb25lOiAnb25seScsIGVpdGhlcjogdHJ1ZSwgbm9wZTogbnVsbCB9KS5zdWNjZXNzLCBmYWxzZSwgJ29uZU9mIHJlamVjdHMgb3V0LW9mLXVuaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ251bGxhYmxlICsgZGVzY3JpcHRpb24gKyBkZWZhdWx0IHN1cnZpdmUgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzaGFwZSA9IGpzb25TY2hlbWFUb1pvZFJhd1NoYXBlKHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRuOiB7IHR5cGU6ICdzdHJpbmcnLCBudWxsYWJsZTogdHJ1ZSwgZGVzY3JpcHRpb246ICdhIHRoaW5nJywgZGVmYXVsdDogJ2QnIH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnbiddLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZShzaGFwZSwgeyBuOiBudWxsIH0pLnN1Y2Nlc3MsIHRydWUsICdudWxsYWJsZSBhY2NlcHRzIG51bGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2Uoc2hhcGUsIHsgbjogJ2hpJyB9KS5zdWNjZXNzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2Uoc2hhcGUsIHsgbjogNyB9KS5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0Y29uc3Qgd2l0aERlZmF1bHQgPSBwYXJzZShzaGFwZSwge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aXRoRGVmYXVsdC5zdWNjZXNzLCB0cnVlLCAnZGVmYXVsdCBmaWxscyBpbiBtaXNzaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpdGhEZWZhdWx0LnN1Y2Nlc3MgJiYgKHdpdGhEZWZhdWx0LmRhdGEgYXMgeyBuOiBzdHJpbmcgfSkubiwgJ2QnKTtcblx0fSk7XG5cblx0dGVzdCgndW5zdXBwb3J0ZWQgcHJvcGVydHkgc2NoZW1hIGZhbGxzIGJhY2sgdG8gei5hbnkoKSBcdTIwMTQgbmV2ZXIgcmVqZWN0cyB0aGUgdG9vbCcsICgpID0+IHtcblx0XHRjb25zdCBzaGFwZSA9IGpzb25TY2hlbWFUb1pvZFJhd1NoYXBlKHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHR3ZWlyZDogeyB0eXBlOiAndG90YWxseS1ib2d1cycgYXMgdW5rbm93biBhcyBzdHJpbmcgfSxcblx0XHRcdFx0d29yc2U6IG51bGwgYXMgdW5rbm93biBhcyBvYmplY3QsXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnd2VpcmQnXSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2Uoc2hhcGUsIHsgd2VpcmQ6IDQyIH0pLnN1Y2Nlc3MsIHRydWUsICdhbnkgYWNjZXB0cyBhbnl0aGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZShzaGFwZSwgeyB3ZWlyZDogeyBuZXN0ZWQ6IHRydWUgfSwgd29yc2U6ICdhbHNvIGZpbmUnIH0pLnN1Y2Nlc3MsIHRydWUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUztBQUNsQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLE1BQU0sT0FBcUMsT0FBZ0I7QUFDbkUsU0FBTyxFQUFFLE9BQU8sS0FBSyxFQUFFLFVBQVUsS0FBSztBQUN2QztBQUVBLE1BQU0seUJBQXlCLE1BQU07QUFFcEMsMENBQXdDO0FBRXhDLE9BQUssZ0RBQWdELE1BQU07QUFDMUQsV0FBTyxnQkFBZ0IsT0FBTyxLQUFLLHdCQUF3QixNQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDMUUsV0FBTyxnQkFBZ0IsT0FBTyxLQUFLLHdCQUF3QixFQUFFLE1BQU0sU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNwRixDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxVQUFNLFFBQVEsd0JBQXdCO0FBQUEsTUFDckMsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsR0FBRyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQ3BCLEdBQUcsRUFBRSxNQUFNLFNBQVM7QUFBQSxRQUNwQixHQUFHLEVBQUUsTUFBTSxVQUFVO0FBQUEsUUFDckIsR0FBRyxFQUFFLE1BQU0sVUFBVTtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxVQUFVLENBQUMsR0FBRztBQUFBLElBQ2YsQ0FBQztBQUNELFdBQU8sWUFBWSxNQUFNLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLFNBQVMsTUFBTSw0QkFBNEI7QUFDdkYsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDLENBQUMsRUFBRSxTQUFTLE9BQU8sMEJBQTBCO0FBQzlFLFdBQU8sWUFBWSxNQUFNLE9BQU8sRUFBRSxHQUFHLEtBQUssR0FBRyxJ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
