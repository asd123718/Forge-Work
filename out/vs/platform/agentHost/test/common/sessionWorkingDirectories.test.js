import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { areAdditionalWorkingDirectoriesEqual, areSessionWorkingDirectoriesEqual, resolveSessionWorkingDirectoryAction } from "../../common/state/sessionWorkingDirectories.js";
suite("Session working directories", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const primary = "file:///workspace/primary";
  const secondary = "file:///workspace/secondary";
  test("compares additional working directories as an unordered set", () => {
    const first = [URI.file("/workspace/a"), URI.file("/workspace/b")];
    const second = [URI.file("/workspace/b"), URI.file("/workspace/a")];
    assert.strictEqual(areAdditionalWorkingDirectoriesEqual(first, second), true);
  });
  test("compares the session primary positionally and additional directories as a set", () => {
    const first = [URI.file("/workspace/primary"), URI.file("/workspace/a"), URI.file("/workspace/b")];
    const reorderedAdditional = [URI.file("/workspace/primary"), URI.file("/workspace/b"), URI.file("/workspace/a")];
    const changedPrimary = [URI.file("/workspace/a"), URI.file("/workspace/primary"), URI.file("/workspace/b")];
    assert.deepStrictEqual([
      areSessionWorkingDirectoriesEqual(first, reorderedAdditional, true),
      areSessionWorkingDirectoriesEqual(first, changedPrimary, true)
    ], [true, false]);
  });
  test("compares every directory as an equal peer without an immutable primary", () => {
    const first = [URI.file("/workspace/primary"), URI.file("/workspace/a")];
    const reordered = [URI.file("/workspace/a"), URI.file("/workspace/primary")];
    const different = [URI.file("/workspace/a"), URI.file("/workspace/b")];
    assert.deepStrictEqual([
      areSessionWorkingDirectoriesEqual(first, reordered, false),
      areSessionWorkingDirectoriesEqual(first, different, false)
    ], [true, false]);
  });
  test("uses an existing canonical spelling for equivalent set and remove actions", () => {
    const encodedEquivalent = "file:///workspace/%73econdary";
    assert.deepStrictEqual([
      resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectorySet, directory: encodedEquivalent },
        [primary, secondary],
        true
      ),
      resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectoryRemoved, directory: encodedEquivalent },
        [primary, secondary],
        true
      )
    ], [
      { type: ActionType.SessionWorkingDirectorySet, directory: secondary },
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: secondary }
    ]);
  });
  test("canonicalizes new sets and absent removes", () => {
    assert.deepStrictEqual([
      resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectorySet, directory: "file:///workspace/%61dded" },
        [primary, secondary],
        true
      ),
      resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectoryRemoved, directory: "file:///workspace/%61bsent" },
        [primary, secondary],
        true
      )
    ], [
      { type: ActionType.SessionWorkingDirectorySet, directory: "file:///workspace/added" },
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: "file:///workspace/absent" }
    ]);
  });
  test("rejects removal of the immutable primary", () => {
    assert.throws(
      () => resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectoryRemoved, directory: "file:///workspace/%70rimary" },
        [primary, secondary],
        true
      ),
      /The primary working directory cannot be removed/
    );
  });
  test("allows removal of index zero when the provider has no immutable primary", () => {
    assert.deepStrictEqual(
      resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectoryRemoved, directory: primary },
        [primary, secondary],
        false
      ),
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: primary }
    );
  });
  test("rejects malformed and non-file URIs", () => {
    assert.throws(
      () => resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectorySet, directory: "not a URI" },
        [primary],
        true
      ),
      /Scheme is missing/
    );
    assert.throws(
      () => resolveSessionWorkingDirectoryAction(
        { type: ActionType.SessionWorkingDirectorySet, directory: "vscode-remote://ssh-remote+host/workspace" },
        [primary],
        true
      ),
      /Working directory must be a file URI/
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXJlQWRkaXRpb25hbFdvcmtpbmdEaXJlY3Rvcmllc0VxdWFsLCBhcmVTZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzRXF1YWwsIHJlc29sdmVTZXNzaW9uV29ya2luZ0RpcmVjdG9yeUFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmpzJztcblxuc3VpdGUoJ1Nlc3Npb24gd29ya2luZyBkaXJlY3RvcmllcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgcHJpbWFyeSA9ICdmaWxlOi8vL3dvcmtzcGFjZS9wcmltYXJ5Jztcblx0Y29uc3Qgc2Vjb25kYXJ5ID0gJ2ZpbGU6Ly8vd29ya3NwYWNlL3NlY29uZGFyeSc7XG5cblx0dGVzdCgnY29tcGFyZXMgYWRkaXRpb25hbCB3b3JraW5nIGRpcmVjdG9yaWVzIGFzIGFuIHVub3JkZXJlZCBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3QgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyldO1xuXHRcdGNvbnN0IHNlY29uZCA9IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyksIFVSSS5maWxlKCcvd29ya3NwYWNlL2EnKV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJlQWRkaXRpb25hbFdvcmtpbmdEaXJlY3Rvcmllc0VxdWFsKGZpcnN0LCBzZWNvbmQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZXMgdGhlIHNlc3Npb24gcHJpbWFyeSBwb3NpdGlvbmFsbHkgYW5kIGFkZGl0aW9uYWwgZGlyZWN0b3JpZXMgYXMgYSBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3QgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJpbWFyeScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyksIFVSSS5maWxlKCcvd29ya3NwYWNlL2InKV07XG5cdFx0Y29uc3QgcmVvcmRlcmVkQWRkaXRpb25hbCA9IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS9wcmltYXJ5JyksIFVSSS5maWxlKCcvd29ya3NwYWNlL2InKSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpXTtcblx0XHRjb25zdCBjaGFuZ2VkUHJpbWFyeSA9IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyksIFVSSS5maWxlKCcvd29ya3NwYWNlL3ByaW1hcnknKSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UvYicpXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0YXJlU2Vzc2lvbldvcmtpbmdEaXJlY3Rvcmllc0VxdWFsKGZpcnN0LCByZW9yZGVyZWRBZGRpdGlvbmFsLCB0cnVlKSxcblx0XHRcdGFyZVNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXNFcXVhbChmaXJzdCwgY2hhbmdlZFByaW1hcnksIHRydWUpLFxuXHRcdF0sIFt0cnVlLCBmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlcyBldmVyeSBkaXJlY3RvcnkgYXMgYW4gZXF1YWwgcGVlciB3aXRob3V0IGFuIGltbXV0YWJsZSBwcmltYXJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gW1VSSS5maWxlKCcvd29ya3NwYWNlL3ByaW1hcnknKSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpXTtcblx0XHRjb25zdCByZW9yZGVyZWQgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9wcmltYXJ5JyldO1xuXHRcdGNvbnN0IGRpZmZlcmVudCA9IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyksIFVSSS5maWxlKCcvd29ya3NwYWNlL2InKV07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGFyZVNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXNFcXVhbChmaXJzdCwgcmVvcmRlcmVkLCBmYWxzZSksXG5cdFx0XHRhcmVTZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzRXF1YWwoZmlyc3QsIGRpZmZlcmVudCwgZmFsc2UpLFxuXHRcdF0sIFt0cnVlLCBmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGFuIGV4aXN0aW5nIGNhbm9uaWNhbCBzcGVsbGluZyBmb3IgZXF1aXZhbGVudCBzZXQgYW5kIHJlbW92ZSBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVuY29kZWRFcXVpdmFsZW50ID0gJ2ZpbGU6Ly8vd29ya3NwYWNlLyU3M2Vjb25kYXJ5JztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cmVzb2x2ZVNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uKFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogZW5jb2RlZEVxdWl2YWxlbnQgfSxcblx0XHRcdFx0W3ByaW1hcnksIHNlY29uZGFyeV0sXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpLFxuXHRcdFx0cmVzb2x2ZVNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uKFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IGVuY29kZWRFcXVpdmFsZW50IH0sXG5cdFx0XHRcdFtwcmltYXJ5LCBzZWNvbmRhcnldLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0KSxcblx0XHRdLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogc2Vjb25kYXJ5IH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHNlY29uZGFyeSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5vbmljYWxpemVzIG5ldyBzZXRzIGFuZCBhYnNlbnQgcmVtb3ZlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHJlc29sdmVTZXNzaW9uV29ya2luZ0RpcmVjdG9yeUFjdGlvbihcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3dvcmtzcGFjZS8lNjFkZGVkJyB9LFxuXHRcdFx0XHRbcHJpbWFyeSwgc2Vjb25kYXJ5XSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdCksXG5cdFx0XHRyZXNvbHZlU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlBY3Rpb24oXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlbW92ZWQsIGRpcmVjdG9yeTogJ2ZpbGU6Ly8vd29ya3NwYWNlLyU2MWJzZW50JyB9LFxuXHRcdFx0XHRbcHJpbWFyeSwgc2Vjb25kYXJ5XSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdCksXG5cdFx0XSwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3dvcmtzcGFjZS9hZGRlZCcgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlbW92ZWQsIGRpcmVjdG9yeTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2Fic2VudCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyByZW1vdmFsIG9mIHRoZSBpbW11dGFibGUgcHJpbWFyeScsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gcmVzb2x2ZVNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uKFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3dvcmtzcGFjZS8lNzByaW1hcnknIH0sXG5cdFx0XHRcdFtwcmltYXJ5LCBzZWNvbmRhcnldLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0KSxcblx0XHRcdC9UaGUgcHJpbWFyeSB3b3JraW5nIGRpcmVjdG9yeSBjYW5ub3QgYmUgcmVtb3ZlZC8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIHJlbW92YWwgb2YgaW5kZXggemVybyB3aGVuIHRoZSBwcm92aWRlciBoYXMgbm8gaW1tdXRhYmxlIHByaW1hcnknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVTZXNzaW9uV29ya2luZ0RpcmVjdG9yeUFjdGlvbihcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiBwcmltYXJ5IH0sXG5cdFx0XHRcdFtwcmltYXJ5LCBzZWNvbmRhcnldLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCksXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHByaW1hcnkgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG1hbGZvcm1lZCBhbmQgbm9uLWZpbGUgVVJJcycsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gcmVzb2x2ZVNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uKFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogJ25vdCBhIFVSSScgfSxcblx0XHRcdFx0W3ByaW1hcnldLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0KSxcblx0XHRcdC9TY2hlbWUgaXMgbWlzc2luZy8sXG5cdFx0KTtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gcmVzb2x2ZVNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uKFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogJ3ZzY29kZS1yZW1vdGU6Ly9zc2gtcmVtb3RlK2hvc3Qvd29ya3NwYWNlJyB9LFxuXHRcdFx0XHRbcHJpbWFyeV0sXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpLFxuXHRcdFx0L1dvcmtpbmcgZGlyZWN0b3J5IG11c3QgYmUgYSBmaWxlIFVSSS8sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQ0FBc0MsbUNBQW1DLDRDQUE0QztBQUU5SCxNQUFNLCtCQUErQixNQUFNO0FBQzFDLDBDQUF3QztBQUV4QyxRQUFNLFVBQVU7QUFDaEIsUUFBTSxZQUFZO0FBRWxCLE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSxRQUFRLENBQUMsSUFBSSxLQUFLLGNBQWMsR0FBRyxJQUFJLEtBQUssY0FBYyxDQUFDO0FBQ2pFLFVBQU0sU0FBUyxDQUFDLElBQUksS0FBSyxjQUFjLEdBQUcsSUFBSSxLQUFLLGNBQWMsQ0FBQztBQUVsRSxXQUFPLFlBQVkscUNBQXFDLE9BQU8sTUFBTSxHQUFHLElBQUk7QUFBQSxFQUM3RSxDQUFDO0FBRUQsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLFFBQVEsQ0FBQyxJQUFJLEtBQUssb0JBQW9CLEdBQUcsSUFBSSxLQUFLLGNBQWMsR0FBRyxJQUFJLEtBQUssY0FBYyxDQUFDO0FBQ2pHLFVBQU0sc0JBQXNCLENBQUMsSUFBSSxLQUFLLG9CQUFvQixHQUFHLElBQUksS0FBSyxjQUFjLEdBQUcsSUFBSSxLQUFLLGNBQWMsQ0FBQztBQUMvRyxVQUFNLGlCQUFpQixDQUFDLElBQUksS0FBSyxjQUFjLEdBQUcsSUFBSSxLQUFLLG9CQUFvQixHQUFHLElBQUksS0FBSyxjQUFjLENBQUM7QUFFMUcsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixrQ0FBa0MsT0FBTyxxQkFBcUIsSUFBSTtBQUFBLE1BQ2xFLGtDQUFrQyxPQUFPLGdCQUFnQixJQUFJO0FBQUEsSUFDOUQsR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDakIsQ0FBQztBQUVELE9BQUssMEVB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
