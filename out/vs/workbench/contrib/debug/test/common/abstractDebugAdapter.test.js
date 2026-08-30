import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockDebugAdapter } from "./mockDebug.js";
suite("Debug - AbstractDebugAdapter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("event ordering", () => {
    let adapter;
    let output;
    setup(() => {
      adapter = new MockDebugAdapter();
      output = [];
      adapter.onEvent((ev) => {
        output.push(ev.body.output);
        Promise.resolve().then(() => output.push("--end microtask--"));
      });
    });
    const evaluate = async (expression) => {
      await new Promise((resolve) => adapter.sendRequest("evaluate", { expression }, resolve));
      output.push(`=${expression}`);
      Promise.resolve().then(() => output.push("--end microtask--"));
    };
    test("inserts task boundary before response", async () => {
      await evaluate("before.foo");
      await timeout(0);
      assert.deepStrictEqual(output, ["before.foo", "--end microtask--", "=before.foo", "--end microtask--"]);
    });
    test("inserts task boundary after response", async () => {
      await evaluate("after.foo");
      await timeout(0);
      assert.deepStrictEqual(output, ["=after.foo", "--end microtask--", "after.foo", "--end microtask--"]);
    });
    test("does not insert boundaries between events", async () => {
      adapter.sendEventBody("output", { output: "a" });
      adapter.sendEventBody("output", { output: "b" });
      adapter.sendEventBody("output", { output: "c" });
      await timeout(0);
      assert.deepStrictEqual(output, ["a", "b", "c", "--end microtask--", "--end microtask--", "--end microtask--"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxjb21tb25cXGFic3RyYWN0RGVidWdBZGFwdGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNb2NrRGVidWdBZGFwdGVyIH0gZnJvbSAnLi9tb2NrRGVidWcuanMnO1xuXG5zdWl0ZSgnRGVidWcgLSBBYnN0cmFjdERlYnVnQWRhcHRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2V2ZW50IG9yZGVyaW5nJywgKCkgPT4ge1xuXHRcdGxldCBhZGFwdGVyOiBNb2NrRGVidWdBZGFwdGVyO1xuXHRcdGxldCBvdXRwdXQ6IHN0cmluZ1tdO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFkYXB0ZXIgPSBuZXcgTW9ja0RlYnVnQWRhcHRlcigpO1xuXHRcdFx0b3V0cHV0ID0gW107XG5cdFx0XHRhZGFwdGVyLm9uRXZlbnQoZXYgPT4ge1xuXHRcdFx0XHRvdXRwdXQucHVzaCgoZXYgYXMgRGVidWdQcm90b2NvbC5PdXRwdXRFdmVudCkuYm9keS5vdXRwdXQpO1xuXHRcdFx0XHRQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IG91dHB1dC5wdXNoKCctLWVuZCBtaWNyb3Rhc2stLScpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXZhbHVhdGUgPSBhc3luYyAoZXhwcmVzc2lvbjogc3RyaW5nKSA9PiB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGFkYXB0ZXIuc2VuZFJlcXVlc3QoJ2V2YWx1YXRlJywgeyBleHByZXNzaW9uIH0sIHJlc29sdmUpKTtcblx0XHRcdG91dHB1dC5wdXNoKGA9JHtleHByZXNzaW9ufWApO1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiBvdXRwdXQucHVzaCgnLS1lbmQgbWljcm90YXNrLS0nKSk7XG5cdFx0fTtcblxuXHRcdHRlc3QoJ2luc2VydHMgdGFzayBib3VuZGFyeSBiZWZvcmUgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBldmFsdWF0ZSgnYmVmb3JlLmZvbycpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdXRwdXQsIFsnYmVmb3JlLmZvbycsICctLWVuZCBtaWNyb3Rhc2stLScsICc9YmVmb3JlLmZvbycsICctLWVuZCBtaWNyb3Rhc2stLSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2VydHMgdGFzayBib3VuZGFyeSBhZnRlciByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGV2YWx1YXRlKCdhZnRlci5mb28nKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0cHV0LCBbJz1hZnRlci5mb28nLCAnLS1lbmQgbWljcm90YXNrLS0nLCAnYWZ0ZXIuZm9vJywgJy0tZW5kIG1pY3JvdGFzay0tJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgaW5zZXJ0IGJvdW5kYXJpZXMgYmV0d2VlbiBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhZGFwdGVyLnNlbmRFdmVudEJvZHkoJ291dHB1dCcsIHsgb3V0cHV0OiAnYScgfSk7XG5cdFx0XHRhZGFwdGVyLnNlbmRFdmVudEJvZHkoJ291dHB1dCcsIHsgb3V0cHV0OiAnYicgfSk7XG5cdFx0XHRhZGFwdGVyLnNlbmRFdmVudEJvZHkoJ291dHB1dCcsIHsgb3V0cHV0OiAnYycgfSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG91dHB1dCwgWydhJywgJ2InLCAnYycsICctLWVuZCBtaWNyb3Rhc2stLScsICctLWVuZCBtaWNyb3Rhc2stLScsICctLWVuZCBtaWNyb3Rhc2stLSddKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxnQ0FBZ0MsTUFBTTtBQUMzQywwQ0FBd0M7QUFFeEMsUUFBTSxrQkFBa0IsTUFBTTtBQUM3QixRQUFJO0FBQ0osUUFBSTtBQUNKLFVBQU0sTUFBTTtBQUNYLGdCQUFVLElBQUksaUJBQWlCO0FBQy9CLGVBQVMsQ0FBQztBQUNWLGNBQVEsUUFBUSxRQUFNO0FBQ3JCLGVBQU8sS0FBTSxHQUFpQyxLQUFLLE1BQU07QUFDekQsZ0JBQVEsUUFBUSxFQUFFLEtBQUssTUFBTSxPQUFPLEtBQUssbUJBQW1CLENBQUM7QUFBQSxNQUM5RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxXQUFXLE9BQU8sZUFBdUI7QUFDOUMsWUFBTSxJQUFJLFFBQVEsYUFBVyxRQUFRLFlBQVksWUFBWSxFQUFFLFdBQVcsR0FBRyxPQUFPLENBQUM7QUFDckYsYUFBTyxLQUFLLElBQUksVUFBVSxFQUFFO0FBQzVCLGNBQVEsUUFBUSxFQUFFLEtBQUssTUFBTSxPQUFPLEtBQUssbUJBQW1CLENBQUM7QUFBQSxJQUM5RDtBQUVBLFNBQUsseUNBQXlDLFlBQVk7QUFDekQsWUFBTSxTQUFTLFlBQVk7QUFDM0IsWUFBTSxRQUFRLENBQUM7QUFFZixhQUFPLGdCQUFnQixRQUFRLENBQUMsY0FBYyxxQkFBcUIsZUFBZSxtQkFBbUIsQ0FBQztBQUFBLElBQ3ZHLENBQUM7QUFFRCxTQUFLLHdDQUF3QyxZQUFZO0FBQ3hELFlBQU0sU0FBUyxXQUFXO0FBQzFCLFlBQU0sUUFBUSxDQUFDO0FBRWYsYUFBTyxnQkFBZ0IsUUFBUSxDQUFDLGNBQWMscUJBQXFCLGFBQWEsbUJBQW1CLENBQUM7QUFBQSxJQUNyRyxDQUFDO0FBRUQsU0FBSyw2Q0FBNkMsWUFBWTtBQUM3RCxjQUFRLGNBQWMsVUFBVSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQy9DLGNBQVEsY0FBYyxVQUFVLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFDL0MsY0FBUSxjQUFjLFVBQVUsRUFBRSxRQUFRLElBQUksQ0FBQztBQUMvQyxZQUFNLFFBQVEsQ0FBQztBQUVmLGFBQU8sZ0JBQWdCLFFBQVEsQ0FBQyxLQUFLLEtBQUssS0FBSyxxQkFBcUIscUJBQXFCLG1CQUFtQixDQUFDO0FBQUEsSUFDOUcsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
