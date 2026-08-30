import { CharCode } from "./charCode.js";
import { compareAnything } from "./comparers.js";
import { createMatches as createFuzzyMatches, fuzzyScore, isUpper, matchesPrefix } from "./filters.js";
import { hash } from "./hash.js";
import { sep } from "./path.js";
import { isLinux, isWindows } from "./platform.js";
import { equalsIgnoreCase } from "./strings.js";
const NO_MATCH = 0;
const NO_SCORE = [NO_MATCH, []];
function scoreFuzzy(target, query, queryLower, allowNonContiguousMatches) {
  if (!target || !query) {
    return NO_SCORE;
  }
  const targetLength = target.length;
  const queryLength = query.length;
  if (targetLength < queryLength) {
    return NO_SCORE;
  }
  const targetLower = target.toLowerCase();
  const res = doScoreFuzzy(query, queryLower, queryLength, target, targetLower, targetLength, allowNonContiguousMatches);
  return res;
}
function doScoreFuzzy(query, queryLower, queryLength, target, targetLower, targetLength, allowNonContiguousMatches) {
  const scores = [];
  const matches = [];
  for (let queryIndex2 = 0; queryIndex2 < queryLength; queryIndex2++) {
    const queryIndexOffset = queryIndex2 * targetLength;
    const queryIndexPreviousOffset = queryIndexOffset - targetLength;
    const queryIndexGtNull = queryIndex2 > 0;
    const queryCharAtIndex = query[queryIndex2];
    const queryLowerCharAtIndex = queryLower[queryIndex2];
    for (let targetIndex2 = 0; targetIndex2 < targetLength; targetIndex2++) {
      const targetIndexGtNull = targetIndex2 > 0;
      const currentIndex = queryIndexOffset + targetIndex2;
      const leftIndex = currentIndex - 1;
      const diagIndex = queryIndexPreviousOffset + targetIndex2 - 1;
      const leftScore = targetIndexGtNull ? scores[leftIndex] : 0;
      const diagScore = queryIndexGtNull && targetIndexGtNull ? scores[diagIndex] : 0;
      const matchesSequenceLength = queryIndexGtNull && targetIndexGtNull ? matches[diagIndex] : 0;
      let score;
      if (!diagScore && queryIndexGtNull) {
        score = 0;
      } else {
        score = computeCharScore(queryCharAtIndex, queryLowerCharAtIndex, target, targetLower, targetIndex2, matchesSequenceLength);
      }
      const isValidScore = score && diagScore + score >= leftScore;
      if (isValidScore && // We don't need to check if it's contiguous if we allow non-contiguous matches
      (allowNonContiguousMatches || // We must be looking for a contiguous match.
      // Looking at an index higher than 0 in the query means we must have already
      // found out this is contiguous otherwise there wouldn't have been a score
      queryIndexGtNull || // lastly check if the query is completely contiguous at this index in the target
      targetLower.startsWith(queryLower, targetIndex2))) {
        matches[currentIndex] = matchesSequenceLength + 1;
        scores[currentIndex] = diagScore + score;
      } else {
        matches[currentIndex] = NO_MATCH;
        scores[currentIndex] = leftScore;
      }
    }
  }
  const positions = [];
  let queryIndex = queryLength - 1;
  let targetIndex = targetLength - 1;
  while (queryIndex >= 0 && targetIndex >= 0) {
    const currentIndex = queryIndex * targetLength + targetIndex;
    const match = matches[currentIndex];
    if (match === NO_MATCH) {
      targetIndex--;
    } else {
      positions.push(targetIndex);
      queryIndex--;
      targetIndex--;
    }
  }
  return [scores[queryLength * targetLength - 1], positions.reverse()];
}
function computeCharScore(queryCharAtIndex, queryLowerCharAtIndex, target, targetLower, targetIndex, matchesSequenceLength) {
  let score = 0;
  if (!considerAsEqual(queryLowerCharAtIndex, targetLower[targetIndex])) {
    return score;
  }
  score += 1;
  if (matchesSequenceLength > 0) {
    score += Math.min(matchesSequenceLength, 3) * 6 + Math.max(0, matchesSequenceLength - 3) * 3;
  }
  if (queryCharAtIndex === target[targetIndex]) {
    score += 1;
  }
  if (targetIndex === 0) {
    score += 8;
  } else {
    const separatorBonus = scoreSeparatorAtPos(target.charCodeAt(targetIndex - 1));
    if (separatorBonus) {
      score += separatorBonus;
    } else if (isUpper(target.charCodeAt(targetIndex)) && matchesSequenceLength === 0) {
      score += 2;
    }
  }
  return score;
}
function considerAsEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a === "/" || a === "\\") {
    return b === "/" || b === "\\";
  }
  return false;
}
function scoreSeparatorAtPos(charCode) {
  switch (charCode) {
    case CharCode.Slash:
    case CharCode.Backslash:
      return 5;
    // prefer path separators...
    case CharCode.Underline:
    case CharCode.Dash:
    case CharCode.Period:
    case CharCode.Space:
    case CharCode.SingleQuote:
    case CharCode.DoubleQuote:
    case CharCode.Colon:
      return 4;
    // ...over other separators
    default:
      return 0;
  }
}
const NO_SCORE2 = [void 0, []];
function scoreFuzzy2(target, query, patternStart = 0, wordStart = 0) {
  const preparedQuery = query;
  if (preparedQuery.values && preparedQuery.values.length > 1) {
    return doScoreFuzzy2Multiple(target, preparedQuery.values, patternStart, wordStart);
  }
  return doScoreFuzzy2Single(target, query, patternStart, wordStart);
}
function doScoreFuzzy2Multiple(target, query, patternStart, wordStart) {
  let totalScore = 0;
  const totalMatches = [];
  for (const queryPiece of query) {
    const [score, matches] = doScoreFuzzy2Single(target, queryPiece, patternStart, wordStart);
    if (typeof score !== "number") {
      return NO_SCORE2;
    }
    totalScore += score;
    totalMatches.push(...matches);
  }
  return [totalScore, normalizeMatches(totalMatches)];
}
function doScoreFuzzy2Single(target, query, patternStart, wordStart) {
  const score = fuzzyScore(query.normalized, query.normalizedLowercase, patternStart, target, target.toLowerCase(), wordStart, { firstMatchCanBeWeak: true, boostFullMatch: true });
  if (!score) {
    return NO_SCORE2;
  }
  return [score[0], createFuzzyMatches(score)];
}
const NO_ITEM_SCORE = Object.freeze({ score: 0 });
const PATH_IDENTITY_SCORE = 1 << 18;
const LABEL_PREFIX_SCORE_THRESHOLD = 1 << 17;
const LABEL_SCORE_THRESHOLD = 1 << 16;
function getCacheHash(label, description, allowNonContiguousMatches, query) {
  const values = query.values ? query.values : [query];
  const cacheHash = hash({
    [query.normalized]: {
      values: values.map((v) => ({ value: v.normalized, expectContiguousMatch: v.expectContiguousMatch })),
      label,
      description,
      allowNonContiguousMatches
    }
  });
  return cacheHash;
}
function scoreItemFuzzy(item, query, allowNonContiguousMatches, accessor, cache) {
  if (!item || !query.normalized) {
    return NO_ITEM_SCORE;
  }
  const label = accessor.getItemLabel(item);
  if (!label) {
    return NO_ITEM_SCORE;
  }
  const description = accessor.getItemDescription(item);
  const cacheHash = getCacheHash(label, description, allowNonContiguousMatches, query);
  const cached = cache[cacheHash];
  if (cached) {
    return cached;
  }
  const itemScore = doScoreItemFuzzy(label, description, accessor.getItemPath(item), query, allowNonContiguousMatches);
  cache[cacheHash] = itemScore;
  return itemScore;
}
function doScoreItemFuzzy(label, description, path, query, allowNonContiguousMatches) {
  const preferLabelMatches = !path || !query.containsPathSeparator;
  if (path && (isLinux ? query.pathNormalized === path : equalsIgnoreCase(query.pathNormalized, path))) {
    return { score: PATH_IDENTITY_SCORE, labelMatch: [{ start: 0, end: label.length }], descriptionMatch: description ? [{ start: 0, end: description.length }] : void 0 };
  }
  if (query.values && query.values.length > 1) {
    return doScoreItemFuzzyMultiple(label, description, path, query.values, preferLabelMatches, allowNonContiguousMatches);
  }
  return doScoreItemFuzzySingle(label, description, path, query, preferLabelMatches, allowNonContiguousMatches);
}
function doScoreItemFuzzyMultiple(label, description, path, query, preferLabelMatches, allowNonContiguousMatches) {
  let totalScore = 0;
  const totalLabelMatches = [];
  const totalDescriptionMatches = [];
  for (const queryPiece of query) {
    const { score, labelMatch, descriptionMatch } = doScoreItemFuzzySingle(label, description, path, queryPiece, preferLabelMatches, allowNonContiguousMatches);
    if (score === NO_MATCH) {
      return NO_ITEM_SCORE;
    }
    totalScore += score;
    if (labelMatch) {
      totalLabelMatches.push(...labelMatch);
    }
    if (descriptionMatch) {
      totalDescriptionMatches.push(...descriptionMatch);
    }
  }
  return {
    score: totalScore,
    labelMatch: normalizeMatches(totalLabelMatches),
    descriptionMatch: normalizeMatches(totalDescriptionMatches)
  };
}
function doScoreItemFuzzySingle(label, description, path, query, preferLabelMatches, allowNonContiguousMatches) {
  if (preferLabelMatches || !description) {
    const [labelScore, labelPositions] = scoreFuzzy(
      label,
      query.normalized,
      query.normalizedLowercase,
      allowNonContiguousMatches && !query.expectContiguousMatch
    );
    if (labelScore) {
      const labelPrefixMatch = matchesPrefix(query.normalized, label);
      let baseScore;
      if (labelPrefixMatch) {
        baseScore = LABEL_PREFIX_SCORE_THRESHOLD;
        const prefixLengthBoost = Math.round(query.normalized.length / label.length * 100);
        baseScore += prefixLengthBoost;
      } else {
        baseScore = LABEL_SCORE_THRESHOLD;
      }
      return { score: baseScore + labelScore, labelMatch: labelPrefixMatch || createMatches(labelPositions) };
    }
  }
  if (description) {
    let descriptionPrefix = description;
    if (!!path) {
      descriptionPrefix = `${description}${sep}`;
    }
    const descriptionPrefixLength = descriptionPrefix.length;
    const descriptionAndLabel = `${descriptionPrefix}${label}`;
    const [labelDescriptionScore, labelDescriptionPositions] = scoreFuzzy(
      descriptionAndLabel,
      query.normalized,
      query.normalizedLowercase,
      allowNonContiguousMatches && !query.expectContiguousMatch
    );
    if (labelDescriptionScore) {
      const labelDescriptionMatches = createMatches(labelDescriptionPositions);
      const labelMatch = [];
      const descriptionMatch = [];
      labelDescriptionMatches.forEach((h) => {
        if (h.start < descriptionPrefixLength && h.end > descriptionPrefixLength) {
          labelMatch.push({ start: 0, end: h.end - descriptionPrefixLength });
          descriptionMatch.push({ start: h.start, end: descriptionPrefixLength });
        } else if (h.start >= descriptionPrefixLength) {
          labelMatch.push({ start: h.start - descriptionPrefixLength, end: h.end - descriptionPrefixLength });
        } else {
          descriptionMatch.push(h);
        }
      });
      return { score: labelDescriptionScore, labelMatch, descriptionMatch };
    }
  }
  return NO_ITEM_SCORE;
}
function createMatches(offsets) {
  const ret = [];
  if (!offsets) {
    return ret;
  }
  let last;
  for (const pos of offsets) {
    if (last && last.end === pos) {
      last.end += 1;
    } else {
      last = { start: pos, end: pos + 1 };
      ret.push(last);
    }
  }
  return ret;
}
function normalizeMatches(matches) {
  const sortedMatches = matches.sort((matchA, matchB) => {
    return matchA.start - matchB.start;
  });
  const normalizedMatches = [];
  let currentMatch = void 0;
  for (const match of sortedMatches) {
    if (!currentMatch || !matchOverlaps(currentMatch, match)) {
      currentMatch = match;
      normalizedMatches.push(match);
    } else {
      currentMatch.start = Math.min(currentMatch.start, match.start);
      currentMatch.end = Math.max(currentMatch.end, match.end);
    }
  }
  return normalizedMatches;
}
function matchOverlaps(matchA, matchB) {
  if (matchA.end < matchB.start) {
    return false;
  }
  if (matchB.end < matchA.start) {
    return false;
  }
  return true;
}
function compareItemsByFuzzyScore(itemA, itemB, query, allowNonContiguousMatches, accessor, cache) {
  const itemScoreA = scoreItemFuzzy(itemA, query, allowNonContiguousMatches, accessor, cache);
  const itemScoreB = scoreItemFuzzy(itemB, query, allowNonContiguousMatches, accessor, cache);
  const scoreA = itemScoreA.score;
  const scoreB = itemScoreB.score;
  if (scoreA === PATH_IDENTITY_SCORE || scoreB === PATH_IDENTITY_SCORE) {
    if (scoreA !== scoreB) {
      return scoreA === PATH_IDENTITY_SCORE ? -1 : 1;
    }
  }
  if (scoreA > LABEL_SCORE_THRESHOLD || scoreB > LABEL_SCORE_THRESHOLD) {
    if (scoreA !== scoreB) {
      return scoreA > scoreB ? -1 : 1;
    }
    if (scoreA < LABEL_PREFIX_SCORE_THRESHOLD && scoreB < LABEL_PREFIX_SCORE_THRESHOLD) {
      const comparedByMatchLength = compareByMatchLength(itemScoreA.labelMatch, itemScoreB.labelMatch);
      if (comparedByMatchLength !== 0) {
        return comparedByMatchLength;
      }
    }
    const labelA = accessor.getItemLabel(itemA) || "";
    const labelB = accessor.getItemLabel(itemB) || "";
    if (labelA.length !== labelB.length) {
      return labelA.length - labelB.length;
    }
  }
  if (scoreA !== scoreB) {
    return scoreA > scoreB ? -1 : 1;
  }
  const itemAHasLabelMatches = Array.isArray(itemScoreA.labelMatch) && itemScoreA.labelMatch.length > 0;
  const itemBHasLabelMatches = Array.isArray(itemScoreB.labelMatch) && itemScoreB.labelMatch.length > 0;
  if (itemAHasLabelMatches && !itemBHasLabelMatches) {
    return -1;
  } else if (itemBHasLabelMatches && !itemAHasLabelMatches) {
    return 1;
  }
  const itemAMatchDistance = computeLabelAndDescriptionMatchDistance(itemA, itemScoreA, accessor);
  const itemBMatchDistance = computeLabelAndDescriptionMatchDistance(itemB, itemScoreB, accessor);
  if (itemAMatchDistance && itemBMatchDistance && itemAMatchDistance !== itemBMatchDistance) {
    return itemBMatchDistance > itemAMatchDistance ? -1 : 1;
  }
  return fallbackCompare(itemA, itemB, query, accessor);
}
function computeLabelAndDescriptionMatchDistance(item, score, accessor) {
  let matchStart = -1;
  let matchEnd = -1;
  if (score.descriptionMatch?.length) {
    matchStart = score.descriptionMatch[0].start;
  } else if (score.labelMatch?.length) {
    matchStart = score.labelMatch[0].start;
  }
  if (score.labelMatch?.length) {
    matchEnd = score.labelMatch[score.labelMatch.length - 1].end;
    if (score.descriptionMatch?.length) {
      const itemDescription = accessor.getItemDescription(item);
      if (itemDescription) {
        matchEnd += itemDescription.length;
      }
    }
  } else if (score.descriptionMatch?.length) {
    matchEnd = score.descriptionMatch[score.descriptionMatch.length - 1].end;
  }
  return matchEnd - matchStart;
}
function compareByMatchLength(matchesA, matchesB) {
  if (!matchesA && !matchesB || !matchesA?.length && !matchesB?.length) {
    return 0;
  }
  if (!matchesB?.length) {
    return -1;
  }
  if (!matchesA?.length) {
    return 1;
  }
  const matchStartA = matchesA[0].start;
  const matchEndA = matchesA[matchesA.length - 1].end;
  const matchLengthA = matchEndA - matchStartA;
  const matchStartB = matchesB[0].start;
  const matchEndB = matchesB[matchesB.length - 1].end;
  const matchLengthB = matchEndB - matchStartB;
  return matchLengthA === matchLengthB ? 0 : matchLengthB < matchLengthA ? 1 : -1;
}
function fallbackCompare(itemA, itemB, query, accessor) {
  const labelA = accessor.getItemLabel(itemA) || "";
  const labelB = accessor.getItemLabel(itemB) || "";
  const descriptionA = accessor.getItemDescription(itemA);
  const descriptionB = accessor.getItemDescription(itemB);
  const labelDescriptionALength = labelA.length + (descriptionA ? descriptionA.length : 0);
  const labelDescriptionBLength = labelB.length + (descriptionB ? descriptionB.length : 0);
  if (labelDescriptionALength !== labelDescriptionBLength) {
    return labelDescriptionALength - labelDescriptionBLength;
  }
  const pathA = accessor.getItemPath(itemA);
  const pathB = accessor.getItemPath(itemB);
  if (pathA && pathB && pathA.length !== pathB.length) {
    return pathA.length - pathB.length;
  }
  if (labelA !== labelB) {
    return compareAnything(labelA, labelB, query.normalized);
  }
  if (descriptionA && descriptionB && descriptionA !== descriptionB) {
    return compareAnything(descriptionA, descriptionB, query.normalized);
  }
  if (pathA && pathB && pathA !== pathB) {
    return compareAnything(pathA, pathB, query.normalized);
  }
  return 0;
}
function queryExpectsExactMatch(query) {
  return query.startsWith('"') && query.endsWith('"');
}
const MULTIPLE_QUERY_VALUES_SEPARATOR = " ";
function prepareQuery(original) {
  if (typeof original !== "string") {
    original = "";
  }
  const originalLowercase = original.toLowerCase();
  const { pathNormalized, normalized, normalizedLowercase } = normalizeQuery(original);
  const containsPathSeparator = pathNormalized.indexOf(sep) >= 0;
  const expectExactMatch = queryExpectsExactMatch(original);
  let values = void 0;
  const originalSplit = original.split(MULTIPLE_QUERY_VALUES_SEPARATOR);
  if (originalSplit.length > 1) {
    for (const originalPiece of originalSplit) {
      const expectExactMatchPiece = queryExpectsExactMatch(originalPiece);
      const {
        pathNormalized: pathNormalizedPiece,
        normalized: normalizedPiece,
        normalizedLowercase: normalizedLowercasePiece
      } = normalizeQuery(originalPiece);
      if (normalizedPiece) {
        if (!values) {
          values = [];
        }
        values.push({
          original: originalPiece,
          originalLowercase: originalPiece.toLowerCase(),
          pathNormalized: pathNormalizedPiece,
          normalized: normalizedPiece,
          normalizedLowercase: normalizedLowercasePiece,
          expectContiguousMatch: expectExactMatchPiece
        });
      }
    }
  }
  return { original, originalLowercase, pathNormalized, normalized, normalizedLowercase, values, containsPathSeparator, expectContiguousMatch: expectExactMatch };
}
function normalizeQuery(original) {
  let pathNormalized;
  if (isWindows) {
    pathNormalized = original.replace(/\//g, sep);
  } else {
    pathNormalized = original.replace(/\\/g, sep);
  }
  const normalized = pathNormalized.replace(/[\*\u2026\s"]/g, "").replace(/(?<=.)#$/, "");
  return {
    pathNormalized,
    normalized,
    normalizedLowercase: normalized.toLowerCase()
  };
}
function pieceToQuery(arg1) {
  if (Array.isArray(arg1)) {
    return prepareQuery(arg1.map((piece) => piece.original).join(MULTIPLE_QUERY_VALUES_SEPARATOR));
  }
  return prepareQuery(arg1.original);
}
export {
  compareItemsByFuzzyScore,
  pieceToQuery,
  prepareQuery,
  scoreFuzzy,
  scoreFuzzy2,
  scoreItemFuzzy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGZ1enp5U2NvcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IGNvbXBhcmVBbnl0aGluZyB9IGZyb20gJy4vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMgYXMgY3JlYXRlRnV6enlNYXRjaGVzLCBmdXp6eVNjb3JlLCBJTWF0Y2gsIGlzVXBwZXIsIG1hdGNoZXNQcmVmaXggfSBmcm9tICcuL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4vaGFzaC5qcyc7XG5pbXBvcnQgeyBzZXAgfSBmcm9tICcuL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzIH0gZnJvbSAnLi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlcXVhbHNJZ25vcmVDYXNlIH0gZnJvbSAnLi9zdHJpbmdzLmpzJztcblxuLy8jcmVnaW9uIEZ1enp5IHNjb3JlclxuXG5leHBvcnQgdHlwZSBGdXp6eVNjb3JlID0gW251bWJlciAvKiBzY29yZSAqLywgbnVtYmVyW10gLyogbWF0Y2ggcG9zaXRpb25zICovXTtcbmV4cG9ydCB0eXBlIEZ1enp5U2NvcmVyQ2FjaGUgPSB7IFtrZXk6IHN0cmluZ106IElJdGVtU2NvcmUgfTtcblxuY29uc3QgTk9fTUFUQ0ggPSAwO1xuY29uc3QgTk9fU0NPUkU6IEZ1enp5U2NvcmUgPSBbTk9fTUFUQ0gsIFtdXTtcblxuLy8gY29uc3QgREVCVUcgPSB0cnVlO1xuLy8gY29uc3QgREVCVUdfTUFUUklYID0gZmFsc2U7XG5cbmV4cG9ydCBmdW5jdGlvbiBzY29yZUZ1enp5KHRhcmdldDogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCBxdWVyeUxvd2VyOiBzdHJpbmcsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM6IGJvb2xlYW4pOiBGdXp6eVNjb3JlIHtcblx0aWYgKCF0YXJnZXQgfHwgIXF1ZXJ5KSB7XG5cdFx0cmV0dXJuIE5PX1NDT1JFOyAvLyByZXR1cm4gZWFybHkgaWYgdGFyZ2V0IG9yIHF1ZXJ5IGFyZSB1bmRlZmluZWRcblx0fVxuXG5cdGNvbnN0IHRhcmdldExlbmd0aCA9IHRhcmdldC5sZW5ndGg7XG5cdGNvbnN0IHF1ZXJ5TGVuZ3RoID0gcXVlcnkubGVuZ3RoO1xuXG5cdGlmICh0YXJnZXRMZW5ndGggPCBxdWVyeUxlbmd0aCkge1xuXHRcdHJldHVybiBOT19TQ09SRTsgLy8gaW1wb3NzaWJsZSBmb3IgcXVlcnkgdG8gYmUgY29udGFpbmVkIGluIHRhcmdldFxuXHR9XG5cblx0Ly8gaWYgKERFQlVHKSB7XG5cdC8vIFx0Y29uc29sZS5ncm91cChgVGFyZ2V0OiAke3RhcmdldH0sIFF1ZXJ5OiAke3F1ZXJ5fWApO1xuXHQvLyB9XG5cblx0Y29uc3QgdGFyZ2V0TG93ZXIgPSB0YXJnZXQudG9Mb3dlckNhc2UoKTtcblx0Y29uc3QgcmVzID0gZG9TY29yZUZ1enp5KHF1ZXJ5LCBxdWVyeUxvd2VyLCBxdWVyeUxlbmd0aCwgdGFyZ2V0LCB0YXJnZXRMb3dlciwgdGFyZ2V0TGVuZ3RoLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzKTtcblxuXHQvLyBpZiAoREVCVUcpIHtcblx0Ly8gXHRjb25zb2xlLmxvZyhgJWNGaW5hbCBTY29yZTogJHtyZXNbMF19YCwgJ2ZvbnQtd2VpZ2h0OiBib2xkJyk7XG5cdC8vIFx0Y29uc29sZS5ncm91cEVuZCgpO1xuXHQvLyB9XG5cblx0cmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gZG9TY29yZUZ1enp5KHF1ZXJ5OiBzdHJpbmcsIHF1ZXJ5TG93ZXI6IHN0cmluZywgcXVlcnlMZW5ndGg6IG51bWJlciwgdGFyZ2V0OiBzdHJpbmcsIHRhcmdldExvd2VyOiBzdHJpbmcsIHRhcmdldExlbmd0aDogbnVtYmVyLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzOiBib29sZWFuKTogRnV6enlTY29yZSB7XG5cdGNvbnN0IHNjb3JlczogbnVtYmVyW10gPSBbXTtcblx0Y29uc3QgbWF0Y2hlczogbnVtYmVyW10gPSBbXTtcblxuXHQvL1xuXHQvLyBCdWlsZCBTY29yZXIgTWF0cml4OlxuXHQvL1xuXHQvLyBUaGUgbWF0cml4IGlzIGNvbXBvc2VkIG9mIHF1ZXJ5IHEgYW5kIHRhcmdldCB0LiBGb3IgZWFjaCBpbmRleCB3ZSBzY29yZVxuXHQvLyBxW2ldIHdpdGggdFtpXSBhbmQgY29tcGFyZSB0aGF0IHdpdGggdGhlIHByZXZpb3VzIHNjb3JlLiBJZiB0aGUgc2NvcmUgaXNcblx0Ly8gZXF1YWwgb3IgbGFyZ2VyLCB3ZSBrZWVwIHRoZSBtYXRjaC4gSW4gYWRkaXRpb24gdG8gdGhlIHNjb3JlLCB3ZSBhbHNvIGtlZXBcblx0Ly8gdGhlIGxlbmd0aCBvZiB0aGUgY29uc2VjdXRpdmUgbWF0Y2hlcyB0byB1c2UgYXMgYm9vc3QgZm9yIHRoZSBzY29yZS5cblx0Ly9cblx0Ly8gICAgICB0ICAgYSAgIHIgICBnICAgZSAgIHRcblx0Ly8gIHFcblx0Ly8gIHVcblx0Ly8gIGVcblx0Ly8gIHJcblx0Ly8gIHlcblx0Ly9cblx0Zm9yIChsZXQgcXVlcnlJbmRleCA9IDA7IHF1ZXJ5SW5kZXggPCBxdWVyeUxlbmd0aDsgcXVlcnlJbmRleCsrKSB7XG5cdFx0Y29uc3QgcXVlcnlJbmRleE9mZnNldCA9IHF1ZXJ5SW5kZXggKiB0YXJnZXRMZW5ndGg7XG5cdFx0Y29uc3QgcXVlcnlJbmRleFByZXZpb3VzT2Zmc2V0ID0gcXVlcnlJbmRleE9mZnNldCAtIHRhcmdldExlbmd0aDtcblxuXHRcdGNvbnN0IHF1ZXJ5SW5kZXhHdE51bGwgPSBxdWVyeUluZGV4ID4gMDtcblxuXHRcdGNvbnN0IHF1ZXJ5Q2hhckF0SW5kZXggPSBxdWVyeVtxdWVyeUluZGV4XTtcblx0XHRjb25zdCBxdWVyeUxvd2VyQ2hhckF0SW5kZXggPSBxdWVyeUxvd2VyW3F1ZXJ5SW5kZXhdO1xuXG5cdFx0Zm9yIChsZXQgdGFyZ2V0SW5kZXggPSAwOyB0YXJnZXRJbmRleCA8IHRhcmdldExlbmd0aDsgdGFyZ2V0SW5kZXgrKykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0SW5kZXhHdE51bGwgPSB0YXJnZXRJbmRleCA+IDA7XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IHF1ZXJ5SW5kZXhPZmZzZXQgKyB0YXJnZXRJbmRleDtcblx0XHRcdGNvbnN0IGxlZnRJbmRleCA9IGN1cnJlbnRJbmRleCAtIDE7XG5cdFx0XHRjb25zdCBkaWFnSW5kZXggPSBxdWVyeUluZGV4UHJldmlvdXNPZmZzZXQgKyB0YXJnZXRJbmRleCAtIDE7XG5cblx0XHRcdGNvbnN0IGxlZnRTY29yZSA9IHRhcmdldEluZGV4R3ROdWxsID8gc2NvcmVzW2xlZnRJbmRleF0gOiAwO1xuXHRcdFx0Y29uc3QgZGlhZ1Njb3JlID0gcXVlcnlJbmRleEd0TnVsbCAmJiB0YXJnZXRJbmRleEd0TnVsbCA/IHNjb3Jlc1tkaWFnSW5kZXhdIDogMDtcblxuXHRcdFx0Y29uc3QgbWF0Y2hlc1NlcXVlbmNlTGVuZ3RoID0gcXVlcnlJbmRleEd0TnVsbCAmJiB0YXJnZXRJbmRleEd0TnVsbCA/IG1hdGNoZXNbZGlhZ0luZGV4XSA6IDA7XG5cblx0XHRcdC8vIElmIHdlIGFyZSBub3QgbWF0Y2hpbmcgb24gdGhlIGZpcnN0IHF1ZXJ5IGNoYXJhY3RlciBhbnkgbW9yZSwgd2Ugb25seSBwcm9kdWNlIGFcblx0XHRcdC8vIHNjb3JlIGlmIHdlIGhhZCBhIHNjb3JlIHByZXZpb3VzbHkgZm9yIHRoZSBsYXN0IHF1ZXJ5IGluZGV4IChieSBsb29raW5nIGF0IHRoZSBkaWFnU2NvcmUpLlxuXHRcdFx0Ly8gVGhpcyBtYWtlcyBzdXJlIHRoYXQgdGhlIHF1ZXJ5IGFsd2F5cyBtYXRjaGVzIGluIHNlcXVlbmNlIG9uIHRoZSB0YXJnZXQuIEZvciBleGFtcGxlXG5cdFx0XHQvLyBnaXZlbiBhIHRhcmdldCBvZiBcImVkZVwiIGFuZCBhIHF1ZXJ5IG9mIFwiZGVcIiwgd2Ugd291bGQgb3RoZXJ3aXNlIHByb2R1Y2UgYSB3cm9uZyBoaWdoIHNjb3JlXG5cdFx0XHQvLyBmb3IgcXVlcnlbMV0gKFwiZVwiKSBtYXRjaGluZyBvbiB0YXJnZXRbMF0gKFwiZVwiKSBiZWNhdXNlIG9mIHRoZSBcImJlZ2lubmluZyBvZiB3b3JkXCIgYm9vc3QuXG5cdFx0XHRsZXQgc2NvcmU6IG51bWJlcjtcblx0XHRcdGlmICghZGlhZ1Njb3JlICYmIHF1ZXJ5SW5kZXhHdE51bGwpIHtcblx0XHRcdFx0c2NvcmUgPSAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcmUgPSBjb21wdXRlQ2hhclNjb3JlKHF1ZXJ5Q2hhckF0SW5kZXgsIHF1ZXJ5TG93ZXJDaGFyQXRJbmRleCwgdGFyZ2V0LCB0YXJnZXRMb3dlciwgdGFyZ2V0SW5kZXgsIG1hdGNoZXNTZXF1ZW5jZUxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdlIGhhdmUgYSBzY29yZSBhbmQgaXRzIGVxdWFsIG9yIGxhcmdlciB0aGFuIHRoZSBsZWZ0IHNjb3JlXG5cdFx0XHQvLyBNYXRjaDogc2VxdWVuY2UgY29udGludWVzIGdyb3dpbmcgZnJvbSBwcmV2aW91cyBkaWFnIHZhbHVlXG5cdFx0XHQvLyBTY29yZTogaW5jcmVhc2VzIGJ5IGRpYWcgc2NvcmUgdmFsdWVcblx0XHRcdGNvbnN0IGlzVmFsaWRTY29yZSA9IHNjb3JlICYmIGRpYWdTY29yZSArIHNjb3JlID49IGxlZnRTY29yZTtcblx0XHRcdGlmIChpc1ZhbGlkU2NvcmUgJiYgKFxuXHRcdFx0XHQvLyBXZSBkb24ndCBuZWVkIHRvIGNoZWNrIGlmIGl0J3MgY29udGlndW91cyBpZiB3ZSBhbGxvdyBub24tY29udGlndW91cyBtYXRjaGVzXG5cdFx0XHRcdGFsbG93Tm9uQ29udGlndW91c01hdGNoZXMgfHxcblx0XHRcdFx0Ly8gV2UgbXVzdCBiZSBsb29raW5nIGZvciBhIGNvbnRpZ3VvdXMgbWF0Y2guXG5cdFx0XHRcdC8vIExvb2tpbmcgYXQgYW4gaW5kZXggaGlnaGVyIHRoYW4gMCBpbiB0aGUgcXVlcnkgbWVhbnMgd2UgbXVzdCBoYXZlIGFscmVhZHlcblx0XHRcdFx0Ly8gZm91bmQgb3V0IHRoaXMgaXMgY29udGlndW91cyBvdGhlcndpc2UgdGhlcmUgd291bGRuJ3QgaGF2ZSBiZWVuIGEgc2NvcmVcblx0XHRcdFx0cXVlcnlJbmRleEd0TnVsbCB8fFxuXHRcdFx0XHQvLyBsYXN0bHkgY2hlY2sgaWYgdGhlIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGlndW91cyBhdCB0aGlzIGluZGV4IGluIHRoZSB0YXJnZXRcblx0XHRcdFx0dGFyZ2V0TG93ZXIuc3RhcnRzV2l0aChxdWVyeUxvd2VyLCB0YXJnZXRJbmRleClcblx0XHRcdCkpIHtcblx0XHRcdFx0bWF0Y2hlc1tjdXJyZW50SW5kZXhdID0gbWF0Y2hlc1NlcXVlbmNlTGVuZ3RoICsgMTtcblx0XHRcdFx0c2NvcmVzW2N1cnJlbnRJbmRleF0gPSBkaWFnU2NvcmUgKyBzY29yZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgZWl0aGVyIGhhdmUgbm8gc2NvcmUgb3IgdGhlIHNjb3JlIGlzIGxvd2VyIHRoYW4gdGhlIGxlZnQgc2NvcmVcblx0XHRcdC8vIE1hdGNoOiByZXNldCB0byAwXG5cdFx0XHQvLyBTY29yZTogcGljayB1cCBmcm9tIGxlZnQgaGFuZCBzaWRlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0bWF0Y2hlc1tjdXJyZW50SW5kZXhdID0gTk9fTUFUQ0g7XG5cdFx0XHRcdHNjb3Jlc1tjdXJyZW50SW5kZXhdID0gbGVmdFNjb3JlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFJlc3RvcmUgUG9zaXRpb25zIChzdGFydGluZyBmcm9tIGJvdHRvbSByaWdodCBvZiBtYXRyaXgpXG5cdGNvbnN0IHBvc2l0aW9uczogbnVtYmVyW10gPSBbXTtcblx0bGV0IHF1ZXJ5SW5kZXggPSBxdWVyeUxlbmd0aCAtIDE7XG5cdGxldCB0YXJnZXRJbmRleCA9IHRhcmdldExlbmd0aCAtIDE7XG5cdHdoaWxlIChxdWVyeUluZGV4ID49IDAgJiYgdGFyZ2V0SW5kZXggPj0gMCkge1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IHF1ZXJ5SW5kZXggKiB0YXJnZXRMZW5ndGggKyB0YXJnZXRJbmRleDtcblx0XHRjb25zdCBtYXRjaCA9IG1hdGNoZXNbY3VycmVudEluZGV4XTtcblx0XHRpZiAobWF0Y2ggPT09IE5PX01BVENIKSB7XG5cdFx0XHR0YXJnZXRJbmRleC0tOyAvLyBnbyBsZWZ0XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBvc2l0aW9ucy5wdXNoKHRhcmdldEluZGV4KTtcblxuXHRcdFx0Ly8gZ28gdXAgYW5kIGxlZnRcblx0XHRcdHF1ZXJ5SW5kZXgtLTtcblx0XHRcdHRhcmdldEluZGV4LS07XG5cdFx0fVxuXHR9XG5cblx0Ly8gUHJpbnQgbWF0cml4XG5cdC8vIGlmIChERUJVR19NQVRSSVgpIHtcblx0Ly8gXHRwcmludE1hdHJpeChxdWVyeSwgdGFyZ2V0LCBtYXRjaGVzLCBzY29yZXMpO1xuXHQvLyB9XG5cblx0cmV0dXJuIFtzY29yZXNbcXVlcnlMZW5ndGggKiB0YXJnZXRMZW5ndGggLSAxXSwgcG9zaXRpb25zLnJldmVyc2UoKV07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVDaGFyU2NvcmUocXVlcnlDaGFyQXRJbmRleDogc3RyaW5nLCBxdWVyeUxvd2VyQ2hhckF0SW5kZXg6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIHRhcmdldExvd2VyOiBzdHJpbmcsIHRhcmdldEluZGV4OiBudW1iZXIsIG1hdGNoZXNTZXF1ZW5jZUxlbmd0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0bGV0IHNjb3JlID0gMDtcblxuXHRpZiAoIWNvbnNpZGVyQXNFcXVhbChxdWVyeUxvd2VyQ2hhckF0SW5kZXgsIHRhcmdldExvd2VyW3RhcmdldEluZGV4XSkpIHtcblx0XHRyZXR1cm4gc2NvcmU7IC8vIG5vIG1hdGNoIG9mIGNoYXJhY3RlcnNcblx0fVxuXG5cdC8vIGlmIChERUJVRykge1xuXHQvLyBcdGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoYCVjRm91bmQgYSBtYXRjaCBvZiBjaGFyOiAke3F1ZXJ5TG93ZXJDaGFyQXRJbmRleH0gYXQgaW5kZXggJHt0YXJnZXRJbmRleH1gLCAnZm9udC13ZWlnaHQ6IG5vcm1hbCcpO1xuXHQvLyB9XG5cblx0Ly8gQ2hhcmFjdGVyIG1hdGNoIGJvbnVzXG5cdHNjb3JlICs9IDE7XG5cblx0Ly8gaWYgKERFQlVHKSB7XG5cdC8vIFx0Y29uc29sZS5sb2coYCVjQ2hhcmFjdGVyIG1hdGNoIGJvbnVzOiArMWAsICdmb250LXdlaWdodDogbm9ybWFsJyk7XG5cdC8vIH1cblxuXHQvLyBDb25zZWN1dGl2ZSBtYXRjaCBib251czogc2VxdWVuY2VzIHVwIHRvIDMgZ2V0IHRoZSBmdWxsIGJvbnVzICg2KVxuXHQvLyBhbmQgdGhlIHJlbWFpbmRlciBnZXRzIGhhbGYgdGhlIGJvbnVzICgzKS4gVGhpcyBoZWxwcyByZWR1Y2UgdGhlXG5cdC8vIG92ZXJhbGwgYm9vc3QgZm9yIGxvbmcgc2VxdWVuY2UgbWF0Y2hlcy5cblx0aWYgKG1hdGNoZXNTZXF1ZW5jZUxlbmd0aCA+IDApIHtcblx0XHRzY29yZSArPSAoTWF0aC5taW4obWF0Y2hlc1NlcXVlbmNlTGVuZ3RoLCAzKSAqIDYpICsgKE1hdGgubWF4KDAsIG1hdGNoZXNTZXF1ZW5jZUxlbmd0aCAtIDMpICogMyk7XG5cblx0XHQvLyBpZiAoREVCVUcpIHtcblx0XHQvLyBcdGNvbnNvbGUubG9nKGBDb25zZWN1dGl2ZSBtYXRjaCBib251czogKyR7bWF0Y2hlc1NlcXVlbmNlTGVuZ3RoICogNX1gKTtcblx0XHQvLyB9XG5cdH1cblxuXHQvLyBTYW1lIGNhc2UgYm9udXNcblx0aWYgKHF1ZXJ5Q2hhckF0SW5kZXggPT09IHRhcmdldFt0YXJnZXRJbmRleF0pIHtcblx0XHRzY29yZSArPSAxO1xuXG5cdFx0Ly8gaWYgKERFQlVHKSB7XG5cdFx0Ly8gXHRjb25zb2xlLmxvZygnU2FtZSBjYXNlIGJvbnVzOiArMScpO1xuXHRcdC8vIH1cblx0fVxuXG5cdC8vIFN0YXJ0IG9mIHdvcmQgYm9udXNcblx0aWYgKHRhcmdldEluZGV4ID09PSAwKSB7XG5cdFx0c2NvcmUgKz0gODtcblxuXHRcdC8vIGlmIChERUJVRykge1xuXHRcdC8vIFx0Y29uc29sZS5sb2coJ1N0YXJ0IG9mIHdvcmQgYm9udXM6ICs4Jyk7XG5cdFx0Ly8gfVxuXHR9XG5cblx0ZWxzZSB7XG5cblx0XHQvLyBBZnRlciBzZXBhcmF0b3IgYm9udXNcblx0XHRjb25zdCBzZXBhcmF0b3JCb251cyA9IHNjb3JlU2VwYXJhdG9yQXRQb3ModGFyZ2V0LmNoYXJDb2RlQXQodGFyZ2V0SW5kZXggLSAxKSk7XG5cdFx0aWYgKHNlcGFyYXRvckJvbnVzKSB7XG5cdFx0XHRzY29yZSArPSBzZXBhcmF0b3JCb251cztcblxuXHRcdFx0Ly8gaWYgKERFQlVHKSB7XG5cdFx0XHQvLyBcdGNvbnNvbGUubG9nKGBBZnRlciBzZXBhcmF0b3IgYm9udXM6ICske3NlcGFyYXRvckJvbnVzfWApO1xuXHRcdFx0Ly8gfVxuXHRcdH1cblxuXHRcdC8vIEluc2lkZSB3b3JkIHVwcGVyIGNhc2UgYm9udXMgKGNhbWVsIGNhc2UpLiBXZSBvbmx5IGdpdmUgdGhpcyBib251cyBpZiB3ZSdyZSBub3QgaW4gYSBjb250aWd1b3VzIHNlcXVlbmNlLlxuXHRcdC8vIEZvciBleGFtcGxlOlxuXHRcdC8vIE5QRSA9PiBOdWxsUG9pbnRlckV4Y2VwdGlvbiA9IGJvb3N0XG5cdFx0Ly8gSFRUUCA9PiBIVFRQID0gbm90IGJvb3N0XG5cdFx0ZWxzZSBpZiAoaXNVcHBlcih0YXJnZXQuY2hhckNvZGVBdCh0YXJnZXRJbmRleCkpICYmIG1hdGNoZXNTZXF1ZW5jZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0c2NvcmUgKz0gMjtcblxuXHRcdFx0Ly8gaWYgKERFQlVHKSB7XG5cdFx0XHQvLyBcdGNvbnNvbGUubG9nKCdJbnNpZGUgd29yZCB1cHBlciBjYXNlIGJvbnVzOiArMicpO1xuXHRcdFx0Ly8gfVxuXHRcdH1cblx0fVxuXG5cdC8vIGlmIChERUJVRykge1xuXHQvLyBcdGNvbnNvbGUubG9nKGBUb3RhbCBzY29yZTogJHtzY29yZX1gKTtcblx0Ly8gXHRjb25zb2xlLmdyb3VwRW5kKCk7XG5cdC8vIH1cblxuXHRyZXR1cm4gc2NvcmU7XG59XG5cbmZ1bmN0aW9uIGNvbnNpZGVyQXNFcXVhbChhOiBzdHJpbmcsIGI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoYSA9PT0gYikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gU3BlY2lhbCBjYXNlIHBhdGggc2VwYXJhdG9yczogaWdub3JlIHBsYXRmb3JtIGRpZmZlcmVuY2VzXG5cdGlmIChhID09PSAnLycgfHwgYSA9PT0gJ1xcXFwnKSB7XG5cdFx0cmV0dXJuIGIgPT09ICcvJyB8fCBiID09PSAnXFxcXCc7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHNjb3JlU2VwYXJhdG9yQXRQb3MoY2hhckNvZGU6IG51bWJlcik6IG51bWJlciB7XG5cdHN3aXRjaCAoY2hhckNvZGUpIHtcblx0XHRjYXNlIENoYXJDb2RlLlNsYXNoOlxuXHRcdGNhc2UgQ2hhckNvZGUuQmFja3NsYXNoOlxuXHRcdFx0cmV0dXJuIDU7IC8vIHByZWZlciBwYXRoIHNlcGFyYXRvcnMuLi5cblx0XHRjYXNlIENoYXJDb2RlLlVuZGVybGluZTpcblx0XHRjYXNlIENoYXJDb2RlLkRhc2g6XG5cdFx0Y2FzZSBDaGFyQ29kZS5QZXJpb2Q6XG5cdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTpcblx0XHRjYXNlIENoYXJDb2RlLlNpbmdsZVF1b3RlOlxuXHRcdGNhc2UgQ2hhckNvZGUuRG91YmxlUXVvdGU6XG5cdFx0Y2FzZSBDaGFyQ29kZS5Db2xvbjpcblx0XHRcdHJldHVybiA0OyAvLyAuLi5vdmVyIG90aGVyIHNlcGFyYXRvcnNcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIDA7XG5cdH1cbn1cblxuLy8gZnVuY3Rpb24gcHJpbnRNYXRyaXgocXVlcnk6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIG1hdGNoZXM6IG51bWJlcltdLCBzY29yZXM6IG51bWJlcltdKTogdm9pZCB7XG4vLyBcdGNvbnNvbGUubG9nKCdcXHQnICsgdGFyZ2V0LnNwbGl0KCcnKS5qb2luKCdcXHQnKSk7XG4vLyBcdGZvciAobGV0IHF1ZXJ5SW5kZXggPSAwOyBxdWVyeUluZGV4IDwgcXVlcnkubGVuZ3RoOyBxdWVyeUluZGV4KyspIHtcbi8vIFx0XHRsZXQgbGluZSA9IHF1ZXJ5W3F1ZXJ5SW5kZXhdICsgJ1xcdCc7XG4vLyBcdFx0Zm9yIChsZXQgdGFyZ2V0SW5kZXggPSAwOyB0YXJnZXRJbmRleCA8IHRhcmdldC5sZW5ndGg7IHRhcmdldEluZGV4KyspIHtcbi8vIFx0XHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IHF1ZXJ5SW5kZXggKiB0YXJnZXQubGVuZ3RoICsgdGFyZ2V0SW5kZXg7XG4vLyBcdFx0XHRsaW5lID0gbGluZSArICdNJyArIG1hdGNoZXNbY3VycmVudEluZGV4XSArICcvJyArICdTJyArIHNjb3Jlc1tjdXJyZW50SW5kZXhdICsgJ1xcdCc7XG4vLyBcdFx0fVxuXG4vLyBcdFx0Y29uc29sZS5sb2cobGluZSk7XG4vLyBcdH1cbi8vIH1cblxuLy8jZW5kcmVnaW9uXG5cblxuLy8jcmVnaW9uIEFsdGVybmF0ZSBmdXp6eSBzY29yZXIgaW1wbGVtZW50YXRpb24gdGhhdCBpcyBlLmcuIHVzZWQgZm9yIHN5bWJvbHNcblxuZXhwb3J0IHR5cGUgRnV6enlTY29yZTIgPSBbbnVtYmVyIHwgdW5kZWZpbmVkIC8qIHNjb3JlICovLCBJTWF0Y2hbXV07XG5cbmNvbnN0IE5PX1NDT1JFMjogRnV6enlTY29yZTIgPSBbdW5kZWZpbmVkLCBbXV07XG5cbmV4cG9ydCBmdW5jdGlvbiBzY29yZUZ1enp5Mih0YXJnZXQ6IHN0cmluZywgcXVlcnk6IElQcmVwYXJlZFF1ZXJ5IHwgSVByZXBhcmVkUXVlcnlQaWVjZSwgcGF0dGVyblN0YXJ0ID0gMCwgd29yZFN0YXJ0ID0gMCk6IEZ1enp5U2NvcmUyIHtcblxuXHQvLyBTY29yZTogbXVsdGlwbGUgaW5wdXRzXG5cdGNvbnN0IHByZXBhcmVkUXVlcnkgPSBxdWVyeSBhcyBJUHJlcGFyZWRRdWVyeTtcblx0aWYgKHByZXBhcmVkUXVlcnkudmFsdWVzICYmIHByZXBhcmVkUXVlcnkudmFsdWVzLmxlbmd0aCA+IDEpIHtcblx0XHRyZXR1cm4gZG9TY29yZUZ1enp5Mk11bHRpcGxlKHRhcmdldCwgcHJlcGFyZWRRdWVyeS52YWx1ZXMsIHBhdHRlcm5TdGFydCwgd29yZFN0YXJ0KTtcblx0fVxuXG5cdC8vIFNjb3JlOiBzaW5nbGUgaW5wdXRcblx0cmV0dXJuIGRvU2NvcmVGdXp6eTJTaW5nbGUodGFyZ2V0LCBxdWVyeSwgcGF0dGVyblN0YXJ0LCB3b3JkU3RhcnQpO1xufVxuXG5mdW5jdGlvbiBkb1Njb3JlRnV6enkyTXVsdGlwbGUodGFyZ2V0OiBzdHJpbmcsIHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeVBpZWNlW10sIHBhdHRlcm5TdGFydDogbnVtYmVyLCB3b3JkU3RhcnQ6IG51bWJlcik6IEZ1enp5U2NvcmUyIHtcblx0bGV0IHRvdGFsU2NvcmUgPSAwO1xuXHRjb25zdCB0b3RhbE1hdGNoZXM6IElNYXRjaFtdID0gW107XG5cblx0Zm9yIChjb25zdCBxdWVyeVBpZWNlIG9mIHF1ZXJ5KSB7XG5cdFx0Y29uc3QgW3Njb3JlLCBtYXRjaGVzXSA9IGRvU2NvcmVGdXp6eTJTaW5nbGUodGFyZ2V0LCBxdWVyeVBpZWNlLCBwYXR0ZXJuU3RhcnQsIHdvcmRTdGFydCk7XG5cdFx0aWYgKHR5cGVvZiBzY29yZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdC8vIGlmIGEgc2luZ2xlIHF1ZXJ5IHZhbHVlIGRvZXMgbm90IG1hdGNoLCByZXR1cm4gd2l0aFxuXHRcdFx0Ly8gbm8gc2NvcmUgZW50aXJlbHksIHdlIHJlcXVpcmUgYWxsIHF1ZXJpZXMgdG8gbWF0Y2hcblx0XHRcdHJldHVybiBOT19TQ09SRTI7XG5cdFx0fVxuXG5cdFx0dG90YWxTY29yZSArPSBzY29yZTtcblx0XHR0b3RhbE1hdGNoZXMucHVzaCguLi5tYXRjaGVzKTtcblx0fVxuXG5cdC8vIGlmIHdlIGhhdmUgYSBzY29yZSwgZW5zdXJlIHRoYXQgdGhlIHBvc2l0aW9ucyBhcmVcblx0Ly8gc29ydGVkIGluIGFzY2VuZGluZyBvcmRlciBhbmQgZGlzdGluY3Rcblx0cmV0dXJuIFt0b3RhbFNjb3JlLCBub3JtYWxpemVNYXRjaGVzKHRvdGFsTWF0Y2hlcyldO1xufVxuXG5mdW5jdGlvbiBkb1Njb3JlRnV6enkyU2luZ2xlKHRhcmdldDogc3RyaW5nLCBxdWVyeTogSVByZXBhcmVkUXVlcnlQaWVjZSwgcGF0dGVyblN0YXJ0OiBudW1iZXIsIHdvcmRTdGFydDogbnVtYmVyKTogRnV6enlTY29yZTIge1xuXHRjb25zdCBzY29yZSA9IGZ1enp5U2NvcmUocXVlcnkubm9ybWFsaXplZCwgcXVlcnkubm9ybWFsaXplZExvd2VyY2FzZSwgcGF0dGVyblN0YXJ0LCB0YXJnZXQsIHRhcmdldC50b0xvd2VyQ2FzZSgpLCB3b3JkU3RhcnQsIHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSwgYm9vc3RGdWxsTWF0Y2g6IHRydWUgfSk7XG5cdGlmICghc2NvcmUpIHtcblx0XHRyZXR1cm4gTk9fU0NPUkUyO1xuXHR9XG5cblx0cmV0dXJuIFtzY29yZVswXSwgY3JlYXRlRnV6enlNYXRjaGVzKHNjb3JlKV07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5cbi8vI3JlZ2lvbiBJdGVtIChsYWJlbCwgZGVzY3JpcHRpb24sIHBhdGgpIHNjb3JlclxuXG4vKipcbiAqIFNjb3Jpbmcgb24gc3RydWN0dXJhbCBpdGVtcyB0aGF0IGhhdmUgYSBsYWJlbCBhbmQgb3B0aW9uYWwgZGVzY3JpcHRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUl0ZW1TY29yZSB7XG5cblx0LyoqXG5cdCAqIE92ZXJhbGwgc2NvcmUuXG5cdCAqL1xuXHRzY29yZTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBNYXRjaGVzIHdpdGhpbiB0aGUgbGFiZWwuXG5cdCAqL1xuXHRsYWJlbE1hdGNoPzogSU1hdGNoW107XG5cblx0LyoqXG5cdCAqIE1hdGNoZXMgd2l0aGluIHRoZSBkZXNjcmlwdGlvbi5cblx0ICovXG5cdGRlc2NyaXB0aW9uTWF0Y2g/OiBJTWF0Y2hbXTtcbn1cblxuY29uc3QgTk9fSVRFTV9TQ09SRSA9IE9iamVjdC5mcmVlemU8SUl0ZW1TY29yZT4oeyBzY29yZTogMCB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBJSXRlbUFjY2Vzc29yPFQ+IHtcblxuXHQvKipcblx0ICogSnVzdCB0aGUgbGFiZWwgb2YgdGhlIGl0ZW0gdG8gc2NvcmUgb24uXG5cdCAqL1xuXHRnZXRJdGVtTGFiZWwoaXRlbTogVCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIG9wdGlvbmFsIGRlc2NyaXB0aW9uIG9mIHRoZSBpdGVtIHRvIHNjb3JlIG9uLlxuXHQgKi9cblx0Z2V0SXRlbURlc2NyaXB0aW9uKGl0ZW06IFQpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIElmIHRoZSBpdGVtIGlzIGEgZmlsZSwgdGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gc2NvcmUgb24uXG5cdCAqL1xuXHRnZXRJdGVtUGF0aChmaWxlOiBUKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBQQVRIX0lERU5USVRZX1NDT1JFID0gMSA8PCAxODtcbmNvbnN0IExBQkVMX1BSRUZJWF9TQ09SRV9USFJFU0hPTEQgPSAxIDw8IDE3O1xuY29uc3QgTEFCRUxfU0NPUkVfVEhSRVNIT0xEID0gMSA8PCAxNjtcblxuZnVuY3Rpb24gZ2V0Q2FjaGVIYXNoKGxhYmVsOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM6IGJvb2xlYW4sIHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSkge1xuXHRjb25zdCB2YWx1ZXMgPSBxdWVyeS52YWx1ZXMgPyBxdWVyeS52YWx1ZXMgOiBbcXVlcnldO1xuXHRjb25zdCBjYWNoZUhhc2ggPSBoYXNoKHtcblx0XHRbcXVlcnkubm9ybWFsaXplZF06IHtcblx0XHRcdHZhbHVlczogdmFsdWVzLm1hcCh2ID0+ICh7IHZhbHVlOiB2Lm5vcm1hbGl6ZWQsIGV4cGVjdENvbnRpZ3VvdXNNYXRjaDogdi5leHBlY3RDb250aWd1b3VzTWF0Y2ggfSkpLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGFsbG93Tm9uQ29udGlndW91c01hdGNoZXNcblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gY2FjaGVIYXNoO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2NvcmVJdGVtRnV6enk8VD4oaXRlbTogVCwgcXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzOiBib29sZWFuLCBhY2Nlc3NvcjogSUl0ZW1BY2Nlc3NvcjxUPiwgY2FjaGU6IEZ1enp5U2NvcmVyQ2FjaGUpOiBJSXRlbVNjb3JlIHtcblx0aWYgKCFpdGVtIHx8ICFxdWVyeS5ub3JtYWxpemVkKSB7XG5cdFx0cmV0dXJuIE5PX0lURU1fU0NPUkU7IC8vIHdlIG5lZWQgYW4gaXRlbSBhbmQgcXVlcnkgdG8gc2NvcmUgb24gYXQgbGVhc3Rcblx0fVxuXG5cdGNvbnN0IGxhYmVsID0gYWNjZXNzb3IuZ2V0SXRlbUxhYmVsKGl0ZW0pO1xuXHRpZiAoIWxhYmVsKSB7XG5cdFx0cmV0dXJuIE5PX0lURU1fU0NPUkU7IC8vIHdlIG5lZWQgYSBsYWJlbCBhdCBsZWFzdFxuXHR9XG5cblx0Y29uc3QgZGVzY3JpcHRpb24gPSBhY2Nlc3Nvci5nZXRJdGVtRGVzY3JpcHRpb24oaXRlbSk7XG5cblx0Ly8gaW4gb3JkZXIgdG8gc3BlZWQgdXAgc2NvcmluZywgd2UgY2FjaGUgdGhlIHNjb3JlIHdpdGggYSB1bmlxdWUgaGFzaCBiYXNlZCBvbjpcblx0Ly8gLSBsYWJlbFxuXHQvLyAtIGRlc2NyaXB0aW9uIChpZiBwcm92aWRlZClcblx0Ly8gLSB3aGV0aGVyIG5vbi1jb250aWd1b3VzIG1hdGNoaW5nIGlzIGVuYWJsZWQgb3Igbm90XG5cdC8vIC0gaGFzaCBvZiB0aGUgcXVlcnkgKG5vcm1hbGl6ZWQpIHZhbHVlc1xuXHRjb25zdCBjYWNoZUhhc2ggPSBnZXRDYWNoZUhhc2gobGFiZWwsIGRlc2NyaXB0aW9uLCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzLCBxdWVyeSk7XG5cdGNvbnN0IGNhY2hlZCA9IGNhY2hlW2NhY2hlSGFzaF07XG5cdGlmIChjYWNoZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkO1xuXHR9XG5cblx0Y29uc3QgaXRlbVNjb3JlID0gZG9TY29yZUl0ZW1GdXp6eShsYWJlbCwgZGVzY3JpcHRpb24sIGFjY2Vzc29yLmdldEl0ZW1QYXRoKGl0ZW0pLCBxdWVyeSwgYWxsb3dOb25Db250aWd1b3VzTWF0Y2hlcyk7XG5cdGNhY2hlW2NhY2hlSGFzaF0gPSBpdGVtU2NvcmU7XG5cblx0cmV0dXJuIGl0ZW1TY29yZTtcbn1cblxuZnVuY3Rpb24gZG9TY29yZUl0ZW1GdXp6eShsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsIHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgYWxsb3dOb25Db250aWd1b3VzTWF0Y2hlczogYm9vbGVhbik6IElJdGVtU2NvcmUge1xuXHRjb25zdCBwcmVmZXJMYWJlbE1hdGNoZXMgPSAhcGF0aCB8fCAhcXVlcnkuY29udGFpbnNQYXRoU2VwYXJhdG9yO1xuXG5cdC8vIFRyZWF0IGlkZW50aXR5IG1hdGNoZXMgb24gZnVsbCBwYXRoIGhpZ2hlc3Rcblx0aWYgKHBhdGggJiYgKGlzTGludXggPyBxdWVyeS5wYXRoTm9ybWFsaXplZCA9PT0gcGF0aCA6IGVxdWFsc0lnbm9yZUNhc2UocXVlcnkucGF0aE5vcm1hbGl6ZWQsIHBhdGgpKSkge1xuXHRcdHJldHVybiB7IHNjb3JlOiBQQVRIX0lERU5USVRZX1NDT1JFLCBsYWJlbE1hdGNoOiBbeyBzdGFydDogMCwgZW5kOiBsYWJlbC5sZW5ndGggfV0sIGRlc2NyaXB0aW9uTWF0Y2g6IGRlc2NyaXB0aW9uID8gW3sgc3RhcnQ6IDAsIGVuZDogZGVzY3JpcHRpb24ubGVuZ3RoIH1dIDogdW5kZWZpbmVkIH07XG5cdH1cblxuXHQvLyBTY29yZTogbXVsdGlwbGUgaW5wdXRzXG5cdGlmIChxdWVyeS52YWx1ZXMgJiYgcXVlcnkudmFsdWVzLmxlbmd0aCA+IDEpIHtcblx0XHRyZXR1cm4gZG9TY29yZUl0ZW1GdXp6eU11bHRpcGxlKGxhYmVsLCBkZXNjcmlwdGlvbiwgcGF0aCwgcXVlcnkudmFsdWVzLCBwcmVmZXJMYWJlbE1hdGNoZXMsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXMpO1xuXHR9XG5cblx0Ly8gU2NvcmU6IHNpbmdsZSBpbnB1dFxuXHRyZXR1cm4gZG9TY29yZUl0ZW1GdXp6eVNpbmdsZShsYWJlbCwgZGVzY3JpcHRpb24sIHBhdGgsIHF1ZXJ5LCBwcmVmZXJMYWJlbE1hdGNoZXMsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXMpO1xufVxuXG5mdW5jdGlvbiBkb1Njb3JlSXRlbUZ1enp5TXVsdGlwbGUobGFiZWw6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgcGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLCBxdWVyeTogSVByZXBhcmVkUXVlcnlQaWVjZVtdLCBwcmVmZXJMYWJlbE1hdGNoZXM6IGJvb2xlYW4sIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM6IGJvb2xlYW4pOiBJSXRlbVNjb3JlIHtcblx0bGV0IHRvdGFsU2NvcmUgPSAwO1xuXHRjb25zdCB0b3RhbExhYmVsTWF0Y2hlczogSU1hdGNoW10gPSBbXTtcblx0Y29uc3QgdG90YWxEZXNjcmlwdGlvbk1hdGNoZXM6IElNYXRjaFtdID0gW107XG5cblx0Zm9yIChjb25zdCBxdWVyeVBpZWNlIG9mIHF1ZXJ5KSB7XG5cdFx0Y29uc3QgeyBzY29yZSwgbGFiZWxNYXRjaCwgZGVzY3JpcHRpb25NYXRjaCB9ID0gZG9TY29yZUl0ZW1GdXp6eVNpbmdsZShsYWJlbCwgZGVzY3JpcHRpb24sIHBhdGgsIHF1ZXJ5UGllY2UsIHByZWZlckxhYmVsTWF0Y2hlcywgYWxsb3dOb25Db250aWd1b3VzTWF0Y2hlcyk7XG5cdFx0aWYgKHNjb3JlID09PSBOT19NQVRDSCkge1xuXHRcdFx0Ly8gaWYgYSBzaW5nbGUgcXVlcnkgdmFsdWUgZG9lcyBub3QgbWF0Y2gsIHJldHVybiB3aXRoXG5cdFx0XHQvLyBubyBzY29yZSBlbnRpcmVseSwgd2UgcmVxdWlyZSBhbGwgcXVlcmllcyB0byBtYXRjaFxuXHRcdFx0cmV0dXJuIE5PX0lURU1fU0NPUkU7XG5cdFx0fVxuXG5cdFx0dG90YWxTY29yZSArPSBzY29yZTtcblx0XHRpZiAobGFiZWxNYXRjaCkge1xuXHRcdFx0dG90YWxMYWJlbE1hdGNoZXMucHVzaCguLi5sYWJlbE1hdGNoKTtcblx0XHR9XG5cblx0XHRpZiAoZGVzY3JpcHRpb25NYXRjaCkge1xuXHRcdFx0dG90YWxEZXNjcmlwdGlvbk1hdGNoZXMucHVzaCguLi5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHR9XG5cdH1cblxuXHQvLyBpZiB3ZSBoYXZlIGEgc2NvcmUsIGVuc3VyZSB0aGF0IHRoZSBwb3NpdGlvbnMgYXJlXG5cdC8vIHNvcnRlZCBpbiBhc2NlbmRpbmcgb3JkZXIgYW5kIGRpc3RpbmN0XG5cdHJldHVybiB7XG5cdFx0c2NvcmU6IHRvdGFsU2NvcmUsXG5cdFx0bGFiZWxNYXRjaDogbm9ybWFsaXplTWF0Y2hlcyh0b3RhbExhYmVsTWF0Y2hlcyksXG5cdFx0ZGVzY3JpcHRpb25NYXRjaDogbm9ybWFsaXplTWF0Y2hlcyh0b3RhbERlc2NyaXB0aW9uTWF0Y2hlcylcblx0fTtcbn1cblxuZnVuY3Rpb24gZG9TY29yZUl0ZW1GdXp6eVNpbmdsZShsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsIHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeVBpZWNlLCBwcmVmZXJMYWJlbE1hdGNoZXM6IGJvb2xlYW4sIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM6IGJvb2xlYW4pOiBJSXRlbVNjb3JlIHtcblxuXHQvLyBQcmVmZXIgbGFiZWwgbWF0Y2hlcyBpZiB0b2xkIHNvIG9yIHdlIGhhdmUgbm8gZGVzY3JpcHRpb25cblx0aWYgKHByZWZlckxhYmVsTWF0Y2hlcyB8fCAhZGVzY3JpcHRpb24pIHtcblx0XHRjb25zdCBbbGFiZWxTY29yZSwgbGFiZWxQb3NpdGlvbnNdID0gc2NvcmVGdXp6eShcblx0XHRcdGxhYmVsLFxuXHRcdFx0cXVlcnkubm9ybWFsaXplZCxcblx0XHRcdHF1ZXJ5Lm5vcm1hbGl6ZWRMb3dlcmNhc2UsXG5cdFx0XHRhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzICYmICFxdWVyeS5leHBlY3RDb250aWd1b3VzTWF0Y2gpO1xuXHRcdGlmIChsYWJlbFNjb3JlKSB7XG5cblx0XHRcdC8vIElmIHdlIGhhdmUgYSBwcmVmaXggbWF0Y2ggb24gdGhlIGxhYmVsLCB3ZSBnaXZlIGEgbXVjaFxuXHRcdFx0Ly8gaGlnaGVyIGJhc2VTY29yZSB0byBlbGV2YXRlIHRoZXNlIG1hdGNoZXMgb3ZlciBvdGhlcnNcblx0XHRcdC8vIFRoaXMgZW5zdXJlcyB0aGF0IHR5cGluZyBhIGZpbGUgbmFtZSB3aW5zIG92ZXIgcmVzdWx0c1xuXHRcdFx0Ly8gdGhhdCBhcmUgcHJlc2VudCBzb21ld2hlcmUgaW4gdGhlIGxhYmVsLCBidXQgbm90IHRoZVxuXHRcdFx0Ly8gYmVnaW5uaW5nLlxuXHRcdFx0Y29uc3QgbGFiZWxQcmVmaXhNYXRjaCA9IG1hdGNoZXNQcmVmaXgocXVlcnkubm9ybWFsaXplZCwgbGFiZWwpO1xuXHRcdFx0bGV0IGJhc2VTY29yZTogbnVtYmVyO1xuXHRcdFx0aWYgKGxhYmVsUHJlZml4TWF0Y2gpIHtcblx0XHRcdFx0YmFzZVNjb3JlID0gTEFCRUxfUFJFRklYX1NDT1JFX1RIUkVTSE9MRDtcblxuXHRcdFx0XHQvLyBXZSBnaXZlIGFub3RoZXIgYm9vc3QgdG8gbGFiZWxzIHRoYXQgYXJlIHNob3J0LCBlLmcuIGdpdmVuXG5cdFx0XHRcdC8vIGZpbGVzIFwid2luZG93LnRzXCIgYW5kIFwid2luZG93QWN0aW9ucy50c1wiIGFuZCBhIHF1ZXJ5IG9mXG5cdFx0XHRcdC8vIFwid2luZG93XCIsIHdlIHdhbnQgXCJ3aW5kb3cudHNcIiB0byByZWNlaXZlIGEgaGlnaGVyIHNjb3JlLlxuXHRcdFx0XHQvLyBBcyBzdWNoIHdlIGNvbXB1dGUgdGhlIHBlcmNlbnRhZ2UgdGhlIHF1ZXJ5IGhhcyB3aXRoaW4gdGhlXG5cdFx0XHRcdC8vIGxhYmVsIGFuZCBhZGQgdGhhdCB0byB0aGUgYmFzZVNjb3JlLlxuXHRcdFx0XHRjb25zdCBwcmVmaXhMZW5ndGhCb29zdCA9IE1hdGgucm91bmQoKHF1ZXJ5Lm5vcm1hbGl6ZWQubGVuZ3RoIC8gbGFiZWwubGVuZ3RoKSAqIDEwMCk7XG5cdFx0XHRcdGJhc2VTY29yZSArPSBwcmVmaXhMZW5ndGhCb29zdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJhc2VTY29yZSA9IExBQkVMX1NDT1JFX1RIUkVTSE9MRDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgc2NvcmU6IGJhc2VTY29yZSArIGxhYmVsU2NvcmUsIGxhYmVsTWF0Y2g6IGxhYmVsUHJlZml4TWF0Y2ggfHwgY3JlYXRlTWF0Y2hlcyhsYWJlbFBvc2l0aW9ucykgfTtcblx0XHR9XG5cdH1cblxuXHQvLyBGaW5hbGx5IGNvbXB1dGUgZGVzY3JpcHRpb24gKyBsYWJlbCBzY29yZXMgaWYgd2UgaGF2ZSBhIGRlc2NyaXB0aW9uXG5cdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdGxldCBkZXNjcmlwdGlvblByZWZpeCA9IGRlc2NyaXB0aW9uO1xuXHRcdGlmICghIXBhdGgpIHtcblx0XHRcdGRlc2NyaXB0aW9uUHJlZml4ID0gYCR7ZGVzY3JpcHRpb259JHtzZXB9YDsgLy8gYXNzdW1lIHRoaXMgaXMgYSBmaWxlIHBhdGhcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvblByZWZpeExlbmd0aCA9IGRlc2NyaXB0aW9uUHJlZml4Lmxlbmd0aDtcblx0XHRjb25zdCBkZXNjcmlwdGlvbkFuZExhYmVsID0gYCR7ZGVzY3JpcHRpb25QcmVmaXh9JHtsYWJlbH1gO1xuXG5cdFx0Y29uc3QgW2xhYmVsRGVzY3JpcHRpb25TY29yZSwgbGFiZWxEZXNjcmlwdGlvblBvc2l0aW9uc10gPSBzY29yZUZ1enp5KFxuXHRcdFx0ZGVzY3JpcHRpb25BbmRMYWJlbCxcblx0XHRcdHF1ZXJ5Lm5vcm1hbGl6ZWQsXG5cdFx0XHRxdWVyeS5ub3JtYWxpemVkTG93ZXJjYXNlLFxuXHRcdFx0YWxsb3dOb25Db250aWd1b3VzTWF0Y2hlcyAmJiAhcXVlcnkuZXhwZWN0Q29udGlndW91c01hdGNoKTtcblx0XHRpZiAobGFiZWxEZXNjcmlwdGlvblNjb3JlKSB7XG5cdFx0XHRjb25zdCBsYWJlbERlc2NyaXB0aW9uTWF0Y2hlcyA9IGNyZWF0ZU1hdGNoZXMobGFiZWxEZXNjcmlwdGlvblBvc2l0aW9ucyk7XG5cdFx0XHRjb25zdCBsYWJlbE1hdGNoOiBJTWF0Y2hbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25NYXRjaDogSU1hdGNoW10gPSBbXTtcblxuXHRcdFx0Ly8gV2UgaGF2ZSB0byBzcGxpdCB0aGUgbWF0Y2hlcyBiYWNrIG9udG8gdGhlIGxhYmVsIGFuZCBkZXNjcmlwdGlvbiBwb3J0aW9uc1xuXHRcdFx0bGFiZWxEZXNjcmlwdGlvbk1hdGNoZXMuZm9yRWFjaChoID0+IHtcblxuXHRcdFx0XHQvLyBNYXRjaCBvdmVybGFwcyBsYWJlbCBhbmQgZGVzY3JpcHRpb24gcGFydCwgd2UgbmVlZCB0byBzcGxpdCBpdCB1cFxuXHRcdFx0XHRpZiAoaC5zdGFydCA8IGRlc2NyaXB0aW9uUHJlZml4TGVuZ3RoICYmIGguZW5kID4gZGVzY3JpcHRpb25QcmVmaXhMZW5ndGgpIHtcblx0XHRcdFx0XHRsYWJlbE1hdGNoLnB1c2goeyBzdGFydDogMCwgZW5kOiBoLmVuZCAtIGRlc2NyaXB0aW9uUHJlZml4TGVuZ3RoIH0pO1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uTWF0Y2gucHVzaCh7IHN0YXJ0OiBoLnN0YXJ0LCBlbmQ6IGRlc2NyaXB0aW9uUHJlZml4TGVuZ3RoIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTWF0Y2ggb24gbGFiZWwgcGFydFxuXHRcdFx0XHRlbHNlIGlmIChoLnN0YXJ0ID49IGRlc2NyaXB0aW9uUHJlZml4TGVuZ3RoKSB7XG5cdFx0XHRcdFx0bGFiZWxNYXRjaC5wdXNoKHsgc3RhcnQ6IGguc3RhcnQgLSBkZXNjcmlwdGlvblByZWZpeExlbmd0aCwgZW5kOiBoLmVuZCAtIGRlc2NyaXB0aW9uUHJlZml4TGVuZ3RoIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTWF0Y2ggb24gZGVzY3JpcHRpb24gcGFydFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbk1hdGNoLnB1c2goaCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4geyBzY29yZTogbGFiZWxEZXNjcmlwdGlvblNjb3JlLCBsYWJlbE1hdGNoLCBkZXNjcmlwdGlvbk1hdGNoIH07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIE5PX0lURU1fU0NPUkU7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1hdGNoZXMob2Zmc2V0czogbnVtYmVyW10gfCB1bmRlZmluZWQpOiBJTWF0Y2hbXSB7XG5cdGNvbnN0IHJldDogSU1hdGNoW10gPSBbXTtcblx0aWYgKCFvZmZzZXRzKSB7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGxldCBsYXN0OiBJTWF0Y2ggfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgcG9zIG9mIG9mZnNldHMpIHtcblx0XHRpZiAobGFzdCAmJiBsYXN0LmVuZCA9PT0gcG9zKSB7XG5cdFx0XHRsYXN0LmVuZCArPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYXN0ID0geyBzdGFydDogcG9zLCBlbmQ6IHBvcyArIDEgfTtcblx0XHRcdHJldC5wdXNoKGxhc3QpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU1hdGNoZXMobWF0Y2hlczogSU1hdGNoW10pOiBJTWF0Y2hbXSB7XG5cblx0Ly8gc29ydCBtYXRjaGVzIGJ5IHN0YXJ0IHRvIGJlIGFibGUgdG8gbm9ybWFsaXplXG5cdGNvbnN0IHNvcnRlZE1hdGNoZXMgPSBtYXRjaGVzLnNvcnQoKG1hdGNoQSwgbWF0Y2hCKSA9PiB7XG5cdFx0cmV0dXJuIG1hdGNoQS5zdGFydCAtIG1hdGNoQi5zdGFydDtcblx0fSk7XG5cblx0Ly8gbWVyZ2UgbWF0Y2hlcyB0aGF0IG92ZXJsYXBcblx0Y29uc3Qgbm9ybWFsaXplZE1hdGNoZXM6IElNYXRjaFtdID0gW107XG5cdGxldCBjdXJyZW50TWF0Y2g6IElNYXRjaCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBzb3J0ZWRNYXRjaGVzKSB7XG5cblx0XHQvLyBpZiB3ZSBoYXZlIG5vIGN1cnJlbnQgbWF0Y2ggb3IgdGhlIG1hdGNoZXNcblx0XHQvLyBkbyBub3Qgb3ZlcmxhcCwgd2UgdGFrZSBpdCBhcyBpcyBhbmQgcmVtZW1iZXJcblx0XHQvLyBpdCBmb3IgZnV0dXJlIG1lcmdpbmdcblx0XHRpZiAoIWN1cnJlbnRNYXRjaCB8fCAhbWF0Y2hPdmVybGFwcyhjdXJyZW50TWF0Y2gsIG1hdGNoKSkge1xuXHRcdFx0Y3VycmVudE1hdGNoID0gbWF0Y2g7XG5cdFx0XHRub3JtYWxpemVkTWF0Y2hlcy5wdXNoKG1hdGNoKTtcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2Ugd2UgbWVyZ2UgdGhlIG1hdGNoZXNcblx0XHRlbHNlIHtcblx0XHRcdGN1cnJlbnRNYXRjaC5zdGFydCA9IE1hdGgubWluKGN1cnJlbnRNYXRjaC5zdGFydCwgbWF0Y2guc3RhcnQpO1xuXHRcdFx0Y3VycmVudE1hdGNoLmVuZCA9IE1hdGgubWF4KGN1cnJlbnRNYXRjaC5lbmQsIG1hdGNoLmVuZCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5vcm1hbGl6ZWRNYXRjaGVzO1xufVxuXG5mdW5jdGlvbiBtYXRjaE92ZXJsYXBzKG1hdGNoQTogSU1hdGNoLCBtYXRjaEI6IElNYXRjaCk6IGJvb2xlYW4ge1xuXHRpZiAobWF0Y2hBLmVuZCA8IG1hdGNoQi5zdGFydCkge1xuXHRcdHJldHVybiBmYWxzZTtcdC8vIEEgZW5kcyBiZWZvcmUgQiBzdGFydHNcblx0fVxuXG5cdGlmIChtYXRjaEIuZW5kIDwgbWF0Y2hBLnN0YXJ0KSB7XG5cdFx0cmV0dXJuIGZhbHNlOyAvLyBCIGVuZHMgYmVmb3JlIEEgc3RhcnRzXG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cblxuLy8jcmVnaW9uIENvbXBhcmVyc1xuXG5leHBvcnQgZnVuY3Rpb24gY29tcGFyZUl0ZW1zQnlGdXp6eVNjb3JlPFQ+KGl0ZW1BOiBULCBpdGVtQjogVCwgcXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzOiBib29sZWFuLCBhY2Nlc3NvcjogSUl0ZW1BY2Nlc3NvcjxUPiwgY2FjaGU6IEZ1enp5U2NvcmVyQ2FjaGUpOiBudW1iZXIge1xuXHRjb25zdCBpdGVtU2NvcmVBID0gc2NvcmVJdGVtRnV6enkoaXRlbUEsIHF1ZXJ5LCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzLCBhY2Nlc3NvciwgY2FjaGUpO1xuXHRjb25zdCBpdGVtU2NvcmVCID0gc2NvcmVJdGVtRnV6enkoaXRlbUIsIHF1ZXJ5LCBhbGxvd05vbkNvbnRpZ3VvdXNNYXRjaGVzLCBhY2Nlc3NvciwgY2FjaGUpO1xuXG5cdGNvbnN0IHNjb3JlQSA9IGl0ZW1TY29yZUEuc2NvcmU7XG5cdGNvbnN0IHNjb3JlQiA9IGl0ZW1TY29yZUIuc2NvcmU7XG5cblx0Ly8gMS4pIGlkZW50aXR5IG1hdGNoZXMgaGF2ZSBoaWdoZXN0IHNjb3JlXG5cdGlmIChzY29yZUEgPT09IFBBVEhfSURFTlRJVFlfU0NPUkUgfHwgc2NvcmVCID09PSBQQVRIX0lERU5USVRZX1NDT1JFKSB7XG5cdFx0aWYgKHNjb3JlQSAhPT0gc2NvcmVCKSB7XG5cdFx0XHRyZXR1cm4gc2NvcmVBID09PSBQQVRIX0lERU5USVRZX1NDT1JFID8gLTEgOiAxO1xuXHRcdH1cblx0fVxuXG5cdC8vIDIuKSBtYXRjaGVzIG9uIGxhYmVsIGFyZSBjb25zaWRlcmVkIGhpZ2hlciBjb21wYXJlZCB0byBsYWJlbCtkZXNjcmlwdGlvbiBtYXRjaGVzXG5cdGlmIChzY29yZUEgPiBMQUJFTF9TQ09SRV9USFJFU0hPTEQgfHwgc2NvcmVCID4gTEFCRUxfU0NPUkVfVEhSRVNIT0xEKSB7XG5cdFx0aWYgKHNjb3JlQSAhPT0gc2NvcmVCKSB7XG5cdFx0XHRyZXR1cm4gc2NvcmVBID4gc2NvcmVCID8gLTEgOiAxO1xuXHRcdH1cblxuXHRcdC8vIHByZWZlciBtb3JlIGNvbXBhY3QgbWF0Y2hlcyBvdmVyIGxvbmdlciBpbiBsYWJlbCAodW5sZXNzIHRoaXMgaXMgYSBwcmVmaXggbWF0Y2ggd2hlcmVcblx0XHQvLyBsb25nZXIgcHJlZml4IG1hdGNoZXMgYXJlIGFjdHVhbGx5IHByZWZlcnJlZClcblx0XHRpZiAoc2NvcmVBIDwgTEFCRUxfUFJFRklYX1NDT1JFX1RIUkVTSE9MRCAmJiBzY29yZUIgPCBMQUJFTF9QUkVGSVhfU0NPUkVfVEhSRVNIT0xEKSB7XG5cdFx0XHRjb25zdCBjb21wYXJlZEJ5TWF0Y2hMZW5ndGggPSBjb21wYXJlQnlNYXRjaExlbmd0aChpdGVtU2NvcmVBLmxhYmVsTWF0Y2gsIGl0ZW1TY29yZUIubGFiZWxNYXRjaCk7XG5cdFx0XHRpZiAoY29tcGFyZWRCeU1hdGNoTGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBjb21wYXJlZEJ5TWF0Y2hMZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gcHJlZmVyIHNob3J0ZXIgbGFiZWxzIG92ZXIgbG9uZ2VyIGxhYmVsc1xuXHRcdGNvbnN0IGxhYmVsQSA9IGFjY2Vzc29yLmdldEl0ZW1MYWJlbChpdGVtQSkgfHwgJyc7XG5cdFx0Y29uc3QgbGFiZWxCID0gYWNjZXNzb3IuZ2V0SXRlbUxhYmVsKGl0ZW1CKSB8fCAnJztcblx0XHRpZiAobGFiZWxBLmxlbmd0aCAhPT0gbGFiZWxCLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGxhYmVsQS5sZW5ndGggLSBsYWJlbEIubGVuZ3RoO1xuXHRcdH1cblx0fVxuXG5cdC8vIDMuKSBjb21wYXJlIGJ5IHNjb3JlIGluIGxhYmVsK2Rlc2NyaXB0aW9uXG5cdGlmIChzY29yZUEgIT09IHNjb3JlQikge1xuXHRcdHJldHVybiBzY29yZUEgPiBzY29yZUIgPyAtMSA6IDE7XG5cdH1cblxuXHQvLyA0Likgc2NvcmVzIGFyZSBpZGVudGljYWw6IHByZWZlciBtYXRjaGVzIGluIGxhYmVsIG92ZXIgbm9uLWxhYmVsIG1hdGNoZXNcblx0Y29uc3QgaXRlbUFIYXNMYWJlbE1hdGNoZXMgPSBBcnJheS5pc0FycmF5KGl0ZW1TY29yZUEubGFiZWxNYXRjaCkgJiYgaXRlbVNjb3JlQS5sYWJlbE1hdGNoLmxlbmd0aCA+IDA7XG5cdGNvbnN0IGl0ZW1CSGFzTGFiZWxNYXRjaGVzID0gQXJyYXkuaXNBcnJheShpdGVtU2NvcmVCLmxhYmVsTWF0Y2gpICYmIGl0ZW1TY29yZUIubGFiZWxNYXRjaC5sZW5ndGggPiAwO1xuXHRpZiAoaXRlbUFIYXNMYWJlbE1hdGNoZXMgJiYgIWl0ZW1CSGFzTGFiZWxNYXRjaGVzKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9IGVsc2UgaWYgKGl0ZW1CSGFzTGFiZWxNYXRjaGVzICYmICFpdGVtQUhhc0xhYmVsTWF0Y2hlcykge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0Ly8gNS4pIHNjb3JlcyBhcmUgaWRlbnRpY2FsOiBwcmVmZXIgbW9yZSBjb21wYWN0IG1hdGNoZXMgKGxhYmVsIGFuZCBkZXNjcmlwdGlvbilcblx0Y29uc3QgaXRlbUFNYXRjaERpc3RhbmNlID0gY29tcHV0ZUxhYmVsQW5kRGVzY3JpcHRpb25NYXRjaERpc3RhbmNlKGl0ZW1BLCBpdGVtU2NvcmVBLCBhY2Nlc3Nvcik7XG5cdGNvbnN0IGl0ZW1CTWF0Y2hEaXN0YW5jZSA9IGNvbXB1dGVMYWJlbEFuZERlc2NyaXB0aW9uTWF0Y2hEaXN0YW5jZShpdGVtQiwgaXRlbVNjb3JlQiwgYWNjZXNzb3IpO1xuXHRpZiAoaXRlbUFNYXRjaERpc3RhbmNlICYmIGl0ZW1CTWF0Y2hEaXN0YW5jZSAmJiBpdGVtQU1hdGNoRGlzdGFuY2UgIT09IGl0ZW1CTWF0Y2hEaXN0YW5jZSkge1xuXHRcdHJldHVybiBpdGVtQk1hdGNoRGlzdGFuY2UgPiBpdGVtQU1hdGNoRGlzdGFuY2UgPyAtMSA6IDE7XG5cdH1cblxuXHQvLyA2Likgc2NvcmVzIGFyZSBpZGVudGljYWw6IHN0YXJ0IHRvIHVzZSB0aGUgZmFsbGJhY2sgY29tcGFyZVxuXHRyZXR1cm4gZmFsbGJhY2tDb21wYXJlKGl0ZW1BLCBpdGVtQiwgcXVlcnksIGFjY2Vzc29yKTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZUxhYmVsQW5kRGVzY3JpcHRpb25NYXRjaERpc3RhbmNlPFQ+KGl0ZW06IFQsIHNjb3JlOiBJSXRlbVNjb3JlLCBhY2Nlc3NvcjogSUl0ZW1BY2Nlc3NvcjxUPik6IG51bWJlciB7XG5cdGxldCBtYXRjaFN0YXJ0ID0gLTE7XG5cdGxldCBtYXRjaEVuZCA9IC0xO1xuXG5cdC8vIElmIHdlIGhhdmUgZGVzY3JpcHRpb24gbWF0Y2hlcywgdGhlIHN0YXJ0IGlzIGZpcnN0IG9mIGRlc2NyaXB0aW9uIG1hdGNoXG5cdGlmIChzY29yZS5kZXNjcmlwdGlvbk1hdGNoPy5sZW5ndGgpIHtcblx0XHRtYXRjaFN0YXJ0ID0gc2NvcmUuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydDtcblx0fVxuXG5cdC8vIE90aGVyd2lzZSwgdGhlIHN0YXJ0IGlzIHRoZSBmaXJzdCBsYWJlbCBtYXRjaFxuXHRlbHNlIGlmIChzY29yZS5sYWJlbE1hdGNoPy5sZW5ndGgpIHtcblx0XHRtYXRjaFN0YXJ0ID0gc2NvcmUubGFiZWxNYXRjaFswXS5zdGFydDtcblx0fVxuXG5cdC8vIElmIHdlIGhhdmUgbGFiZWwgbWF0Y2gsIHRoZSBlbmQgaXMgdGhlIGxhc3QgbGFiZWwgbWF0Y2hcblx0Ly8gSWYgd2UgaGFkIGEgZGVzY3JpcHRpb24gbWF0Y2gsIHdlIGFkZCB0aGUgbGVuZ3RoIG9mIHRoZSBkZXNjcmlwdGlvblxuXHQvLyBhcyBvZmZzZXQgdG8gdGhlIGVuZCB0byBpbmRpY2F0ZSB0aGlzLlxuXHRpZiAoc2NvcmUubGFiZWxNYXRjaD8ubGVuZ3RoKSB7XG5cdFx0bWF0Y2hFbmQgPSBzY29yZS5sYWJlbE1hdGNoW3Njb3JlLmxhYmVsTWF0Y2gubGVuZ3RoIC0gMV0uZW5kO1xuXHRcdGlmIChzY29yZS5kZXNjcmlwdGlvbk1hdGNoPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGl0ZW1EZXNjcmlwdGlvbiA9IGFjY2Vzc29yLmdldEl0ZW1EZXNjcmlwdGlvbihpdGVtKTtcblx0XHRcdGlmIChpdGVtRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0bWF0Y2hFbmQgKz0gaXRlbURlc2NyaXB0aW9uLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBJZiB3ZSBoYXZlIGp1c3QgYSBkZXNjcmlwdGlvbiBtYXRjaCwgdGhlIGVuZCBpcyB0aGUgbGFzdCBkZXNjcmlwdGlvbiBtYXRjaFxuXHRlbHNlIGlmIChzY29yZS5kZXNjcmlwdGlvbk1hdGNoPy5sZW5ndGgpIHtcblx0XHRtYXRjaEVuZCA9IHNjb3JlLmRlc2NyaXB0aW9uTWF0Y2hbc2NvcmUuZGVzY3JpcHRpb25NYXRjaC5sZW5ndGggLSAxXS5lbmQ7XG5cdH1cblxuXHRyZXR1cm4gbWF0Y2hFbmQgLSBtYXRjaFN0YXJ0O1xufVxuXG5mdW5jdGlvbiBjb21wYXJlQnlNYXRjaExlbmd0aChtYXRjaGVzQT86IElNYXRjaFtdLCBtYXRjaGVzQj86IElNYXRjaFtdKTogbnVtYmVyIHtcblx0aWYgKCghbWF0Y2hlc0EgJiYgIW1hdGNoZXNCKSB8fCAoKCFtYXRjaGVzQT8ubGVuZ3RoKSAmJiAoIW1hdGNoZXNCPy5sZW5ndGgpKSkge1xuXHRcdHJldHVybiAwOyAvLyBtYWtlIHN1cmUgdG8gbm90IGNhdXNlIGJhZCBjb21wYXJpbmcgd2hlbiBtYXRjaGVzIGFyZSBub3QgcHJvdmlkZWRcblx0fVxuXG5cdGlmICghbWF0Y2hlc0I/Lmxlbmd0aCkge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdGlmICghbWF0Y2hlc0E/Lmxlbmd0aCkge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0Ly8gQ29tcHV0ZSBtYXRjaCBsZW5ndGggb2YgQSAoZmlyc3QgdG8gbGFzdCBtYXRjaClcblx0Y29uc3QgbWF0Y2hTdGFydEEgPSBtYXRjaGVzQVswXS5zdGFydDtcblx0Y29uc3QgbWF0Y2hFbmRBID0gbWF0Y2hlc0FbbWF0Y2hlc0EubGVuZ3RoIC0gMV0uZW5kO1xuXHRjb25zdCBtYXRjaExlbmd0aEEgPSBtYXRjaEVuZEEgLSBtYXRjaFN0YXJ0QTtcblxuXHQvLyBDb21wdXRlIG1hdGNoIGxlbmd0aCBvZiBCIChmaXJzdCB0byBsYXN0IG1hdGNoKVxuXHRjb25zdCBtYXRjaFN0YXJ0QiA9IG1hdGNoZXNCWzBdLnN0YXJ0O1xuXHRjb25zdCBtYXRjaEVuZEIgPSBtYXRjaGVzQlttYXRjaGVzQi5sZW5ndGggLSAxXS5lbmQ7XG5cdGNvbnN0IG1hdGNoTGVuZ3RoQiA9IG1hdGNoRW5kQiAtIG1hdGNoU3RhcnRCO1xuXG5cdC8vIFByZWZlciBzaG9ydGVyIG1hdGNoIGxlbmd0aFxuXHRyZXR1cm4gbWF0Y2hMZW5ndGhBID09PSBtYXRjaExlbmd0aEIgPyAwIDogbWF0Y2hMZW5ndGhCIDwgbWF0Y2hMZW5ndGhBID8gMSA6IC0xO1xufVxuXG5mdW5jdGlvbiBmYWxsYmFja0NvbXBhcmU8VD4oaXRlbUE6IFQsIGl0ZW1COiBULCBxdWVyeTogSVByZXBhcmVkUXVlcnksIGFjY2Vzc29yOiBJSXRlbUFjY2Vzc29yPFQ+KTogbnVtYmVyIHtcblxuXHQvLyBjaGVjayBmb3IgbGFiZWwgKyBkZXNjcmlwdGlvbiBsZW5ndGggYW5kIHByZWZlciBzaG9ydGVyXG5cdGNvbnN0IGxhYmVsQSA9IGFjY2Vzc29yLmdldEl0ZW1MYWJlbChpdGVtQSkgfHwgJyc7XG5cdGNvbnN0IGxhYmVsQiA9IGFjY2Vzc29yLmdldEl0ZW1MYWJlbChpdGVtQikgfHwgJyc7XG5cblx0Y29uc3QgZGVzY3JpcHRpb25BID0gYWNjZXNzb3IuZ2V0SXRlbURlc2NyaXB0aW9uKGl0ZW1BKTtcblx0Y29uc3QgZGVzY3JpcHRpb25CID0gYWNjZXNzb3IuZ2V0SXRlbURlc2NyaXB0aW9uKGl0ZW1CKTtcblxuXHRjb25zdCBsYWJlbERlc2NyaXB0aW9uQUxlbmd0aCA9IGxhYmVsQS5sZW5ndGggKyAoZGVzY3JpcHRpb25BID8gZGVzY3JpcHRpb25BLmxlbmd0aCA6IDApO1xuXHRjb25zdCBsYWJlbERlc2NyaXB0aW9uQkxlbmd0aCA9IGxhYmVsQi5sZW5ndGggKyAoZGVzY3JpcHRpb25CID8gZGVzY3JpcHRpb25CLmxlbmd0aCA6IDApO1xuXG5cdGlmIChsYWJlbERlc2NyaXB0aW9uQUxlbmd0aCAhPT0gbGFiZWxEZXNjcmlwdGlvbkJMZW5ndGgpIHtcblx0XHRyZXR1cm4gbGFiZWxEZXNjcmlwdGlvbkFMZW5ndGggLSBsYWJlbERlc2NyaXB0aW9uQkxlbmd0aDtcblx0fVxuXG5cdC8vIGNoZWNrIGZvciBwYXRoIGxlbmd0aCBhbmQgcHJlZmVyIHNob3J0ZXJcblx0Y29uc3QgcGF0aEEgPSBhY2Nlc3Nvci5nZXRJdGVtUGF0aChpdGVtQSk7XG5cdGNvbnN0IHBhdGhCID0gYWNjZXNzb3IuZ2V0SXRlbVBhdGgoaXRlbUIpO1xuXG5cdGlmIChwYXRoQSAmJiBwYXRoQiAmJiBwYXRoQS5sZW5ndGggIT09IHBhdGhCLmxlbmd0aCkge1xuXHRcdHJldHVybiBwYXRoQS5sZW5ndGggLSBwYXRoQi5sZW5ndGg7XG5cdH1cblxuXHQvLyA3LikgZmluYWxseSB3ZSBoYXZlIGVxdWFsIHNjb3JlcyBhbmQgZXF1YWwgbGVuZ3RoLCB3ZSBmYWxsYmFjayB0byBjb21wYXJlclxuXG5cdC8vIGNvbXBhcmUgYnkgbGFiZWxcblx0aWYgKGxhYmVsQSAhPT0gbGFiZWxCKSB7XG5cdFx0cmV0dXJuIGNvbXBhcmVBbnl0aGluZyhsYWJlbEEsIGxhYmVsQiwgcXVlcnkubm9ybWFsaXplZCk7XG5cdH1cblxuXHQvLyBjb21wYXJlIGJ5IGRlc2NyaXB0aW9uXG5cdGlmIChkZXNjcmlwdGlvbkEgJiYgZGVzY3JpcHRpb25CICYmIGRlc2NyaXB0aW9uQSAhPT0gZGVzY3JpcHRpb25CKSB7XG5cdFx0cmV0dXJuIGNvbXBhcmVBbnl0aGluZyhkZXNjcmlwdGlvbkEsIGRlc2NyaXB0aW9uQiwgcXVlcnkubm9ybWFsaXplZCk7XG5cdH1cblxuXHQvLyBjb21wYXJlIGJ5IHBhdGhcblx0aWYgKHBhdGhBICYmIHBhdGhCICYmIHBhdGhBICE9PSBwYXRoQikge1xuXHRcdHJldHVybiBjb21wYXJlQW55dGhpbmcocGF0aEEsIHBhdGhCLCBxdWVyeS5ub3JtYWxpemVkKTtcblx0fVxuXG5cdC8vIGVxdWFsXG5cdHJldHVybiAwO1xufVxuXG4vLyNlbmRyZWdpb25cblxuXG4vLyNyZWdpb24gUXVlcnkgTm9ybWFsaXplclxuXG5leHBvcnQgaW50ZXJmYWNlIElQcmVwYXJlZFF1ZXJ5UGllY2Uge1xuXG5cdC8qKlxuXHQgKiBUaGUgb3JpZ2luYWwgcXVlcnkgYXMgcHJvdmlkZWQgYXMgaW5wdXQuXG5cdCAqL1xuXHRvcmlnaW5hbDogc3RyaW5nO1xuXHRvcmlnaW5hbExvd2VyY2FzZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcmlnaW5hbCBub3JtYWxpemVkIHRvIHBsYXRmb3JtIHNlcGFyYXRvcnM6XG5cdCAqIC0gV2luZG93czogXFxcblx0ICogLSBQb3NpeDogL1xuXHQgKi9cblx0cGF0aE5vcm1hbGl6ZWQ6IHN0cmluZztcblxuXHQvKipcblx0ICogSW4gYWRkaXRpb24gdG8gdGhlIG5vcm1hbGl6ZWQgcGF0aCwgd2lsbCBoYXZlXG5cdCAqIHdoaXRlc3BhY2UsIHdpbGRjYXJkcywgcXVvdGVzLCBlbGxpcHNpcywgYW5kIHRyYWlsaW5nIGhhc2ggY2hhcmFjdGVycyByZW1vdmVkLlxuXHQgKi9cblx0bm9ybWFsaXplZDogc3RyaW5nO1xuXHRub3JtYWxpemVkTG93ZXJjYXNlOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBxdWVyeSBpcyB3cmFwcGVkIGluIHF1b3RlcyB3aGljaCBtZWFuc1xuXHQgKiB0aGlzIHF1ZXJ5IG11c3QgYmUgYSBzdWJzdHJpbmcgb2YgdGhlIGlucHV0LlxuXHQgKiBJbiBvdGhlciB3b3Jkcywgbm8gZnV6enkgbWF0Y2hpbmcgaXMgdXNlZC5cblx0ICovXG5cdGV4cGVjdENvbnRpZ3VvdXNNYXRjaDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJlcGFyZWRRdWVyeSBleHRlbmRzIElQcmVwYXJlZFF1ZXJ5UGllY2Uge1xuXG5cdC8qKlxuXHQgKiBRdWVyeSBzcGxpdCBieSBzcGFjZXMgaW50byBwaWVjZXMuXG5cdCAqL1xuXHR2YWx1ZXM6IElQcmVwYXJlZFF1ZXJ5UGllY2VbXSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcXVlcnkgY29udGFpbnMgcGF0aCBzZXBhcmF0b3Iocykgb3Igbm90LlxuXHQgKi9cblx0Y29udGFpbnNQYXRoU2VwYXJhdG9yOiBib29sZWFuO1xufVxuXG4vKlxuICogSWYgYSBxdWVyeSBpcyB3cmFwcGVkIGluIHF1b3RlcywgdGhlIHVzZXIgZG9lcyBub3Qgd2FudCB0b1xuICogdXNlIGZ1enp5IHNlYXJjaCBmb3IgdGhpcyBxdWVyeS5cbiAqL1xuZnVuY3Rpb24gcXVlcnlFeHBlY3RzRXhhY3RNYXRjaChxdWVyeTogc3RyaW5nKSB7XG5cdHJldHVybiBxdWVyeS5zdGFydHNXaXRoKCdcIicpICYmIHF1ZXJ5LmVuZHNXaXRoKCdcIicpO1xufVxuXG4vKipcbiAqIEhlbHBlciBmdW5jdGlvbiB0byBwcmVwYXJlIGEgc2VhcmNoIHZhbHVlIGZvciBzY29yaW5nIGJ5IHJlbW92aW5nIHVud2FudGVkIGNoYXJhY3RlcnNcbiAqIGFuZCBhbGxvd2luZyB0byBzY29yZSBvbiBtdWx0aXBsZSBwaWVjZXMgc2VwYXJhdGVkIGJ5IHdoaXRlc3BhY2UgY2hhcmFjdGVyLlxuICovXG5jb25zdCBNVUxUSVBMRV9RVUVSWV9WQUxVRVNfU0VQQVJBVE9SID0gJyAnO1xuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVRdWVyeShvcmlnaW5hbDogc3RyaW5nKTogSVByZXBhcmVkUXVlcnkge1xuXHRpZiAodHlwZW9mIG9yaWdpbmFsICE9PSAnc3RyaW5nJykge1xuXHRcdG9yaWdpbmFsID0gJyc7XG5cdH1cblxuXHRjb25zdCBvcmlnaW5hbExvd2VyY2FzZSA9IG9yaWdpbmFsLnRvTG93ZXJDYXNlKCk7XG5cdGNvbnN0IHsgcGF0aE5vcm1hbGl6ZWQsIG5vcm1hbGl6ZWQsIG5vcm1hbGl6ZWRMb3dlcmNhc2UgfSA9IG5vcm1hbGl6ZVF1ZXJ5KG9yaWdpbmFsKTtcblx0Y29uc3QgY29udGFpbnNQYXRoU2VwYXJhdG9yID0gcGF0aE5vcm1hbGl6ZWQuaW5kZXhPZihzZXApID49IDA7XG5cdGNvbnN0IGV4cGVjdEV4YWN0TWF0Y2ggPSBxdWVyeUV4cGVjdHNFeGFjdE1hdGNoKG9yaWdpbmFsKTtcblxuXHRsZXQgdmFsdWVzOiBJUHJlcGFyZWRRdWVyeVBpZWNlW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3Qgb3JpZ2luYWxTcGxpdCA9IG9yaWdpbmFsLnNwbGl0KE1VTFRJUExFX1FVRVJZX1ZBTFVFU19TRVBBUkFUT1IpO1xuXHRpZiAob3JpZ2luYWxTcGxpdC5sZW5ndGggPiAxKSB7XG5cdFx0Zm9yIChjb25zdCBvcmlnaW5hbFBpZWNlIG9mIG9yaWdpbmFsU3BsaXQpIHtcblx0XHRcdGNvbnN0IGV4cGVjdEV4YWN0TWF0Y2hQaWVjZSA9IHF1ZXJ5RXhwZWN0c0V4YWN0TWF0Y2gob3JpZ2luYWxQaWVjZSk7XG5cdFx0XHRjb25zdCB7XG5cdFx0XHRcdHBhdGhOb3JtYWxpemVkOiBwYXRoTm9ybWFsaXplZFBpZWNlLFxuXHRcdFx0XHRub3JtYWxpemVkOiBub3JtYWxpemVkUGllY2UsXG5cdFx0XHRcdG5vcm1hbGl6ZWRMb3dlcmNhc2U6IG5vcm1hbGl6ZWRMb3dlcmNhc2VQaWVjZVxuXHRcdFx0fSA9IG5vcm1hbGl6ZVF1ZXJ5KG9yaWdpbmFsUGllY2UpO1xuXG5cdFx0XHRpZiAobm9ybWFsaXplZFBpZWNlKSB7XG5cdFx0XHRcdGlmICghdmFsdWVzKSB7XG5cdFx0XHRcdFx0dmFsdWVzID0gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2YWx1ZXMucHVzaCh7XG5cdFx0XHRcdFx0b3JpZ2luYWw6IG9yaWdpbmFsUGllY2UsXG5cdFx0XHRcdFx0b3JpZ2luYWxMb3dlcmNhc2U6IG9yaWdpbmFsUGllY2UudG9Mb3dlckNhc2UoKSxcblx0XHRcdFx0XHRwYXRoTm9ybWFsaXplZDogcGF0aE5vcm1hbGl6ZWRQaWVjZSxcblx0XHRcdFx0XHRub3JtYWxpemVkOiBub3JtYWxpemVkUGllY2UsXG5cdFx0XHRcdFx0bm9ybWFsaXplZExvd2VyY2FzZTogbm9ybWFsaXplZExvd2VyY2FzZVBpZWNlLFxuXHRcdFx0XHRcdGV4cGVjdENvbnRpZ3VvdXNNYXRjaDogZXhwZWN0RXhhY3RNYXRjaFBpZWNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IG9yaWdpbmFsLCBvcmlnaW5hbExvd2VyY2FzZSwgcGF0aE5vcm1hbGl6ZWQsIG5vcm1hbGl6ZWQsIG5vcm1hbGl6ZWRMb3dlcmNhc2UsIHZhbHVlcywgY29udGFpbnNQYXRoU2VwYXJhdG9yLCBleHBlY3RDb250aWd1b3VzTWF0Y2g6IGV4cGVjdEV4YWN0TWF0Y2ggfTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUXVlcnkob3JpZ2luYWw6IHN0cmluZyk6IHsgcGF0aE5vcm1hbGl6ZWQ6IHN0cmluZzsgbm9ybWFsaXplZDogc3RyaW5nOyBub3JtYWxpemVkTG93ZXJjYXNlOiBzdHJpbmcgfSB7XG5cdGxldCBwYXRoTm9ybWFsaXplZDogc3RyaW5nO1xuXHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0cGF0aE5vcm1hbGl6ZWQgPSBvcmlnaW5hbC5yZXBsYWNlKC9cXC8vZywgc2VwKTsgLy8gSGVscCBXaW5kb3dzIHVzZXJzIHRvIHNlYXJjaCBmb3IgcGF0aHMgd2hlbiB1c2luZyBzbGFzaFxuXHR9IGVsc2Uge1xuXHRcdHBhdGhOb3JtYWxpemVkID0gb3JpZ2luYWwucmVwbGFjZSgvXFxcXC9nLCBzZXApOyAvLyBIZWxwIG1hY09TL0xpbnV4IHVzZXJzIHRvIHNlYXJjaCBmb3IgcGF0aHMgd2hlbiB1c2luZyBiYWNrc2xhc2hcblx0fVxuXG5cdC8vIHJlbW92ZSBjZXJ0YWluIGNoYXJhY3RlcnMgdGhhdCBoZWxwIGZpbmQgYmV0dGVyIHJlc3VsdHM6XG5cdC8vIC0gcXVvdGVzOiBhcmUgdXNlZCBmb3IgZXhhY3QgbWF0Y2ggc2VhcmNoXG5cdC8vIC0gd2lsZGNhcmRzOiBhcmUgdXNlZCBmb3IgZnV6enkgbWF0Y2hpbmdcblx0Ly8gLSB3aGl0ZXNwYWNlOiBhcmUgdXNlZCB0byBzZXBhcmF0ZSBxdWVyaWVzXG5cdC8vIC0gZWxsaXBzaXM6IHNvbWV0aW1lcyB1c2VkIHRvIGluZGljYXRlIGFueSBwYXRoIHNlZ21lbnRzXG5cdC8vIC0gdHJhaWxpbmcgaGFzaDogdXNlZCBieSBzb21lIGxhbmd1YWdlIHNlcnZlcnMgKGUuZy4gcnVzdC1hbmFseXplcikgYXMgcXVlcnkgbW9kaWZpZXJzXG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBwYXRoTm9ybWFsaXplZC5yZXBsYWNlKC9bXFwqXFx1MjAyNlxcc1wiXS9nLCAnJykucmVwbGFjZSgvKD88PS4pIyQvLCAnJyk7XG5cblx0cmV0dXJuIHtcblx0XHRwYXRoTm9ybWFsaXplZCxcblx0XHRub3JtYWxpemVkLFxuXHRcdG5vcm1hbGl6ZWRMb3dlcmNhc2U6IG5vcm1hbGl6ZWQudG9Mb3dlckNhc2UoKVxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGllY2VUb1F1ZXJ5KHBpZWNlOiBJUHJlcGFyZWRRdWVyeVBpZWNlKTogSVByZXBhcmVkUXVlcnk7XG5leHBvcnQgZnVuY3Rpb24gcGllY2VUb1F1ZXJ5KHBpZWNlczogSVByZXBhcmVkUXVlcnlQaWVjZVtdKTogSVByZXBhcmVkUXVlcnk7XG5leHBvcnQgZnVuY3Rpb24gcGllY2VUb1F1ZXJ5KGFyZzE6IElQcmVwYXJlZFF1ZXJ5UGllY2UgfCBJUHJlcGFyZWRRdWVyeVBpZWNlW10pOiBJUHJlcGFyZWRRdWVyeSB7XG5cdGlmIChBcnJheS5pc0FycmF5KGFyZzEpKSB7XG5cdFx0cmV0dXJuIHByZXBhcmVRdWVyeShhcmcxLm1hcChwaWVjZSA9PiBwaWVjZS5vcmlnaW5hbCkuam9pbihNVUxUSVBMRV9RVUVSWV9WQUxVRVNfU0VQQVJBVE9SKSk7XG5cdH1cblxuXHRyZXR1cm4gcHJlcGFyZVF1ZXJ5KGFyZzEub3JpZ2luYWwpO1xufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLG9CQUFvQixZQUFvQixTQUFTLHFCQUFxQjtBQUNoRyxTQUFTLFlB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Z0IsWUFBWSxxQkFBcUIsUUFBUSx1QkFBdUIsdUJBQXVCLGlCQUFpQjtBQUMvSjtBQUVBLFNBQVMsZUFBZSxVQUErRjtBQUN0SCxNQUFJO0FBQ0osTUFBSSxXQUFXO0FBQ2QscUJBQWlCLFNBQVMsUUFBUSxPQUFPLEdBQUc7QUFBQSxFQUM3QyxPQUFPO0FBQ04scUJBQWlCLFNBQVMsUUFBUSxPQUFPLEdBQUc7QUFBQSxFQUM3QztBQVFBLFFBQU0sYUFBYSxlQUFlLFFBQVEsa0JBQWtCLEVBQUUsRUFBRSxRQUFRLFlBQVksRUFBRTtBQUV0RixTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLHFCQUFxQixXQUFXLFlBQVk7QUFBQSxFQUM3QztBQUNEO0FBSU8sU0FBUyxhQUFhLE1BQW1FO0FBQy9GLE1BQUksTUFBTSxRQUFRLElBQUksR0FBRztBQUN4QixXQUFPLGFBQWEsS0FBSyxJQUFJLFdBQVMsTUFBTSxRQUFRLEVBQUUsS0FBSywrQkFBK0IsQ0FBQztBQUFBLEVBQzVGO0FBRUEsU0FBTyxhQUFhLEtBQUssUUFBUTtBQUNsQzsiLAogICJuYW1lcyI6IFsicXVlcnlJbmRleCIsICJ0YXJnZXRJbmRleCJdCn0K
