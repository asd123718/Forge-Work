import { forEachWithNeighbors } from "../../../../base/common/arrays.js";
import { OffsetRange } from "../../core/ranges/offsetRange.js";
import { OffsetPair, SequenceDiff } from "./algorithms/diffAlgorithm.js";
function optimizeSequenceDiffs(sequence1, sequence2, sequenceDiffs) {
  let result = sequenceDiffs;
  result = joinSequenceDiffsByShifting(sequence1, sequence2, result);
  result = joinSequenceDiffsByShifting(sequence1, sequence2, result);
  result = shiftSequenceDiffs(sequence1, sequence2, result);
  return result;
}
function joinSequenceDiffsByShifting(sequence1, sequence2, sequenceDiffs) {
  if (sequenceDiffs.length === 0) {
    return sequenceDiffs;
  }
  const result = [];
  result.push(sequenceDiffs[0]);
  for (let i = 1; i < sequenceDiffs.length; i++) {
    const prevResult = result[result.length - 1];
    let cur = sequenceDiffs[i];
    if (cur.seq1Range.isEmpty || cur.seq2Range.isEmpty) {
      const length = cur.seq1Range.start - prevResult.seq1Range.endExclusive;
      let d;
      for (d = 1; d <= length; d++) {
        if (sequence1.getElement(cur.seq1Range.start - d) !== sequence1.getElement(cur.seq1Range.endExclusive - d) || sequence2.getElement(cur.seq2Range.start - d) !== sequence2.getElement(cur.seq2Range.endExclusive - d)) {
          break;
        }
      }
      d--;
      if (d === length) {
        result[result.length - 1] = new SequenceDiff(
          new OffsetRange(prevResult.seq1Range.start, cur.seq1Range.endExclusive - length),
          new OffsetRange(prevResult.seq2Range.start, cur.seq2Range.endExclusive - length)
        );
        continue;
      }
      cur = cur.delta(-d);
    }
    result.push(cur);
  }
  const result2 = [];
  for (let i = 0; i < result.length - 1; i++) {
    const nextResult = result[i + 1];
    let cur = result[i];
    if (cur.seq1Range.isEmpty || cur.seq2Range.isEmpty) {
      const length = nextResult.seq1Range.start - cur.seq1Range.endExclusive;
      let d;
      for (d = 0; d < length; d++) {
        if (!sequence1.isStronglyEqual(cur.seq1Range.start + d, cur.seq1Range.endExclusive + d) || !sequence2.isStronglyEqual(cur.seq2Range.start + d, cur.seq2Range.endExclusive + d)) {
          break;
        }
      }
      if (d === length) {
        result[i + 1] = new SequenceDiff(
          new OffsetRange(cur.seq1Range.start + length, nextResult.seq1Range.endExclusive),
          new OffsetRange(cur.seq2Range.start + length, nextResult.seq2Range.endExclusive)
        );
        continue;
      }
      if (d > 0) {
        cur = cur.delta(d);
      }
    }
    result2.push(cur);
  }
  if (result.length > 0) {
    result2.push(result[result.length - 1]);
  }
  return result2;
}
function shiftSequenceDiffs(sequence1, sequence2, sequenceDiffs) {
  if (!sequence1.getBoundaryScore || !sequence2.getBoundaryScore) {
    return sequenceDiffs;
  }
  for (let i = 0; i < sequenceDiffs.length; i++) {
    const prevDiff = i > 0 ? sequenceDiffs[i - 1] : void 0;
    const diff = sequenceDiffs[i];
    const nextDiff = i + 1 < sequenceDiffs.length ? sequenceDiffs[i + 1] : void 0;
    const seq1ValidRange = new OffsetRange(prevDiff ? prevDiff.seq1Range.endExclusive + 1 : 0, nextDiff ? nextDiff.seq1Range.start - 1 : sequence1.length);
    const seq2ValidRange = new OffsetRange(prevDiff ? prevDiff.seq2Range.endExclusive + 1 : 0, nextDiff ? nextDiff.seq2Range.start - 1 : sequence2.length);
    if (diff.seq1Range.isEmpty) {
      sequenceDiffs[i] = shiftDiffToBetterPosition(diff, sequence1, sequence2, seq1ValidRange, seq2ValidRange);
    } else if (diff.seq2Range.isEmpty) {
      sequenceDiffs[i] = shiftDiffToBetterPosition(diff.swap(), sequence2, sequence1, seq2ValidRange, seq1ValidRange).swap();
    }
  }
  return sequenceDiffs;
}
function shiftDiffToBetterPosition(diff, sequence1, sequence2, seq1ValidRange, seq2ValidRange) {
  const maxShiftLimit = 100;
  let deltaBefore = 1;
  while (diff.seq1Range.start - deltaBefore >= seq1ValidRange.start && diff.seq2Range.start - deltaBefore >= seq2ValidRange.start && sequence2.isStronglyEqual(diff.seq2Range.start - deltaBefore, diff.seq2Range.endExclusive - deltaBefore) && deltaBefore < maxShiftLimit) {
    deltaBefore++;
  }
  deltaBefore--;
  let deltaAfter = 0;
  while (diff.seq1Range.start + deltaAfter < seq1ValidRange.endExclusive && diff.seq2Range.endExclusive + deltaAfter < seq2ValidRange.endExclusive && sequence2.isStronglyEqual(diff.seq2Range.start + deltaAfter, diff.seq2Range.endExclusive + deltaAfter) && deltaAfter < maxShiftLimit) {
    deltaAfter++;
  }
  if (deltaBefore === 0 && deltaAfter === 0) {
    return diff;
  }
  let bestDelta = 0;
  let bestScore = -1;
  for (let delta = -deltaBefore; delta <= deltaAfter; delta++) {
    const seq2OffsetStart = diff.seq2Range.start + delta;
    const seq2OffsetEndExclusive = diff.seq2Range.endExclusive + delta;
    const seq1Offset = diff.seq1Range.start + delta;
    const score = sequence1.getBoundaryScore(seq1Offset) + sequence2.getBoundaryScore(seq2OffsetStart) + sequence2.getBoundaryScore(seq2OffsetEndExclusive);
    if (score > bestScore) {
      bestScore = score;
      bestDelta = delta;
    }
  }
  return diff.delta(bestDelta);
}
function removeShortMatches(sequence1, sequence2, sequenceDiffs) {
  const result = [];
  for (const s of sequenceDiffs) {
    const last = result[result.length - 1];
    if (!last) {
      result.push(s);
      continue;
    }
    if (s.seq1Range.start - last.seq1Range.endExclusive <= 2 || s.seq2Range.start - last.seq2Range.endExclusive <= 2) {
      result[result.length - 1] = new SequenceDiff(last.seq1Range.join(s.seq1Range), last.seq2Range.join(s.seq2Range));
    } else {
      result.push(s);
    }
  }
  return result;
}
function extendDiffsToEntireWordIfAppropriate(sequence1, sequence2, sequenceDiffs, findParent, force = false) {
  const equalMappings = SequenceDiff.invert(sequenceDiffs, sequence1.length);
  const additional = [];
  let lastPoint = new OffsetPair(0, 0);
  function scanWord(pair, equalMapping) {
    if (pair.offset1 < lastPoint.offset1 || pair.offset2 < lastPoint.offset2) {
      return;
    }
    const w1 = findParent(sequence1, pair.offset1);
    const w2 = findParent(sequence2, pair.offset2);
    if (!w1 || !w2) {
      return;
    }
    let w = new SequenceDiff(w1, w2);
    const equalPart = w.intersect(equalMapping);
    let equalChars1 = equalPart.seq1Range.length;
    let equalChars2 = equalPart.seq2Range.length;
    while (equalMappings.length > 0) {
      const next = equalMappings[0];
      const intersects = next.seq1Range.intersects(w.seq1Range) || next.seq2Range.intersects(w.seq2Range);
      if (!intersects) {
        break;
      }
      const v1 = findParent(sequence1, next.seq1Range.start);
      const v2 = findParent(sequence2, next.seq2Range.start);
      const v = new SequenceDiff(v1, v2);
      const equalPart2 = v.intersect(next);
      equalChars1 += equalPart2.seq1Range.length;
      equalChars2 += equalPart2.seq2Range.length;
      w = w.join(v);
      if (w.seq1Range.endExclusive >= next.seq1Range.endExclusive) {
        equalMappings.shift();
      } else {
        break;
      }
    }
    if (force && equalChars1 + equalChars2 < w.seq1Range.length + w.seq2Range.length || equalChars1 + equalChars2 < (w.seq1Range.length + w.seq2Range.length) * 2 / 3) {
      additional.push(w);
    }
    lastPoint = w.getEndExclusives();
  }
  while (equalMappings.length > 0) {
    const next = equalMappings.shift();
    if (next.seq1Range.isEmpty) {
      continue;
    }
    scanWord(next.getStarts(), next);
    scanWord(next.getEndExclusives().delta(-1), next);
  }
  const merged = mergeSequenceDiffs(sequenceDiffs, additional);
  return merged;
}
function mergeSequenceDiffs(sequenceDiffs1, sequenceDiffs2) {
  const result = [];
  while (sequenceDiffs1.length > 0 || sequenceDiffs2.length > 0) {
    const sd1 = sequenceDiffs1[0];
    const sd2 = sequenceDiffs2[0];
    let next;
    if (sd1 && (!sd2 || sd1.seq1Range.start < sd2.seq1Range.start)) {
      next = sequenceDiffs1.shift();
    } else {
      next = sequenceDiffs2.shift();
    }
    if (result.length > 0 && result[result.length - 1].seq1Range.endExclusive >= next.seq1Range.start) {
      result[result.length - 1] = result[result.length - 1].join(next);
    } else {
      result.push(next);
    }
  }
  return result;
}
function removeVeryShortMatchingLinesBetweenDiffs(sequence1, _sequence2, sequenceDiffs) {
  let diffs = sequenceDiffs;
  if (diffs.length === 0) {
    return diffs;
  }
  let counter = 0;
  let shouldRepeat;
  do {
    shouldRepeat = false;
    const result = [
      diffs[0]
    ];
    for (let i = 1; i < diffs.length; i++) {
      let shouldJoinDiffs2 = function(before, after) {
        const unchangedRange = new OffsetRange(lastResult.seq1Range.endExclusive, cur.seq1Range.start);
        const unchangedText = sequence1.getText(unchangedRange);
        const unchangedTextWithoutWs = unchangedText.replace(/\s/g, "");
        if (unchangedTextWithoutWs.length <= 4 && (before.seq1Range.length + before.seq2Range.length > 5 || after.seq1Range.length + after.seq2Range.length > 5)) {
          return true;
        }
        return false;
      };
      var shouldJoinDiffs = shouldJoinDiffs2;
      const cur = diffs[i];
      const lastResult = result[result.length - 1];
      const shouldJoin = shouldJoinDiffs2(lastResult, cur);
      if (shouldJoin) {
        shouldRepeat = true;
        result[result.length - 1] = result[result.length - 1].join(cur);
      } else {
        result.push(cur);
      }
    }
    diffs = result;
  } while (counter++ < 10 && shouldRepeat);
  return diffs;
}
function removeVeryShortMatchingTextBetweenLongDiffs(sequence1, sequence2, sequenceDiffs) {
  let diffs = sequenceDiffs;
  if (diffs.length === 0) {
    return diffs;
  }
  let counter = 0;
  let shouldRepeat;
  do {
    shouldRepeat = false;
    const result = [
      diffs[0]
    ];
    for (let i = 1; i < diffs.length; i++) {
      let shouldJoinDiffs2 = function(before, after) {
        const unchangedRange = new OffsetRange(lastResult.seq1Range.endExclusive, cur.seq1Range.start);
        const unchangedLineCount = sequence1.countLinesIn(unchangedRange);
        if (unchangedLineCount > 5 || unchangedRange.length > 500) {
          return false;
        }
        const unchangedText = sequence1.getText(unchangedRange).trim();
        if (unchangedText.length > 20 || unchangedText.split(/\r\n|\r|\n/).length > 1) {
          return false;
        }
        const beforeLineCount1 = sequence1.countLinesIn(before.seq1Range);
        const beforeSeq1Length = before.seq1Range.length;
        const beforeLineCount2 = sequence2.countLinesIn(before.seq2Range);
        const beforeSeq2Length = before.seq2Range.length;
        const afterLineCount1 = sequence1.countLinesIn(after.seq1Range);
        const afterSeq1Length = after.seq1Range.length;
        const afterLineCount2 = sequence2.countLinesIn(after.seq2Range);
        const afterSeq2Length = after.seq2Range.length;
        const max = 2 * 40 + 50;
        function cap(v) {
          return Math.min(v, max);
        }
        if (Math.pow(Math.pow(cap(beforeLineCount1 * 40 + beforeSeq1Length), 1.5) + Math.pow(cap(beforeLineCount2 * 40 + beforeSeq2Length), 1.5), 1.5) + Math.pow(Math.pow(cap(afterLineCount1 * 40 + afterSeq1Length), 1.5) + Math.pow(cap(afterLineCount2 * 40 + afterSeq2Length), 1.5), 1.5) > (max ** 1.5) ** 1.5 * 1.3) {
          return true;
        }
        return false;
      };
      var shouldJoinDiffs = shouldJoinDiffs2;
      const cur = diffs[i];
      const lastResult = result[result.length - 1];
      const shouldJoin = shouldJoinDiffs2(lastResult, cur);
      if (shouldJoin) {
        shouldRepeat = true;
        result[result.length - 1] = result[result.length - 1].join(cur);
      } else {
        result.push(cur);
      }
    }
    diffs = result;
  } while (counter++ < 10 && shouldRepeat);
  const newDiffs = [];
  forEachWithNeighbors(diffs, (prev, cur, next) => {
    let newDiff = cur;
    function shouldMarkAsChanged(text) {
      return text.length > 0 && text.trim().length <= 3 && cur.seq1Range.length + cur.seq2Range.length > 100;
    }
    const fullRange1 = sequence1.extendToFullLines(cur.seq1Range);
    const prefix = sequence1.getText(new OffsetRange(fullRange1.start, cur.seq1Range.start));
    if (shouldMarkAsChanged(prefix)) {
      newDiff = newDiff.deltaStart(-prefix.length);
    }
    const suffix = sequence1.getText(new OffsetRange(cur.seq1Range.endExclusive, fullRange1.endExclusive));
    if (shouldMarkAsChanged(suffix)) {
      newDiff = newDiff.deltaEnd(suffix.length);
    }
    const availableSpace = SequenceDiff.fromOffsetPairs(
      prev ? prev.getEndExclusives() : OffsetPair.zero,
      next ? next.getStarts() : OffsetPair.max
    );
    const result = newDiff.intersect(availableSpace);
    if (newDiffs.length > 0 && result.getStarts().equals(newDiffs[newDiffs.length - 1].getEndExclusives())) {
      newDiffs[newDiffs.length - 1] = newDiffs[newDiffs.length - 1].join(result);
    } else {
      newDiffs.push(result);
    }
  });
  return newDiffs;
}
export {
  extendDiffsToEntireWordIfAppropriate,
  optimizeSequenceDiffs,
  removeShortMatches,
  removeVeryShortMatchingLinesBetweenDiffs,
  removeVeryShortMatchingTextBetweenLongDiffs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcZGlmZlxcZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyXFxoZXVyaXN0aWNTZXF1ZW5jZU9wdGltaXphdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBmb3JFYWNoV2l0aE5laWdoYm9ycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElTZXF1ZW5jZSwgT2Zmc2V0UGFpciwgU2VxdWVuY2VEaWZmIH0gZnJvbSAnLi9hbGdvcml0aG1zL2RpZmZBbGdvcml0aG0uanMnO1xuaW1wb3J0IHsgTGluZVNlcXVlbmNlIH0gZnJvbSAnLi9saW5lU2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgTGluZXNTbGljZUNoYXJTZXF1ZW5jZSB9IGZyb20gJy4vbGluZXNTbGljZUNoYXJTZXF1ZW5jZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBvcHRpbWl6ZVNlcXVlbmNlRGlmZnMoc2VxdWVuY2UxOiBJU2VxdWVuY2UsIHNlcXVlbmNlMjogSVNlcXVlbmNlLCBzZXF1ZW5jZURpZmZzOiBTZXF1ZW5jZURpZmZbXSk6IFNlcXVlbmNlRGlmZltdIHtcblx0bGV0IHJlc3VsdCA9IHNlcXVlbmNlRGlmZnM7XG5cdHJlc3VsdCA9IGpvaW5TZXF1ZW5jZURpZmZzQnlTaGlmdGluZyhzZXF1ZW5jZTEsIHNlcXVlbmNlMiwgcmVzdWx0KTtcblx0Ly8gU29tZXRpbWVzLCBjYWxsaW5nIHRoaXMgZnVuY3Rpb24gdHdpY2UgaW1wcm92ZXMgdGhlIHJlc3VsdC5cblx0Ly8gVW5jb21tZW50IHRoZSBzZWNvbmQgaW52b2NhdGlvbiBhbmQgcnVuIHRoZSB0ZXN0cyB0byBzZWUgdGhlIGRpZmZlcmVuY2UuXG5cdHJlc3VsdCA9IGpvaW5TZXF1ZW5jZURpZmZzQnlTaGlmdGluZyhzZXF1ZW5jZTEsIHNlcXVlbmNlMiwgcmVzdWx0KTtcblx0cmVzdWx0ID0gc2hpZnRTZXF1ZW5jZURpZmZzKHNlcXVlbmNlMSwgc2VxdWVuY2UyLCByZXN1bHQpO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gZml4ZXMgaXNzdWVzIGxpa2UgdGhpczpcbiAqIGBgYFxuICogaW1wb3J0IHsgQmF6LCBCYXIgfSBmcm9tIFwiZm9vXCI7XG4gKiBgYGBcbiAqIDwtPlxuICogYGBgXG4gKiBpbXBvcnQgeyBCYXosIEJhciwgRm9vIH0gZnJvbSBcImZvb1wiO1xuICogYGBgXG4gKiBDb21wdXRlZCBkaWZmOiBbIHtBZGQgXCIsXCIgYWZ0ZXIgQmFyfSwge0FkZCBcIkZvbyBcIiBhZnRlciBzcGFjZX0gfVxuICogSW1wcm92ZWQgZGlmZjogW3tBZGQgXCIsIEZvb1wiIGFmdGVyIEJhcn1dXG4gKi9cbmZ1bmN0aW9uIGpvaW5TZXF1ZW5jZURpZmZzQnlTaGlmdGluZyhzZXF1ZW5jZTE6IElTZXF1ZW5jZSwgc2VxdWVuY2UyOiBJU2VxdWVuY2UsIHNlcXVlbmNlRGlmZnM6IFNlcXVlbmNlRGlmZltdKTogU2VxdWVuY2VEaWZmW10ge1xuXHRpZiAoc2VxdWVuY2VEaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gc2VxdWVuY2VEaWZmcztcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogU2VxdWVuY2VEaWZmW10gPSBbXTtcblx0cmVzdWx0LnB1c2goc2VxdWVuY2VEaWZmc1swXSk7XG5cblx0Ly8gRmlyc3QgbW92ZSB0aGVtIGFsbCB0byB0aGUgbGVmdCBhcyBtdWNoIGFzIHBvc3NpYmxlIGFuZCBqb2luIHRoZW0gaWYgcG9zc2libGVcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBzZXF1ZW5jZURpZmZzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgcHJldlJlc3VsdCA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG5cdFx0bGV0IGN1ciA9IHNlcXVlbmNlRGlmZnNbaV07XG5cblx0XHRpZiAoY3VyLnNlcTFSYW5nZS5pc0VtcHR5IHx8IGN1ci5zZXEyUmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gY3VyLnNlcTFSYW5nZS5zdGFydCAtIHByZXZSZXN1bHQuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZTtcblx0XHRcdGxldCBkO1xuXHRcdFx0Zm9yIChkID0gMTsgZCA8PSBsZW5ndGg7IGQrKykge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0c2VxdWVuY2UxLmdldEVsZW1lbnQoY3VyLnNlcTFSYW5nZS5zdGFydCAtIGQpICE9PSBzZXF1ZW5jZTEuZ2V0RWxlbWVudChjdXIuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSAtIGQpIHx8XG5cdFx0XHRcdFx0c2VxdWVuY2UyLmdldEVsZW1lbnQoY3VyLnNlcTJSYW5nZS5zdGFydCAtIGQpICE9PSBzZXF1ZW5jZTIuZ2V0RWxlbWVudChjdXIuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSAtIGQpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGQtLTtcblxuXHRcdFx0aWYgKGQgPT09IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBNZXJnZSBwcmV2aW91cyBhbmQgY3VycmVudCBkaWZmXG5cdFx0XHRcdHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0gPSBuZXcgU2VxdWVuY2VEaWZmKFxuXHRcdFx0XHRcdG5ldyBPZmZzZXRSYW5nZShwcmV2UmVzdWx0LnNlcTFSYW5nZS5zdGFydCwgY3VyLnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUgLSBsZW5ndGgpLFxuXHRcdFx0XHRcdG5ldyBPZmZzZXRSYW5nZShwcmV2UmVzdWx0LnNlcTJSYW5nZS5zdGFydCwgY3VyLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgLSBsZW5ndGgpLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y3VyID0gY3VyLmRlbHRhKC1kKTtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChjdXIpO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0MjogU2VxdWVuY2VEaWZmW10gPSBbXTtcblx0Ly8gVGhlbiBtb3ZlIHRoZW0gYWxsIHRvIHRoZSByaWdodCBhbmQgam9pbiB0aGVtIGFnYWluIGlmIHBvc3NpYmxlXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0Lmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdGNvbnN0IG5leHRSZXN1bHQgPSByZXN1bHRbaSArIDFdO1xuXHRcdGxldCBjdXIgPSByZXN1bHRbaV07XG5cblx0XHRpZiAoY3VyLnNlcTFSYW5nZS5pc0VtcHR5IHx8IGN1ci5zZXEyUmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gbmV4dFJlc3VsdC5zZXExUmFuZ2Uuc3RhcnQgLSBjdXIuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZTtcblx0XHRcdGxldCBkO1xuXHRcdFx0Zm9yIChkID0gMDsgZCA8IGxlbmd0aDsgZCsrKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHQhc2VxdWVuY2UxLmlzU3Ryb25nbHlFcXVhbChjdXIuc2VxMVJhbmdlLnN0YXJ0ICsgZCwgY3VyLnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUgKyBkKSB8fFxuXHRcdFx0XHRcdCFzZXF1ZW5jZTIuaXNTdHJvbmdseUVxdWFsKGN1ci5zZXEyUmFuZ2Uuc3RhcnQgKyBkLCBjdXIuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSArIGQpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkID09PSBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gTWVyZ2UgcHJldmlvdXMgYW5kIGN1cnJlbnQgZGlmZiwgd3JpdGUgdG8gcmVzdWx0IVxuXHRcdFx0XHRyZXN1bHRbaSArIDFdID0gbmV3IFNlcXVlbmNlRGlmZihcblx0XHRcdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoY3VyLnNlcTFSYW5nZS5zdGFydCArIGxlbmd0aCwgbmV4dFJlc3VsdC5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlKSxcblx0XHRcdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoY3VyLnNlcTJSYW5nZS5zdGFydCArIGxlbmd0aCwgbmV4dFJlc3VsdC5zZXEyUmFuZ2UuZW5kRXhjbHVzaXZlKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkID4gMCkge1xuXHRcdFx0XHRjdXIgPSBjdXIuZGVsdGEoZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVzdWx0Mi5wdXNoKGN1cik7XG5cdH1cblxuXHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRyZXN1bHQyLnB1c2gocmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0Mjtcbn1cblxuLy8gYWxpZ24gY2hhcmFjdGVyIGxldmVsIGRpZmZzIGF0IHdoaXRlc3BhY2UgY2hhcmFjdGVyc1xuLy8gaW1wb3J0IHsgSUJhciB9IGZyb20gXCJmb29cIjtcbi8vIGltcG9ydCB7IElbQXJyLCBJXUJhciB9IGZyb20gXCJmb29cIjtcbi8vIC0+XG4vLyBpbXBvcnQgeyBbSUFyciwgXUlCYXIgfSBmcm9tIFwiZm9vXCI7XG5cbi8vIGltcG9ydCB7IElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGUnO1xuLy8gaW1wb3J0IHsgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlW0Zyb21FdmVudCwgb2JzZXJ2YWJsZV1WYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICd2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlJztcbi8vIC0+XG4vLyBpbXBvcnQgeyBJVHJhbnNhY3Rpb24sIFtvYnNlcnZhYmxlRnJvbUV2ZW50LCBdb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGUnO1xuXG4vLyBjb2xsZWN0QnJhY2tldHMobGV2ZWwgKyAxLCBsZXZlbFBlckJyYWNrZXRUeXBlKTtcbi8vIGNvbGxlY3RCcmFja2V0cyhsZXZlbCArIDEsIGxldmVsUGVyQnJhY2tldFsgKyAxLCBsZXZlbFBlckJyYWNrZXRdVHlwZSk7XG4vLyAtPlxuLy8gY29sbGVjdEJyYWNrZXRzKGxldmVsICsgMSwgW2xldmVsUGVyQnJhY2tldCArIDEsIF1sZXZlbFBlckJyYWNrZXRUeXBlKTtcblxuZnVuY3Rpb24gc2hpZnRTZXF1ZW5jZURpZmZzKHNlcXVlbmNlMTogSVNlcXVlbmNlLCBzZXF1ZW5jZTI6IElTZXF1ZW5jZSwgc2VxdWVuY2VEaWZmczogU2VxdWVuY2VEaWZmW10pOiBTZXF1ZW5jZURpZmZbXSB7XG5cdGlmICghc2VxdWVuY2UxLmdldEJvdW5kYXJ5U2NvcmUgfHwgIXNlcXVlbmNlMi5nZXRCb3VuZGFyeVNjb3JlKSB7XG5cdFx0cmV0dXJuIHNlcXVlbmNlRGlmZnM7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHNlcXVlbmNlRGlmZnMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBwcmV2RGlmZiA9IChpID4gMCA/IHNlcXVlbmNlRGlmZnNbaSAtIDFdIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBkaWZmID0gc2VxdWVuY2VEaWZmc1tpXTtcblx0XHRjb25zdCBuZXh0RGlmZiA9IChpICsgMSA8IHNlcXVlbmNlRGlmZnMubGVuZ3RoID8gc2VxdWVuY2VEaWZmc1tpICsgMV0gOiB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc2VxMVZhbGlkUmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2UocHJldkRpZmYgPyBwcmV2RGlmZi5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlICsgMSA6IDAsIG5leHREaWZmID8gbmV4dERpZmYuc2VxMVJhbmdlLnN0YXJ0IC0gMSA6IHNlcXVlbmNlMS5sZW5ndGgpO1xuXHRcdGNvbnN0IHNlcTJWYWxpZFJhbmdlID0gbmV3IE9mZnNldFJhbmdlKHByZXZEaWZmID8gcHJldkRpZmYuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSArIDEgOiAwLCBuZXh0RGlmZiA/IG5leHREaWZmLnNlcTJSYW5nZS5zdGFydCAtIDEgOiBzZXF1ZW5jZTIubGVuZ3RoKTtcblxuXHRcdGlmIChkaWZmLnNlcTFSYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHRzZXF1ZW5jZURpZmZzW2ldID0gc2hpZnREaWZmVG9CZXR0ZXJQb3NpdGlvbihkaWZmLCBzZXF1ZW5jZTEsIHNlcXVlbmNlMiwgc2VxMVZhbGlkUmFuZ2UsIHNlcTJWYWxpZFJhbmdlKTtcblx0XHR9IGVsc2UgaWYgKGRpZmYuc2VxMlJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdHNlcXVlbmNlRGlmZnNbaV0gPSBzaGlmdERpZmZUb0JldHRlclBvc2l0aW9uKGRpZmYuc3dhcCgpLCBzZXF1ZW5jZTIsIHNlcXVlbmNlMSwgc2VxMlZhbGlkUmFuZ2UsIHNlcTFWYWxpZFJhbmdlKS5zd2FwKCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHNlcXVlbmNlRGlmZnM7XG59XG5cbmZ1bmN0aW9uIHNoaWZ0RGlmZlRvQmV0dGVyUG9zaXRpb24oZGlmZjogU2VxdWVuY2VEaWZmLCBzZXF1ZW5jZTE6IElTZXF1ZW5jZSwgc2VxdWVuY2UyOiBJU2VxdWVuY2UsIHNlcTFWYWxpZFJhbmdlOiBPZmZzZXRSYW5nZSwgc2VxMlZhbGlkUmFuZ2U6IE9mZnNldFJhbmdlLCkge1xuXHRjb25zdCBtYXhTaGlmdExpbWl0ID0gMTAwOyAvLyBUbyBwcmV2ZW50IHBlcmZvcm1hbmNlIGlzc3Vlc1xuXG5cdC8vIGRvbid0IHRvdWNoIHByZXZpb3VzIG9yIG5leHQhXG5cdGxldCBkZWx0YUJlZm9yZSA9IDE7XG5cdHdoaWxlIChcblx0XHRkaWZmLnNlcTFSYW5nZS5zdGFydCAtIGRlbHRhQmVmb3JlID49IHNlcTFWYWxpZFJhbmdlLnN0YXJ0ICYmXG5cdFx0ZGlmZi5zZXEyUmFuZ2Uuc3RhcnQgLSBkZWx0YUJlZm9yZSA+PSBzZXEyVmFsaWRSYW5nZS5zdGFydCAmJlxuXHRcdHNlcXVlbmNlMi5pc1N0cm9uZ2x5RXF1YWwoZGlmZi5zZXEyUmFuZ2Uuc3RhcnQgLSBkZWx0YUJlZm9yZSwgZGlmZi5zZXEyUmFuZ2UuZW5kRXhjbHVzaXZlIC0gZGVsdGFCZWZvcmUpICYmIGRlbHRhQmVmb3JlIDwgbWF4U2hpZnRMaW1pdFxuXHQpIHtcblx0XHRkZWx0YUJlZm9yZSsrO1xuXHR9XG5cdGRlbHRhQmVmb3JlLS07XG5cblx0bGV0IGRlbHRhQWZ0ZXIgPSAwO1xuXHR3aGlsZSAoXG5cdFx0ZGlmZi5zZXExUmFuZ2Uuc3RhcnQgKyBkZWx0YUFmdGVyIDwgc2VxMVZhbGlkUmFuZ2UuZW5kRXhjbHVzaXZlICYmXG5cdFx0ZGlmZi5zZXEyUmFuZ2UuZW5kRXhjbHVzaXZlICsgZGVsdGFBZnRlciA8IHNlcTJWYWxpZFJhbmdlLmVuZEV4Y2x1c2l2ZSAmJlxuXHRcdHNlcXVlbmNlMi5pc1N0cm9uZ2x5RXF1YWwoZGlmZi5zZXEyUmFuZ2Uuc3RhcnQgKyBkZWx0YUFmdGVyLCBkaWZmLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgKyBkZWx0YUFmdGVyKSAmJiBkZWx0YUFmdGVyIDwgbWF4U2hpZnRMaW1pdFxuXHQpIHtcblx0XHRkZWx0YUFmdGVyKys7XG5cdH1cblxuXHRpZiAoZGVsdGFCZWZvcmUgPT09IDAgJiYgZGVsdGFBZnRlciA9PT0gMCkge1xuXHRcdHJldHVybiBkaWZmO1xuXHR9XG5cblx0Ly8gVmlzdWFsaXplIGBbc2VxdWVuY2UxLnRleHQsIGRpZmYuc2VxMVJhbmdlLnN0YXJ0ICsgZGVsdGFBZnRlcl1gXG5cdC8vIGFuZCBgW3NlcXVlbmNlMi50ZXh0LCBkaWZmLnNlcTJSYW5nZS5zdGFydCArIGRlbHRhQWZ0ZXIsIGRpZmYuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSArIGRlbHRhQWZ0ZXJdYFxuXG5cdGxldCBiZXN0RGVsdGEgPSAwO1xuXHRsZXQgYmVzdFNjb3JlID0gLTE7XG5cdC8vIGZpbmQgYmVzdCBzY29yZWQgZGVsdGFcblx0Zm9yIChsZXQgZGVsdGEgPSAtZGVsdGFCZWZvcmU7IGRlbHRhIDw9IGRlbHRhQWZ0ZXI7IGRlbHRhKyspIHtcblx0XHRjb25zdCBzZXEyT2Zmc2V0U3RhcnQgPSBkaWZmLnNlcTJSYW5nZS5zdGFydCArIGRlbHRhO1xuXHRcdGNvbnN0IHNlcTJPZmZzZXRFbmRFeGNsdXNpdmUgPSBkaWZmLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgKyBkZWx0YTtcblx0XHRjb25zdCBzZXExT2Zmc2V0ID0gZGlmZi5zZXExUmFuZ2Uuc3RhcnQgKyBkZWx0YTtcblxuXHRcdGNvbnN0IHNjb3JlID0gc2VxdWVuY2UxLmdldEJvdW5kYXJ5U2NvcmUhKHNlcTFPZmZzZXQpICsgc2VxdWVuY2UyLmdldEJvdW5kYXJ5U2NvcmUhKHNlcTJPZmZzZXRTdGFydCkgKyBzZXF1ZW5jZTIuZ2V0Qm91bmRhcnlTY29yZSEoc2VxMk9mZnNldEVuZEV4Y2x1c2l2ZSk7XG5cdFx0aWYgKHNjb3JlID4gYmVzdFNjb3JlKSB7XG5cdFx0XHRiZXN0U2NvcmUgPSBzY29yZTtcblx0XHRcdGJlc3REZWx0YSA9IGRlbHRhO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBkaWZmLmRlbHRhKGJlc3REZWx0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVTaG9ydE1hdGNoZXMoc2VxdWVuY2UxOiBJU2VxdWVuY2UsIHNlcXVlbmNlMjogSVNlcXVlbmNlLCBzZXF1ZW5jZURpZmZzOiBTZXF1ZW5jZURpZmZbXSk6IFNlcXVlbmNlRGlmZltdIHtcblx0Y29uc3QgcmVzdWx0OiBTZXF1ZW5jZURpZmZbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHMgb2Ygc2VxdWVuY2VEaWZmcykge1xuXHRcdGNvbnN0IGxhc3QgPSByZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdO1xuXHRcdGlmICghbGFzdCkge1xuXHRcdFx0cmVzdWx0LnB1c2gocyk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAocy5zZXExUmFuZ2Uuc3RhcnQgLSBsYXN0LnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUgPD0gMiB8fCBzLnNlcTJSYW5nZS5zdGFydCAtIGxhc3Quc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSA8PSAyKSB7XG5cdFx0XHRyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdID0gbmV3IFNlcXVlbmNlRGlmZihsYXN0LnNlcTFSYW5nZS5qb2luKHMuc2VxMVJhbmdlKSwgbGFzdC5zZXEyUmFuZ2Uuam9pbihzLnNlcTJSYW5nZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQucHVzaChzKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0ZW5kRGlmZnNUb0VudGlyZVdvcmRJZkFwcHJvcHJpYXRlKFxuXHRzZXF1ZW5jZTE6IExpbmVzU2xpY2VDaGFyU2VxdWVuY2UsXG5cdHNlcXVlbmNlMjogTGluZXNTbGljZUNoYXJTZXF1ZW5jZSxcblx0c2VxdWVuY2VEaWZmczogU2VxdWVuY2VEaWZmW10sXG5cdGZpbmRQYXJlbnQ6IChzZXE6IExpbmVzU2xpY2VDaGFyU2VxdWVuY2UsIGlkeDogbnVtYmVyKSA9PiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCxcblx0Zm9yY2U6IGJvb2xlYW4gPSBmYWxzZSxcbik6IFNlcXVlbmNlRGlmZltdIHtcblx0Y29uc3QgZXF1YWxNYXBwaW5ncyA9IFNlcXVlbmNlRGlmZi5pbnZlcnQoc2VxdWVuY2VEaWZmcywgc2VxdWVuY2UxLmxlbmd0aCk7XG5cblx0Y29uc3QgYWRkaXRpb25hbDogU2VxdWVuY2VEaWZmW10gPSBbXTtcblxuXHRsZXQgbGFzdFBvaW50ID0gbmV3IE9mZnNldFBhaXIoMCwgMCk7XG5cblx0ZnVuY3Rpb24gc2NhbldvcmQocGFpcjogT2Zmc2V0UGFpciwgZXF1YWxNYXBwaW5nOiBTZXF1ZW5jZURpZmYpIHtcblx0XHRpZiAocGFpci5vZmZzZXQxIDwgbGFzdFBvaW50Lm9mZnNldDEgfHwgcGFpci5vZmZzZXQyIDwgbGFzdFBvaW50Lm9mZnNldDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3MSA9IGZpbmRQYXJlbnQoc2VxdWVuY2UxLCBwYWlyLm9mZnNldDEpO1xuXHRcdGNvbnN0IHcyID0gZmluZFBhcmVudChzZXF1ZW5jZTIsIHBhaXIub2Zmc2V0Mik7XG5cdFx0aWYgKCF3MSB8fCAhdzIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IHcgPSBuZXcgU2VxdWVuY2VEaWZmKHcxLCB3Mik7XG5cdFx0Y29uc3QgZXF1YWxQYXJ0ID0gdy5pbnRlcnNlY3QoZXF1YWxNYXBwaW5nKSE7XG5cblx0XHRsZXQgZXF1YWxDaGFyczEgPSBlcXVhbFBhcnQuc2VxMVJhbmdlLmxlbmd0aDtcblx0XHRsZXQgZXF1YWxDaGFyczIgPSBlcXVhbFBhcnQuc2VxMlJhbmdlLmxlbmd0aDtcblxuXHRcdC8vIFRoZSB3b3JkcyBkbyBub3QgdG91Y2ggcHJldmlvdXMgZXF1YWxzIG1hcHBpbmdzLCBhcyB3ZSB3b3VsZCBoYXZlIHByb2Nlc3NlZCB0aGVtIGFscmVhZHkuXG5cdFx0Ly8gQnV0IHRoZXkgbWlnaHQgdG91Y2ggdGhlIG5leHQgb25lcy5cblxuXHRcdHdoaWxlIChlcXVhbE1hcHBpbmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG5leHQgPSBlcXVhbE1hcHBpbmdzWzBdO1xuXHRcdFx0Y29uc3QgaW50ZXJzZWN0cyA9IG5leHQuc2VxMVJhbmdlLmludGVyc2VjdHMody5zZXExUmFuZ2UpIHx8IG5leHQuc2VxMlJhbmdlLmludGVyc2VjdHMody5zZXEyUmFuZ2UpO1xuXHRcdFx0aWYgKCFpbnRlcnNlY3RzKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2MSA9IGZpbmRQYXJlbnQoc2VxdWVuY2UxLCBuZXh0LnNlcTFSYW5nZS5zdGFydCk7XG5cdFx0XHRjb25zdCB2MiA9IGZpbmRQYXJlbnQoc2VxdWVuY2UyLCBuZXh0LnNlcTJSYW5nZS5zdGFydCk7XG5cdFx0XHQvLyBCZWNhdXNlIHRoZXJlIGlzIGFuIGludGVyc2VjdGlvbiwgd2Uga25vdyB0aGF0IHRoZSB3b3JkcyBhcmUgbm90IGVtcHR5LlxuXHRcdFx0Y29uc3QgdiA9IG5ldyBTZXF1ZW5jZURpZmYodjEhLCB2MiEpO1xuXHRcdFx0Y29uc3QgZXF1YWxQYXJ0ID0gdi5pbnRlcnNlY3QobmV4dCkhO1xuXG5cdFx0XHRlcXVhbENoYXJzMSArPSBlcXVhbFBhcnQuc2VxMVJhbmdlLmxlbmd0aDtcblx0XHRcdGVxdWFsQ2hhcnMyICs9IGVxdWFsUGFydC5zZXEyUmFuZ2UubGVuZ3RoO1xuXG5cdFx0XHR3ID0gdy5qb2luKHYpO1xuXG5cdFx0XHRpZiAody5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlID49IG5leHQuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHQvLyBUaGUgd29yZCBleHRlbmRzIGJleW9uZCB0aGUgbmV4dCBlcXVhbCBtYXBwaW5nLlxuXHRcdFx0XHRlcXVhbE1hcHBpbmdzLnNoaWZ0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoKGZvcmNlICYmIGVxdWFsQ2hhcnMxICsgZXF1YWxDaGFyczIgPCB3LnNlcTFSYW5nZS5sZW5ndGggKyB3LnNlcTJSYW5nZS5sZW5ndGgpIHx8IGVxdWFsQ2hhcnMxICsgZXF1YWxDaGFyczIgPCAody5zZXExUmFuZ2UubGVuZ3RoICsgdy5zZXEyUmFuZ2UubGVuZ3RoKSAqIDIgLyAzKSB7XG5cdFx0XHRhZGRpdGlvbmFsLnB1c2godyk7XG5cdFx0fVxuXG5cdFx0bGFzdFBvaW50ID0gdy5nZXRFbmRFeGNsdXNpdmVzKCk7XG5cdH1cblxuXHR3aGlsZSAoZXF1YWxNYXBwaW5ncy5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgbmV4dCA9IGVxdWFsTWFwcGluZ3Muc2hpZnQoKSE7XG5cdFx0aWYgKG5leHQuc2VxMVJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRzY2FuV29yZChuZXh0LmdldFN0YXJ0cygpLCBuZXh0KTtcblx0XHQvLyBUaGUgZXF1YWwgcGFydHMgYXJlIG5vdCBlbXB0eSwgc28gLTEgZ2l2ZXMgdXMgYSBjaGFyYWN0ZXIgdGhhdCBpcyBlcXVhbCBpbiBib3RoIHBhcnRzLlxuXHRcdHNjYW5Xb3JkKG5leHQuZ2V0RW5kRXhjbHVzaXZlcygpLmRlbHRhKC0xKSwgbmV4dCk7XG5cdH1cblxuXHRjb25zdCBtZXJnZWQgPSBtZXJnZVNlcXVlbmNlRGlmZnMoc2VxdWVuY2VEaWZmcywgYWRkaXRpb25hbCk7XG5cdHJldHVybiBtZXJnZWQ7XG59XG5cbmZ1bmN0aW9uIG1lcmdlU2VxdWVuY2VEaWZmcyhzZXF1ZW5jZURpZmZzMTogU2VxdWVuY2VEaWZmW10sIHNlcXVlbmNlRGlmZnMyOiBTZXF1ZW5jZURpZmZbXSk6IFNlcXVlbmNlRGlmZltdIHtcblx0Y29uc3QgcmVzdWx0OiBTZXF1ZW5jZURpZmZbXSA9IFtdO1xuXG5cdHdoaWxlIChzZXF1ZW5jZURpZmZzMS5sZW5ndGggPiAwIHx8IHNlcXVlbmNlRGlmZnMyLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBzZDEgPSBzZXF1ZW5jZURpZmZzMVswXTtcblx0XHRjb25zdCBzZDIgPSBzZXF1ZW5jZURpZmZzMlswXTtcblxuXHRcdGxldCBuZXh0OiBTZXF1ZW5jZURpZmY7XG5cdFx0aWYgKHNkMSAmJiAoIXNkMiB8fCBzZDEuc2VxMVJhbmdlLnN0YXJ0IDwgc2QyLnNlcTFSYW5nZS5zdGFydCkpIHtcblx0XHRcdG5leHQgPSBzZXF1ZW5jZURpZmZzMS5zaGlmdCgpITtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV4dCA9IHNlcXVlbmNlRGlmZnMyLnNoaWZ0KCkhO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQubGVuZ3RoID4gMCAmJiByZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdLnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUgPj0gbmV4dC5zZXExUmFuZ2Uuc3RhcnQpIHtcblx0XHRcdHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0gPSByZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdLmpvaW4obmV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5wdXNoKG5leHQpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVWZXJ5U2hvcnRNYXRjaGluZ0xpbmVzQmV0d2VlbkRpZmZzKHNlcXVlbmNlMTogTGluZVNlcXVlbmNlLCBfc2VxdWVuY2UyOiBMaW5lU2VxdWVuY2UsIHNlcXVlbmNlRGlmZnM6IFNlcXVlbmNlRGlmZltdKTogU2VxdWVuY2VEaWZmW10ge1xuXHRsZXQgZGlmZnMgPSBzZXF1ZW5jZURpZmZzO1xuXHRpZiAoZGlmZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGRpZmZzO1xuXHR9XG5cblx0bGV0IGNvdW50ZXIgPSAwO1xuXHRsZXQgc2hvdWxkUmVwZWF0OiBib29sZWFuO1xuXHRkbyB7XG5cdFx0c2hvdWxkUmVwZWF0ID0gZmFsc2U7XG5cblx0XHRjb25zdCByZXN1bHQ6IFNlcXVlbmNlRGlmZltdID0gW1xuXHRcdFx0ZGlmZnNbMF1cblx0XHRdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBkaWZmcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VyID0gZGlmZnNbaV07XG5cdFx0XHRjb25zdCBsYXN0UmVzdWx0ID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcblxuXHRcdFx0ZnVuY3Rpb24gc2hvdWxkSm9pbkRpZmZzKGJlZm9yZTogU2VxdWVuY2VEaWZmLCBhZnRlcjogU2VxdWVuY2VEaWZmKTogYm9vbGVhbiB7XG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZFJhbmdlID0gbmV3IE9mZnNldFJhbmdlKGxhc3RSZXN1bHQuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSwgY3VyLnNlcTFSYW5nZS5zdGFydCk7XG5cblx0XHRcdFx0Y29uc3QgdW5jaGFuZ2VkVGV4dCA9IHNlcXVlbmNlMS5nZXRUZXh0KHVuY2hhbmdlZFJhbmdlKTtcblx0XHRcdFx0Y29uc3QgdW5jaGFuZ2VkVGV4dFdpdGhvdXRXcyA9IHVuY2hhbmdlZFRleHQucmVwbGFjZSgvXFxzL2csICcnKTtcblx0XHRcdFx0aWYgKHVuY2hhbmdlZFRleHRXaXRob3V0V3MubGVuZ3RoIDw9IDRcblx0XHRcdFx0XHQmJiAoYmVmb3JlLnNlcTFSYW5nZS5sZW5ndGggKyBiZWZvcmUuc2VxMlJhbmdlLmxlbmd0aCA+IDUgfHwgYWZ0ZXIuc2VxMVJhbmdlLmxlbmd0aCArIGFmdGVyLnNlcTJSYW5nZS5sZW5ndGggPiA1KSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzaG91bGRKb2luID0gc2hvdWxkSm9pbkRpZmZzKGxhc3RSZXN1bHQsIGN1cik7XG5cdFx0XHRpZiAoc2hvdWxkSm9pbikge1xuXHRcdFx0XHRzaG91bGRSZXBlYXQgPSB0cnVlO1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXS5qb2luKGN1cik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaChjdXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGRpZmZzID0gcmVzdWx0O1xuXHR9IHdoaWxlIChjb3VudGVyKysgPCAxMCAmJiBzaG91bGRSZXBlYXQpO1xuXG5cdHJldHVybiBkaWZmcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVZlcnlTaG9ydE1hdGNoaW5nVGV4dEJldHdlZW5Mb25nRGlmZnMoc2VxdWVuY2UxOiBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlLCBzZXF1ZW5jZTI6IExpbmVzU2xpY2VDaGFyU2VxdWVuY2UsIHNlcXVlbmNlRGlmZnM6IFNlcXVlbmNlRGlmZltdKTogU2VxdWVuY2VEaWZmW10ge1xuXHRsZXQgZGlmZnMgPSBzZXF1ZW5jZURpZmZzO1xuXHRpZiAoZGlmZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGRpZmZzO1xuXHR9XG5cblx0bGV0IGNvdW50ZXIgPSAwO1xuXHRsZXQgc2hvdWxkUmVwZWF0OiBib29sZWFuO1xuXHRkbyB7XG5cdFx0c2hvdWxkUmVwZWF0ID0gZmFsc2U7XG5cblx0XHRjb25zdCByZXN1bHQ6IFNlcXVlbmNlRGlmZltdID0gW1xuXHRcdFx0ZGlmZnNbMF1cblx0XHRdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBkaWZmcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VyID0gZGlmZnNbaV07XG5cdFx0XHRjb25zdCBsYXN0UmVzdWx0ID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcblxuXHRcdFx0ZnVuY3Rpb24gc2hvdWxkSm9pbkRpZmZzKGJlZm9yZTogU2VxdWVuY2VEaWZmLCBhZnRlcjogU2VxdWVuY2VEaWZmKTogYm9vbGVhbiB7XG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZFJhbmdlID0gbmV3IE9mZnNldFJhbmdlKGxhc3RSZXN1bHQuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSwgY3VyLnNlcTFSYW5nZS5zdGFydCk7XG5cblx0XHRcdFx0Y29uc3QgdW5jaGFuZ2VkTGluZUNvdW50ID0gc2VxdWVuY2UxLmNvdW50TGluZXNJbih1bmNoYW5nZWRSYW5nZSk7XG5cdFx0XHRcdGlmICh1bmNoYW5nZWRMaW5lQ291bnQgPiA1IHx8IHVuY2hhbmdlZFJhbmdlLmxlbmd0aCA+IDUwMCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZFRleHQgPSBzZXF1ZW5jZTEuZ2V0VGV4dCh1bmNoYW5nZWRSYW5nZSkudHJpbSgpO1xuXHRcdFx0XHRpZiAodW5jaGFuZ2VkVGV4dC5sZW5ndGggPiAyMCB8fCB1bmNoYW5nZWRUZXh0LnNwbGl0KC9cXHJcXG58XFxyfFxcbi8pLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBiZWZvcmVMaW5lQ291bnQxID0gc2VxdWVuY2UxLmNvdW50TGluZXNJbihiZWZvcmUuc2VxMVJhbmdlKTtcblx0XHRcdFx0Y29uc3QgYmVmb3JlU2VxMUxlbmd0aCA9IGJlZm9yZS5zZXExUmFuZ2UubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBiZWZvcmVMaW5lQ291bnQyID0gc2VxdWVuY2UyLmNvdW50TGluZXNJbihiZWZvcmUuc2VxMlJhbmdlKTtcblx0XHRcdFx0Y29uc3QgYmVmb3JlU2VxMkxlbmd0aCA9IGJlZm9yZS5zZXEyUmFuZ2UubGVuZ3RoO1xuXG5cdFx0XHRcdGNvbnN0IGFmdGVyTGluZUNvdW50MSA9IHNlcXVlbmNlMS5jb3VudExpbmVzSW4oYWZ0ZXIuc2VxMVJhbmdlKTtcblx0XHRcdFx0Y29uc3QgYWZ0ZXJTZXExTGVuZ3RoID0gYWZ0ZXIuc2VxMVJhbmdlLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgYWZ0ZXJMaW5lQ291bnQyID0gc2VxdWVuY2UyLmNvdW50TGluZXNJbihhZnRlci5zZXEyUmFuZ2UpO1xuXHRcdFx0XHRjb25zdCBhZnRlclNlcTJMZW5ndGggPSBhZnRlci5zZXEyUmFuZ2UubGVuZ3RoO1xuXG5cdFx0XHRcdC8vIFRPRE86IE1heWJlIGEgbmV1cmFsIG5ldCBjYW4gYmUgdXNlZCB0byBkZXJpdmUgdGhlIHJlc3VsdCBmcm9tIHRoZXNlIG51bWJlcnNcblxuXHRcdFx0XHRjb25zdCBtYXggPSAyICogNDAgKyA1MDtcblx0XHRcdFx0ZnVuY3Rpb24gY2FwKHY6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdFx0cmV0dXJuIE1hdGgubWluKHYsIG1heCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoTWF0aC5wb3coTWF0aC5wb3coY2FwKGJlZm9yZUxpbmVDb3VudDEgKiA0MCArIGJlZm9yZVNlcTFMZW5ndGgpLCAxLjUpICsgTWF0aC5wb3coY2FwKGJlZm9yZUxpbmVDb3VudDIgKiA0MCArIGJlZm9yZVNlcTJMZW5ndGgpLCAxLjUpLCAxLjUpXG5cdFx0XHRcdFx0KyBNYXRoLnBvdyhNYXRoLnBvdyhjYXAoYWZ0ZXJMaW5lQ291bnQxICogNDAgKyBhZnRlclNlcTFMZW5ndGgpLCAxLjUpICsgTWF0aC5wb3coY2FwKGFmdGVyTGluZUNvdW50MiAqIDQwICsgYWZ0ZXJTZXEyTGVuZ3RoKSwgMS41KSwgMS41KSA+ICgobWF4ICoqIDEuNSkgKiogMS41KSAqIDEuMykge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hvdWxkSm9pbiA9IHNob3VsZEpvaW5EaWZmcyhsYXN0UmVzdWx0LCBjdXIpO1xuXHRcdFx0aWYgKHNob3VsZEpvaW4pIHtcblx0XHRcdFx0c2hvdWxkUmVwZWF0ID0gdHJ1ZTtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0uam9pbihjdXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goY3VyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaWZmcyA9IHJlc3VsdDtcblx0fSB3aGlsZSAoY291bnRlcisrIDwgMTAgJiYgc2hvdWxkUmVwZWF0KTtcblxuXHRjb25zdCBuZXdEaWZmczogU2VxdWVuY2VEaWZmW10gPSBbXTtcblxuXHQvLyBSZW1vdmUgc2hvcnQgc3VmZml4ZXMvcHJlZml4ZXNcblx0Zm9yRWFjaFdpdGhOZWlnaGJvcnMoZGlmZnMsIChwcmV2LCBjdXIsIG5leHQpID0+IHtcblx0XHRsZXQgbmV3RGlmZiA9IGN1cjtcblxuXHRcdGZ1bmN0aW9uIHNob3VsZE1hcmtBc0NoYW5nZWQodGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdGV4dC5sZW5ndGggPiAwICYmIHRleHQudHJpbSgpLmxlbmd0aCA8PSAzICYmIGN1ci5zZXExUmFuZ2UubGVuZ3RoICsgY3VyLnNlcTJSYW5nZS5sZW5ndGggPiAxMDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnVsbFJhbmdlMSA9IHNlcXVlbmNlMS5leHRlbmRUb0Z1bGxMaW5lcyhjdXIuc2VxMVJhbmdlKTtcblx0XHRjb25zdCBwcmVmaXggPSBzZXF1ZW5jZTEuZ2V0VGV4dChuZXcgT2Zmc2V0UmFuZ2UoZnVsbFJhbmdlMS5zdGFydCwgY3VyLnNlcTFSYW5nZS5zdGFydCkpO1xuXHRcdGlmIChzaG91bGRNYXJrQXNDaGFuZ2VkKHByZWZpeCkpIHtcblx0XHRcdG5ld0RpZmYgPSBuZXdEaWZmLmRlbHRhU3RhcnQoLXByZWZpeC5sZW5ndGgpO1xuXHRcdH1cblx0XHRjb25zdCBzdWZmaXggPSBzZXF1ZW5jZTEuZ2V0VGV4dChuZXcgT2Zmc2V0UmFuZ2UoY3VyLnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUsIGZ1bGxSYW5nZTEuZW5kRXhjbHVzaXZlKSk7XG5cdFx0aWYgKHNob3VsZE1hcmtBc0NoYW5nZWQoc3VmZml4KSkge1xuXHRcdFx0bmV3RGlmZiA9IG5ld0RpZmYuZGVsdGFFbmQoc3VmZml4Lmxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXZhaWxhYmxlU3BhY2UgPSBTZXF1ZW5jZURpZmYuZnJvbU9mZnNldFBhaXJzKFxuXHRcdFx0cHJldiA/IHByZXYuZ2V0RW5kRXhjbHVzaXZlcygpIDogT2Zmc2V0UGFpci56ZXJvLFxuXHRcdFx0bmV4dCA/IG5leHQuZ2V0U3RhcnRzKCkgOiBPZmZzZXRQYWlyLm1heCxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ld0RpZmYuaW50ZXJzZWN0KGF2YWlsYWJsZVNwYWNlKSE7XG5cdFx0aWYgKG5ld0RpZmZzLmxlbmd0aCA+IDAgJiYgcmVzdWx0LmdldFN0YXJ0cygpLmVxdWFscyhuZXdEaWZmc1tuZXdEaWZmcy5sZW5ndGggLSAxXS5nZXRFbmRFeGNsdXNpdmVzKCkpKSB7XG5cdFx0XHRuZXdEaWZmc1tuZXdEaWZmcy5sZW5ndGggLSAxXSA9IG5ld0RpZmZzW25ld0RpZmZzLmxlbmd0aCAtIDFdLmpvaW4ocmVzdWx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3RGlmZnMucHVzaChyZXN1bHQpO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG5ld0RpZmZzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBb0IsWUFBWSxvQkFBb0I7QUFJN0MsU0FBUyxzQkFBc0IsV0FBc0IsV0FBc0IsZUFBK0M7QUFDaEksTUFBSSxTQUFTO0FBQ2IsV0FBUyw0QkFBNEIsV0FBVyxXQUFXLE1BQU07QUFHakUsV0FBUyw0QkFBNEIsV0FBVyxXQUFXLE1BQU07QUFDakUsV0FBUyxtQkFBbUIsV0FBVyxXQUFXLE1BQU07QUFDeEQsU0FBTztBQUNSO0FBY0EsU0FBUyw0QkFBNEIsV0FBc0IsV0FBc0IsZUFBK0M7QUFDL0gsTUFBSSxjQUFjLFdBQVcsR0FBRztBQUMvQixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sU0FBeUIsQ0FBQztBQUNoQyxTQUFPLEtBQUssY0FBYyxDQUFDLENBQUM7QUFHNUIsV0FBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUM5QyxVQUFNLGFBQWEsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUMzQyxRQUFJLE1BQU0s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LDRCQUFBQTtBQUhULFlBQU0sTUFBTSxNQUFNLENBQUM7QUFDbkIsWUFBTSxhQUFhLE9BQU8sT0FBTyxTQUFTLENBQUM7QUF1QzNDLFlBQU0sYUFBYUEsaUJBQWdCLFlBQVksR0FBRztBQUNsRCxVQUFJLFlBQVk7QUFDZix1QkFBZTtBQUNmLGVBQU8sT0FBTyxTQUFTLENBQUMsSUFBSSxPQUFPLE9BQU8sU0FBUyxDQUFDLEVBQUUsS0FBSyxHQUFHO0FBQUEsTUFDL0QsT0FBTztBQUNOLGVBQU8sS0FBSyxHQUFHO0FBQUEsTUFDaEI7QUFBQSxJQUNEO0FBRUEsWUFBUTtBQUFBLEVBQ1QsU0FBUyxZQUFZLE1BQU07QUFFM0IsUUFBTSxXQUEyQixDQUFDO0FBR2xDLHVCQUFxQixPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVM7QUFDaEQsUUFBSSxVQUFVO0FBRWQsYUFBUyxvQkFBb0IsTUFBdUI7QUFDbkQsYUFBTyxLQUFLLFNBQVMsS0FBSyxLQUFLLEtBQUssRUFBRSxVQUFVLEtBQUssSUFBSSxVQUFVLFNBQVMsSUFBSSxVQUFVLFNBQVM7QUFBQSxJQUNwRztBQUVBLFVBQU0sYUFBYSxVQUFVLGtCQUFrQixJQUFJLFNBQVM7QUFDNUQsVUFBTSxTQUFTLFVBQVUsUUFBUSxJQUFJLFlBQVksV0FBVyxPQUFPLElBQUksVUFBVSxLQUFLLENBQUM7QUFDdkYsUUFBSSxvQkFBb0IsTUFBTSxHQUFHO0FBQ2hDLGdCQUFVLFFBQVEsV0FBVyxDQUFDLE9BQU8sTUFBTTtBQUFBLElBQzVDO0FBQ0EsVUFBTSxTQUFTLFVBQVUsUUFBUSxJQUFJLFlBQVksSUFBSSxVQUFVLGNBQWMsV0FBVyxZQUFZLENBQUM7QUFDckcsUUFBSSxvQkFBb0IsTUFBTSxHQUFHO0FBQ2hDLGdCQUFVLFFBQVEsU0FBUyxPQUFPLE1BQU07QUFBQSxJQUN6QztBQUVBLFVBQU0saUJBQWlCLGFBQWE7QUFBQSxNQUNuQyxPQUFPLEtBQUssaUJBQWlCLElBQUksV0FBVztBQUFBLE1BQzVDLE9BQU8sS0FBSyxVQUFVLElBQUksV0FBVztBQUFBLElBQ3RDO0FBQ0EsVUFBTSxTQUFTLFFBQVEsVUFBVSxjQUFjO0FBQy9DLFFBQUksU0FBUyxTQUFTLEtBQUssT0FBTyxVQUFVLEVBQUUsT0FBTyxTQUFTLFNBQVMsU0FBUyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsR0FBRztBQUN2RyxlQUFTLFNBQVMsU0FBUyxDQUFDLElBQUksU0FBUyxTQUFTLFNBQVMsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUFBLElBQzFFLE9BQU87QUFDTixlQUFTLEtBQUssTUFBTTtBQUFBLElBQ3JCO0FBQUEsRUFDRCxDQUFDO0FBRUQsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJlcXVhbFBhcnQiLCAic2hvdWxkSm9pbkRpZmZzIl0KfQo=
