import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { GroupNameError, MAX_GROUP_NAME_BYTES, parseGroupName } from "../../../common/webPubSub/groups.js";
suite("WebPubSub - parseGroupName", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses a per-client broadcast lane", () => {
    const parsed = parseGroupName("user.u1.env.e1.client.c1.broadcast");
    assert.deepStrictEqual(parsed, { scope: "client", lane: "broadcast", uid: "u1", eid: "e1", cid: "c1" });
  });
  test("parses per-client to-host and to-client lanes", () => {
    assert.strictEqual(parseGroupName("user.u1.env.e1.client.c1.to-host").lane, "to-host");
    assert.strictEqual(parseGroupName("user.u1.env.e1.client.c1.to-client").lane, "to-client");
  });
  test("parses per-environment lanes", () => {
    for (const lane of ["root", "events", "lifecycle", "control", "ingest-ack"]) {
      const parsed = parseGroupName(`user.u1.env.e1.${lane}`);
      assert.deepStrictEqual(parsed, { scope: "env", lane, uid: "u1", eid: "e1" });
    }
  });
  test("enforces expected uid/eid/cid when provided", () => {
    assert.throws(() => parseGroupName("user.u1.env.e1.events", { expected: { uid: "u2" } }), GroupNameError);
    assert.throws(() => parseGroupName("user.u1.env.e1.events", { expected: { eid: "e2" } }), GroupNameError);
    assert.throws(() => parseGroupName("user.u1.env.e1.client.c1.broadcast", { expected: { cid: "c2" } }), GroupNameError);
    assert.strictEqual(parseGroupName("user.u1.env.e1.events", { expected: { uid: "u1", eid: "e1" } }).scope, "env");
  });
  test("rejects an empty name", () => {
    assert.throws(() => parseGroupName(""), GroupNameError);
  });
  test("rejects names with too few segments", () => {
    assert.throws(() => parseGroupName("user.u1.env.e1"), GroupNameError);
  });
  test("rejects a wrong leading segment", () => {
    assert.throws(() => parseGroupName("usr.u1.env.e1.events"), /expected first segment/);
  });
  test("rejects a wrong env segment", () => {
    assert.throws(() => parseGroupName("user.u1.envx.e1.events"), /third segment/);
  });
  test("rejects empty uid/eid/cid segments", () => {
    assert.throws(() => parseGroupName("user..env.e1.events"), /uid segment is empty/);
    assert.throws(() => parseGroupName("user.u1.env..events"), /eid segment is empty/);
    assert.throws(() => parseGroupName("user.u1.env.e1.client..broadcast"), /cid segment is empty/);
  });
  test("rejects identifier characters outside the portable opaque-id grammar", () => {
    assert.throws(() => parseGroupName("user.user@github.env.e1.events"), /opaque-id grammar/);
    assert.throws(() => parseGroupName("user.u1.env.e/1.events"), /opaque-id grammar/);
    assert.throws(() => parseGroupName("user.u1.env.e1.client.c:1.broadcast"), /opaque-id grammar/);
  });
  test("rejects unknown env lanes and multi-segment env lanes", () => {
    assert.throws(() => parseGroupName("user.u1.env.e1.bogus"), /unknown env lane/);
    assert.throws(() => parseGroupName("user.u1.env.e1.events.extra"), /single segment/);
  });
  test("rejects unknown client directions and trailing segments", () => {
    assert.throws(() => parseGroupName("user.u1.env.e1.client.c1.sideways"), /unknown client direction/);
    assert.throws(() => parseGroupName("user.u1.env.e1.client.c1.broadcast.extra"), /trailing segments/);
    assert.throws(() => parseGroupName("user.u1.env.e1.client.c1"), /client lane truncated/);
  });
  test("rejects names exceeding the byte cap", () => {
    const huge = `user.u1.env.${"e".repeat(MAX_GROUP_NAME_BYTES)}.events`;
    assert.throws(() => parseGroupName(huge), /exceeds/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHdlYlB1YlN1YlxcZ3JvdXBzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEdyb3VwTmFtZUVycm9yLCBNQVhfR1JPVVBfTkFNRV9CWVRFUywgcGFyc2VHcm91cE5hbWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vd2ViUHViU3ViL2dyb3Vwcy5qcyc7XG5cbnN1aXRlKCdXZWJQdWJTdWIgLSBwYXJzZUdyb3VwTmFtZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXJzZXMgYSBwZXItY2xpZW50IGJyb2FkY2FzdCBsYW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlR3JvdXBOYW1lKCd1c2VyLnUxLmVudi5lMS5jbGllbnQuYzEuYnJvYWRjYXN0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHsgc2NvcGU6ICdjbGllbnQnLCBsYW5lOiAnYnJvYWRjYXN0JywgdWlkOiAndTEnLCBlaWQ6ICdlMScsIGNpZDogJ2MxJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHBlci1jbGllbnQgdG8taG9zdCBhbmQgdG8tY2xpZW50IGxhbmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuZTEuY2xpZW50LmMxLnRvLWhvc3QnKS5sYW5lLCAndG8taG9zdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuZTEuY2xpZW50LmMxLnRvLWNsaWVudCcpLmxhbmUsICd0by1jbGllbnQnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHBlci1lbnZpcm9ubWVudCBsYW5lcycsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGxhbmUgb2YgWydyb290JywgJ2V2ZW50cycsICdsaWZlY3ljbGUnLCAnY29udHJvbCcsICdpbmdlc3QtYWNrJ10gYXMgY29uc3QpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlR3JvdXBOYW1lKGB1c2VyLnUxLmVudi5lMS4ke2xhbmV9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgeyBzY29wZTogJ2VudicsIGxhbmUsIHVpZDogJ3UxJywgZWlkOiAnZTEnIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZW5mb3JjZXMgZXhwZWN0ZWQgdWlkL2VpZC9jaWQgd2hlbiBwcm92aWRlZCcsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHBhcnNlR3JvdXBOYW1lKCd1c2VyLnUxLmVudi5lMS5ldmVudHMnLCB7IGV4cGVjdGVkOiB7IHVpZDogJ3UyJyB9IH0pLCBHcm91cE5hbWVFcnJvcik7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuZTEuZXZlbnRzJywgeyBleHBlY3RlZDogeyBlaWQ6ICdlMicgfSB9KSwgR3JvdXBOYW1lRXJyb3IpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJ3VzZXIudTEuZW52LmUxLmNsaWVudC5jMS5icm9hZGNhc3QnLCB7IGV4cGVjdGVkOiB7IGNpZDogJ2MyJyB9IH0pLCBHcm91cE5hbWVFcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlR3JvdXBOYW1lKCd1c2VyLnUxLmVudi5lMS5ldmVudHMnLCB7IGV4cGVjdGVkOiB7IHVpZDogJ3UxJywgZWlkOiAnZTEnIH0gfSkuc2NvcGUsICdlbnYnKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBhbiBlbXB0eSBuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJycpLCBHcm91cE5hbWVFcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgbmFtZXMgd2l0aCB0b28gZmV3IHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJ3VzZXIudTEuZW52LmUxJyksIEdyb3VwTmFtZUVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBhIHdyb25nIGxlYWRpbmcgc2VnbWVudCcsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHBhcnNlR3JvdXBOYW1lKCd1c3IudTEuZW52LmUxLmV2ZW50cycpLCAvZXhwZWN0ZWQgZmlyc3Qgc2VnbWVudC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGEgd3JvbmcgZW52IHNlZ21lbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnZ4LmUxLmV2ZW50cycpLCAvdGhpcmQgc2VnbWVudC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGVtcHR5IHVpZC9laWQvY2lkIHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJ3VzZXIuLmVudi5lMS5ldmVudHMnKSwgL3VpZCBzZWdtZW50IGlzIGVtcHR5Lyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuLmV2ZW50cycpLCAvZWlkIHNlZ21lbnQgaXMgZW1wdHkvKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHBhcnNlR3JvdXBOYW1lKCd1c2VyLnUxLmVudi5lMS5jbGllbnQuLmJyb2FkY2FzdCcpLCAvY2lkIHNlZ21lbnQgaXMgZW1wdHkvKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBpZGVudGlmaWVyIGNoYXJhY3RlcnMgb3V0c2lkZSB0aGUgcG9ydGFibGUgb3BhcXVlLWlkIGdyYW1tYXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51c2VyQGdpdGh1Yi5lbnYuZTEuZXZlbnRzJyksIC9vcGFxdWUtaWQgZ3JhbW1hci8pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJ3VzZXIudTEuZW52LmUvMS5ldmVudHMnKSwgL29wYXF1ZS1pZCBncmFtbWFyLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuZTEuY2xpZW50LmM6MS5icm9hZGNhc3QnKSwgL29wYXF1ZS1pZCBncmFtbWFyLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgdW5rbm93biBlbnYgbGFuZXMgYW5kIG11bHRpLXNlZ21lbnQgZW52IGxhbmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJ3VzZXIudTEuZW52LmUxLmJvZ3VzJyksIC91bmtub3duIGVudiBsYW5lLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuZTEuZXZlbnRzLmV4dHJhJyksIC9zaW5nbGUgc2VnbWVudC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHVua25vd24gY2xpZW50IGRpcmVjdGlvbnMgYW5kIHRyYWlsaW5nIHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoJ3VzZXIudTEuZW52LmUxLmNsaWVudC5jMS5zaWRld2F5cycpLCAvdW5rbm93biBjbGllbnQgZGlyZWN0aW9uLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUdyb3VwTmFtZSgndXNlci51MS5lbnYuZTEuY2xpZW50LmMxLmJyb2FkY2FzdC5leHRyYScpLCAvdHJhaWxpbmcgc2VnbWVudHMvKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHBhcnNlR3JvdXBOYW1lKCd1c2VyLnUxLmVudi5lMS5jbGllbnQuYzEnKSwgL2NsaWVudCBsYW5lIHRydW5jYXRlZC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5hbWVzIGV4Y2VlZGluZyB0aGUgYnl0ZSBjYXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHVnZSA9IGB1c2VyLnUxLmVudi4keydlJy5yZXBlYXQoTUFYX0dST1VQX05BTUVfQllURVMpfS5ldmVudHNgO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VHcm91cE5hbWUoaHVnZSksIC9leGNlZWRzLyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0Isc0JBQXNCLHNCQUFzQjtBQUVyRSxNQUFNLDhCQUE4QixNQUFNO0FBRXpDLDBDQUF3QztBQUV4QyxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFVBQU0s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
