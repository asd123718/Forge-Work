import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { isCompatibleProtocolVersion, negotiateProtocolVersion } from "../../../../../common/state/protocol/version/negotiation.js";
suite("Protocol version negotiation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matrix of compatibility rules", () => {
    const cases = [
      // Exact match always works.
      ["0.1.0", "0.1.0", true],
      ["1.2.3", "1.2.3", true],
      // 0.x: minor must match; offered <= server.
      ["0.1.0", "0.1.5", true],
      ["0.1.5", "0.1.5", true],
      ["0.1.5", "0.1.0", false],
      ["0.2.0", "0.1.0", false],
      ["0.0.1", "0.1.0", false],
      // >=1.x: same major; offered <= server.
      ["1.0.0", "1.2.3", true],
      ["1.2.3", "1.0.0", false],
      ["2.0.0", "1.2.3", false],
      // Invalid versions: never compatible.
      ["not-a-version", "0.1.0", false],
      ["0.1.0", "0.1", false]
    ];
    const actual = cases.map(([offered, server, expected]) => ({
      offered,
      server,
      expected,
      got: isCompatibleProtocolVersion(offered, server)
    }));
    assert.deepStrictEqual(
      actual.filter((c) => c.got !== c.expected),
      [],
      "mismatched compatibility checks"
    );
  });
  test("negotiate picks the highest compatible offered version", () => {
    assert.strictEqual(negotiateProtocolVersion(["0.1.0", "0.1.2", "0.1.1"], "0.1.5"), "0.1.2");
    assert.strictEqual(negotiateProtocolVersion(["0.1.0", "0.2.0"], "0.1.0"), "0.1.0");
    assert.strictEqual(negotiateProtocolVersion(["0.0.5", "0.2.0"], "0.1.0"), void 0);
    assert.strictEqual(negotiateProtocolVersion([], "0.1.0"), void 0);
    assert.strictEqual(negotiateProtocolVersion(["0.1.2", "0.1.0"], "0.1.5"), "0.1.2");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHN0YXRlXFxwcm90b2NvbFxcdmVyc2lvblxcbmVnb3RpYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNDb21wYXRpYmxlUHJvdG9jb2xWZXJzaW9uLCBuZWdvdGlhdGVQcm90b2NvbFZlcnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9uZWdvdGlhdGlvbi5qcyc7XG5cbnN1aXRlKCdQcm90b2NvbCB2ZXJzaW9uIG5lZ290aWF0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRyaXggb2YgY29tcGF0aWJpbGl0eSBydWxlcycsICgpID0+IHtcblx0XHRjb25zdCBjYXNlczogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbc3RyaW5nLCBzdHJpbmcsIGJvb2xlYW5dPiA9IFtcblx0XHRcdC8vIEV4YWN0IG1hdGNoIGFsd2F5cyB3b3Jrcy5cblx0XHRcdFsnMC4xLjAnLCAnMC4xLjAnLCB0cnVlXSxcblx0XHRcdFsnMS4yLjMnLCAnMS4yLjMnLCB0cnVlXSxcblx0XHRcdC8vIDAueDogbWlub3IgbXVzdCBtYXRjaDsgb2ZmZXJlZCA8PSBzZXJ2ZXIuXG5cdFx0XHRbJzAuMS4wJywgJzAuMS41JywgdHJ1ZV0sXG5cdFx0XHRbJzAuMS41JywgJzAuMS41JywgdHJ1ZV0sXG5cdFx0XHRbJzAuMS41JywgJzAuMS4wJywgZmFsc2VdLFxuXHRcdFx0WycwLjIuMCcsICcwLjEuMCcsIGZhbHNlXSxcblx0XHRcdFsnMC4wLjEnLCAnMC4xLjAnLCBmYWxzZV0sXG5cdFx0XHQvLyA+PTEueDogc2FtZSBtYWpvcjsgb2ZmZXJlZCA8PSBzZXJ2ZXIuXG5cdFx0XHRbJzEuMC4wJywgJzEuMi4zJywgdHJ1ZV0sXG5cdFx0XHRbJzEuMi4zJywgJzEuMC4wJywgZmFsc2VdLFxuXHRcdFx0WycyLjAuMCcsICcxLjIuMycsIGZhbHNlXSxcblx0XHRcdC8vIEludmFsaWQgdmVyc2lvbnM6IG5ldmVyIGNvbXBhdGlibGUuXG5cdFx0XHRbJ25vdC1hLXZlcnNpb24nLCAnMC4xLjAnLCBmYWxzZV0sXG5cdFx0XHRbJzAuMS4wJywgJzAuMScsIGZhbHNlXSxcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGNhc2VzLm1hcCgoW29mZmVyZWQsIHNlcnZlciwgZXhwZWN0ZWRdKSA9PiAoe1xuXHRcdFx0b2ZmZXJlZCwgc2VydmVyLCBleHBlY3RlZCwgZ290OiBpc0NvbXBhdGlibGVQcm90b2NvbFZlcnNpb24ob2ZmZXJlZCwgc2VydmVyKSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGFjdHVhbC5maWx0ZXIoYyA9PiBjLmdvdCAhPT0gYy5leHBlY3RlZCksXG5cdFx0XHRbXSxcblx0XHRcdCdtaXNtYXRjaGVkIGNvbXBhdGliaWxpdHkgY2hlY2tzJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWdvdGlhdGUgcGlja3MgdGhlIGhpZ2hlc3QgY29tcGF0aWJsZSBvZmZlcmVkIHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lZ290aWF0ZVByb3RvY29sVmVyc2lvbihbJzAuMS4wJywgJzAuMS4yJywgJzAuMS4xJ10sICcwLjEuNScpLCAnMC4xLjInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmVnb3RpYXRlUHJvdG9jb2xWZXJzaW9uKFsnMC4xLjAnLCAnMC4yLjAnXSwgJzAuMS4wJyksICcwLjEuMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZWdvdGlhdGVQcm90b2NvbFZlcnNpb24oWycwLjAuNScsICcwLjIuMCddLCAnMC4xLjAnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmVnb3RpYXRlUHJvdG9jb2xWZXJzaW9uKFtdLCAnMC4xLjAnKSwgdW5kZWZpbmVkKTtcblx0XHQvLyBPcmRlciBvZiBvZmZlcmVkIHZlcnNpb25zIGRvZXMgbm90IGFmZmVjdCB0aGUgcmVzdWx0LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZWdvdGlhdGVQcm90b2NvbFZlcnNpb24oWycwLjEuMicsICcwLjEuMCddLCAnMC4xLjUnKSwgJzAuMS4yJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkIsZ0NBQWdDO0FBRXRFLE1BQU0sZ0NBQWdDLE1BQU07QUFDM0MsMENBQXdDO0FBRXhDLE9BQUssaUNBQWlDLE1BQU07QUFDM0MsVUFBTSxRQUEyRDtBQUFBO0FBQUEsTUFFaEUsQ0FBQyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQ3ZCLENBQUMsU0FBUyxTQUFTLElBQUk7QUFBQTtBQUFBLE1BRXZCLENBQUMsU0FBUyxTQUFTLElBQUk7QUFBQSxNQUN2QixDQUFDLFNBQVMsU0FBUyxJQUFJO0FBQUEsTUFDdkIsQ0FBQyxTQUFTLFNBQVMsS0FBSztBQUFBLE1BQ3hCLENBQUMsU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUN4QixDQUFDLFNBQVMsU0FBUyxLQUFLO0FBQUE7QUFBQSxNQUV4QixDQUFDLFNBQVMsU0FBUyxJQUFJO0FBQUEsTUFDdkIsQ0FBQyxTQUFTLFNBQVMsS0FBSztBQUFBLE1BQ3hCLENBQUMsU0FBUyxTQUFTLEtBQUs7QUFBQTtBQUFBLE1BRXhCLENBQUMsaUJBQWlCLFNBQVMsS0FBSztBQUFBLE1BQ2hDLENBQUMsU0FBUyxPQUFPLEtBQUs7QUFBQSxJQUN2QjtBQUNBLFVBQU0sU0FBUyxNQUFNLElBQUksQ0FBQyxDQUFDLFNBQVMsUUFBUSxRQUFRLE9BQU87QUFBQSxNQUMxRDtBQUFBLE1BQVM7QUFBQSxNQUFRO0FBQUEsTUFBVSxLQUFLLDRCQUE0QixTQUFTLE1BQU07QUFBQSxJQUM1RSxFQUFFO0FBQ0YsV0FBTztBQUFBLE1BQ04sT0FBTyxPQUFPLE9BQUssRUFBRSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQ3ZDLENBQUM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsV0FBTyxZQUFZLHlCQUF5QixDQUFDLFNBQVMsU0FBUyxPQUFPLEdBQUcsT0FBTyxHQUFHLE9BQU87QUFDMUYsV0FBTyxZQUFZLHlCQUF5QixDQUFDLFNBQVMsT0FBTyxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQ2pGLFdBQU8sWUFBWSx5QkFBeUIsQ0FBQyxTQUFTLE9BQU8sR0FBRyxPQUFPLEdBQUcsTUFBUztBQUNuRixXQUFPLFlBQVkseUJBQXlCLENBQUMsR0FBRyxPQUFPLEdBQUcsTUFBUztBQUVuRSxXQUFPLFlBQVkseUJBQXlCLENBQUMsU0FBUyxPQUFPLEdBQUcsT0FBTyxHQUFHLE9BQU87QUFBQSxFQUNsRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
