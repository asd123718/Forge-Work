import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isValidExtensionVersion, isValidVersion, isValidVersionStr, normalizeVersion, parseVersion } from "../../common/extensionValidator.js";
suite("Extension Version Validator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const productVersion = "2021-05-11T21:54:30.577Z";
  test("isValidVersionStr", () => {
    assert.strictEqual(isValidVersionStr("0.10.0-dev"), true);
    assert.strictEqual(isValidVersionStr("0.10.0"), true);
    assert.strictEqual(isValidVersionStr("0.10.1"), true);
    assert.strictEqual(isValidVersionStr("0.10.100"), true);
    assert.strictEqual(isValidVersionStr("0.11.0"), true);
    assert.strictEqual(isValidVersionStr("x.x.x"), true);
    assert.strictEqual(isValidVersionStr("0.x.x"), true);
    assert.strictEqual(isValidVersionStr("0.10.0"), true);
    assert.strictEqual(isValidVersionStr("0.10.x"), true);
    assert.strictEqual(isValidVersionStr("^0.10.0"), true);
    assert.strictEqual(isValidVersionStr("*"), true);
    assert.strictEqual(isValidVersionStr("0.x.x.x"), false);
    assert.strictEqual(isValidVersionStr("0.10"), false);
    assert.strictEqual(isValidVersionStr("0.10."), false);
  });
  test("parseVersion", () => {
    function assertParseVersion(version, hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease) {
      const actual = parseVersion(version);
      const expected = { hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease };
      assert.deepStrictEqual(actual, expected, "parseVersion for " + version);
    }
    assertParseVersion("0.10.0-dev", false, false, 0, true, 10, true, 0, true, "-dev");
    assertParseVersion("0.10.0", false, false, 0, true, 10, true, 0, true, null);
    assertParseVersion("0.10.1", false, false, 0, true, 10, true, 1, true, null);
    assertParseVersion("0.10.100", false, false, 0, true, 10, true, 100, true, null);
    assertParseVersion("0.11.0", false, false, 0, true, 11, true, 0, true, null);
    assertParseVersion("x.x.x", false, false, 0, false, 0, false, 0, false, null);
    assertParseVersion("0.x.x", false, false, 0, true, 0, false, 0, false, null);
    assertParseVersion("0.10.x", false, false, 0, true, 10, true, 0, false, null);
    assertParseVersion("^0.10.0", true, false, 0, true, 10, true, 0, true, null);
    assertParseVersion("^0.10.2", true, false, 0, true, 10, true, 2, true, null);
    assertParseVersion("^1.10.2", true, false, 1, true, 10, true, 2, true, null);
    assertParseVersion("*", false, false, 0, false, 0, false, 0, false, null);
    assertParseVersion(">=0.0.1", false, true, 0, true, 0, true, 1, true, null);
    assertParseVersion(">=2.4.3", false, true, 2, true, 4, true, 3, true, null);
    assertParseVersion("1.10.0-202105111430", false, false, 1, true, 10, true, 0, true, "-202105111430");
    assertParseVersion("^1.10.0-202105112359", true, false, 1, true, 10, true, 0, true, "-202105112359");
  });
  test("normalizeVersion", () => {
    function assertNormalizeVersion(version, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore = 0) {
      const actual = normalizeVersion(parseVersion(version));
      const expected = { majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore };
      assert.deepStrictEqual(actual, expected, "parseVersion for " + version);
    }
    assertNormalizeVersion("0.10.0-dev", 0, true, 10, true, 0, true, false, 0);
    assertNormalizeVersion("0.10.0-222222222", 0, true, 10, true, 0, true, false, 0);
    assertNormalizeVersion("0.10.0-20210511", 0, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T00:00:00Z")).getTime());
    assertNormalizeVersion("1.10.0-202105111430", 1, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T14:30:00Z")).getTime());
    assertNormalizeVersion("1.10.0-202105112359", 1, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T23:59:00Z")).getTime());
    assertNormalizeVersion("1.10.0-202105110000", 1, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T00:00:00Z")).getTime());
    assertNormalizeVersion("0.10.0", 0, true, 10, true, 0, true, false);
    assertNormalizeVersion("0.10.1", 0, true, 10, true, 1, true, false);
    assertNormalizeVersion("0.10.100", 0, true, 10, true, 100, true, false);
    assertNormalizeVersion("0.11.0", 0, true, 11, true, 0, true, false);
    assertNormalizeVersion("x.x.x", 0, false, 0, false, 0, false, false);
    assertNormalizeVersion("0.x.x", 0, true, 0, false, 0, false, false);
    assertNormalizeVersion("0.10.x", 0, true, 10, true, 0, false, false);
    assertNormalizeVersion("^0.10.0", 0, true, 10, true, 0, false, false);
    assertNormalizeVersion("^0.10.2", 0, true, 10, true, 2, false, false);
    assertNormalizeVersion("^1.10.2", 1, true, 10, false, 2, false, false);
    assertNormalizeVersion("*", 0, false, 0, false, 0, false, false);
    assertNormalizeVersion(">=0.0.1", 0, true, 0, true, 1, true, true);
    assertNormalizeVersion(">=2.4.3", 2, true, 4, true, 3, true, true);
    assertNormalizeVersion(">=2.4.3", 2, true, 4, true, 3, true, true);
  });
  test("isValidVersion", () => {
    function testIsValidVersion(version, desiredVersion, expectedResult) {
      const actual = isValidVersion(version, productVersion, desiredVersion);
      assert.strictEqual(actual, expectedResult, "extension - vscode: " + version + ", desiredVersion: " + desiredVersion + " should be " + expectedResult);
    }
    testIsValidVersion("0.10.0-dev", "x.x.x", true);
    testIsValidVersion("0.10.0-dev", "0.x.x", true);
    testIsValidVersion("0.10.0-dev", "0.10.0", true);
    testIsValidVersion("0.10.0-dev", "0.10.2", false);
    testIsValidVersion("0.10.0-dev", "^0.10.2", false);
    testIsValidVersion("0.10.0-dev", "0.10.x", true);
    testIsValidVersion("0.10.0-dev", "^0.10.0", true);
    testIsValidVersion("0.10.0-dev", "*", true);
    testIsValidVersion("0.10.0-dev", ">=0.0.1", true);
    testIsValidVersion("0.10.0-dev", ">=0.0.10", true);
    testIsValidVersion("0.10.0-dev", ">=0.10.0", true);
    testIsValidVersion("0.10.0-dev", ">=0.10.1", false);
    testIsValidVersion("0.10.0-dev", ">=1.0.0", false);
    testIsValidVersion("0.10.0", "x.x.x", true);
    testIsValidVersion("0.10.0", "0.x.x", true);
    testIsValidVersion("0.10.0", "0.10.0", true);
    testIsValidVersion("0.10.0", "0.10.2", false);
    testIsValidVersion("0.10.0", "^0.10.2", false);
    testIsValidVersion("0.10.0", "0.10.x", true);
    testIsValidVersion("0.10.0", "^0.10.0", true);
    testIsValidVersion("0.10.0", "*", true);
    testIsValidVersion("0.10.1", "x.x.x", true);
    testIsValidVersion("0.10.1", "0.x.x", true);
    testIsValidVersion("0.10.1", "0.10.0", false);
    testIsValidVersion("0.10.1", "0.10.2", false);
    testIsValidVersion("0.10.1", "^0.10.2", false);
    testIsValidVersion("0.10.1", "0.10.x", true);
    testIsValidVersion("0.10.1", "^0.10.0", true);
    testIsValidVersion("0.10.1", "*", true);
    testIsValidVersion("0.10.100", "x.x.x", true);
    testIsValidVersion("0.10.100", "0.x.x", true);
    testIsValidVersion("0.10.100", "0.10.0", false);
    testIsValidVersion("0.10.100", "0.10.2", false);
    testIsValidVersion("0.10.100", "^0.10.2", true);
    testIsValidVersion("0.10.100", "0.10.x", true);
    testIsValidVersion("0.10.100", "^0.10.0", true);
    testIsValidVersion("0.10.100", "*", true);
    testIsValidVersion("0.11.0", "x.x.x", true);
    testIsValidVersion("0.11.0", "0.x.x", true);
    testIsValidVersion("0.11.0", "0.10.0", false);
    testIsValidVersion("0.11.0", "0.10.2", false);
    testIsValidVersion("0.11.0", "^0.10.2", false);
    testIsValidVersion("0.11.0", "0.10.x", false);
    testIsValidVersion("0.11.0", "^0.10.0", false);
    testIsValidVersion("0.11.0", "*", true);
    testIsValidVersion("1.0.0", "x.x.x", true);
    testIsValidVersion("1.0.0", "0.x.x", true);
    testIsValidVersion("1.0.0", "0.10.0", false);
    testIsValidVersion("1.0.0", "0.10.2", false);
    testIsValidVersion("1.0.0", "^0.10.2", true);
    testIsValidVersion("1.0.0", "0.10.x", true);
    testIsValidVersion("1.0.0", "^0.10.0", true);
    testIsValidVersion("1.0.0", "1.0.0", true);
    testIsValidVersion("1.0.0", "^1.0.0", true);
    testIsValidVersion("1.0.0", "^2.0.0", false);
    testIsValidVersion("1.0.0", "*", true);
    testIsValidVersion("1.0.0", ">=0.0.1", true);
    testIsValidVersion("1.0.0", ">=0.0.10", true);
    testIsValidVersion("1.0.0", ">=0.10.0", true);
    testIsValidVersion("1.0.0", ">=0.10.1", true);
    testIsValidVersion("1.0.0", ">=1.0.0", true);
    testIsValidVersion("1.0.0", ">=1.1.0", false);
    testIsValidVersion("1.0.0", ">=1.0.1", false);
    testIsValidVersion("1.0.0", ">=2.0.0", false);
    testIsValidVersion("1.0.100", "x.x.x", true);
    testIsValidVersion("1.0.100", "0.x.x", true);
    testIsValidVersion("1.0.100", "0.10.0", false);
    testIsValidVersion("1.0.100", "0.10.2", false);
    testIsValidVersion("1.0.100", "^0.10.2", true);
    testIsValidVersion("1.0.100", "0.10.x", true);
    testIsValidVersion("1.0.100", "^0.10.0", true);
    testIsValidVersion("1.0.100", "1.0.0", false);
    testIsValidVersion("1.0.100", "^1.0.0", true);
    testIsValidVersion("1.0.100", "^1.0.1", true);
    testIsValidVersion("1.0.100", "^2.0.0", false);
    testIsValidVersion("1.0.100", "*", true);
    testIsValidVersion("1.100.0", "x.x.x", true);
    testIsValidVersion("1.100.0", "0.x.x", true);
    testIsValidVersion("1.100.0", "0.10.0", false);
    testIsValidVersion("1.100.0", "0.10.2", false);
    testIsValidVersion("1.100.0", "^0.10.2", true);
    testIsValidVersion("1.100.0", "0.10.x", true);
    testIsValidVersion("1.100.0", "^0.10.0", true);
    testIsValidVersion("1.100.0", "1.0.0", false);
    testIsValidVersion("1.100.0", "^1.0.0", true);
    testIsValidVersion("1.100.0", "^1.1.0", true);
    testIsValidVersion("1.100.0", "^1.100.0", true);
    testIsValidVersion("1.100.0", "^2.0.0", false);
    testIsValidVersion("1.100.0", "*", true);
    testIsValidVersion("1.100.0", ">=1.99.0", true);
    testIsValidVersion("1.100.0", ">=1.100.0", true);
    testIsValidVersion("1.100.0", ">=1.101.0", false);
    testIsValidVersion("2.0.0", "x.x.x", true);
    testIsValidVersion("2.0.0", "0.x.x", false);
    testIsValidVersion("2.0.0", "0.10.0", false);
    testIsValidVersion("2.0.0", "0.10.2", false);
    testIsValidVersion("2.0.0", "^0.10.2", false);
    testIsValidVersion("2.0.0", "0.10.x", false);
    testIsValidVersion("2.0.0", "^0.10.0", false);
    testIsValidVersion("2.0.0", "1.0.0", false);
    testIsValidVersion("2.0.0", "^1.0.0", false);
    testIsValidVersion("2.0.0", "^1.1.0", false);
    testIsValidVersion("2.0.0", "^1.100.0", false);
    testIsValidVersion("2.0.0", "^2.0.0", true);
    testIsValidVersion("2.0.0", "*", true);
  });
  test("isValidExtensionVersion", () => {
    function testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, expectedResult) {
      const manifest = {
        name: "test",
        publisher: "test",
        version: "0.0.0",
        engines: {
          vscode: desiredVersion
        },
        main: hasMain ? "something" : void 0
      };
      const reasons = [];
      const actual = isValidExtensionVersion(version, productVersion, manifest, isBuiltin, reasons);
      assert.strictEqual(actual, expectedResult, "version: " + version + ", desiredVersion: " + desiredVersion + ", desc: " + JSON.stringify(manifest) + ", reasons: " + JSON.stringify(reasons));
    }
    function testIsInvalidExtensionVersion(version, desiredVersion, isBuiltin, hasMain) {
      testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, false);
    }
    function testIsValidExtensionVersion(version, desiredVersion, isBuiltin, hasMain) {
      testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, true);
    }
    function testIsValidVersion(version, desiredVersion, expectedResult) {
      testExtensionVersion(version, desiredVersion, false, true, expectedResult);
    }
    testIsValidExtensionVersion("0.10.0-dev", "*", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", true, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", true, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "*", true, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", true, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", true, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", true, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", true, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", true, false);
    testIsInvalidExtensionVersion("0.10.0-dev", "*", false, true);
    testIsInvalidExtensionVersion("0.10.0-dev", "x.x.x", false, true);
    testIsInvalidExtensionVersion("0.10.0-dev", "0.x.x", false, true);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, true);
    testIsValidExtensionVersion("0.10.0-dev", "*", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", ">=0.9.1-pre.1", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "*", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "*", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, false);
    testIsValidVersion("0.10.0-dev", "x.x.x", false);
    testIsValidVersion("0.10.0-dev", "0.x.x", false);
    testIsValidVersion("0.10.0-dev", "0.10.0", true);
    testIsValidVersion("0.10.0-dev", "0.10.2", false);
    testIsValidVersion("0.10.0-dev", "^0.10.2", false);
    testIsValidVersion("0.10.0-dev", "0.10.x", true);
    testIsValidVersion("0.10.0-dev", "^0.10.0", true);
    testIsValidVersion("0.10.0-dev", "*", false);
    testIsValidVersion("0.10.0", "x.x.x", false);
    testIsValidVersion("0.10.0", "0.x.x", false);
    testIsValidVersion("0.10.0", "0.10.0", true);
    testIsValidVersion("0.10.0", "0.10.2", false);
    testIsValidVersion("0.10.0", "^0.10.2", false);
    testIsValidVersion("0.10.0", "0.10.x", true);
    testIsValidVersion("0.10.0", "^0.10.0", true);
    testIsValidVersion("0.10.0", "*", false);
    testIsValidVersion("0.10.1", "x.x.x", false);
    testIsValidVersion("0.10.1", "0.x.x", false);
    testIsValidVersion("0.10.1", "0.10.0", false);
    testIsValidVersion("0.10.1", "0.10.2", false);
    testIsValidVersion("0.10.1", "^0.10.2", false);
    testIsValidVersion("0.10.1", "0.10.x", true);
    testIsValidVersion("0.10.1", "^0.10.0", true);
    testIsValidVersion("0.10.1", "*", false);
    testIsValidVersion("0.10.100", "x.x.x", false);
    testIsValidVersion("0.10.100", "0.x.x", false);
    testIsValidVersion("0.10.100", "0.10.0", false);
    testIsValidVersion("0.10.100", "0.10.2", false);
    testIsValidVersion("0.10.100", "^0.10.2", true);
    testIsValidVersion("0.10.100", "0.10.x", true);
    testIsValidVersion("0.10.100", "^0.10.0", true);
    testIsValidVersion("0.10.100", "*", false);
    testIsValidVersion("0.11.0", "x.x.x", false);
    testIsValidVersion("0.11.0", "0.x.x", false);
    testIsValidVersion("0.11.0", "0.10.0", false);
    testIsValidVersion("0.11.0", "0.10.2", false);
    testIsValidVersion("0.11.0", "^0.10.2", false);
    testIsValidVersion("0.11.0", "0.10.x", false);
    testIsValidVersion("0.11.0", "^0.10.0", false);
    testIsValidVersion("0.11.0", "*", false);
    testIsValidVersion("1.0.0", "x.x.x", false);
    testIsValidVersion("1.0.0", "0.x.x", false);
    testIsValidVersion("1.0.0", "0.10.0", false);
    testIsValidVersion("1.0.0", "0.10.2", false);
    testIsValidVersion("1.0.0", "^0.10.2", true);
    testIsValidVersion("1.0.0", "0.10.x", true);
    testIsValidVersion("1.0.0", "^0.10.0", true);
    testIsValidVersion("1.0.0", "*", false);
    testIsValidVersion("1.10.0", "x.x.x", false);
    testIsValidVersion("1.10.0", "1.x.x", true);
    testIsValidVersion("1.10.0", "1.10.0", true);
    testIsValidVersion("1.10.0", "1.10.2", false);
    testIsValidVersion("1.10.0", "^1.10.2", false);
    testIsValidVersion("1.10.0", "1.10.x", true);
    testIsValidVersion("1.10.0", "^1.10.0", true);
    testIsValidVersion("1.10.0", "*", false);
    testIsValidVersion("1.0.0", "x.x.x", false);
    testIsValidVersion("1.0.0", "0.x.x", false);
    testIsValidVersion("1.0.0", "0.10.0", false);
    testIsValidVersion("1.0.0", "0.10.2", false);
    testIsValidVersion("1.0.0", "^0.10.2", true);
    testIsValidVersion("1.0.0", "0.10.x", true);
    testIsValidVersion("1.0.0", "^0.10.0", true);
    testIsValidVersion("1.0.0", "1.0.0", true);
    testIsValidVersion("1.0.0", "^1.0.0", true);
    testIsValidVersion("1.0.0", "^2.0.0", false);
    testIsValidVersion("1.0.0", "*", false);
    testIsValidVersion("1.0.100", "x.x.x", false);
    testIsValidVersion("1.0.100", "0.x.x", false);
    testIsValidVersion("1.0.100", "0.10.0", false);
    testIsValidVersion("1.0.100", "0.10.2", false);
    testIsValidVersion("1.0.100", "^0.10.2", true);
    testIsValidVersion("1.0.100", "0.10.x", true);
    testIsValidVersion("1.0.100", "^0.10.0", true);
    testIsValidVersion("1.0.100", "1.0.0", false);
    testIsValidVersion("1.0.100", "^1.0.0", true);
    testIsValidVersion("1.0.100", "^1.0.1", true);
    testIsValidVersion("1.0.100", "^2.0.0", false);
    testIsValidVersion("1.0.100", "*", false);
    testIsValidVersion("1.100.0", "x.x.x", false);
    testIsValidVersion("1.100.0", "0.x.x", false);
    testIsValidVersion("1.100.0", "0.10.0", false);
    testIsValidVersion("1.100.0", "0.10.2", false);
    testIsValidVersion("1.100.0", "^0.10.2", true);
    testIsValidVersion("1.100.0", "0.10.x", true);
    testIsValidVersion("1.100.0", "^0.10.0", true);
    testIsValidVersion("1.100.0", "1.0.0", false);
    testIsValidVersion("1.100.0", "^1.0.0", true);
    testIsValidVersion("1.100.0", "^1.1.0", true);
    testIsValidVersion("1.100.0", "^1.100.0", true);
    testIsValidVersion("1.100.0", "^2.0.0", false);
    testIsValidVersion("1.100.0", "*", false);
    testIsValidVersion("2.0.0", "x.x.x", false);
    testIsValidVersion("2.0.0", "0.x.x", false);
    testIsValidVersion("2.0.0", "0.10.0", false);
    testIsValidVersion("2.0.0", "0.10.2", false);
    testIsValidVersion("2.0.0", "^0.10.2", false);
    testIsValidVersion("2.0.0", "0.10.x", false);
    testIsValidVersion("2.0.0", "^0.10.0", false);
    testIsValidVersion("2.0.0", "1.0.0", false);
    testIsValidVersion("2.0.0", "^1.0.0", false);
    testIsValidVersion("2.0.0", "^1.1.0", false);
    testIsValidVersion("2.0.0", "^1.100.0", false);
    testIsValidVersion("2.0.0", "^2.0.0", true);
    testIsValidVersion("2.0.0", "*", false);
    testIsValidVersion("1.10.0", "^1.10.0-20210511", true);
    testIsValidVersion("1.10.0", "^1.10.0-20210510", true);
    testIsValidVersion("1.10.0", "^1.10.0-20210512", false);
    testIsValidVersion("1.10.1", "^1.10.0-20200101", true);
    testIsValidVersion("1.11.0", "^1.10.0-20200101", true);
    testIsValidVersion("1.10.0", "^1.10.0-202105111400", true);
    testIsValidVersion("1.10.0", "^1.10.0-202105112359", false);
    testIsValidVersion("1.10.0", "^1.10.0-202105110000", true);
  });
  test("isValidExtensionVersion checks browser only extensions", () => {
    const manifest = {
      name: "test",
      publisher: "test",
      version: "0.0.0",
      engines: {
        vscode: "^1.45.0"
      },
      browser: "something"
    };
    assert.strictEqual(isValidExtensionVersion("1.44.0", void 0, manifest, false, []), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uc1xcdGVzdFxcY29tbW9uXFxleHRlbnNpb25WYWxpZGF0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElOb3JtYWxpemVkVmVyc2lvbiwgSVBhcnNlZFZlcnNpb24sIGlzVmFsaWRFeHRlbnNpb25WZXJzaW9uLCBpc1ZhbGlkVmVyc2lvbiwgaXNWYWxpZFZlcnNpb25TdHIsIG5vcm1hbGl6ZVZlcnNpb24sIHBhcnNlVmVyc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRlbnNpb25WYWxpZGF0b3IuanMnO1xuXG5zdWl0ZSgnRXh0ZW5zaW9uIFZlcnNpb24gVmFsaWRhdG9yJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHByb2R1Y3RWZXJzaW9uID0gJzIwMjEtMDUtMTFUMjE6NTQ6MzAuNTc3Wic7XG5cblx0dGVzdCgnaXNWYWxpZFZlcnNpb25TdHInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCcwLjEwLjAtZGV2JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMC4wJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMC4xJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMC4xMDAnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCcwLjExLjAnKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJ3gueC54JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC54LngnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCcwLjEwLjAnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCcwLjEwLngnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCdeMC4xMC4wJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignKicpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC54LngueCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCcwLjEwJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJzAuMTAuJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VWZXJzaW9uJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGFzc2VydFBhcnNlVmVyc2lvbih2ZXJzaW9uOiBzdHJpbmcsIGhhc0NhcmV0OiBib29sZWFuLCBoYXNHcmVhdGVyRXF1YWxzOiBib29sZWFuLCBtYWpvckJhc2U6IG51bWJlciwgbWFqb3JNdXN0RXF1YWw6IGJvb2xlYW4sIG1pbm9yQmFzZTogbnVtYmVyLCBtaW5vck11c3RFcXVhbDogYm9vbGVhbiwgcGF0Y2hCYXNlOiBudW1iZXIsIHBhdGNoTXVzdEVxdWFsOiBib29sZWFuLCBwcmVSZWxlYXNlOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVZlcnNpb24odmVyc2lvbik7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSVBhcnNlZFZlcnNpb24gPSB7IGhhc0NhcmV0LCBoYXNHcmVhdGVyRXF1YWxzLCBtYWpvckJhc2UsIG1ham9yTXVzdEVxdWFsLCBtaW5vckJhc2UsIG1pbm9yTXVzdEVxdWFsLCBwYXRjaEJhc2UsIHBhdGNoTXVzdEVxdWFsLCBwcmVSZWxlYXNlIH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgJ3BhcnNlVmVyc2lvbiBmb3IgJyArIHZlcnNpb24pO1xuXHRcdH1cblxuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignMC4xMC4wLWRldicsIGZhbHNlLCBmYWxzZSwgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsICctZGV2Jyk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCcwLjEwLjAnLCBmYWxzZSwgZmFsc2UsIDAsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJzAuMTAuMScsIGZhbHNlLCBmYWxzZSwgMCwgdHJ1ZSwgMTAsIHRydWUsIDEsIHRydWUsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignMC4xMC4xMDAnLCBmYWxzZSwgZmFsc2UsIDAsIHRydWUsIDEwLCB0cnVlLCAxMDAsIHRydWUsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignMC4xMS4wJywgZmFsc2UsIGZhbHNlLCAwLCB0cnVlLCAxMSwgdHJ1ZSwgMCwgdHJ1ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJ3gueC54JywgZmFsc2UsIGZhbHNlLCAwLCBmYWxzZSwgMCwgZmFsc2UsIDAsIGZhbHNlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJzAueC54JywgZmFsc2UsIGZhbHNlLCAwLCB0cnVlLCAwLCBmYWxzZSwgMCwgZmFsc2UsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignMC4xMC54JywgZmFsc2UsIGZhbHNlLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgZmFsc2UsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignXjAuMTAuMCcsIHRydWUsIGZhbHNlLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCdeMC4xMC4yJywgdHJ1ZSwgZmFsc2UsIDAsIHRydWUsIDEwLCB0cnVlLCAyLCB0cnVlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJ14xLjEwLjInLCB0cnVlLCBmYWxzZSwgMSwgdHJ1ZSwgMTAsIHRydWUsIDIsIHRydWUsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignKicsIGZhbHNlLCBmYWxzZSwgMCwgZmFsc2UsIDAsIGZhbHNlLCAwLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJz49MC4wLjEnLCBmYWxzZSwgdHJ1ZSwgMCwgdHJ1ZSwgMCwgdHJ1ZSwgMSwgdHJ1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCc+PTIuNC4zJywgZmFsc2UsIHRydWUsIDIsIHRydWUsIDQsIHRydWUsIDMsIHRydWUsIG51bGwpO1xuXG5cdFx0Ly8gUGFyc2UgdmVyc2lvbnMgd2l0aCBISE1NIGRhdGUgZm9ybWF0XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCcxLjEwLjAtMjAyMTA1MTExNDMwJywgZmFsc2UsIGZhbHNlLCAxLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgJy0yMDIxMDUxMTE0MzAnKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJ14xLjEwLjAtMjAyMTA1MTEyMzU5JywgdHJ1ZSwgZmFsc2UsIDEsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCAnLTIwMjEwNTExMjM1OScpO1xuXHR9KTtcblxuXHR0ZXN0KCdub3JtYWxpemVWZXJzaW9uJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGFzc2VydE5vcm1hbGl6ZVZlcnNpb24odmVyc2lvbjogc3RyaW5nLCBtYWpvckJhc2U6IG51bWJlciwgbWFqb3JNdXN0RXF1YWw6IGJvb2xlYW4sIG1pbm9yQmFzZTogbnVtYmVyLCBtaW5vck11c3RFcXVhbDogYm9vbGVhbiwgcGF0Y2hCYXNlOiBudW1iZXIsIHBhdGNoTXVzdEVxdWFsOiBib29sZWFuLCBpc01pbmltdW06IGJvb2xlYW4sIG5vdEJlZm9yZSA9IDApOiB2b2lkIHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVZlcnNpb24ocGFyc2VWZXJzaW9uKHZlcnNpb24pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJTm9ybWFsaXplZFZlcnNpb24gPSB7IG1ham9yQmFzZSwgbWFqb3JNdXN0RXF1YWwsIG1pbm9yQmFzZSwgbWlub3JNdXN0RXF1YWwsIHBhdGNoQmFzZSwgcGF0Y2hNdXN0RXF1YWwsIGlzTWluaW11bSwgbm90QmVmb3JlIH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsICdwYXJzZVZlcnNpb24gZm9yICcgKyB2ZXJzaW9uKTtcblx0XHR9XG5cblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcwLjEwLjAtZGV2JywgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIGZhbHNlLCAwKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcwLjEwLjAtMjIyMjIyMjIyJywgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIGZhbHNlLCAwKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcwLjEwLjAtMjAyMTA1MTEnLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgZmFsc2UsIG5ldyBEYXRlKCcyMDIxLTA1LTExVDAwOjAwOjAwWicpLmdldFRpbWUoKSk7XG5cblx0XHQvLyBOb3JtYWxpemUgdmVyc2lvbnMgd2l0aCBISE1NIGRhdGUgZm9ybWF0XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMS4xMC4wLTIwMjEwNTExMTQzMCcsIDEsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCBmYWxzZSwgbmV3IERhdGUoJzIwMjEtMDUtMTFUMTQ6MzA6MDBaJykuZ2V0VGltZSgpKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcxLjEwLjAtMjAyMTA1MTEyMzU5JywgMSwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIGZhbHNlLCBuZXcgRGF0ZSgnMjAyMS0wNS0xMVQyMzo1OTowMFonKS5nZXRUaW1lKCkpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzEuMTAuMC0yMDIxMDUxMTAwMDAnLCAxLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgZmFsc2UsIG5ldyBEYXRlKCcyMDIxLTA1LTExVDAwOjAwOjAwWicpLmdldFRpbWUoKSk7XG5cblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcwLjEwLjAnLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzAuMTAuMScsIDAsIHRydWUsIDEwLCB0cnVlLCAxLCB0cnVlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMC4xMDAnLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMTAwLCB0cnVlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMS4wJywgMCwgdHJ1ZSwgMTEsIHRydWUsIDAsIHRydWUsIGZhbHNlKTtcblxuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJ3gueC54JywgMCwgZmFsc2UsIDAsIGZhbHNlLCAwLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzAueC54JywgMCwgdHJ1ZSwgMCwgZmFsc2UsIDAsIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMC54JywgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignXjAuMTAuMCcsIDAsIHRydWUsIDEwLCB0cnVlLCAwLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJ14wLjEwLjInLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMiwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCdeMS4xMC4yJywgMSwgdHJ1ZSwgMTAsIGZhbHNlLCAyLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJyonLCAwLCBmYWxzZSwgMCwgZmFsc2UsIDAsIGZhbHNlLCBmYWxzZSk7XG5cblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCc+PTAuMC4xJywgMCwgdHJ1ZSwgMCwgdHJ1ZSwgMSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignPj0yLjQuMycsIDIsIHRydWUsIDQsIHRydWUsIDMsIHRydWUsIHRydWUpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJz49Mi40LjMnLCAyLCB0cnVlLCA0LCB0cnVlLCAzLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNWYWxpZFZlcnNpb24nLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdElzVmFsaWRWZXJzaW9uKHZlcnNpb246IHN0cmluZywgZGVzaXJlZFZlcnNpb246IHN0cmluZywgZXhwZWN0ZWRSZXN1bHQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGlzVmFsaWRWZXJzaW9uKHZlcnNpb24sIHByb2R1Y3RWZXJzaW9uLCBkZXNpcmVkVmVyc2lvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZFJlc3VsdCwgJ2V4dGVuc2lvbiAtIHZzY29kZTogJyArIHZlcnNpb24gKyAnLCBkZXNpcmVkVmVyc2lvbjogJyArIGRlc2lyZWRWZXJzaW9uICsgJyBzaG91bGQgYmUgJyArIGV4cGVjdGVkUmVzdWx0KTtcblx0XHR9XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAneC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnKicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICc+PTAuMC4xJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJz49MC4wLjEwJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJz49MC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJz49MC4xMC4xJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICc+PTEuMC4wJywgZmFsc2UpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAneC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICcwLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICcqJywgdHJ1ZSk7XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJzAueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcqJywgdHJ1ZSk7XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJ3gueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICcwLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnXjAuMTAuMicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICcqJywgdHJ1ZSk7XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJzAueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJzAuMTAueCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICdeMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJyonLCB0cnVlKTtcblxuXHRcdC8vIEFueXRoaW5nIDwgMS4wLjAgaXMgY29tcGF0aWJsZVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14wLjEwLjInLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14xLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjIuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnKicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnPj0wLjAuMScsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnPj0wLjAuMTAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJz49MC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICc+PTAuMTAuMScsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnPj0xLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnPj0xLjEuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJz49MS4wLjEnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICc+PTIuMC4wJywgZmFsc2UpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ3gueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzAueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzEuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnXjEuMC4xJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ14yLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnKicsIHRydWUpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ3gueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzAueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzEuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjEuMS4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14xLjEwMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14yLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnKicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICc+PTEuOTkuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICc+PTEuMTAwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnPj0xLjEwMS4wJywgZmFsc2UpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMC54LngnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMC4xMC54JywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzEuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjEuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjEuMS4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjEuMTAwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICdeMi4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJyonLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNWYWxpZEV4dGVuc2lvblZlcnNpb24nLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiB0ZXN0RXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uOiBzdHJpbmcsIGRlc2lyZWRWZXJzaW9uOiBzdHJpbmcsIGlzQnVpbHRpbjogYm9vbGVhbiwgaGFzTWFpbjogYm9vbGVhbiwgZXhwZWN0ZWRSZXN1bHQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgPSB7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0cHVibGlzaGVyOiAndGVzdCcsXG5cdFx0XHRcdHZlcnNpb246ICcwLjAuMCcsXG5cdFx0XHRcdGVuZ2luZXM6IHtcblx0XHRcdFx0XHR2c2NvZGU6IGRlc2lyZWRWZXJzaW9uXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1haW46IGhhc01haW4gPyAnc29tZXRoaW5nJyA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBpc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uLCBwcm9kdWN0VmVyc2lvbiwgbWFuaWZlc3QsIGlzQnVpbHRpbiwgcmVhc29ucyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkUmVzdWx0LCAndmVyc2lvbjogJyArIHZlcnNpb24gKyAnLCBkZXNpcmVkVmVyc2lvbjogJyArIGRlc2lyZWRWZXJzaW9uICsgJywgZGVzYzogJyArIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0KSArICcsIHJlYXNvbnM6ICcgKyBKU09OLnN0cmluZ2lmeShyZWFzb25zKSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdGVzdElzSW52YWxpZEV4dGVuc2lvblZlcnNpb24odmVyc2lvbjogc3RyaW5nLCBkZXNpcmVkVmVyc2lvbjogc3RyaW5nLCBpc0J1aWx0aW46IGJvb2xlYW4sIGhhc01haW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdHRlc3RFeHRlbnNpb25WZXJzaW9uKHZlcnNpb24sIGRlc2lyZWRWZXJzaW9uLCBpc0J1aWx0aW4sIGhhc01haW4sIGZhbHNlKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24odmVyc2lvbjogc3RyaW5nLCBkZXNpcmVkVmVyc2lvbjogc3RyaW5nLCBpc0J1aWx0aW46IGJvb2xlYW4sIGhhc01haW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdHRlc3RFeHRlbnNpb25WZXJzaW9uKHZlcnNpb24sIGRlc2lyZWRWZXJzaW9uLCBpc0J1aWx0aW4sIGhhc01haW4sIHRydWUpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRlc3RJc1ZhbGlkVmVyc2lvbih2ZXJzaW9uOiBzdHJpbmcsIGRlc2lyZWRWZXJzaW9uOiBzdHJpbmcsIGV4cGVjdGVkUmVzdWx0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHR0ZXN0RXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uLCBkZXNpcmVkVmVyc2lvbiwgZmFsc2UsIHRydWUsIGV4cGVjdGVkUmVzdWx0KTtcblx0XHR9XG5cblx0XHQvLyBidWlsdGluIGFyZSBhbGxvd2VkIHRvIHVzZSAqIG9yIHgueC54XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJyonLCB0cnVlLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAneC54LngnLCB0cnVlLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC54LngnLCB0cnVlLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC54JywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEueC54JywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEuMTAueCcsIHRydWUsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcqJywgdHJ1ZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICd4LngueCcsIHRydWUsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC54LngnLCB0cnVlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAueCcsIHRydWUsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuMTAuMC1kZXYnLCAnMS54LngnLCB0cnVlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEuMTAueCcsIHRydWUsIGZhbHNlKTtcblxuXHRcdC8vIG5vcm1hbCBleHRlbnNpb25zIGFyZSBhbGxvd2VkIHRvIHVzZSAqIG9yIHgueC54IG9ubHkgaWYgdGhleSBoYXZlIG5vIG1haW5cblx0XHR0ZXN0SXNJbnZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcqJywgZmFsc2UsIHRydWUpO1xuXHRcdHRlc3RJc0ludmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJ3gueC54JywgZmFsc2UsIHRydWUpO1xuXHRcdHRlc3RJc0ludmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgZmFsc2UsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLngnLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEueC54JywgZmFsc2UsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLjEwLngnLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJyonLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICd4LngueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuMTAuMC1kZXYnLCAnMS54LngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLjEwLngnLCBmYWxzZSwgZmFsc2UpO1xuXG5cdFx0Ly8gZXh0ZW5zaW9ucyB3aXRob3V0IFwibWFpblwiIGdldCBubyB2ZXJzaW9uIGNoZWNrXG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJz49MC45LjEtcHJlLjEnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcqJywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAneC54LngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLngueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEueC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuMTAuMC1kZXYnLCAnMS4xMC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnKicsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJ3gueC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC54LngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLngueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEuMTAueCcsIGZhbHNlLCBmYWxzZSk7XG5cblx0XHQvLyBub3JtYWwgZXh0ZW5zaW9ucyB3aXRoIGNvZGVcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJ14wLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJyonLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJ14wLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJyonLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJyonLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJ14wLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnMC4xMC54JywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJ14wLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14wLjEwLjInLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJzEueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnMS4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnMS4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnMS4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnXjEuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJyonLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cblxuXHRcdC8vIEFueXRoaW5nIDwgMS4wLjAgaXMgY29tcGF0aWJsZVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjAuMTAuMicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcxLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjEuMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICdeMi4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ14wLjEwLjInLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnMS4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ14xLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMS4wLjEnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnXjIuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14wLjEwLjInLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnMS4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14xLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMS4xLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjEuMTAwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjIuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzAueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzAuMTAueCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14wLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcxLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14xLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14xLjEuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14xLjEwMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjIuMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0Ly8gZGF0ZSB0YWdzXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnXjEuMTAuMC0yMDIxMDUxMScsIHRydWUpOyAvLyBjdXJyZW50IGRhdGVcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMCcsICdeMS4xMC4wLTIwMjEwNTEwJywgdHJ1ZSk7IC8vIGJlZm9yZSBkYXRlXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnXjEuMTAuMC0yMDIxMDUxMicsIGZhbHNlKTsgLy8gZnV0dXJlIGRhdGVcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMScsICdeMS4xMC4wLTIwMjAwMTAxJywgdHJ1ZSk7IC8vIGJlZm9yZSBkYXRlLCBidXQgYWhlYWQgdmVyc2lvblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMS4wJywgJ14xLjEwLjAtMjAyMDAxMDEnLCB0cnVlKTtcblxuXHRcdC8vIFRlc3Qgd2l0aCBISE1NIGRhdGUgZm9ybWF0XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnXjEuMTAuMC0yMDIxMDUxMTE0MDAnLCB0cnVlKTsgLy8gcHJvZHVjdCBhdCBiZWdpbm5pbmcgb2YgZGF5LCByZXF1aXJlZCB0aW1lIGF0IDE0OjAwXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnXjEuMTAuMC0yMDIxMDUxMTIzNTknLCBmYWxzZSk7IC8vIHByb2R1Y3QgYXQgYmVnaW5uaW5nIG9mIGRheSwgcmVxdWlyZWQgdGltZSBhdCAyMzo1OVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjAtMjAyMTA1MTEwMDAwJywgdHJ1ZSk7IC8vIHByb2R1Y3QgYXQgYmVnaW5uaW5nIG9mIGRheSwgcmVxdWlyZWQgdGltZSBhdCAwMDowMFxuXHR9KTtcblxuXHR0ZXN0KCdpc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbiBjaGVja3MgYnJvd3NlciBvbmx5IGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSB7XG5cdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRwdWJsaXNoZXI6ICd0ZXN0Jyxcblx0XHRcdHZlcnNpb246ICcwLjAuMCcsXG5cdFx0XHRlbmdpbmVzOiB7XG5cdFx0XHRcdHZzY29kZTogJ14xLjQ1LjAnXG5cdFx0XHR9LFxuXHRcdFx0YnJvd3NlcjogJ3NvbWV0aGluZydcblx0XHR9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS40NC4wJywgdW5kZWZpbmVkLCBtYW5pZmVzdCwgZmFsc2UsIFtdKSwgZmFsc2UpO1xu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QUFtQixZQUFZLFNBQVMsSUFBSTtBQUM1Qyx1QkFBbUIsWUFBWSxTQUFTLElBQUk7QUFDNUMsdUJBQW1CLFlBQVksVUFBVSxLQUFLO0FBQzlDLHVCQUFtQixZQUFZLFVBQVUsS0FBSztBQUM5Qyx1QkFBbUIsWUFBWSxXQUFXLElBQUk7QUFDOUMsdUJBQW1CLFlBQVksVUFBVSxJQUFJO0FBQzdDLHVCQUFtQixZQUFZLFdBQVcsSUFBSTtBQUM5Qyx1QkFBbUIsWUFBWSxLQUFLLElBQUk7QUFFeEMsdUJBQW1CLFVBQVUsU0FBUyxJQUFJO0FBQzFDLHVCQUFtQixVQUFVLFNBQVMsSUFBSTtBQUMxQyx1QkFBbUIsVUFBVSxVQUFVLEtBQUs7QUFDNUMsdUJBQW1CLFVBQVUsVUFBVSxLQUFLO0FBQzVDLHVCQUFtQixVQUFVLFdBQVcsS0FBSztBQUM3Qyx1QkFBbUIsVUFBVSxVQUFVLEtBQUs7QUFDNUMsdUJBQW1CLFVBQVUsV0FBVyxLQUFLO0FBQzdDLHVCQUFtQixVQUFVLEtBQUssSUFBSTtBQUl0Qyx1QkFBbUIsU0FBUyxTQUFTLElBQUk7QUFDekMsdUJBQW1CLFNBQVMsU0FBUyxJQUFJO0FBQ3pDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsV0FBVyxJQUFJO0FBQzNDLHVCQUFtQixTQUFTLFVBQVUsSUFBSTtBQUMxQyx1QkFBbUIsU0FBUyxXQUFXLElBQUk7QUFDM0MsdUJBQW1CLFNBQVMsU0FBUyxJQUFJO0FBQ3pDLHVCQUFtQixTQUFTLFVBQVUsSUFBSTtBQUMxQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsS0FBSyxJQUFJO0FBQ3JDLHVCQUFtQixTQUFTLFdBQVcsSUFBSTtBQUMzQyx1QkFBbUIsU0FBUyxZQUFZLElBQUk7QUFDNUMsdUJBQW1CLFNBQVMsWUFBWSxJQUFJO0FBQzVDLHVCQUFtQixTQUFTLFlBQVksSUFBSTtBQUM1Qyx1QkFBbUIsU0FBUyxXQUFXLElBQUk7QUFDM0MsdUJBQW1C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S0FBSztBQUMzQyx1QkFBbUIsVUFBVSxTQUFTLEtBQUs7QUFDM0MsdUJBQW1CLFVBQVUsVUFBVSxLQUFLO0FBQzVDLHVCQUFtQixVQUFVLFVBQVUsS0FBSztBQUM1Qyx1QkFBbUIsVUFBVSxXQUFXLEtBQUs7QUFDN0MsdUJBQW1CLFVBQVUsVUFBVSxJQUFJO0FBQzNDLHVCQUFtQixVQUFVLFdBQVcsSUFBSTtBQUM1Qyx1QkFBbUIsVUFBVSxLQUFLLEtBQUs7QUFFdkMsdUJBQW1CLFlBQVksU0FBUyxLQUFLO0FBQzdDLHVCQUFtQixZQUFZLFNBQVMsS0FBSztBQUM3Qyx1QkFBbUIsWUFBWSxVQUFVLEtBQUs7QUFDOUMsdUJBQW1CLFlBQVksVUFBVSxLQUFLO0FBQzlDLHVCQUFtQixZQUFZLFdBQVcsSUFBSTtBQUM5Qyx1QkFBbUIsWUFBWSxVQUFVLElBQUk7QUFDN0MsdUJBQW1CLFlBQVksV0FBVyxJQUFJO0FBQzlDLHVCQUFtQixZQUFZLEtBQUssS0FBSztBQUV6Qyx1QkFBbUIsVUFBVSxTQUFTLEtBQUs7QUFDM0MsdUJBQW1CLFVBQVUsU0FBUyxLQUFLO0FBQzNDLHVCQUFtQixVQUFVLFVBQVUsS0FBSztBQUM1Qyx1QkFBbUIsVUFBVSxVQUFVLEtBQUs7QUFDNUMsdUJBQW1CLFVBQVUsV0FBVyxLQUFLO0FBQzdDLHVCQUFtQixVQUFVLFVBQVUsS0FBSztBQUM1Qyx1QkFBbUIsVUFBVSxXQUFXLEtBQUs7QUFDN0MsdUJBQW1CLFVBQVUsS0FBSyxLQUFLO0FBRXZDLHVCQUFtQixTQUFTLFNBQVMsS0FBSztBQUMxQyx1QkFBbUIsU0FBUyxTQUFTLEtBQUs7QUFDMUMsdUJBQW1CLFNBQVMsVUFBVSxLQUFLO0FBQzNDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxXQUFXLElBQUk7QUFDM0MsdUJBQW1CLFNBQVMsVUFBVSxJQUFJO0FBQzFDLHVCQUFtQixTQUFTLFdBQVcsSUFBSTtBQUMzQyx1QkFBbUIsU0FBUyxLQUFLLEtBQUs7QUFFdEMsdUJBQW1CLFVBQVUsU0FBUyxLQUFLO0FBQzNDLHVCQUFtQixVQUFVLFNBQVMsSUFBSTtBQUMxQyx1QkFBbUIsVUFBVSxVQUFVLElBQUk7QUFDM0MsdUJBQW1CLFVBQVUsVUFBVSxLQUFLO0FBQzVDLHVCQUFtQixVQUFVLFdBQVcsS0FBSztBQUM3Qyx1QkFBbUIsVUFBVSxVQUFVLElBQUk7QUFDM0MsdUJBQW1CLFVBQVUsV0FBVyxJQUFJO0FBQzVDLHVCQUFtQixVQUFVLEtBQUssS0FBSztBQUt2Qyx1QkFBbUIsU0FBUyxTQUFTLEtBQUs7QUFDMUMsdUJBQW1CLFNBQVMsU0FBUyxLQUFLO0FBQzFDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsV0FBVyxJQUFJO0FBQzNDLHVCQUFtQixTQUFTLFVBQVUsSUFBSTtBQUMxQyx1QkFBbUIsU0FBUyxXQUFXLElBQUk7QUFDM0MsdUJBQW1CLFNBQVMsU0FBUyxJQUFJO0FBQ3pDLHVCQUFtQixTQUFTLFVBQVUsSUFBSTtBQUMxQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsS0FBSyxLQUFLO0FBRXRDLHVCQUFtQixXQUFXLFNBQVMsS0FBSztBQUM1Qyx1QkFBbUIsV0FBVyxTQUFTLEtBQUs7QUFDNUMsdUJBQW1CLFdBQVcsVUFBVSxLQUFLO0FBQzdDLHVCQUFtQixXQUFXLFVBQVUsS0FBSztBQUM3Qyx1QkFBbUIsV0FBVyxXQUFXLElBQUk7QUFDN0MsdUJBQW1CLFdBQVcsVUFBVSxJQUFJO0FBQzVDLHVCQUFtQixXQUFXLFdBQVcsSUFBSTtBQUM3Qyx1QkFBbUIsV0FBVyxTQUFTLEtBQUs7QUFDNUMsdUJBQW1CLFdBQVcsVUFBVSxJQUFJO0FBQzVDLHVCQUFtQixXQUFXLFVBQVUsSUFBSTtBQUM1Qyx1QkFBbUIsV0FBVyxVQUFVLEtBQUs7QUFDN0MsdUJBQW1CLFdBQVcsS0FBSyxLQUFLO0FBRXhDLHVCQUFtQixXQUFXLFNBQVMsS0FBSztBQUM1Qyx1QkFBbUIsV0FBVyxTQUFTLEtBQUs7QUFDNUMsdUJBQW1CLFdBQVcsVUFBVSxLQUFLO0FBQzdDLHVCQUFtQixXQUFXLFVBQVUsS0FBSztBQUM3Qyx1QkFBbUIsV0FBVyxXQUFXLElBQUk7QUFDN0MsdUJBQW1CLFdBQVcsVUFBVSxJQUFJO0FBQzVDLHVCQUFtQixXQUFXLFdBQVcsSUFBSTtBQUM3Qyx1QkFBbUIsV0FBVyxTQUFTLEtBQUs7QUFDNUMsdUJBQW1CLFdBQVcsVUFBVSxJQUFJO0FBQzVDLHVCQUFtQixXQUFXLFVBQVUsSUFBSTtBQUM1Qyx1QkFBbUIsV0FBVyxZQUFZLElBQUk7QUFDOUMsdUJBQW1CLFdBQVcsVUFBVSxLQUFLO0FBQzdDLHVCQUFtQixXQUFXLEtBQUssS0FBSztBQUV4Qyx1QkFBbUIsU0FBUyxTQUFTLEtBQUs7QUFDMUMsdUJBQW1CLFNBQVMsU0FBUyxLQUFLO0FBQzFDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsV0FBVyxLQUFLO0FBQzVDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxXQUFXLEtBQUs7QUFDNUMsdUJBQW1CLFNBQVMsU0FBUyxLQUFLO0FBQzFDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsWUFBWSxLQUFLO0FBQzdDLHVCQUFtQixTQUFTLFVBQVUsSUFBSTtBQUMxQyx1QkFBbUIsU0FBUyxLQUFLLEtBQUs7QUFHdEMsdUJBQW1CLFVBQVUsb0JBQW9CLElBQUk7QUFDckQsdUJBQW1CLFVBQVUsb0JBQW9CLElBQUk7QUFDckQsdUJBQW1CLFVBQVUsb0JBQW9CLEtBQUs7QUFDdEQsdUJBQW1CLFVBQVUsb0JBQW9CLElBQUk7QUFDckQsdUJBQW1CLFVBQVUsb0JBQW9CLElBQUk7QUFHckQsdUJBQW1CLFVBQVUsd0JBQXdCLElBQUk7QUFDekQsdUJBQW1CLFVBQVUsd0JBQXdCLEtBQUs7QUFDMUQsdUJBQW1CLFVBQVUsd0JBQXdCLElBQUk7QUFBQSxFQUMxRCxDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLFdBQVc7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsUUFDUixRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1Y7QUFDQSxXQUFPLFlBQVksd0JBQXdCLFVBQVUsUUFBVyxVQUFVLE9BQU8sQ0FBQyxDQUFDLEdBQUcsS0FBSztBQUFBLEVBQzVGLENBQUM7QUFFRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
