import assert from "assert";
import { compareItemsByFuzzyScore, pieceToQuery, prepareQuery, scoreFuzzy, scoreFuzzy2, scoreItemFuzzy } from "../../common/fuzzyScorer.js";
import { Schemas } from "../../common/network.js";
import { basename, dirname, posix, sep, win32 } from "../../common/path.js";
import { isWindows } from "../../common/platform.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
class ResourceAccessorClass {
  getItemLabel(resource) {
    return basename(resource.fsPath);
  }
  getItemDescription(resource) {
    return dirname(resource.fsPath);
  }
  getItemPath(resource) {
    return resource.fsPath;
  }
}
const ResourceAccessor = new ResourceAccessorClass();
class ResourceWithSlashAccessorClass {
  getItemLabel(resource) {
    return basename(resource.fsPath);
  }
  getItemDescription(resource) {
    return posix.normalize(dirname(resource.path));
  }
  getItemPath(resource) {
    return posix.normalize(resource.path);
  }
}
const ResourceWithSlashAccessor = new ResourceWithSlashAccessorClass();
class ResourceWithBackslashAccessorClass {
  getItemLabel(resource) {
    return basename(resource.fsPath);
  }
  getItemDescription(resource) {
    return win32.normalize(dirname(resource.path));
  }
  getItemPath(resource) {
    return win32.normalize(resource.path);
  }
}
const ResourceWithBackslashAccessor = new ResourceWithBackslashAccessorClass();
class NullAccessorClass {
  getItemLabel(resource) {
    return void 0;
  }
  getItemDescription(resource) {
    return void 0;
  }
  getItemPath(resource) {
    return void 0;
  }
}
function _doScore(target, query, allowNonContiguousMatches) {
  const preparedQuery = prepareQuery(query);
  return scoreFuzzy(target, preparedQuery.normalized, preparedQuery.normalizedLowercase, allowNonContiguousMatches ?? !preparedQuery.expectContiguousMatch);
}
function _doScore2(target, query, matchOffset = 0) {
  const preparedQuery = prepareQuery(query);
  return scoreFuzzy2(target, preparedQuery, 0, matchOffset);
}
function scoreItem(item, query, allowNonContiguousMatches, accessor, cache = /* @__PURE__ */ Object.create(null)) {
  return scoreItemFuzzy(item, prepareQuery(query), allowNonContiguousMatches, accessor, cache);
}
function compareItemsByScore(itemA, itemB, query, allowNonContiguousMatches, accessor) {
  return compareItemsByFuzzyScore(itemA, itemB, prepareQuery(query), allowNonContiguousMatches, accessor, /* @__PURE__ */ Object.create(null));
}
const NullAccessor = new NullAccessorClass();
suite("Fuzzy Scorer", () => {
  test("score (fuzzy)", function() {
    const target = "HelLo-World";
    const scores = [];
    scores.push(_doScore(target, "HelLo-World", true));
    scores.push(_doScore(target, "hello-world", true));
    scores.push(_doScore(target, "HW", true));
    scores.push(_doScore(target, "hw", true));
    scores.push(_doScore(target, "H", true));
    scores.push(_doScore(target, "h", true));
    scores.push(_doScore(target, "W", true));
    scores.push(_doScore(target, "Ld", true));
    scores.push(_doScore(target, "ld", true));
    scores.push(_doScore(target, "w", true));
    scores.push(_doScore(target, "L", true));
    scores.push(_doScore(target, "l", true));
    scores.push(_doScore(target, "4", true));
    const sortedScores = scores.concat().sort((a, b) => b[0] - a[0]);
    assert.deepStrictEqual(scores, sortedScores);
  });
  test("score (non fuzzy)", function() {
    const target = "HelLo-World";
    assert.ok(_doScore(target, "HelLo-World", false)[0] > 0);
    assert.strictEqual(_doScore(target, "HelLo-World", false)[1].length, "HelLo-World".length);
    assert.ok(_doScore(target, "hello-world", false)[0] > 0);
    assert.strictEqual(_doScore(target, "HW", false)[0], 0);
    assert.ok(_doScore(target, "h", false)[0] > 0);
    assert.ok(_doScore(target, "ello", false)[0] > 0);
    assert.ok(_doScore(target, "ld", false)[0] > 0);
    assert.strictEqual(_doScore(target, "eo", false)[0], 0);
  });
  test("scoreItem - matches are proper", function() {
    let res = scoreItem(null, "something", true, ResourceAccessor);
    assert.ok(!res.score);
    const resource = URI.file("/xyz/some/path/someFile123.txt");
    res = scoreItem(resource, "something", true, NullAccessor);
    assert.ok(!res.score);
    const identityRes = scoreItem(resource, ResourceAccessor.getItemPath(resource), true, ResourceAccessor);
    assert.ok(identityRes.score);
    assert.strictEqual(identityRes.descriptionMatch.length, 1);
    assert.strictEqual(identityRes.labelMatch.length, 1);
    assert.strictEqual(identityRes.descriptionMatch[0].start, 0);
    assert.strictEqual(identityRes.descriptionMatch[0].end, ResourceAccessor.getItemDescription(resource).length);
    assert.strictEqual(identityRes.labelMatch[0].start, 0);
    assert.strictEqual(identityRes.labelMatch[0].end, ResourceAccessor.getItemLabel(resource).length);
    const basenamePrefixRes = scoreItem(resource, "som", true, ResourceAccessor);
    assert.ok(basenamePrefixRes.score);
    assert.ok(!basenamePrefixRes.descriptionMatch);
    assert.strictEqual(basenamePrefixRes.labelMatch.length, 1);
    assert.strictEqual(basenamePrefixRes.labelMatch[0].start, 0);
    assert.strictEqual(basenamePrefixRes.labelMatch[0].end, "som".length);
    const basenameCamelcaseRes = scoreItem(resource, "sF", true, ResourceAccessor);
    assert.ok(basenameCamelcaseRes.score);
    assert.ok(!basenameCamelcaseRes.descriptionMatch);
    assert.strictEqual(basenameCamelcaseRes.labelMatch.length, 2);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[0].start, 0);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[0].end, 1);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[1].start, 4);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[1].end, 5);
    const basenameRes = scoreItem(resource, "of", true, ResourceAccessor);
    assert.ok(basenameRes.score);
    assert.ok(!basenameRes.descriptionMatch);
    assert.strictEqual(basenameRes.labelMatch.length, 2);
    assert.strictEqual(basenameRes.labelMatch[0].start, 1);
    assert.strictEqual(basenameRes.labelMatch[0].end, 2);
    assert.strictEqual(basenameRes.labelMatch[1].start, 4);
    assert.strictEqual(basenameRes.labelMatch[1].end, 5);
    const pathRes = scoreItem(resource, "xyz123", true, ResourceAccessor);
    assert.ok(pathRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 8);
    assert.strictEqual(pathRes.labelMatch[0].end, 11);
    assert.strictEqual(pathRes.descriptionMatch.length, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].start, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].end, 4);
    const ellipsisRes = scoreItem(resource, "\u2026me/path/someFile123.txt", true, ResourceAccessor);
    assert.ok(ellipsisRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 8);
    assert.strictEqual(pathRes.labelMatch[0].end, 11);
    assert.strictEqual(pathRes.descriptionMatch.length, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].start, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].end, 4);
    const noRes = scoreItem(resource, "987", true, ResourceAccessor);
    assert.ok(!noRes.score);
    assert.ok(!noRes.labelMatch);
    assert.ok(!noRes.descriptionMatch);
    const noExactRes = scoreItem(resource, '"sF"', true, ResourceAccessor);
    assert.ok(!noExactRes.score);
    assert.ok(!noExactRes.labelMatch);
    assert.ok(!noExactRes.descriptionMatch);
    assert.strictEqual(noRes.score, noExactRes.score);
    assert.ok(identityRes.score > basenamePrefixRes.score);
    assert.ok(basenamePrefixRes.score > basenameRes.score);
    assert.ok(basenameRes.score > pathRes.score);
    assert.ok(pathRes.score > noRes.score);
  });
  test("scoreItem - multiple", function() {
    const resource = URI.file("/xyz/some/path/someFile123.txt");
    const res1 = scoreItem(resource, "xyz some", true, ResourceAccessor);
    assert.ok(res1.score);
    assert.strictEqual(res1.labelMatch?.length, 1);
    assert.strictEqual(res1.labelMatch[0].start, 0);
    assert.strictEqual(res1.labelMatch[0].end, 4);
    assert.strictEqual(res1.descriptionMatch?.length, 1);
    assert.strictEqual(res1.descriptionMatch[0].start, 1);
    assert.strictEqual(res1.descriptionMatch[0].end, 4);
    const res2 = scoreItem(resource, "some xyz", true, ResourceAccessor);
    assert.ok(res2.score);
    assert.strictEqual(res1.score, res2.score);
    assert.strictEqual(res2.labelMatch?.length, 1);
    assert.strictEqual(res2.labelMatch[0].start, 0);
    assert.strictEqual(res2.labelMatch[0].end, 4);
    assert.strictEqual(res2.descriptionMatch?.length, 1);
    assert.strictEqual(res2.descriptionMatch[0].start, 1);
    assert.strictEqual(res2.descriptionMatch[0].end, 4);
    const res3 = scoreItem(resource, "some xyz file file123", true, ResourceAccessor);
    assert.ok(res3.score);
    assert.ok(res3.score > res2.score);
    assert.strictEqual(res3.labelMatch?.length, 1);
    assert.strictEqual(res3.labelMatch[0].start, 0);
    assert.strictEqual(res3.labelMatch[0].end, 11);
    assert.strictEqual(res3.descriptionMatch?.length, 1);
    assert.strictEqual(res3.descriptionMatch[0].start, 1);
    assert.strictEqual(res3.descriptionMatch[0].end, 4);
    const res4 = scoreItem(resource, "path z y", true, ResourceAccessor);
    assert.ok(res4.score);
    assert.ok(res4.score < res2.score);
    assert.strictEqual(res4.labelMatch?.length, 0);
    assert.strictEqual(res4.descriptionMatch?.length, 2);
    assert.strictEqual(res4.descriptionMatch[0].start, 2);
    assert.strictEqual(res4.descriptionMatch[0].end, 4);
    assert.strictEqual(res4.descriptionMatch[1].start, 10);
    assert.strictEqual(res4.descriptionMatch[1].end, 14);
  });
  test("scoreItem - multiple with cache yields different results", function() {
    const resource = URI.file("/xyz/some/path/someFile123.txt");
    const cache = {};
    const res1 = scoreItem(resource, "xyz sm", true, ResourceAccessor, cache);
    assert.ok(res1.score);
    const res2 = scoreItem(resource, 'xyz "sm"', true, ResourceAccessor, cache);
    assert.ok(!res2.score);
  });
  test("scoreItem - invalid input", function() {
    let res = scoreItem(null, null, true, ResourceAccessor);
    assert.strictEqual(res.score, 0);
    res = scoreItem(null, "null", true, ResourceAccessor);
    assert.strictEqual(res.score, 0);
  });
  test("scoreItem - optimize for file paths", function() {
    const resource = URI.file("/xyz/others/spath/some/xsp/file123.txt");
    const pathRes = scoreItem(resource, "xspfile123", true, ResourceAccessor);
    assert.ok(pathRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 0);
    assert.strictEqual(pathRes.labelMatch[0].end, 7);
    assert.strictEqual(pathRes.descriptionMatch.length, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].start, 23);
    assert.strictEqual(pathRes.descriptionMatch[0].end, 26);
  });
  test("scoreItem - avoid match scattering (bug #36119)", function() {
    const resource = URI.file("projects/ui/cula/ats/target.mk");
    const pathRes = scoreItem(resource, "tcltarget.mk", true, ResourceAccessor);
    assert.ok(pathRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 0);
    assert.strictEqual(pathRes.labelMatch[0].end, 9);
  });
  test("scoreItem - prefers more compact matches", function() {
    const resource = URI.file("/1a111d1/11a1d1/something.txt");
    const res = scoreItem(resource, "ad", true, ResourceAccessor);
    assert.ok(res.score);
    assert.ok(res.descriptionMatch);
    assert.ok(!res.labelMatch.length);
    assert.strictEqual(res.descriptionMatch.length, 2);
    assert.strictEqual(res.descriptionMatch[0].start, 11);
    assert.strictEqual(res.descriptionMatch[0].end, 12);
    assert.strictEqual(res.descriptionMatch[1].start, 13);
    assert.strictEqual(res.descriptionMatch[1].end, 14);
  });
  test("scoreItem - proper target offset", function() {
    const resource = URI.file("etem");
    const res = scoreItem(resource, "teem", true, ResourceAccessor);
    assert.ok(!res.score);
  });
  test("scoreItem - proper target offset #2", function() {
    const resource = URI.file("ede");
    const res = scoreItem(resource, "de", true, ResourceAccessor);
    assert.strictEqual(res.labelMatch.length, 1);
    assert.strictEqual(res.labelMatch[0].start, 1);
    assert.strictEqual(res.labelMatch[0].end, 3);
  });
  test("scoreItem - proper target offset #3", function() {
    const resource = URI.file("/src/vs/editor/browser/viewParts/lineNumbers/flipped-cursor-2x.svg");
    const res = scoreItem(resource, "debug", true, ResourceAccessor);
    assert.strictEqual(res.descriptionMatch.length, 3);
    assert.strictEqual(res.descriptionMatch[0].start, 9);
    assert.strictEqual(res.descriptionMatch[0].end, 10);
    assert.strictEqual(res.descriptionMatch[1].start, 36);
    assert.strictEqual(res.descriptionMatch[1].end, 37);
    assert.strictEqual(res.descriptionMatch[2].start, 40);
    assert.strictEqual(res.descriptionMatch[2].end, 41);
    assert.strictEqual(res.labelMatch.length, 2);
    assert.strictEqual(res.labelMatch[0].start, 9);
    assert.strictEqual(res.labelMatch[0].end, 10);
    assert.strictEqual(res.labelMatch[1].start, 20);
    assert.strictEqual(res.labelMatch[1].end, 21);
  });
  test("scoreItem - no match unless query contained in sequence", function() {
    const resource = URI.file("abcde");
    const res = scoreItem(resource, "edcda", true, ResourceAccessor);
    assert.ok(!res.score);
  });
  test("scoreItem - match if using slash or backslash (local, remote resource)", function() {
    const localResource = URI.file("abcde/super/duper");
    const remoteResource = URI.from({ scheme: Schemas.vscodeRemote, path: "abcde/super/duper" });
    for (const resource of [localResource, remoteResource]) {
      let res = scoreItem(resource, "abcde\\super\\duper", true, ResourceAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde\\super\\duper", true, ResourceWithSlashAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde\\super\\duper", true, ResourceWithBackslashAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde/super/duper", true, ResourceAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde/super/duper", true, ResourceWithSlashAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde/super/duper", true, ResourceWithBackslashAccessor);
      assert.ok(res.score);
    }
  });
  test("scoreItem - ensure upper case bonus only applies on non-consecutive matches (bug #134723)", function() {
    const resourceWithUpper = URI.file("ASDFasdfasdf");
    const resourceAllLower = URI.file("asdfasdfasdf");
    assert.ok(scoreItem(resourceAllLower, "asdf", true, ResourceAccessor).score > scoreItem(resourceWithUpper, "asdf", true, ResourceAccessor).score);
  });
  test("compareItemsByScore - identity", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = ResourceAccessor.getItemPath(resourceA);
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = ResourceAccessor.getItemPath(resourceB);
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - basename prefix", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = ResourceAccessor.getItemLabel(resourceA);
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = ResourceAccessor.getItemLabel(resourceB);
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - basename camelcase", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = "fA";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = "fB";
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - basename scores", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = "fileA";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = "fileB";
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - path scores", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = "pathfileA";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = "pathfileB";
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer shorter basenames", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileBLonger.txt");
    const resourceC = URI.file("/unrelated/the/path/other/fileC.txt");
    const query = "somepath";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer shorter basenames (match on basename)", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileBLonger.txt");
    const resourceC = URI.file("/unrelated/the/path/other/fileC.txt");
    const query = "file";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
  });
  test("compareFilesByScore - prefer shorter paths", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    const query = "somepath";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer shorter paths (bug #17443)", function() {
    const resourceA = URI.file("config/test/t1.js");
    const resourceB = URI.file("config/test.js");
    const resourceC = URI.file("config/test/t2.js");
    const query = "co/te";
    const res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer matches in label over description if scores are otherwise equal", function() {
    const resourceA = URI.file("parts/quick/arrow-left-dark.svg");
    const resourceB = URI.file("parts/quickopen/quickopen.ts");
    const query = "partsquick";
    const res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer camel case matches", function() {
    const resourceA = URI.file("config/test/NullPointerException.java");
    const resourceB = URI.file("config/test/nopointerexception.java");
    for (const query of ["npe", "NPE"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer more compact camel case matches", function() {
    const resourceA = URI.file("config/test/openthisAnythingHandler.js");
    const resourceB = URI.file("config/test/openthisisnotsorelevantforthequeryAnyHand.js");
    const query = "AH";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer more compact matches (label)", function() {
    const resourceA = URI.file("config/test/examasdaple.js");
    const resourceB = URI.file("config/test/exampleasdaasd.ts");
    const query = "xp";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer more compact matches (path)", function() {
    const resourceA = URI.file("config/test/examasdaple/file.js");
    const resourceB = URI.file("config/test/exampleasdaasd/file.ts");
    const query = "xp";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer more compact matches (label and path)", function() {
    const resourceA = URI.file("config/example/thisfile.ts");
    const resourceB = URI.file("config/24234243244/example/file.js");
    const query = "exfile";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - avoid match scattering (bug #34210)", function() {
    const resourceA = URI.file("node_modules1/bundle/lib/model/modules/ot1/index.js");
    const resourceB = URI.file("node_modules1/bundle/lib/model/modules/un1/index.js");
    const resourceC = URI.file("node_modules1/bundle/lib/model/modules/modu1/index.js");
    const resourceD = URI.file("node_modules1/bundle/lib/model/modules/oddl1/index.js");
    let query = isWindows ? "modu1\\index.js" : "modu1/index.js";
    let res = [resourceA, resourceB, resourceC, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    res = [resourceC, resourceB, resourceA, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    query = isWindows ? "un1\\index.js" : "un1/index.js";
    res = [resourceA, resourceB, resourceC, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceC, resourceB, resourceA, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #21019 1.)", function() {
    const resourceA = URI.file("app/containers/Services/NetworkData/ServiceDetails/ServiceLoad/index.js");
    const resourceB = URI.file("app/containers/Services/NetworkData/ServiceDetails/ServiceDistribution/index.js");
    const resourceC = URI.file("app/containers/Services/NetworkData/ServiceDetailTabs/ServiceTabs/StatVideo/index.js");
    const query = "StatVideoindex";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
  });
  test("compareFilesByScore - avoid match scattering (bug #21019 2.)", function() {
    const resourceA = URI.file("src/build-helper/store/redux.ts");
    const resourceB = URI.file("src/repository/store/redux.ts");
    const query = "reproreduxts";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #26649)", function() {
    const resourceA = URI.file("photobook/src/components/AddPagesButton/index.js");
    const resourceB = URI.file("photobook/src/components/ApprovalPageHeader/index.js");
    const resourceC = URI.file("photobook/src/canvasComponents/BookPage/index.js");
    const query = "bookpageIndex";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
  });
  test("compareFilesByScore - avoid match scattering (bug #33247)", function() {
    const resourceA = URI.file("ui/src/utils/constants.js");
    const resourceB = URI.file("ui/src/ui/Icons/index.js");
    const query = isWindows ? "ui\\icons" : "ui/icons";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #33247 comment)", function() {
    const resourceA = URI.file("ui/src/components/IDInput/index.js");
    const resourceB = URI.file("ui/src/ui/Input/index.js");
    const query = isWindows ? "ui\\input\\index" : "ui/input/index";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #36166)", function() {
    const resourceA = URI.file("django/contrib/sites/locale/ga/LC_MESSAGES/django.mo");
    const resourceB = URI.file("django/core/signals.py");
    const query = "djancosig";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #32918)", function() {
    const resourceA = URI.file("adsys/protected/config.php");
    const resourceB = URI.file("adsys/protected/framework/smarty/sysplugins/smarty_internal_config.php");
    const resourceC = URI.file("duowanVideo/wap/protected/config.php");
    const query = "protectedconfig.php";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #14879)", function() {
    const resourceA = URI.file("pkg/search/gradient/testdata/constraint_attrMatchString.yml");
    const resourceB = URI.file("cmd/gradient/main.go");
    const query = "gradientmain";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #14727 1)", function() {
    const resourceA = URI.file("alpha-beta-cappa.txt");
    const resourceB = URI.file("abc.txt");
    const query = "abc";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #14727 2)", function() {
    const resourceA = URI.file("xerxes-yak-zubba/index.js");
    const resourceB = URI.file("xyz/index.js");
    const query = "xyz";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #18381)", function() {
    const resourceA = URI.file("AssymblyInfo.cs");
    const resourceB = URI.file("IAsynchronousTask.java");
    const query = "async";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #35572)", function() {
    const resourceA = URI.file("static/app/source/angluar/-admin/-organization/-settings/layout/layout.js");
    const resourceB = URI.file("static/app/source/angular/-admin/-project/-settings/_settings/settings.js");
    const query = "partisettings";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #36810)", function() {
    const resourceA = URI.file("Trilby.TrilbyTV.Web.Portal/Views/Systems/Index.cshtml");
    const resourceB = URI.file("Trilby.TrilbyTV.Web.Portal/Areas/Admins/Views/Tips/Index.cshtml");
    const query = "tipsindex.cshtml";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - prefer shorter hit (bug #20546)", function() {
    const resourceA = URI.file("editor/core/components/tests/list-view-spec.js");
    const resourceB = URI.file("editor/core/components/list-view.js");
    const query = "listview";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #12095)", function() {
    const resourceA = URI.file("src/vs/workbench/contrib/files/common/explorerViewModel.ts");
    const resourceB = URI.file("src/vs/workbench/contrib/files/browser/views/explorerView.ts");
    const resourceC = URI.file("src/vs/workbench/contrib/files/browser/views/explorerViewer.ts");
    const query = "filesexplorerview.ts";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceA, resourceC, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - prefer case match (bug #96122)", function() {
    const resourceA = URI.file("lists.php");
    const resourceB = URI.file("lib/Lists.php");
    const query = "Lists.php";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - prefer shorter match (bug #103052) - foo bar", function() {
    const resourceA = URI.file("app/emails/foo.bar.js");
    const resourceB = URI.file("app/emails/other-footer.other-bar.js");
    for (const query of ["foo bar", "foobar"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer shorter match (bug #103052) - payment model", function() {
    const resourceA = URI.file("app/components/payment/payment.model.js");
    const resourceB = URI.file("app/components/online-payments-history/online-payments-history.model.js");
    for (const query of ["payment model", "paymentmodel"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer shorter match (bug #103052) - color", function() {
    const resourceA = URI.file("app/constants/color.js");
    const resourceB = URI.file("app/components/model/input/pick-avatar-color.js");
    for (const query of ["color js", "colorjs"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer strict case prefix", function() {
    const resourceA = URI.file("app/constants/color.js");
    const resourceB = URI.file("app/components/model/input/Color.js");
    let query = "Color";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    query = "color";
    res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
  });
  test("compareFilesByScore - prefer prefix (bug #103052)", function() {
    const resourceA = URI.file("test/smoke/src/main.ts");
    const resourceB = URI.file("src/vs/editor/common/services/semantikTokensProviderStyling.ts");
    const query = "smoke main.ts";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
  });
  test("compareFilesByScore - boost better prefix match if multiple queries are used", function() {
    const resourceA = URI.file("src/vs/workbench/services/host/browser/browserHostService.ts");
    const resourceB = URI.file("src/vs/workbench/browser/workbench.ts");
    for (const query of ["workbench.ts browser", "browser workbench.ts", "browser workbench", "workbench browser"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
    }
  });
  test("compareFilesByScore - boost shorter prefix match if multiple queries are used", function() {
    const resourceA = URI.file("src/vs/workbench/node/actions/windowActions.ts");
    const resourceB = URI.file("src/vs/workbench/electron-node/window.ts");
    for (const query of ["window node", "window.ts node"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
    }
  });
  test("compareFilesByScore - skip preference on label match when using path sep", function() {
    const resourceA = URI.file("djangosite/ufrela/def.py");
    const resourceB = URI.file("djangosite/urls/default.py");
    const query = "url/def";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - boost shorter prefix match if multiple queries are used (#99171)", function() {
    const resourceA = URI.file("mesh_editor_lifetime_job.h");
    const resourceB = URI.file("lifetime_job.h");
    const query = "m life, life m";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - boost consecutive matches in the beginning over end", function() {
    const resourceA = URI.file("src/vs/server/node/extensionHostStatusService.ts");
    const resourceB = URI.file("src/vs/workbench/browser/parts/notifications/notificationsStatus.ts");
    const query = "notStatus";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("prepareQuery", () => {
    assert.strictEqual(prepareQuery(" f*a ").normalized, "fa");
    assert.strictEqual(prepareQuery(" f\u2026a ").normalized, "fa");
    assert.strictEqual(prepareQuery("main#").normalized, "main");
    assert.strictEqual(prepareQuery("main#").original, "main#");
    assert.strictEqual(prepareQuery("foo*").normalized, "foo");
    assert.strictEqual(prepareQuery("foo*").original, "foo*");
    assert.strictEqual(prepareQuery("model Tester.ts").original, "model Tester.ts");
    assert.strictEqual(prepareQuery("model Tester.ts").originalLowercase, "model Tester.ts".toLowerCase());
    assert.strictEqual(prepareQuery("model Tester.ts").normalized, "modelTester.ts");
    assert.strictEqual(prepareQuery("model Tester.ts").expectContiguousMatch, false);
    assert.strictEqual(prepareQuery("Model Tester.ts").normalizedLowercase, "modeltester.ts");
    assert.strictEqual(prepareQuery("ModelTester.ts").containsPathSeparator, false);
    assert.strictEqual(prepareQuery("Model" + sep + "Tester.ts").containsPathSeparator, true);
    assert.strictEqual(prepareQuery('"hello"').expectContiguousMatch, true);
    assert.strictEqual(prepareQuery('"hello"').normalized, "hello");
    let query = prepareQuery("He*llo World");
    assert.strictEqual(query.original, "He*llo World");
    assert.strictEqual(query.normalized, "HelloWorld");
    assert.strictEqual(query.normalizedLowercase, "HelloWorld".toLowerCase());
    assert.strictEqual(query.values?.length, 2);
    assert.strictEqual(query.values?.[0].original, "He*llo");
    assert.strictEqual(query.values?.[0].normalized, "Hello");
    assert.strictEqual(query.values?.[0].normalizedLowercase, "Hello".toLowerCase());
    assert.strictEqual(query.values?.[1].original, "World");
    assert.strictEqual(query.values?.[1].normalized, "World");
    assert.strictEqual(query.values?.[1].normalizedLowercase, "World".toLowerCase());
    const restoredQuery = pieceToQuery(query.values);
    assert.strictEqual(restoredQuery.original, query.original);
    assert.strictEqual(restoredQuery.values?.length, query.values?.length);
    assert.strictEqual(restoredQuery.containsPathSeparator, query.containsPathSeparator);
    query = prepareQuery(" Hello   World  	");
    assert.strictEqual(query.original, " Hello   World  	");
    assert.strictEqual(query.originalLowercase, " Hello   World  	".toLowerCase());
    assert.strictEqual(query.normalized, "HelloWorld");
    assert.strictEqual(query.normalizedLowercase, "HelloWorld".toLowerCase());
    assert.strictEqual(query.values?.length, 2);
    assert.strictEqual(query.values?.[0].original, "Hello");
    assert.strictEqual(query.values?.[0].originalLowercase, "Hello".toLowerCase());
    assert.strictEqual(query.values?.[0].normalized, "Hello");
    assert.strictEqual(query.values?.[0].normalizedLowercase, "Hello".toLowerCase());
    assert.strictEqual(query.values?.[1].original, "World");
    assert.strictEqual(query.values?.[1].originalLowercase, "World".toLowerCase());
    assert.strictEqual(query.values?.[1].normalized, "World");
    assert.strictEqual(query.values?.[1].normalizedLowercase, "World".toLowerCase());
    if (isWindows) {
      assert.strictEqual(prepareQuery("C:\\some\\path").pathNormalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:\\some\\path").normalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:\\some\\path").containsPathSeparator, true);
      assert.strictEqual(prepareQuery("C:/some/path").pathNormalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:/some/path").normalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:/some/path").containsPathSeparator, true);
    } else {
      assert.strictEqual(prepareQuery("/some/path").pathNormalized, "/some/path");
      assert.strictEqual(prepareQuery("/some/path").normalized, "/some/path");
      assert.strictEqual(prepareQuery("/some/path").containsPathSeparator, true);
      assert.strictEqual(prepareQuery("\\some\\path").pathNormalized, "/some/path");
      assert.strictEqual(prepareQuery("\\some\\path").normalized, "/some/path");
      assert.strictEqual(prepareQuery("\\some\\path").containsPathSeparator, true);
    }
  });
  test("fuzzyScore2 (matching)", function() {
    const target = "HelLo-World";
    for (const offset of [0, 3]) {
      let [score, matches] = _doScore2(offset === 0 ? target : `123${target}`, "HelLo-World", offset);
      assert.ok(score);
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].start, 0 + offset);
      assert.strictEqual(matches[0].end, target.length + offset);
      [score, matches] = _doScore2(offset === 0 ? target : `123${target}`, "HW", offset);
      assert.ok(score);
      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0].start, 0 + offset);
      assert.strictEqual(matches[0].end, 1 + offset);
      assert.strictEqual(matches[1].start, 6 + offset);
      assert.strictEqual(matches[1].end, 7 + offset);
    }
  });
  test("fuzzyScore2 (multiple queries)", function() {
    const target = "HelLo-World";
    const [firstSingleScore, firstSingleMatches] = _doScore2(target, "HelLo");
    const [secondSingleScore, secondSingleMatches] = _doScore2(target, "World");
    const firstAndSecondSingleMatches = [...firstSingleMatches || [], ...secondSingleMatches || []];
    let [multiScore, multiMatches] = _doScore2(target, "HelLo World");
    function assertScore() {
      assert.ok((multiScore ?? 0) >= (firstSingleScore ?? 0) + (secondSingleScore ?? 0));
      for (let i = 0; multiMatches && i < multiMatches.length; i++) {
        const multiMatch = multiMatches[i];
        const firstAndSecondSingleMatch = firstAndSecondSingleMatches[i];
        if (multiMatch && firstAndSecondSingleMatch) {
          assert.strictEqual(multiMatch.start, firstAndSecondSingleMatch.start);
          assert.strictEqual(multiMatch.end, firstAndSecondSingleMatch.end);
        } else {
          assert.fail();
        }
      }
    }
    function assertNoScore() {
      assert.strictEqual(multiScore, void 0);
      assert.strictEqual(multiMatches.length, 0);
    }
    assertScore();
    [multiScore, multiMatches] = _doScore2(target, "World HelLo");
    assertScore();
    [multiScore, multiMatches] = _doScore2(target, "World HelLo World");
    assertScore();
    [multiScore, multiMatches] = _doScore2(target, "World HelLo Nothing");
    assertNoScore();
    [multiScore, multiMatches] = _doScore2(target, "More Nothing");
    assertNoScore();
  });
  test("fuzzyScore2 (#95716)", function() {
    const target = "# \u274C Wow";
    const score = _doScore2(target, "\u274C");
    assert.ok(score);
    assert.ok(typeof score[0] === "number");
    assert.ok(score[1].length > 0);
  });
  test("Using quotes should expect contiguous matches match", function() {
    assert.strictEqual(_doScore("contiguous", '"contguous"')[0], 0);
    const score = _doScore("contiguous", '"contiguous"');
    assert.ok(score[0] > 0);
  });
  test("Using quotes should highlight contiguous indexes", function() {
    const score = _doScore("2021-7-26.md", '"26"');
    assert.strictEqual(score[0], 14);
    assert.strictEqual(score[1][0], 7);
    assert.strictEqual(score[1][1], 8);
  });
  test("Workspace symbol search with special characters (#, *)", function() {
    let query = prepareQuery("main#");
    assert.strictEqual(query.original, "main#");
    assert.strictEqual(query.normalized, "main");
    let [score, matches] = _doScore2("main", "main#");
    assert.ok(typeof score === "number" && score > 0, 'Should match "main" symbol when query is "main#"');
    assert.ok(matches.length > 0);
    query = prepareQuery("foo*");
    assert.strictEqual(query.original, "foo*");
    assert.strictEqual(query.normalized, "foo");
    [score, matches] = _doScore2("foo", "foo*");
    assert.ok(typeof score === "number" && score > 0, 'Should match "foo" symbol when query is "foo*"');
    assert.ok(matches.length > 0);
    query = prepareQuery("MyClass#*");
    assert.strictEqual(query.original, "MyClass#*");
    assert.strictEqual(query.normalized, "MyClass");
    [score, matches] = _doScore2("MyClass", "MyClass#*");
    assert.ok(typeof score === "number" && score > 0, 'Should match "MyClass" symbol when query is "MyClass#*"');
    assert.ok(matches.length > 0);
    query = prepareQuery("MC#");
    assert.strictEqual(query.original, "MC#");
    assert.strictEqual(query.normalized, "MC");
    [score, matches] = _doScore2("MyClass", "MC#");
    assert.ok(typeof score === "number" && score > 0, 'Should fuzzy match "MyClass" symbol when query is "MC#"');
    assert.ok(matches.length > 0);
    query = prepareQuery("#SpecialFunction");
    assert.strictEqual(query.original, "#SpecialFunction");
    assert.strictEqual(query.normalized, "#SpecialFunction");
    [score, matches] = _doScore2("#SpecialFunction", "#SpecialFunction");
    assert.ok(typeof score === "number" && score > 0, 'Should match "#SpecialFunction" symbol when query is "#SpecialFunction"');
    assert.ok(matches.length > 0);
    query = prepareQuery("#");
    assert.strictEqual(query.original, "#");
    assert.strictEqual(query.normalized, "#", "Standalone # should not be removed");
    [score, matches] = _doScore2("#", "#");
    assert.ok(typeof score === "number" && score > 0, 'Should match "#" symbol when query is "#"');
    assert.ok(matches.length > 0);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGZ1enp5U2NvcmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjb21wYXJlSXRlbXNCeUZ1enp5U2NvcmUsIEZ1enp5U2NvcmUsIEZ1enp5U2NvcmUyLCBGdXp6eVNjb3JlckNhY2hlLCBJSXRlbUFjY2Vzc29yLCBJSXRlbVNjb3JlLCBwaWVjZVRvUXVlcnksIHByZXBhcmVRdWVyeSwgc2NvcmVGdXp6eSwgc2NvcmVGdXp6eTIsIHNjb3JlSXRlbUZ1enp5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2Z1enp5U2NvcmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgcG9zaXgsIHNlcCwgd2luMzIgfSBmcm9tICcuLi8uLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuY2xhc3MgUmVzb3VyY2VBY2Nlc3NvckNsYXNzIGltcGxlbWVudHMgSUl0ZW1BY2Nlc3NvcjxVUkk+IHtcblxuXHRnZXRJdGVtTGFiZWwocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKHJlc291cmNlLmZzUGF0aCk7XG5cdH1cblxuXHRnZXRJdGVtRGVzY3JpcHRpb24ocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGRpcm5hbWUocmVzb3VyY2UuZnNQYXRoKTtcblx0fVxuXG5cdGdldEl0ZW1QYXRoKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiByZXNvdXJjZS5mc1BhdGg7XG5cdH1cbn1cblxuY29uc3QgUmVzb3VyY2VBY2Nlc3NvciA9IG5ldyBSZXNvdXJjZUFjY2Vzc29yQ2xhc3MoKTtcblxuY2xhc3MgUmVzb3VyY2VXaXRoU2xhc2hBY2Nlc3NvckNsYXNzIGltcGxlbWVudHMgSUl0ZW1BY2Nlc3NvcjxVUkk+IHtcblxuXHRnZXRJdGVtTGFiZWwocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKHJlc291cmNlLmZzUGF0aCk7XG5cdH1cblxuXHRnZXRJdGVtRGVzY3JpcHRpb24ocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHBvc2l4Lm5vcm1hbGl6ZShkaXJuYW1lKHJlc291cmNlLnBhdGgpKTtcblx0fVxuXG5cdGdldEl0ZW1QYXRoKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiBwb3NpeC5ub3JtYWxpemUocmVzb3VyY2UucGF0aCk7XG5cdH1cbn1cblxuY29uc3QgUmVzb3VyY2VXaXRoU2xhc2hBY2Nlc3NvciA9IG5ldyBSZXNvdXJjZVdpdGhTbGFzaEFjY2Vzc29yQ2xhc3MoKTtcblxuY2xhc3MgUmVzb3VyY2VXaXRoQmFja3NsYXNoQWNjZXNzb3JDbGFzcyBpbXBsZW1lbnRzIElJdGVtQWNjZXNzb3I8VVJJPiB7XG5cblx0Z2V0SXRlbUxhYmVsKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiBiYXNlbmFtZShyZXNvdXJjZS5mc1BhdGgpO1xuXHR9XG5cblx0Z2V0SXRlbURlc2NyaXB0aW9uKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB3aW4zMi5ub3JtYWxpemUoZGlybmFtZShyZXNvdXJjZS5wYXRoKSk7XG5cdH1cblxuXHRnZXRJdGVtUGF0aChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gd2luMzIubm9ybWFsaXplKHJlc291cmNlLnBhdGgpO1xuXHR9XG59XG5cbmNvbnN0IFJlc291cmNlV2l0aEJhY2tzbGFzaEFjY2Vzc29yID0gbmV3IFJlc291cmNlV2l0aEJhY2tzbGFzaEFjY2Vzc29yQ2xhc3MoKTtcblxuY2xhc3MgTnVsbEFjY2Vzc29yQ2xhc3MgaW1wbGVtZW50cyBJSXRlbUFjY2Vzc29yPFVSST4ge1xuXG5cdGdldEl0ZW1MYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkITtcblx0fVxuXG5cdGdldEl0ZW1EZXNjcmlwdGlvbihyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkITtcblx0fVxuXG5cdGdldEl0ZW1QYXRoKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB1bmRlZmluZWQhO1xuXHR9XG59XG5cbmZ1bmN0aW9uIF9kb1Njb3JlKHRhcmdldDogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzPzogYm9vbGVhbik6IEZ1enp5U2NvcmUge1xuXHRjb25zdCBwcmVwYXJlZFF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KHF1ZXJ5KTtcblxuXHRyZXR1cm4gc2NvcmVGdXp6eSh0YXJnZXQsIHByZXBhcmVkUXVlcnkubm9ybWFsaXplZCwgcHJlcGFyZWRRdWVyeS5ub3JtYWxpemVkTG93ZXJjYXNlLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzID8/ICFwcmVwYXJlZFF1ZXJ5LmV4cGVjdENvbnRpZ3VvdXNNYXRjaCk7XG59XG5cbmZ1bmN0aW9uIF9kb1Njb3JlMih0YXJnZXQ6IHN0cmluZywgcXVlcnk6IHN0cmluZywgbWF0Y2hPZmZzZXQ6IG51bWJlciA9IDApOiBGdXp6eVNjb3JlMiB7XG5cdGNvbnN0IHByZXBhcmVkUXVlcnkgPSBwcmVwYXJlUXVlcnkocXVlcnkpO1xuXG5cdHJldHVybiBzY29yZUZ1enp5Mih0YXJnZXQsIHByZXBhcmVkUXVlcnksIDAsIG1hdGNoT2Zmc2V0KTtcbn1cblxuZnVuY3Rpb24gc2NvcmVJdGVtPFQ+KGl0ZW06IFQsIHF1ZXJ5OiBzdHJpbmcsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM6IGJvb2xlYW4sIGFjY2Vzc29yOiBJSXRlbUFjY2Vzc29yPFQ+LCBjYWNoZTogRnV6enlTY29yZXJDYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBJSXRlbVNjb3JlIHtcblx0cmV0dXJuIHNjb3JlSXRlbUZ1enp5KGl0ZW0sIHByZXBhcmVRdWVyeShxdWVyeSksIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXMsIGFjY2Vzc29yLCBjYWNoZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVJdGVtc0J5U2NvcmU8VD4oaXRlbUE6IFQsIGl0ZW1COiBULCBxdWVyeTogc3RyaW5nLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzOiBib29sZWFuLCBhY2Nlc3NvcjogSUl0ZW1BY2Nlc3NvcjxUPik6IG51bWJlciB7XG5cdHJldHVybiBjb21wYXJlSXRlbXNCeUZ1enp5U2NvcmUoaXRlbUEsIGl0ZW1CLCBwcmVwYXJlUXVlcnkocXVlcnkpLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzLCBhY2Nlc3NvciwgT2JqZWN0LmNyZWF0ZShudWxsKSk7XG59XG5cbmNvbnN0IE51bGxBY2Nlc3NvciA9IG5ldyBOdWxsQWNjZXNzb3JDbGFzcygpO1xuXG5zdWl0ZSgnRnV6enkgU2NvcmVyJywgKCkgPT4ge1xuXG5cdHRlc3QoJ3Njb3JlIChmdXp6eSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gJ0hlbExvLVdvcmxkJztcblxuXHRcdGNvbnN0IHNjb3JlczogRnV6enlTY29yZVtdID0gW107XG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnSGVsTG8tV29ybGQnLCB0cnVlKSk7IC8vIGRpcmVjdCBjYXNlIG1hdGNoXG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnaGVsbG8td29ybGQnLCB0cnVlKSk7IC8vIGRpcmVjdCBtaXgtY2FzZSBtYXRjaFxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ0hXJywgdHJ1ZSkpOyAvLyBkaXJlY3QgY2FzZSBwcmVmaXggKG11bHRpcGxlKVxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ2h3JywgdHJ1ZSkpOyAvLyBkaXJlY3QgbWl4LWNhc2UgcHJlZml4IChtdWx0aXBsZSlcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdIJywgdHJ1ZSkpOyAvLyBkaXJlY3QgY2FzZSBwcmVmaXhcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdoJywgdHJ1ZSkpOyAvLyBkaXJlY3QgbWl4LWNhc2UgcHJlZml4XG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnVycsIHRydWUpKTsgLy8gZGlyZWN0IGNhc2Ugd29yZCBwcmVmaXhcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdMZCcsIHRydWUpKTsgLy8gaW4tc3RyaW5nIGNhc2UgbWF0Y2ggKG11bHRpcGxlKVxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ2xkJywgdHJ1ZSkpOyAvLyBpbi1zdHJpbmcgbWl4LWNhc2UgbWF0Y2ggKGNvbnNlY3V0aXZlLCBhdm9pZHMgc2NhdHRlcmVkIGhpdClcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICd3JywgdHJ1ZSkpOyAvLyBkaXJlY3QgbWl4LWNhc2Ugd29yZCBwcmVmaXhcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdMJywgdHJ1ZSkpOyAvLyBpbi1zdHJpbmcgY2FzZSBtYXRjaFxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ2wnLCB0cnVlKSk7IC8vIGluLXN0cmluZyBtaXgtY2FzZSBtYXRjaFxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJzQnLCB0cnVlKSk7IC8vIG5vIG1hdGNoXG5cblx0XHQvLyBBc3NlcnQgc2NvcmluZyBvcmRlclxuXHRcdGNvbnN0IHNvcnRlZFNjb3JlcyA9IHNjb3Jlcy5jb25jYXQoKS5zb3J0KChhLCBiKSA9PiBiWzBdIC0gYVswXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzY29yZXMsIHNvcnRlZFNjb3Jlcyk7XG5cblx0XHQvLyBBc3NlcnQgc2NvcmluZyBwb3NpdGlvbnNcblx0XHQvLyBsZXQgcG9zaXRpb25zID0gc2NvcmVzWzBdWzFdO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbnMubGVuZ3RoLCAnSGVsTG8tV29ybGQnLmxlbmd0aCk7XG5cblx0XHQvLyBwb3NpdGlvbnMgPSBzY29yZXNbMl1bMV07XG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKHBvc2l0aW9ucy5sZW5ndGgsICdIVycubGVuZ3RoKTtcblx0XHQvLyBhc3NlcnQuc3RyaWN0RXF1YWwocG9zaXRpb25zWzBdLCAwKTtcblx0XHQvLyBhc3NlcnQuc3RyaWN0RXF1YWwocG9zaXRpb25zWzFdLCA2KTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmUgKG5vbiBmdXp6eSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gJ0hlbExvLVdvcmxkJztcblxuXHRcdGFzc2VydC5vayhfZG9TY29yZSh0YXJnZXQsICdIZWxMby1Xb3JsZCcsIGZhbHNlKVswXSA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfZG9TY29yZSh0YXJnZXQsICdIZWxMby1Xb3JsZCcsIGZhbHNlKVsxXS5sZW5ndGgsICdIZWxMby1Xb3JsZCcubGVuZ3RoKTtcblxuXHRcdGFzc2VydC5vayhfZG9TY29yZSh0YXJnZXQsICdoZWxsby13b3JsZCcsIGZhbHNlKVswXSA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfZG9TY29yZSh0YXJnZXQsICdIVycsIGZhbHNlKVswXSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKF9kb1Njb3JlKHRhcmdldCwgJ2gnLCBmYWxzZSlbMF0gPiAwKTtcblx0XHRhc3NlcnQub2soX2RvU2NvcmUodGFyZ2V0LCAnZWxsbycsIGZhbHNlKVswXSA+IDApO1xuXHRcdGFzc2VydC5vayhfZG9TY29yZSh0YXJnZXQsICdsZCcsIGZhbHNlKVswXSA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfZG9TY29yZSh0YXJnZXQsICdlbycsIGZhbHNlKVswXSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIG1hdGNoZXMgYXJlIHByb3BlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcmVzID0gc2NvcmVJdGVtKG51bGwsICdzb21ldGhpbmcnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soIXJlcy5zY29yZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcveHl6L3NvbWUvcGF0aC9zb21lRmlsZTEyMy50eHQnKTtcblxuXHRcdHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3NvbWV0aGluZycsIHRydWUsIE51bGxBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMuc2NvcmUpO1xuXG5cdFx0Ly8gUGF0aCBJZGVudGl0eVxuXHRcdGNvbnN0IGlkZW50aXR5UmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCBSZXNvdXJjZUFjY2Vzc29yLmdldEl0ZW1QYXRoKHJlc291cmNlKSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKGlkZW50aXR5UmVzLnNjb3JlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRlbnRpdHlSZXMuZGVzY3JpcHRpb25NYXRjaCEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRlbnRpdHlSZXMubGFiZWxNYXRjaCEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRlbnRpdHlSZXMuZGVzY3JpcHRpb25NYXRjaCFbMF0uc3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZGVudGl0eVJlcy5kZXNjcmlwdGlvbk1hdGNoIVswXS5lbmQsIFJlc291cmNlQWNjZXNzb3IuZ2V0SXRlbURlc2NyaXB0aW9uKHJlc291cmNlKS5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZGVudGl0eVJlcy5sYWJlbE1hdGNoIVswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkZW50aXR5UmVzLmxhYmVsTWF0Y2ghWzBdLmVuZCwgUmVzb3VyY2VBY2Nlc3Nvci5nZXRJdGVtTGFiZWwocmVzb3VyY2UpLmxlbmd0aCk7XG5cblx0XHQvLyBCYXNlbmFtZSBQcmVmaXhcblx0XHRjb25zdCBiYXNlbmFtZVByZWZpeFJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3NvbScsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayhiYXNlbmFtZVByZWZpeFJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKCFiYXNlbmFtZVByZWZpeFJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVQcmVmaXhSZXMubGFiZWxNYXRjaCEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVQcmVmaXhSZXMubGFiZWxNYXRjaCFbMF0uc3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVByZWZpeFJlcy5sYWJlbE1hdGNoIVswXS5lbmQsICdzb20nLmxlbmd0aCk7XG5cblx0XHQvLyBCYXNlbmFtZSBDYW1lbGNhc2Vcblx0XHRjb25zdCBiYXNlbmFtZUNhbWVsY2FzZVJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3NGJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lQ2FtZWxjYXNlUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2soIWJhc2VuYW1lQ2FtZWxjYXNlUmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZUNhbWVsY2FzZVJlcy5sYWJlbE1hdGNoIS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZUNhbWVsY2FzZVJlcy5sYWJlbE1hdGNoIVswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lQ2FtZWxjYXNlUmVzLmxhYmVsTWF0Y2ghWzBdLmVuZCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lQ2FtZWxjYXNlUmVzLmxhYmVsTWF0Y2ghWzFdLnN0YXJ0LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVDYW1lbGNhc2VSZXMubGFiZWxNYXRjaCFbMV0uZW5kLCA1KTtcblxuXHRcdC8vIEJhc2VuYW1lIE1hdGNoXG5cdFx0Y29uc3QgYmFzZW5hbWVSZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdvZicsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayhiYXNlbmFtZVJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKCFiYXNlbmFtZVJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVSZXMubGFiZWxNYXRjaCEubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVSZXMubGFiZWxNYXRjaCFbMF0uc3RhcnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVJlcy5sYWJlbE1hdGNoIVswXS5lbmQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVJlcy5sYWJlbE1hdGNoIVsxXS5zdGFydCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lUmVzLmxhYmVsTWF0Y2ghWzFdLmVuZCwgNSk7XG5cblx0XHQvLyBQYXRoIE1hdGNoXG5cdFx0Y29uc3QgcGF0aFJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3h5ejEyMycsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5sYWJlbE1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaFswXS5zdGFydCwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaFswXS5lbmQsIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaFswXS5lbmQsIDQpO1xuXG5cdFx0Ly8gRWxsaXBzaXMgTWF0Y2hcblx0XHRjb25zdCBlbGxpcHNpc1JlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ1x1MjAyNm1lL3BhdGgvc29tZUZpbGUxMjMudHh0JywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKGVsbGlwc2lzUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5sYWJlbE1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaFswXS5zdGFydCwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaFswXS5lbmQsIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaFswXS5lbmQsIDQpO1xuXG5cdFx0Ly8gTm8gTWF0Y2hcblx0XHRjb25zdCBub1JlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJzk4NycsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayghbm9SZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5vayghbm9SZXMubGFiZWxNYXRjaCk7XG5cdFx0YXNzZXJ0Lm9rKCFub1Jlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblxuXHRcdC8vIE5vIEV4YWN0IE1hdGNoXG5cdFx0Y29uc3Qgbm9FeGFjdFJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ1wic0ZcIicsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayghbm9FeGFjdFJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKCFub0V4YWN0UmVzLmxhYmVsTWF0Y2gpO1xuXHRcdGFzc2VydC5vayghbm9FeGFjdFJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9SZXMuc2NvcmUsIG5vRXhhY3RSZXMuc2NvcmUpO1xuXG5cdFx0Ly8gVmVyaWZ5IFNjb3Jlc1xuXHRcdGFzc2VydC5vayhpZGVudGl0eVJlcy5zY29yZSA+IGJhc2VuYW1lUHJlZml4UmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2soYmFzZW5hbWVQcmVmaXhSZXMuc2NvcmUgPiBiYXNlbmFtZVJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lUmVzLnNjb3JlID4gcGF0aFJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMuc2NvcmUgPiBub1Jlcy5zY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIG11bHRpcGxlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy94eXovc29tZS9wYXRoL3NvbWVGaWxlMTIzLnR4dCcpO1xuXG5cdFx0Y29uc3QgcmVzMSA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3h5eiBzb21lJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKHJlczEuc2NvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMxLmxhYmVsTWF0Y2g/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEubGFiZWxNYXRjaFswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEubGFiZWxNYXRjaFswXS5lbmQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMxLmRlc2NyaXB0aW9uTWF0Y2g/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEuZGVzY3JpcHRpb25NYXRjaFswXS5lbmQsIDQpO1xuXG5cdFx0Y29uc3QgcmVzMiA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3NvbWUgeHl6JywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKHJlczIuc2NvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMxLnNjb3JlLCByZXMyLnNjb3JlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMi5sYWJlbE1hdGNoPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMyLmxhYmVsTWF0Y2hbMF0uc3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMyLmxhYmVsTWF0Y2hbMF0uZW5kLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMi5kZXNjcmlwdGlvbk1hdGNoPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMyLmRlc2NyaXB0aW9uTWF0Y2hbMF0uc3RhcnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMyLmRlc2NyaXB0aW9uTWF0Y2hbMF0uZW5kLCA0KTtcblxuXHRcdGNvbnN0IHJlczMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdzb21lIHh5eiBmaWxlIGZpbGUxMjMnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socmVzMy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlczMuc2NvcmUgPiByZXMyLnNjb3JlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMy5sYWJlbE1hdGNoPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLmxhYmVsTWF0Y2hbMF0uc3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLmxhYmVsTWF0Y2hbMF0uZW5kLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczMuZGVzY3JpcHRpb25NYXRjaD8ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMy5kZXNjcmlwdGlvbk1hdGNoWzBdLnN0YXJ0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMy5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgNCk7XG5cblx0XHRjb25zdCByZXM0ID0gc2NvcmVJdGVtKHJlc291cmNlLCAncGF0aCB6IHknLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socmVzNC5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlczQuc2NvcmUgPCByZXMyLnNjb3JlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzNC5sYWJlbE1hdGNoPy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM0LmRlc2NyaXB0aW9uTWF0Y2g/Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczQuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczQuZGVzY3JpcHRpb25NYXRjaFswXS5lbmQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM0LmRlc2NyaXB0aW9uTWF0Y2hbMV0uc3RhcnQsIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzNC5kZXNjcmlwdGlvbk1hdGNoWzFdLmVuZCwgMTQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZUl0ZW0gLSBtdWx0aXBsZSB3aXRoIGNhY2hlIHlpZWxkcyBkaWZmZXJlbnQgcmVzdWx0cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcveHl6L3NvbWUvcGF0aC9zb21lRmlsZTEyMy50eHQnKTtcblx0XHRjb25zdCBjYWNoZSA9IHt9O1xuXHRcdGNvbnN0IHJlczEgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICd4eXogc20nLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yLCBjYWNoZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlczEuc2NvcmUpO1xuXG5cdFx0Ly8gZnJvbSB0aGUgY2FjaGUncyBwZXJzcGVjdGl2ZSB0aGlzIHNob3VsZCBiZSBhIHRvdGFsbHkgZGlmZmVyZW50IHF1ZXJ5XG5cdFx0Y29uc3QgcmVzMiA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3h5eiBcInNtXCInLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yLCBjYWNoZSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMyLnNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gaW52YWxpZCBpbnB1dCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCByZXMgPSBzY29yZUl0ZW0obnVsbCwgbnVsbCEsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc2NvcmUsIDApO1xuXG5cdFx0cmVzID0gc2NvcmVJdGVtKG51bGwsICdudWxsJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zY29yZSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIG9wdGltaXplIGZvciBmaWxlIHBhdGhzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy94eXovb3RoZXJzL3NwYXRoL3NvbWUveHNwL2ZpbGUxMjMudHh0Jyk7XG5cblx0XHQvLyB4c3AgaXMgbW9yZSByZWxldmFudCB0byB0aGUgZW5kIG9mIHRoZSBmaWxlIHBhdGggZXZlbiB0aG91Z2ggaXQgbWF0Y2hlc1xuXHRcdC8vIGZ1enp5IGFsc28gaW4gdGhlIGJlZ2lubmluZy4gd2UgdmVyaWZ5IHRoZSBtb3JlIHJlbGV2YW50IG1hdGNoIGF0IHRoZVxuXHRcdC8vIGVuZCBnZXRzIHJldHVybmVkLlxuXHRcdGNvbnN0IHBhdGhSZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICd4c3BmaWxlMTIzJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLmxhYmVsTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2gubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoWzBdLnN0YXJ0LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoWzBdLmVuZCwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2hbMF0uc3RhcnQsIDIzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgMjYpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZUl0ZW0gLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzM2MTE5KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdwcm9qZWN0cy91aS9jdWxhL2F0cy90YXJnZXQubWsnKTtcblxuXHRcdGNvbnN0IHBhdGhSZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICd0Y2x0YXJnZXQubWsnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaCk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMubGFiZWxNYXRjaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2hbMF0uc3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2hbMF0uZW5kLCA5KTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gcHJlZmVycyBtb3JlIGNvbXBhY3QgbWF0Y2hlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvMWExMTFkMS8xMWExZDEvc29tZXRoaW5nLnR4dCcpO1xuXG5cdFx0Ly8gZXhwZWN0IFwiYWRcIiB0byBiZSBtYXRjaGVkIHRvd2FyZHMgdGhlIGVuZCBvZiB0aGUgZmlsZSBiZWNhdXNlIHRoZVxuXHRcdC8vIG1hdGNoIGlzIG1vcmUgY29tcGFjdFxuXHRcdGNvbnN0IHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ2FkJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKHJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQub2soIXJlcy5sYWJlbE1hdGNoIS5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaFswXS5lbmQsIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlc2NyaXB0aW9uTWF0Y2hbMV0uc3RhcnQsIDEzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlc2NyaXB0aW9uTWF0Y2hbMV0uZW5kLCAxNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIHByb3BlciB0YXJnZXQgb2Zmc2V0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ2V0ZW0nKTtcblxuXHRcdGNvbnN0IHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3RlZW0nLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soIXJlcy5zY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIHByb3BlciB0YXJnZXQgb2Zmc2V0ICMyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ2VkZScpO1xuXG5cdFx0Y29uc3QgcmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnZGUnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGFiZWxNYXRjaCEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxhYmVsTWF0Y2ghWzBdLnN0YXJ0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxhYmVsTWF0Y2ghWzBdLmVuZCwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIHByb3BlciB0YXJnZXQgb2Zmc2V0ICMzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9zcmMvdnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL2xpbmVOdW1iZXJzL2ZsaXBwZWQtY3Vyc29yLTJ4LnN2ZycpO1xuXG5cdFx0Y29uc3QgcmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnZGVidWcnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCEubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlc2NyaXB0aW9uTWF0Y2ghWzBdLnN0YXJ0LCA5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlc2NyaXB0aW9uTWF0Y2ghWzBdLmVuZCwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCFbMV0uc3RhcnQsIDM2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlc2NyaXB0aW9uTWF0Y2ghWzFdLmVuZCwgMzcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCFbMl0uc3RhcnQsIDQwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlc2NyaXB0aW9uTWF0Y2ghWzJdLmVuZCwgNDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5sYWJlbE1hdGNoIS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGFiZWxNYXRjaCFbMF0uc3RhcnQsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGFiZWxNYXRjaCFbMF0uZW5kLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5sYWJlbE1hdGNoIVsxXS5zdGFydCwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGFiZWxNYXRjaCFbMV0uZW5kLCAyMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIG5vIG1hdGNoIHVubGVzcyBxdWVyeSBjb250YWluZWQgaW4gc2VxdWVuY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnYWJjZGUnKTtcblxuXHRcdGNvbnN0IHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ2VkY2RhJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMuc2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZUl0ZW0gLSBtYXRjaCBpZiB1c2luZyBzbGFzaCBvciBiYWNrc2xhc2ggKGxvY2FsLCByZW1vdGUgcmVzb3VyY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxvY2FsUmVzb3VyY2UgPSBVUkkuZmlsZSgnYWJjZGUvc3VwZXIvZHVwZXInKTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgcGF0aDogJ2FiY2RlL3N1cGVyL2R1cGVyJyB9KTtcblxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgW2xvY2FsUmVzb3VyY2UsIHJlbW90ZVJlc291cmNlXSkge1xuXHRcdFx0bGV0IHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ2FiY2RlXFxcXHN1cGVyXFxcXGR1cGVyJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0XHRhc3NlcnQub2socmVzLnNjb3JlKTtcblxuXHRcdFx0cmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnYWJjZGVcXFxcc3VwZXJcXFxcZHVwZXInLCB0cnVlLCBSZXNvdXJjZVdpdGhTbGFzaEFjY2Vzc29yKTtcblx0XHRcdGFzc2VydC5vayhyZXMuc2NvcmUpO1xuXG5cdFx0XHRyZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdhYmNkZVxcXFxzdXBlclxcXFxkdXBlcicsIHRydWUsIFJlc291cmNlV2l0aEJhY2tzbGFzaEFjY2Vzc29yKTtcblx0XHRcdGFzc2VydC5vayhyZXMuc2NvcmUpO1xuXG5cdFx0XHRyZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdhYmNkZS9zdXBlci9kdXBlcicsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcy5zY29yZSk7XG5cblx0XHRcdHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ2FiY2RlL3N1cGVyL2R1cGVyJywgdHJ1ZSwgUmVzb3VyY2VXaXRoU2xhc2hBY2Nlc3Nvcik7XG5cdFx0XHRhc3NlcnQub2socmVzLnNjb3JlKTtcblxuXHRcdFx0cmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnYWJjZGUvc3VwZXIvZHVwZXInLCB0cnVlLCBSZXNvdXJjZVdpdGhCYWNrc2xhc2hBY2Nlc3Nvcik7XG5cdFx0XHRhc3NlcnQub2socmVzLnNjb3JlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIGVuc3VyZSB1cHBlciBjYXNlIGJvbnVzIG9ubHkgYXBwbGllcyBvbiBub24tY29uc2VjdXRpdmUgbWF0Y2hlcyAoYnVnICMxMzQ3MjMpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlV2l0aFVwcGVyID0gVVJJLmZpbGUoJ0FTREZhc2RmYXNkZicpO1xuXHRcdGNvbnN0IHJlc291cmNlQWxsTG93ZXIgPSBVUkkuZmlsZSgnYXNkZmFzZGZhc2RmJyk7XG5cblx0XHRhc3NlcnQub2soc2NvcmVJdGVtKHJlc291cmNlQWxsTG93ZXIsICdhc2RmJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcikuc2NvcmUgPiBzY29yZUl0ZW0ocmVzb3VyY2VXaXRoVXBwZXIsICdhc2RmJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcikuc2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlSXRlbXNCeVNjb3JlIC0gaWRlbnRpdHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvc29tZS9wYXRoL290aGVyL2ZpbGVDLnR4dCcpO1xuXG5cdFx0Ly8gRnVsbCByZXNvdXJjZSBBIHBhdGhcblx0XHRsZXQgcXVlcnkgPSBSZXNvdXJjZUFjY2Vzc29yLmdldEl0ZW1QYXRoKHJlc291cmNlQSk7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdC8vIEZ1bGwgcmVzb3VyY2UgQiBwYXRoXG5cdFx0cXVlcnkgPSBSZXNvdXJjZUFjY2Vzc29yLmdldEl0ZW1QYXRoKHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYmFzZW5hbWUgcHJlZml4JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCcvc29tZS9wYXRoL2ZpbGVBLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCcvc29tZS9wYXRoL290aGVyL2ZpbGVCLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCcvdW5yZWxhdGVkL3NvbWUvcGF0aC9vdGhlci9maWxlQy50eHQnKTtcblxuXHRcdC8vIEZ1bGwgcmVzb3VyY2UgQSBiYXNlbmFtZVxuXHRcdGxldCBxdWVyeSA9IFJlc291cmNlQWNjZXNzb3IuZ2V0SXRlbUxhYmVsKHJlc291cmNlQSk7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdC8vIEZ1bGwgcmVzb3VyY2UgQiBiYXNlbmFtZVxuXHRcdHF1ZXJ5ID0gUmVzb3VyY2VBY2Nlc3Nvci5nZXRJdGVtTGFiZWwocmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBiYXNlbmFtZSBjYW1lbGNhc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvc29tZS9wYXRoL290aGVyL2ZpbGVDLnR4dCcpO1xuXG5cdFx0Ly8gcmVzb3VyY2UgQSBjYW1lbGNhc2Vcblx0XHRsZXQgcXVlcnkgPSAnZkEnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHQvLyByZXNvdXJjZSBCIGNhbWVsY2FzZVxuXHRcdHF1ZXJ5ID0gJ2ZCJztcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBiYXNlbmFtZSBzY29yZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvc29tZS9wYXRoL290aGVyL2ZpbGVDLnR4dCcpO1xuXG5cdFx0Ly8gUmVzb3VyY2UgQSBwYXJ0IG9mIGJhc2VuYW1lXG5cdFx0bGV0IHF1ZXJ5ID0gJ2ZpbGVBJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0Ly8gUmVzb3VyY2UgQiBwYXJ0IG9mIGJhc2VuYW1lXG5cdFx0cXVlcnkgPSAnZmlsZUInO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHBhdGggc2NvcmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCcvc29tZS9wYXRoL2ZpbGVBLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCcvc29tZS9wYXRoL290aGVyL2ZpbGVCLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCcvdW5yZWxhdGVkL3NvbWUvcGF0aC9vdGhlci9maWxlQy50eHQnKTtcblxuXHRcdC8vIFJlc291cmNlIEEgcGFydCBvZiBwYXRoXG5cdFx0bGV0IHF1ZXJ5ID0gJ3BhdGhmaWxlQSc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdC8vIFJlc291cmNlIEIgcGFydCBvZiBwYXRoXG5cdFx0cXVlcnkgPSAncGF0aGZpbGVCJztcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc2hvcnRlciBiYXNlbmFtZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUJMb25nZXIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvdGhlL3BhdGgvb3RoZXIvZmlsZUMudHh0Jyk7XG5cblx0XHQvLyBSZXNvdXJjZSBBIHBhcnQgb2YgcGF0aFxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3NvbWVwYXRoJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIHNob3J0ZXIgYmFzZW5hbWVzIChtYXRjaCBvbiBiYXNlbmFtZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUJMb25nZXIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvdGhlL3BhdGgvb3RoZXIvZmlsZUMudHh0Jyk7XG5cblx0XHQvLyBSZXNvdXJjZSBBIHBhcnQgb2YgcGF0aFxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2ZpbGUnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VDKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc2hvcnRlciBwYXRocycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9maWxlQS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9vdGhlci9maWxlQi50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnL3VucmVsYXRlZC9zb21lL3BhdGgvb3RoZXIvZmlsZUMudHh0Jyk7XG5cblx0XHQvLyBSZXNvdXJjZSBBIHBhcnQgb2YgcGF0aFxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3NvbWVwYXRoJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIHNob3J0ZXIgcGF0aHMgKGJ1ZyAjMTc0NDMpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdjb25maWcvdGVzdC90MS5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdjb25maWcvdGVzdC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCdjb25maWcvdGVzdC90Mi5qcycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnY28vdGUnO1xuXG5cdFx0Y29uc3QgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgbWF0Y2hlcyBpbiBsYWJlbCBvdmVyIGRlc2NyaXB0aW9uIGlmIHNjb3JlcyBhcmUgb3RoZXJ3aXNlIGVxdWFsJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdwYXJ0cy9xdWljay9hcnJvdy1sZWZ0LWRhcmsuc3ZnJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3BhcnRzL3F1aWNrb3Blbi9xdWlja29wZW4udHMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3BhcnRzcXVpY2snO1xuXG5cdFx0Y29uc3QgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBjYW1lbCBjYXNlIG1hdGNoZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0L051bGxQb2ludGVyRXhjZXB0aW9uLmphdmEnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3Qvbm9wb2ludGVyZXhjZXB0aW9uLmphdmEnKTtcblxuXHRcdGZvciAoY29uc3QgcXVlcnkgb2YgWyducGUnLCAnTlBFJ10pIHtcblx0XHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblxuXHRcdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIG1vcmUgY29tcGFjdCBjYW1lbCBjYXNlIG1hdGNoZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0L29wZW50aGlzQW55dGhpbmdIYW5kbGVyLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0L29wZW50aGlzaXNub3Rzb3JlbGV2YW50Zm9ydGhlcXVlcnlBbnlIYW5kLmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdBSCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgbW9yZSBjb21wYWN0IG1hdGNoZXMgKGxhYmVsKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3QvZXhhbWFzZGFwbGUuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3QvZXhhbXBsZWFzZGFhc2QudHMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3hwJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBtb3JlIGNvbXBhY3QgbWF0Y2hlcyAocGF0aCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0L2V4YW1hc2RhcGxlL2ZpbGUuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3QvZXhhbXBsZWFzZGFhc2QvZmlsZS50cycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAneHAnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIG1vcmUgY29tcGFjdCBtYXRjaGVzIChsYWJlbCBhbmQgcGF0aCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2NvbmZpZy9leGFtcGxlL3RoaXNmaWxlLnRzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2NvbmZpZy8yNDIzNDI0MzI0NC9leGFtcGxlL2ZpbGUuanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2V4ZmlsZSc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzM0MjEwKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnbm9kZV9tb2R1bGVzMS9idW5kbGUvbGliL21vZGVsL21vZHVsZXMvb3QxL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ25vZGVfbW9kdWxlczEvYnVuZGxlL2xpYi9tb2RlbC9tb2R1bGVzL3VuMS9pbmRleC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCdub2RlX21vZHVsZXMxL2J1bmRsZS9saWIvbW9kZWwvbW9kdWxlcy9tb2R1MS9pbmRleC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlRCA9IFVSSS5maWxlKCdub2RlX21vZHVsZXMxL2J1bmRsZS9saWIvbW9kZWwvbW9kdWxlcy9vZGRsMS9pbmRleC5qcycpO1xuXG5cdFx0bGV0IHF1ZXJ5ID0gaXNXaW5kb3dzID8gJ21vZHUxXFxcXGluZGV4LmpzJyA6ICdtb2R1MS9pbmRleC5qcyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUMsIHJlc291cmNlRF0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUEsIHJlc291cmNlRF0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUMpO1xuXG5cdFx0cXVlcnkgPSBpc1dpbmRvd3MgPyAndW4xXFxcXGluZGV4LmpzJyA6ICd1bjEvaW5kZXguanMnO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUMsIHJlc291cmNlRF0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUEsIHJlc291cmNlRF0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMyMTAxOSAxLiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2FwcC9jb250YWluZXJzL1NlcnZpY2VzL05ldHdvcmtEYXRhL1NlcnZpY2VEZXRhaWxzL1NlcnZpY2VMb2FkL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2FwcC9jb250YWluZXJzL1NlcnZpY2VzL05ldHdvcmtEYXRhL1NlcnZpY2VEZXRhaWxzL1NlcnZpY2VEaXN0cmlidXRpb24vaW5kZXguanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnYXBwL2NvbnRhaW5lcnMvU2VydmljZXMvTmV0d29ya0RhdGEvU2VydmljZURldGFpbFRhYnMvU2VydmljZVRhYnMvU3RhdFZpZGVvL2luZGV4LmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdTdGF0VmlkZW9pbmRleCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzIxMDE5IDIuKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnc3JjL2J1aWxkLWhlbHBlci9zdG9yZS9yZWR1eC50cycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdzcmMvcmVwb3NpdG9yeS9zdG9yZS9yZWR1eC50cycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAncmVwcm9yZWR1eHRzJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMyNjY0OSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3Bob3RvYm9vay9zcmMvY29tcG9uZW50cy9BZGRQYWdlc0J1dHRvbi9pbmRleC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdwaG90b2Jvb2svc3JjL2NvbXBvbmVudHMvQXBwcm92YWxQYWdlSGVhZGVyL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJ3Bob3RvYm9vay9zcmMvY2FudmFzQ29tcG9uZW50cy9Cb29rUGFnZS9pbmRleC5qcycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnYm9va3BhZ2VJbmRleCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzMzMjQ3KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgndWkvc3JjL3V0aWxzL2NvbnN0YW50cy5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCd1aS9zcmMvdWkvSWNvbnMvaW5kZXguanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gaXNXaW5kb3dzID8gJ3VpXFxcXGljb25zJyA6ICd1aS9pY29ucyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzMyNDcgY29tbWVudCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3VpL3NyYy9jb21wb25lbnRzL0lESW5wdXQvaW5kZXguanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgndWkvc3JjL3VpL0lucHV0L2luZGV4LmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9IGlzV2luZG93cyA/ICd1aVxcXFxpbnB1dFxcXFxpbmRleCcgOiAndWkvaW5wdXQvaW5kZXgnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzM2MTY2KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnZGphbmdvL2NvbnRyaWIvc2l0ZXMvbG9jYWxlL2dhL0xDX01FU1NBR0VTL2RqYW5nby5tbycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdkamFuZ28vY29yZS9zaWduYWxzLnB5Jyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdkamFuY29zaWcnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzMyOTE4KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnYWRzeXMvcHJvdGVjdGVkL2NvbmZpZy5waHAnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnYWRzeXMvcHJvdGVjdGVkL2ZyYW1ld29yay9zbWFydHkvc3lzcGx1Z2lucy9zbWFydHlfaW50ZXJuYWxfY29uZmlnLnBocCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCdkdW93YW5WaWRlby93YXAvcHJvdGVjdGVkL2NvbmZpZy5waHAnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3Byb3RlY3RlZGNvbmZpZy5waHAnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VDKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzE0ODc5KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgncGtnL3NlYXJjaC9ncmFkaWVudC90ZXN0ZGF0YS9jb25zdHJhaW50X2F0dHJNYXRjaFN0cmluZy55bWwnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnY21kL2dyYWRpZW50L21haW4uZ28nKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2dyYWRpZW50bWFpbic7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMTQ3MjcgMSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2FscGhhLWJldGEtY2FwcGEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2FiYy50eHQnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2FiYyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMTQ3MjcgMiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3hlcnhlcy15YWstenViYmEvaW5kZXguanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgneHl6L2luZGV4LmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICd4eXonO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzE4MzgxKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnQXNzeW1ibHlJbmZvLmNzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ0lBc3luY2hyb25vdXNUYXNrLmphdmEnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2FzeW5jJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMzNTU3MiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3N0YXRpYy9hcHAvc291cmNlL2FuZ2x1YXIvLWFkbWluLy1vcmdhbml6YXRpb24vLXNldHRpbmdzL2xheW91dC9sYXlvdXQuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnc3RhdGljL2FwcC9zb3VyY2UvYW5ndWxhci8tYWRtaW4vLXByb2plY3QvLXNldHRpbmdzL19zZXR0aW5ncy9zZXR0aW5ncy5qcycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAncGFydGlzZXR0aW5ncyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzY4MTApJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdUcmlsYnkuVHJpbGJ5VFYuV2ViLlBvcnRhbC9WaWV3cy9TeXN0ZW1zL0luZGV4LmNzaHRtbCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdUcmlsYnkuVHJpbGJ5VFYuV2ViLlBvcnRhbC9BcmVhcy9BZG1pbnMvVmlld3MvVGlwcy9JbmRleC5jc2h0bWwnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3RpcHNpbmRleC5jc2h0bWwnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc2hvcnRlciBoaXQgKGJ1ZyAjMjA1NDYpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdlZGl0b3IvY29yZS9jb21wb25lbnRzL3Rlc3RzL2xpc3Qtdmlldy1zcGVjLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2VkaXRvci9jb3JlL2NvbXBvbmVudHMvbGlzdC12aWV3LmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdsaXN0dmlldyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMTIwOTUpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvY29tbW9uL2V4cGxvcmVyVmlld01vZGVsLnRzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3NyYy92cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL3ZpZXdzL2V4cGxvcmVyVmlldy50cycpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci92aWV3cy9leHBsb3JlclZpZXdlci50cycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnZmlsZXNleHBsb3JlcnZpZXcudHMnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUMsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIGNhc2UgbWF0Y2ggKGJ1ZyAjOTYxMjIpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdsaXN0cy5waHAnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnbGliL0xpc3RzLnBocCcpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnTGlzdHMucGhwJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIHNob3J0ZXIgbWF0Y2ggKGJ1ZyAjMTAzMDUyKSAtIGZvbyBiYXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2FwcC9lbWFpbHMvZm9vLmJhci5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdhcHAvZW1haWxzL290aGVyLWZvb3Rlci5vdGhlci1iYXIuanMnKTtcblxuXHRcdGZvciAoY29uc3QgcXVlcnkgb2YgWydmb28gYmFyJywgJ2Zvb2JhciddKSB7XG5cdFx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cblx0XHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBzaG9ydGVyIG1hdGNoIChidWcgIzEwMzA1MikgLSBwYXltZW50IG1vZGVsJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdhcHAvY29tcG9uZW50cy9wYXltZW50L3BheW1lbnQubW9kZWwuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnYXBwL2NvbXBvbmVudHMvb25saW5lLXBheW1lbnRzLWhpc3Rvcnkvb25saW5lLXBheW1lbnRzLWhpc3RvcnkubW9kZWwuanMnKTtcblxuXHRcdGZvciAoY29uc3QgcXVlcnkgb2YgWydwYXltZW50IG1vZGVsJywgJ3BheW1lbnRtb2RlbCddKSB7XG5cdFx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cblx0XHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBzaG9ydGVyIG1hdGNoIChidWcgIzEwMzA1MikgLSBjb2xvcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnYXBwL2NvbnN0YW50cy9jb2xvci5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdhcHAvY29tcG9uZW50cy9tb2RlbC9pbnB1dC9waWNrLWF2YXRhci1jb2xvci5qcycpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVyeSBvZiBbJ2NvbG9yIGpzJywgJ2NvbG9yanMnXSkge1xuXHRcdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXG5cdFx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc3RyaWN0IGNhc2UgcHJlZml4JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdhcHAvY29uc3RhbnRzL2NvbG9yLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2FwcC9jb21wb25lbnRzL21vZGVsL2lucHV0L0NvbG9yLmpzJyk7XG5cblx0XHRsZXQgcXVlcnkgPSAnQ29sb3InO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0cXVlcnkgPSAnY29sb3InO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgcHJlZml4IChidWcgIzEwMzA1MiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3Rlc3Qvc21va2Uvc3JjL21haW4udHMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvc2VtYW50aWtUb2tlbnNQcm92aWRlclN0eWxpbmcudHMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3Ntb2tlIG1haW4udHMnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYm9vc3QgYmV0dGVyIHByZWZpeCBtYXRjaCBpZiBtdWx0aXBsZSBxdWVyaWVzIGFyZSB1c2VkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9icm93c2VySG9zdFNlcnZpY2UudHMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3dvcmtiZW5jaC50cycpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVyeSBvZiBbJ3dvcmtiZW5jaC50cyBicm93c2VyJywgJ2Jyb3dzZXIgd29ya2JlbmNoLnRzJywgJ2Jyb3dzZXIgd29ya2JlbmNoJywgJ3dvcmtiZW5jaCBicm93c2VyJ10pIHtcblx0XHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYm9vc3Qgc2hvcnRlciBwcmVmaXggbWF0Y2ggaWYgbXVsdGlwbGUgcXVlcmllcyBhcmUgdXNlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnc3JjL3ZzL3dvcmtiZW5jaC9ub2RlL2FjdGlvbnMvd2luZG93QWN0aW9ucy50cycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL2VsZWN0cm9uLW5vZGUvd2luZG93LnRzJyk7XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXJ5IG9mIFsnd2luZG93IG5vZGUnLCAnd2luZG93LnRzIG5vZGUnXSkge1xuXHRcdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBza2lwIHByZWZlcmVuY2Ugb24gbGFiZWwgbWF0Y2ggd2hlbiB1c2luZyBwYXRoIHNlcCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnZGphbmdvc2l0ZS91ZnJlbGEvZGVmLnB5Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2RqYW5nb3NpdGUvdXJscy9kZWZhdWx0LnB5Jyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICd1cmwvZGVmJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGJvb3N0IHNob3J0ZXIgcHJlZml4IG1hdGNoIGlmIG11bHRpcGxlIHF1ZXJpZXMgYXJlIHVzZWQgKCM5OTE3MSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ21lc2hfZWRpdG9yX2xpZmV0aW1lX2pvYi5oJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2xpZmV0aW1lX2pvYi5oJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdtIGxpZmUsIGxpZmUgbSc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBib29zdCBjb25zZWN1dGl2ZSBtYXRjaGVzIGluIHRoZSBiZWdpbm5pbmcgb3ZlciBlbmQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3NyYy92cy9zZXJ2ZXIvbm9kZS9leHRlbnNpb25Ib3N0U3RhdHVzU2VydmljZS50cycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zU3RhdHVzLnRzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdub3RTdGF0dXMnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlUXVlcnknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnIGYqYSAnKS5ub3JtYWxpemVkLCAnZmEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCcgZlx1MjAyNmEgJykubm9ybWFsaXplZCwgJ2ZhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnbWFpbiMnKS5ub3JtYWxpemVkLCAnbWFpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ21haW4jJykub3JpZ2luYWwsICdtYWluIycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ2ZvbyonKS5ub3JtYWxpemVkLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnZm9vKicpLm9yaWdpbmFsLCAnZm9vKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ21vZGVsIFRlc3Rlci50cycpLm9yaWdpbmFsLCAnbW9kZWwgVGVzdGVyLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnbW9kZWwgVGVzdGVyLnRzJykub3JpZ2luYWxMb3dlcmNhc2UsICdtb2RlbCBUZXN0ZXIudHMnLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ21vZGVsIFRlc3Rlci50cycpLm5vcm1hbGl6ZWQsICdtb2RlbFRlc3Rlci50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ21vZGVsIFRlc3Rlci50cycpLmV4cGVjdENvbnRpZ3VvdXNNYXRjaCwgZmFsc2UpOyAvLyBkb2Vzbid0IGhhdmUgcXVvdGVzIGluIGl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnTW9kZWwgVGVzdGVyLnRzJykubm9ybWFsaXplZExvd2VyY2FzZSwgJ21vZGVsdGVzdGVyLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnTW9kZWxUZXN0ZXIudHMnKS5jb250YWluc1BhdGhTZXBhcmF0b3IsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdNb2RlbCcgKyBzZXAgKyAnVGVzdGVyLnRzJykuY29udGFpbnNQYXRoU2VwYXJhdG9yLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdcImhlbGxvXCInKS5leHBlY3RDb250aWd1b3VzTWF0Y2gsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ1wiaGVsbG9cIicpLm5vcm1hbGl6ZWQsICdoZWxsbycpO1xuXG5cdFx0Ly8gd2l0aCBzcGFjZXNcblx0XHRsZXQgcXVlcnkgPSBwcmVwYXJlUXVlcnkoJ0hlKmxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5vcmlnaW5hbCwgJ0hlKmxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnSGVsbG9Xb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkTG93ZXJjYXNlLCAnSGVsbG9Xb3JsZCcudG9Mb3dlckNhc2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8ubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMF0ub3JpZ2luYWwsICdIZSpsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMF0ubm9ybWFsaXplZCwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzBdLm5vcm1hbGl6ZWRMb3dlcmNhc2UsICdIZWxsbycudG9Mb3dlckNhc2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzFdLm9yaWdpbmFsLCAnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMV0ubm9ybWFsaXplZCwgJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzFdLm5vcm1hbGl6ZWRMb3dlcmNhc2UsICdXb3JsZCcudG9Mb3dlckNhc2UoKSk7XG5cblx0XHRjb25zdCByZXN0b3JlZFF1ZXJ5ID0gcGllY2VUb1F1ZXJ5KHF1ZXJ5LnZhbHVlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkUXVlcnkub3JpZ2luYWwsIHF1ZXJ5Lm9yaWdpbmFsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWRRdWVyeS52YWx1ZXM/Lmxlbmd0aCwgcXVlcnkudmFsdWVzPy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZFF1ZXJ5LmNvbnRhaW5zUGF0aFNlcGFyYXRvciwgcXVlcnkuY29udGFpbnNQYXRoU2VwYXJhdG9yKTtcblxuXHRcdC8vIHdpdGggc3BhY2VzIHRoYXQgYXJlIGVtcHR5XG5cdFx0cXVlcnkgPSBwcmVwYXJlUXVlcnkoJyBIZWxsbyAgIFdvcmxkICBcdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5vcmlnaW5hbCwgJyBIZWxsbyAgIFdvcmxkICBcdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5vcmlnaW5hbExvd2VyY2FzZSwgJyBIZWxsbyAgIFdvcmxkICBcdCcudG9Mb3dlckNhc2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWQsICdIZWxsb1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWRMb3dlcmNhc2UsICdIZWxsb1dvcmxkJy50b0xvd2VyQ2FzZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlswXS5vcmlnaW5hbCwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzBdLm9yaWdpbmFsTG93ZXJjYXNlLCAnSGVsbG8nLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlswXS5ub3JtYWxpemVkLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMF0ubm9ybWFsaXplZExvd2VyY2FzZSwgJ0hlbGxvJy50b0xvd2VyQ2FzZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMV0ub3JpZ2luYWwsICdXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlsxXS5vcmlnaW5hbExvd2VyY2FzZSwgJ1dvcmxkJy50b0xvd2VyQ2FzZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMV0ubm9ybWFsaXplZCwgJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzFdLm5vcm1hbGl6ZWRMb3dlcmNhc2UsICdXb3JsZCcudG9Mb3dlckNhc2UoKSk7XG5cblx0XHQvLyBQYXRoIHJlbGF0ZWRcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdDOlxcXFxzb21lXFxcXHBhdGgnKS5wYXRoTm9ybWFsaXplZCwgJ0M6XFxcXHNvbWVcXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnQzpcXFxcc29tZVxcXFxwYXRoJykubm9ybWFsaXplZCwgJ0M6XFxcXHNvbWVcXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnQzpcXFxcc29tZVxcXFxwYXRoJykuY29udGFpbnNQYXRoU2VwYXJhdG9yLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ0M6L3NvbWUvcGF0aCcpLnBhdGhOb3JtYWxpemVkLCAnQzpcXFxcc29tZVxcXFxwYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdDOi9zb21lL3BhdGgnKS5ub3JtYWxpemVkLCAnQzpcXFxcc29tZVxcXFxwYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdDOi9zb21lL3BhdGgnKS5jb250YWluc1BhdGhTZXBhcmF0b3IsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCcvc29tZS9wYXRoJykucGF0aE5vcm1hbGl6ZWQsICcvc29tZS9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCcvc29tZS9wYXRoJykubm9ybWFsaXplZCwgJy9zb21lL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJy9zb21lL3BhdGgnKS5jb250YWluc1BhdGhTZXBhcmF0b3IsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnXFxcXHNvbWVcXFxccGF0aCcpLnBhdGhOb3JtYWxpemVkLCAnL3NvbWUvcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnXFxcXHNvbWVcXFxccGF0aCcpLm5vcm1hbGl6ZWQsICcvc29tZS9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdcXFxcc29tZVxcXFxwYXRoJykuY29udGFpbnNQYXRoU2VwYXJhdG9yLCB0cnVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUyIChtYXRjaGluZyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gJ0hlbExvLVdvcmxkJztcblxuXHRcdGZvciAoY29uc3Qgb2Zmc2V0IG9mIFswLCAzXSkge1xuXHRcdFx0bGV0IFtzY29yZSwgbWF0Y2hlc10gPSBfZG9TY29yZTIob2Zmc2V0ID09PSAwID8gdGFyZ2V0IDogYDEyMyR7dGFyZ2V0fWAsICdIZWxMby1Xb3JsZCcsIG9mZnNldCk7XG5cblx0XHRcdGFzc2VydC5vayhzY29yZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNbMF0uc3RhcnQsIDAgKyBvZmZzZXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNbMF0uZW5kLCB0YXJnZXQubGVuZ3RoICsgb2Zmc2V0KTtcblxuXHRcdFx0W3Njb3JlLCBtYXRjaGVzXSA9IF9kb1Njb3JlMihvZmZzZXQgPT09IDAgPyB0YXJnZXQgOiBgMTIzJHt0YXJnZXR9YCwgJ0hXJywgb2Zmc2V0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNjb3JlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc1swXS5zdGFydCwgMCArIG9mZnNldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc1swXS5lbmQsIDEgKyBvZmZzZXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNbMV0uc3RhcnQsIDYgKyBvZmZzZXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNbMV0uZW5kLCA3ICsgb2Zmc2V0KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUyIChtdWx0aXBsZSBxdWVyaWVzKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0YXJnZXQgPSAnSGVsTG8tV29ybGQnO1xuXG5cdFx0Y29uc3QgW2ZpcnN0U2luZ2xlU2NvcmUsIGZpcnN0U2luZ2xlTWF0Y2hlc10gPSBfZG9TY29yZTIodGFyZ2V0LCAnSGVsTG8nKTtcblx0XHRjb25zdCBbc2Vjb25kU2luZ2xlU2NvcmUsIHNlY29uZFNpbmdsZU1hdGNoZXNdID0gX2RvU2NvcmUyKHRhcmdldCwgJ1dvcmxkJyk7XG5cdFx0Y29uc3QgZmlyc3RBbmRTZWNvbmRTaW5nbGVNYXRjaGVzID0gWy4uLmZpcnN0U2luZ2xlTWF0Y2hlcyB8fCBbXSwgLi4uc2Vjb25kU2luZ2xlTWF0Y2hlcyB8fCBbXV07XG5cblx0XHRsZXQgW211bHRpU2NvcmUsIG11bHRpTWF0Y2hlc10gPSBfZG9TY29yZTIodGFyZ2V0LCAnSGVsTG8gV29ybGQnKTtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydFNjb3JlKCkge1xuXHRcdFx0YXNzZXJ0Lm9rKChtdWx0aVNjb3JlID8/IDApID49ICgoZmlyc3RTaW5nbGVTY29yZSA/PyAwKSArIChzZWNvbmRTaW5nbGVTY29yZSA/PyAwKSkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IG11bHRpTWF0Y2hlcyAmJiBpIDwgbXVsdGlNYXRjaGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG11bHRpTWF0Y2ggPSBtdWx0aU1hdGNoZXNbaV07XG5cdFx0XHRcdGNvbnN0IGZpcnN0QW5kU2Vjb25kU2luZ2xlTWF0Y2ggPSBmaXJzdEFuZFNlY29uZFNpbmdsZU1hdGNoZXNbaV07XG5cblx0XHRcdFx0aWYgKG11bHRpTWF0Y2ggJiYgZmlyc3RBbmRTZWNvbmRTaW5nbGVNYXRjaCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtdWx0aU1hdGNoLnN0YXJ0LCBmaXJzdEFuZFNlY29uZFNpbmdsZU1hdGNoLnN0YXJ0KTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXVsdGlNYXRjaC5lbmQsIGZpcnN0QW5kU2Vjb25kU2luZ2xlTWF0Y2guZW5kKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0Tm9TY29yZSgpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtdWx0aVNjb3JlLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG11bHRpTWF0Y2hlcy5sZW5ndGgsIDApO1xuXHRcdH1cblxuXHRcdGFzc2VydFNjb3JlKCk7XG5cblx0XHRbbXVsdGlTY29yZSwgbXVsdGlNYXRjaGVzXSA9IF9kb1Njb3JlMih0YXJnZXQsICdXb3JsZCBIZWxMbycpO1xuXHRcdGFzc2VydFNjb3JlKCk7XG5cblx0XHRbbXVsdGlTY29yZSwgbXVsdGlNYXRjaGVzXSA9IF9kb1Njb3JlMih0YXJnZXQsICdXb3JsZCBIZWxMbyBXb3JsZCcpO1xuXHRcdGFzc2VydFNjb3JlKCk7XG5cblx0XHRbbXVsdGlTY29yZSwgbXVsdGlNYXRjaGVzXSA9IF9kb1Njb3JlMih0YXJnZXQsICdXb3JsZCBIZWxMbyBOb3RoaW5nJyk7XG5cdFx0YXNzZXJ0Tm9TY29yZSgpO1xuXG5cdFx0W211bHRpU2NvcmUsIG11bHRpTWF0Y2hlc10gPSBfZG9TY29yZTIodGFyZ2V0LCAnTW9yZSBOb3RoaW5nJyk7XG5cdFx0YXNzZXJ0Tm9TY29yZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlMiAoIzk1NzE2KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0YXJnZXQgPSAnIyBcdTI3NEMgV293JztcblxuXHRcdGNvbnN0IHNjb3JlID0gX2RvU2NvcmUyKHRhcmdldCwgJ1x1Mjc0QycpO1xuXHRcdGFzc2VydC5vayhzY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzY29yZVswXSA9PT0gJ251bWJlcicpO1xuXHRcdGFzc2VydC5vayhzY29yZVsxXS5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnVXNpbmcgcXVvdGVzIHNob3VsZCBleHBlY3QgY29udGlndW91cyBtYXRjaGVzIG1hdGNoJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIG1pc3NpbmcgdGhlIFwiaVwiIGluIHRoZSBxdWVyeVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfZG9TY29yZSgnY29udGlndW91cycsICdcImNvbnRndW91c1wiJylbMF0sIDApO1xuXG5cdFx0Y29uc3Qgc2NvcmUgPSBfZG9TY29yZSgnY29udGlndW91cycsICdcImNvbnRpZ3VvdXNcIicpO1xuXHRcdGFzc2VydC5vayhzY29yZVswXSA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdVc2luZyBxdW90ZXMgc2hvdWxkIGhpZ2hsaWdodCBjb250aWd1b3VzIGluZGV4ZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2NvcmUgPSBfZG9TY29yZSgnMjAyMS03LTI2Lm1kJywgJ1wiMjZcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZVswXSwgMTQpO1xuXG5cdFx0Ly8gVGhlIGluZGV4ZXMgb2YgdGhlIDIgYW5kIDYgb2YgXCIyNlwiXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlWzFdWzBdLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmVbMV1bMV0sIDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdXb3Jrc3BhY2Ugc3ltYm9sIHNlYXJjaCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycyAoIywgKiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gU2ltdWxhdGVzIHRoZSBzY2VuYXJpbyBmcm9tIHRoZSBpc3N1ZSB3aGVyZSBydXN0LWFuYWx5emVyIHVzZXMgIyBhbmQgKiBhcyBxdWVyeSBtb2RpZmllcnNcblx0XHQvLyBUaGUgb3JpZ2luYWwgcXVlcnkgKHdpdGggc3BlY2lhbCBjaGFycykgc2hvdWxkIHJlYWNoIHRoZSBsYW5ndWFnZSBzZXJ2ZXJcblx0XHQvLyBidXQgbm9ybWFsaXplZCBxdWVyeSAod2l0aG91dCBzcGVjaWFsIGNoYXJzKSBzaG91bGQgYmUgdXNlZCBmb3IgZnV6enkgbWF0Y2hpbmdcblxuXHRcdC8vIFRlc3QgIzogVXNlciB0eXBlcyBcIm1haW4jXCIsIGxhbmd1YWdlIHNlcnZlciByZXR1cm5zIFwibWFpblwiIHN5bWJvbFxuXHRcdGxldCBxdWVyeSA9IHByZXBhcmVRdWVyeSgnbWFpbiMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkub3JpZ2luYWwsICdtYWluIycpOyAvLyBTZW50IHRvIGxhbmd1YWdlIHNlcnZlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnbWFpbicpOyAvLyBVc2VkIGZvciBmdXp6eSBtYXRjaGluZ1xuXHRcdGxldCBbc2NvcmUsIG1hdGNoZXNdID0gX2RvU2NvcmUyKCdtYWluJywgJ21haW4jJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzY29yZSA9PT0gJ251bWJlcicgJiYgc2NvcmUgPiAwLCAnU2hvdWxkIG1hdGNoIFwibWFpblwiIHN5bWJvbCB3aGVuIHF1ZXJ5IGlzIFwibWFpbiNcIicpO1xuXHRcdGFzc2VydC5vayhtYXRjaGVzLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gVGVzdCAqOiBVc2VyIHR5cGVzIFwiZm9vKlwiLCBsYW5ndWFnZSBzZXJ2ZXIgcmV0dXJucyBcImZvb1wiIHN5bWJvbFxuXHRcdHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KCdmb28qJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm9yaWdpbmFsLCAnZm9vKicpOyAvLyBTZW50IHRvIGxhbmd1YWdlIHNlcnZlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnZm9vJyk7IC8vIFVzZWQgZm9yIGZ1enp5IG1hdGNoaW5nXG5cdFx0W3Njb3JlLCBtYXRjaGVzXSA9IF9kb1Njb3JlMignZm9vJywgJ2ZvbyonKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNjb3JlID09PSAnbnVtYmVyJyAmJiBzY29yZSA+IDAsICdTaG91bGQgbWF0Y2ggXCJmb29cIiBzeW1ib2wgd2hlbiBxdWVyeSBpcyBcImZvbypcIicpO1xuXHRcdGFzc2VydC5vayhtYXRjaGVzLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gVGVzdCBib3RoOiBVc2VyIHR5cGVzIFwiTXlDbGFzcyMqXCIsIHNob3VsZCBtYXRjaCBcIk15Q2xhc3NcIlxuXHRcdHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KCdNeUNsYXNzIyonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkub3JpZ2luYWwsICdNeUNsYXNzIyonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkubm9ybWFsaXplZCwgJ015Q2xhc3MnKTtcblx0XHRbc2NvcmUsIG1hdGNoZXNdID0gX2RvU2NvcmUyKCdNeUNsYXNzJywgJ015Q2xhc3MjKicpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygc2NvcmUgPT09ICdudW1iZXInICYmIHNjb3JlID4gMCwgJ1Nob3VsZCBtYXRjaCBcIk15Q2xhc3NcIiBzeW1ib2wgd2hlbiBxdWVyeSBpcyBcIk15Q2xhc3MjKlwiJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoZXMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBUZXN0IGZ1enp5IG1hdGNoaW5nIHN0aWxsIHdvcmtzOiBVc2VyIHR5cGVzIFwiTUMjXCIsIHNob3VsZCBtYXRjaCBcIk15Q2xhc3NcIlxuXHRcdHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KCdNQyMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkub3JpZ2luYWwsICdNQyMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkubm9ybWFsaXplZCwgJ01DJyk7XG5cdFx0W3Njb3JlLCBtYXRjaGVzXSA9IF9kb1Njb3JlMignTXlDbGFzcycsICdNQyMnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNjb3JlID09PSAnbnVtYmVyJyAmJiBzY29yZSA+IDAsICdTaG91bGQgZnV6enkgbWF0Y2ggXCJNeUNsYXNzXCIgc3ltYm9sIHdoZW4gcXVlcnkgaXMgXCJNQyNcIicpO1xuXHRcdGFzc2VydC5vayhtYXRjaGVzLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIGxlYWRpbmcgIyBvciAjIGluIHRoZSBtaWRkbGUgYXJlIG5vdCByZW1vdmVkLlxuXHRcdHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KCcjU3BlY2lhbEZ1bmN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm9yaWdpbmFsLCAnI1NwZWNpYWxGdW5jdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnI1NwZWNpYWxGdW5jdGlvbicpO1xuXHRcdFtzY29yZSwgbWF0Y2hlc10gPSBfZG9TY29yZTIoJyNTcGVjaWFsRnVuY3Rpb24nLCAnI1NwZWNpYWxGdW5jdGlvbicpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygc2NvcmUgPT09ICdudW1iZXInICYmIHNjb3JlID4gMCwgJ1Nob3VsZCBtYXRjaCBcIiNTcGVjaWFsRnVuY3Rpb25cIiBzeW1ib2wgd2hlbiBxdWVyeSBpcyBcIiNTcGVjaWFsRnVuY3Rpb25cIicpO1xuXHRcdGFzc2VydC5vayhtYXRjaGVzLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHN0YW5kYWxvbmUgIyBpcyBub3QgcmVtb3ZlZFxuXHRcdHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KCcjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm9yaWdpbmFsLCAnIycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnIycsICdTdGFuZGFsb25lICMgc2hvdWxkIG5vdCBiZSByZW1vdmVkJyk7XG5cdFx0W3Njb3JlLCBtYXRjaGVzXSA9IF9kb1Njb3JlMignIycsICcjJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzY29yZSA9PT0gJ251bWJlcicgJiYgc2NvcmUgPiAwLCAnU2hvdWxkIG1hdGNoIFwiI1wiIHN5bWJvbCB3aGVuIHF1ZXJ5IGlzIFwiI1wiJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoZXMubGVuZ3RoID4gMCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywwQkFBZ0csY0FBYyxjQUFjLFlBQVksYUFBYSxzQkFBc0I7QUFDcEwsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxTQUFTLE9BQU8sS0FBSyxhQUFhO0FBQ3JELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLHNCQUFvRDtBQUFBLEVBRXpELGFBQWEsVUFBdUI7QUFDbkMsV0FBTyxTQUFTLFNBQVMsTUFBTTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxtQkFBbUIsVUFBdUI7QUFDekMsV0FBTyxRQUFRLFNBQVMsTUFBTTtBQUFBLEVBQy9CO0FBQUEsRUFFQSxZQUFZLFVBQXVCO0FBQ2xDLFdBQU8sU0FBUztBQUFBLEVBQ2pCO0FBQ0Q7QUFFQSxNQUFNLG1CQUFt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
