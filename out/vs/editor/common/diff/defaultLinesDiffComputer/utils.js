import { CharCode } from "../../../../base/common/charCode.js";
class Array2D {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.array = [];
    this.array = new Array(width * height);
  }
  get(x, y) {
    return this.array[x + y * this.width];
  }
  set(x, y, value) {
    this.array[x + y * this.width] = value;
  }
}
function isSpace(charCode) {
  return charCode === CharCode.Space || charCode === CharCode.Tab;
}
const _LineRangeFragment = class _LineRangeFragment {
  constructor(range, lines, source) {
    this.range = range;
    this.lines = lines;
    this.source = source;
    this.histogram = [];
    let counter = 0;
    for (let i = range.startLineNumber - 1; i < range.endLineNumberExclusive - 1; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        counter++;
        const chr = line[j];
        const key2 = _LineRangeFragment.getKey(chr);
        this.histogram[key2] = (this.histogram[key2] || 0) + 1;
      }
      counter++;
      const key = _LineRangeFragment.getKey("\n");
      this.histogram[key] = (this.histogram[key] || 0) + 1;
    }
    this.totalCount = counter;
  }
  static getKey(chr) {
    let key = this.chrKeys.get(chr);
    if (key === void 0) {
      key = this.chrKeys.size;
      this.chrKeys.set(chr, key);
    }
    return key;
  }
  computeSimilarity(other) {
    let sumDifferences = 0;
    const maxLength = Math.max(this.histogram.length, other.histogram.length);
    for (let i = 0; i < maxLength; i++) {
      sumDifferences += Math.abs((this.histogram[i] ?? 0) - (other.histogram[i] ?? 0));
    }
    return 1 - sumDifferences / (this.totalCount + other.totalCount);
  }
};
_LineRangeFragment.chrKeys = /* @__PURE__ */ new Map();
let LineRangeFragment = _LineRangeFragment;
export {
  Array2D,
  LineRangeFragment,
  isSpace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcZGlmZlxcZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyXFx1dGlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uL3JhbmdlTWFwcGluZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBcnJheTJEPFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBhcnJheTogVFtdID0gW107XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHdpZHRoOiBudW1iZXIsIHB1YmxpYyByZWFkb25seSBoZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuYXJyYXkgPSBuZXcgQXJyYXk8VD4od2lkdGggKiBoZWlnaHQpO1xuXHR9XG5cblx0Z2V0KHg6IG51bWJlciwgeTogbnVtYmVyKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuYXJyYXlbeCArIHkgKiB0aGlzLndpZHRoXTtcblx0fVxuXG5cdHNldCh4OiBudW1iZXIsIHk6IG51bWJlciwgdmFsdWU6IFQpOiB2b2lkIHtcblx0XHR0aGlzLmFycmF5W3ggKyB5ICogdGhpcy53aWR0aF0gPSB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTcGFjZShjaGFyQ29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBjaGFyQ29kZSA9PT0gQ2hhckNvZGUuU3BhY2UgfHwgY2hhckNvZGUgPT09IENoYXJDb2RlLlRhYjtcbn1cblxuZXhwb3J0IGNsYXNzIExpbmVSYW5nZUZyYWdtZW50IHtcblx0cHJpdmF0ZSBzdGF0aWMgY2hyS2V5cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0S2V5KGNocjogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRsZXQga2V5ID0gdGhpcy5jaHJLZXlzLmdldChjaHIpO1xuXHRcdGlmIChrZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0a2V5ID0gdGhpcy5jaHJLZXlzLnNpemU7XG5cdFx0XHR0aGlzLmNocktleXMuc2V0KGNociwga2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGtleTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdG90YWxDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpc3RvZ3JhbTogbnVtYmVyW10gPSBbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmdlOiBMaW5lUmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVzOiBzdHJpbmdbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc291cmNlOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsXG5cdCkge1xuXHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMTsgaSA8IHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgbGluZS5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdGNvbnN0IGNociA9IGxpbmVbal07XG5cdFx0XHRcdGNvbnN0IGtleSA9IExpbmVSYW5nZUZyYWdtZW50LmdldEtleShjaHIpO1xuXHRcdFx0XHR0aGlzLmhpc3RvZ3JhbVtrZXldID0gKHRoaXMuaGlzdG9ncmFtW2tleV0gfHwgMCkgKyAxO1xuXHRcdFx0fVxuXHRcdFx0Y291bnRlcisrO1xuXHRcdFx0Y29uc3Qga2V5ID0gTGluZVJhbmdlRnJhZ21lbnQuZ2V0S2V5KCdcXG4nKTtcblx0XHRcdHRoaXMuaGlzdG9ncmFtW2tleV0gPSAodGhpcy5oaXN0b2dyYW1ba2V5XSB8fCAwKSArIDE7XG5cdFx0fVxuXG5cdFx0dGhpcy50b3RhbENvdW50ID0gY291bnRlcjtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlU2ltaWxhcml0eShvdGhlcjogTGluZVJhbmdlRnJhZ21lbnQpOiBudW1iZXIge1xuXHRcdGxldCBzdW1EaWZmZXJlbmNlcyA9IDA7XG5cdFx0Y29uc3QgbWF4TGVuZ3RoID0gTWF0aC5tYXgodGhpcy5oaXN0b2dyYW0ubGVuZ3RoLCBvdGhlci5oaXN0b2dyYW0ubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1heExlbmd0aDsgaSsrKSB7XG5cdFx0XHRzdW1EaWZmZXJlbmNlcyArPSBNYXRoLmFicygodGhpcy5oaXN0b2dyYW1baV0gPz8gMCkgLSAob3RoZXIuaGlzdG9ncmFtW2ldID8/IDApKTtcblx0XHR9XG5cdFx0cmV0dXJuIDEgLSAoc3VtRGlmZmVyZW5jZXMgLyAodGhpcy50b3RhbENvdW50ICsgb3RoZXIudG90YWxDb3VudCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUlsQixNQUFNLFFBQVc7QUFBQSxFQUd2QixZQUE0QixPQUErQixRQUFnQjtBQUEvQztBQUErQjtBQUYzRCxTQUFpQixRQUFhLENBQUM7QUFHOUIsU0FBSyxRQUFRLElBQUksTUFBUyxRQUFRLE1BQU07QUFBQSxFQUN6QztBQUFBLEVBRUEsSUFBSSxHQUFXLEdBQWM7QUFDNUIsV0FBTyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssS0FBSztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxJQUFJLEdBQVcsR0FBVyxPQUFnQjtBQUN6QyxTQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssS0FBSyxJQUFJO0FBQUEsRUFDbEM7QUFDRDtBQUVPLFNBQVMsUUFBUSxVQUEyQjtBQUNsRCxTQUFPLGFBQWEsU0FBUyxTQUFTLGFBQWEsU0FBUztBQUM3RDtBQUVPLE1BQU0scUJBQU4sTUFBTSxtQkFBa0I7QUFBQSxFQWM5QixZQUNpQixPQUNBLE9BQ0EsUUFDZjtBQUhlO0FBQ0E7QUFDQTtBQUpqQixTQUFpQixZQUFzQixDQUFDO0FBTXZDLFFBQUksVUFBVTtBQUNkLGFBQVMsSUFBSSxNQUFNLGtCQUFrQixHQUFHLElBQUksTUFBTSx5QkFBeUIsR0FBRyxLQUFLO0FBQ2xGLFlBQU0sT0FBTyxNQUFNLENBQUM7QUFDcEIsZUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNyQztBQUNBLGNBQU0sTUFBTSxLQUFLLENBQUM7QUFDbEIsY0FBTUEsT0FBTSxtQkFBa0IsT0FBTyxHQUFHO0FBQ3hDLGFBQUssVUFBVUEsSUFBRyxLQUFLLEtBQUssVUFBVUEsSUFBRyxLQUFLLEtBQUs7QUFBQSxNQUNwRDtBQUNBO0FBQ0EsWUFBTSxNQUFNLG1CQUFrQixPQUFPLElBQUk7QUFDekMsV0FBSyxVQUFVLEdBQUcsS0FBSyxLQUFLLFVBQVUsR0FBRyxLQUFLLEtBQUs7QUFBQSxJQUNwRDtBQUVBLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUEvQkEsT0FBZSxPQUFPLEtBQXFCO0FBQzFDLFFBQUksTUFBTSxLQUFLLFFBQVEsSUFBSSxHQUFHO0FBQzlCLFFBQUksUUFBUSxRQUFXO0FBQ3RCLFlBQU0sS0FBSyxRQUFRO0FBQ25CLFdBQUssUUFBUSxJQUFJLEtBQUssR0FBRztBQUFBLElBQzFCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQTBCTyxrQkFBa0IsT0FBa0M7QUFDMUQsUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLFVBQVUsUUFBUSxNQUFNLFVBQVUsTUFBTTtBQUN4RSxhQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsS0FBSztBQUNuQyx3QkFBa0IsS0FBSyxLQUFLLEtBQUssVUFBVSxDQUFDLEtBQUssTUFBTSxNQUFNLFVBQVUsQ0FBQyxLQUFLLEVBQUU7QUFBQSxJQUNoRjtBQUNBLFdBQU8sSUFBSyxrQkFBa0IsS0FBSyxhQUFhLE1BQU07QUFBQSxFQUN2RDtBQUNEO0FBNUNhLG1CQUNHLFVBQVUsb0JBQUksSUFBb0I7QUFEM0MsSUFBTSxvQkFBTjsiLAogICJuYW1lcyI6IFsia2V5Il0KfQo=
