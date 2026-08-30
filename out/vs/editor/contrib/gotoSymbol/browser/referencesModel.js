import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { defaultGenerator } from "../../../../base/common/idGenerator.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { basename, extUri } from "../../../../base/common/resources.js";
import * as strings from "../../../../base/common/strings.js";
import { Constants } from "../../../../base/common/uint.js";
import { Range } from "../../../common/core/range.js";
import { localize } from "../../../../nls.js";
class OneReference {
  constructor(isProviderFirst, parent, link, _rangeCallback) {
    this.isProviderFirst = isProviderFirst;
    this.parent = parent;
    this.link = link;
    this._rangeCallback = _rangeCallback;
    this.id = defaultGenerator.nextId();
  }
  get uri() {
    return this.link.uri;
  }
  get range() {
    return this._range ?? this.link.targetSelectionRange ?? this.link.range;
  }
  set range(value) {
    this._range = value;
    this._rangeCallback(this);
  }
  get ariaMessage() {
    const preview = this.parent.getPreview(this)?.preview(this.range);
    if (!preview) {
      return localize(
        "aria.oneReference",
        "in {0} on line {1} at column {2}",
        basename(this.uri),
        this.range.startLineNumber,
        this.range.startColumn
      );
    } else {
      return localize(
        { key: "aria.oneReference.preview", comment: ["Placeholders are: 0: filename, 1:line number, 2: column number, 3: preview snippet of source code"] },
        "{0} in {1} on line {2} at column {3}",
        preview.value,
        basename(this.uri),
        this.range.startLineNumber,
        this.range.startColumn
      );
    }
  }
}
class FilePreview {
  constructor(_modelReference) {
    this._modelReference = _modelReference;
  }
  dispose() {
    this._modelReference.dispose();
  }
  preview(range, n = 8) {
    const model = this._modelReference.object.textEditorModel;
    if (!model) {
      return void 0;
    }
    const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
    const word = model.getWordUntilPosition({ lineNumber: startLineNumber, column: startColumn - n });
    const beforeRange = new Range(startLineNumber, word.startColumn, startLineNumber, startColumn);
    const afterRange = new Range(endLineNumber, endColumn, endLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
    const before = model.getValueInRange(beforeRange).replace(/^\s+/, "");
    const inside = model.getValueInRange(range);
    const after = model.getValueInRange(afterRange).replace(/\s+$/, "");
    return {
      value: before + inside + after,
      highlight: { start: before.length, end: before.length + inside.length }
    };
  }
}
class FileReferences {
  constructor(parent, uri) {
    this.parent = parent;
    this.uri = uri;
    this.children = [];
    this._previews = new ResourceMap();
  }
  dispose() {
    dispose(this._previews.values());
    this._previews.clear();
  }
  getPreview(child) {
    return this._previews.get(child.uri);
  }
  get ariaMessage() {
    const len = this.children.length;
    if (len === 1) {
      return localize("aria.fileReferences.1", "1 symbol in {0}, full path {1}", basename(this.uri), this.uri.fsPath);
    } else {
      return localize("aria.fileReferences.N", "{0} symbols in {1}, full path {2}", len, basename(this.uri), this.uri.fsPath);
    }
  }
  async resolve(textModelResolverService) {
    if (this._previews.size !== 0) {
      return this;
    }
    for (const child of this.children) {
      if (this._previews.has(child.uri)) {
        continue;
      }
      try {
        const ref = await textModelResolverService.createModelReference(child.uri);
        this._previews.set(child.uri, new FilePreview(ref));
      } catch (err) {
        onUnexpectedError(err);
      }
    }
    return this;
  }
}
class ReferencesModel {
  constructor(links, title) {
    this.groups = [];
    this.references = [];
    this._onDidChangeReferenceRange = new Emitter();
    this.onDidChangeReferenceRange = this._onDidChangeReferenceRange.event;
    this._links = links;
    this._title = title;
    const [providersFirst] = links;
    links.sort(ReferencesModel._compareReferences);
    let current;
    for (const link of links) {
      if (!current || !extUri.isEqual(current.uri, link.uri, true)) {
        current = new FileReferences(this, link.uri);
        this.groups.push(current);
      }
      if (current.children.length === 0 || ReferencesModel._compareReferences(link, current.children[current.children.length - 1]) !== 0) {
        const oneRef = new OneReference(
          providersFirst === link,
          current,
          link,
          (ref) => this._onDidChangeReferenceRange.fire(ref)
        );
        this.references.push(oneRef);
        current.children.push(oneRef);
      }
    }
  }
  dispose() {
    dispose(this.groups);
    this._onDidChangeReferenceRange.dispose();
    this.groups.length = 0;
  }
  clone() {
    return new ReferencesModel(this._links, this._title);
  }
  get title() {
    return this._title;
  }
  get isEmpty() {
    return this.groups.length === 0;
  }
  get ariaMessage() {
    if (this.isEmpty) {
      return localize("aria.result.0", "No results found");
    } else if (this.references.length === 1) {
      return localize("aria.result.1", "Found 1 symbol in {0}", this.references[0].uri.fsPath);
    } else if (this.groups.length === 1) {
      return localize("aria.result.n1", "Found {0} symbols in {1}", this.references.length, this.groups[0].uri.fsPath);
    } else {
      return localize("aria.result.nm", "Found {0} symbols in {1} files", this.references.length, this.groups.length);
    }
  }
  nextOrPreviousReference(reference, next) {
    const { parent } = reference;
    let idx = parent.children.indexOf(reference);
    const childCount = parent.children.length;
    const groupCount = parent.parent.groups.length;
    if (groupCount === 1 || next && idx + 1 < childCount || !next && idx > 0) {
      if (next) {
        idx = (idx + 1) % childCount;
      } else {
        idx = (idx + childCount - 1) % childCount;
      }
      return parent.children[idx];
    }
    idx = parent.parent.groups.indexOf(parent);
    if (next) {
      idx = (idx + 1) % groupCount;
      return parent.parent.groups[idx].children[0];
    } else {
      idx = (idx + groupCount - 1) % groupCount;
      return parent.parent.groups[idx].children[parent.parent.groups[idx].children.length - 1];
    }
  }
  nearestReference(resource, position) {
    const nearest = this.references.map((ref, idx) => {
      return {
        idx,
        prefixLen: strings.commonPrefixLength(ref.uri.toString(), resource.toString()),
        offsetDist: Math.abs(ref.range.startLineNumber - position.lineNumber) * 100 + Math.abs(ref.range.startColumn - position.column)
      };
    }).sort((a, b) => {
      if (a.prefixLen > b.prefixLen) {
        return -1;
      } else if (a.prefixLen < b.prefixLen) {
        return 1;
      } else if (a.offsetDist < b.offsetDist) {
        return -1;
      } else if (a.offsetDist > b.offsetDist) {
        return 1;
      } else {
        return 0;
      }
    })[0];
    if (nearest) {
      return this.references[nearest.idx];
    }
    return void 0;
  }
  referenceAt(resource, position) {
    for (const ref of this.references) {
      if (ref.uri.toString() === resource.toString()) {
        if (Range.containsPosition(ref.range, position)) {
          return ref;
        }
      }
    }
    return void 0;
  }
  firstReference() {
    for (const ref of this.references) {
      if (ref.isProviderFirst) {
        return ref;
      }
    }
    return this.references[0];
  }
  static _compareReferences(a, b) {
    return extUri.compare(a.uri, b.uri) || Range.compareRangesUsingStarts(a.range, b.range);
  }
}
export {
  FilePreview,
  FileReferences,
  OneReference,
  ReferencesModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdvdG9TeW1ib2xcXGJyb3dzZXJcXHJlZmVyZW5jZXNNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0R2VuZXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWRHZW5lcmF0b3IuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24sIExvY2F0aW9uTGluayB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuZXhwb3J0IGNsYXNzIE9uZVJlZmVyZW5jZSB7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZyA9IGRlZmF1bHRHZW5lcmF0b3IubmV4dElkKCk7XG5cblx0cHJpdmF0ZSBfcmFuZ2U/OiBJUmFuZ2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaXNQcm92aWRlckZpcnN0OiBib29sZWFuLFxuXHRcdHJlYWRvbmx5IHBhcmVudDogRmlsZVJlZmVyZW5jZXMsXG5cdFx0cmVhZG9ubHkgbGluazogTG9jYXRpb25MaW5rLFxuXHRcdHByaXZhdGUgX3JhbmdlQ2FsbGJhY2s6IChyZWY6IE9uZVJlZmVyZW5jZSkgPT4gdm9pZFxuXHQpIHsgfVxuXG5cdGdldCB1cmkoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGluay51cmk7XG5cdH1cblxuXHRnZXQgcmFuZ2UoKTogSVJhbmdlIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2UgPz8gdGhpcy5saW5rLnRhcmdldFNlbGVjdGlvblJhbmdlID8/IHRoaXMubGluay5yYW5nZTtcblx0fVxuXG5cdHNldCByYW5nZSh2YWx1ZTogSVJhbmdlKSB7XG5cdFx0dGhpcy5fcmFuZ2UgPSB2YWx1ZTtcblx0XHR0aGlzLl9yYW5nZUNhbGxiYWNrKHRoaXMpO1xuXHR9XG5cblx0Z2V0IGFyaWFNZXNzYWdlKCk6IHN0cmluZyB7XG5cblx0XHRjb25zdCBwcmV2aWV3ID0gdGhpcy5wYXJlbnQuZ2V0UHJldmlldyh0aGlzKT8ucHJldmlldyh0aGlzLnJhbmdlKTtcblxuXHRcdGlmICghcHJldmlldykge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHQnYXJpYS5vbmVSZWZlcmVuY2UnLCBcImluIHswfSBvbiBsaW5lIHsxfSBhdCBjb2x1bW4gezJ9XCIsXG5cdFx0XHRcdGJhc2VuYW1lKHRoaXMudXJpKSwgdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW5cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdFx0eyBrZXk6ICdhcmlhLm9uZVJlZmVyZW5jZS5wcmV2aWV3JywgY29tbWVudDogWydQbGFjZWhvbGRlcnMgYXJlOiAwOiBmaWxlbmFtZSwgMTpsaW5lIG51bWJlciwgMjogY29sdW1uIG51bWJlciwgMzogcHJldmlldyBzbmlwcGV0IG9mIHNvdXJjZSBjb2RlJ10gfSwgXCJ7MH0gaW4gezF9IG9uIGxpbmUgezJ9IGF0IGNvbHVtbiB7M31cIixcblx0XHRcdFx0cHJldmlldy52YWx1ZSwgYmFzZW5hbWUodGhpcy51cmkpLCB0aGlzLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgdGhpcy5yYW5nZS5zdGFydENvbHVtblxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVQcmV2aWV3IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsUmVmZXJlbmNlOiBJUmVmZXJlbmNlPElUZXh0RWRpdG9yTW9kZWw+XG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbFJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcmV2aWV3KHJhbmdlOiBJUmFuZ2UsIG46IG51bWJlciA9IDgpOiB7IHZhbHVlOiBzdHJpbmc7IGhpZ2hsaWdodDogSU1hdGNoIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxSZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4gfSA9IHJhbmdlO1xuXHRcdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbih7IGxpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlciwgY29sdW1uOiBzdGFydENvbHVtbiAtIG4gfSk7XG5cdFx0Y29uc3QgYmVmb3JlUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBhZnRlclJhbmdlID0gbmV3IFJhbmdlKGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiwgZW5kTGluZU51bWJlciwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXG5cdFx0Y29uc3QgYmVmb3JlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKGJlZm9yZVJhbmdlKS5yZXBsYWNlKC9eXFxzKy8sICcnKTtcblx0XHRjb25zdCBpbnNpZGUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdGNvbnN0IGFmdGVyID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKGFmdGVyUmFuZ2UpLnJlcGxhY2UoL1xccyskLywgJycpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHZhbHVlOiBiZWZvcmUgKyBpbnNpZGUgKyBhZnRlcixcblx0XHRcdGhpZ2hsaWdodDogeyBzdGFydDogYmVmb3JlLmxlbmd0aCwgZW5kOiBiZWZvcmUubGVuZ3RoICsgaW5zaWRlLmxlbmd0aCB9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmlsZVJlZmVyZW5jZXMgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgY2hpbGRyZW46IE9uZVJlZmVyZW5jZVtdID0gW107XG5cblx0cHJpdmF0ZSBfcHJldmlld3MgPSBuZXcgUmVzb3VyY2VNYXA8RmlsZVByZXZpZXc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcGFyZW50OiBSZWZlcmVuY2VzTW9kZWwsXG5cdFx0cmVhZG9ubHkgdXJpOiBVUklcblx0KSB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fcHJldmlld3MudmFsdWVzKCkpO1xuXHRcdHRoaXMuX3ByZXZpZXdzLmNsZWFyKCk7XG5cdH1cblxuXHRnZXRQcmV2aWV3KGNoaWxkOiBPbmVSZWZlcmVuY2UpOiBGaWxlUHJldmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpZXdzLmdldChjaGlsZC51cmkpO1xuXHR9XG5cblx0Z2V0IGFyaWFNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGVuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0aWYgKGxlbiA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcmlhLmZpbGVSZWZlcmVuY2VzLjEnLCBcIjEgc3ltYm9sIGluIHswfSwgZnVsbCBwYXRoIHsxfVwiLCBiYXNlbmFtZSh0aGlzLnVyaSksIHRoaXMudXJpLmZzUGF0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYS5maWxlUmVmZXJlbmNlcy5OJywgXCJ7MH0gc3ltYm9scyBpbiB7MX0sIGZ1bGwgcGF0aCB7Mn1cIiwgbGVuLCBiYXNlbmFtZSh0aGlzLnVyaSksIHRoaXMudXJpLmZzUGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZSh0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlKTogUHJvbWlzZTxGaWxlUmVmZXJlbmNlcz4ge1xuXHRcdGlmICh0aGlzLl9wcmV2aWV3cy5zaXplICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAodGhpcy5fcHJldmlld3MuaGFzKGNoaWxkLnVyaSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2hpbGQudXJpKTtcblx0XHRcdFx0dGhpcy5fcHJldmlld3Muc2V0KGNoaWxkLnVyaSwgbmV3IEZpbGVQcmV2aWV3KHJlZikpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZWZlcmVuY2VzTW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGlua3M6IExvY2F0aW9uTGlua1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZTogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IGdyb3VwczogRmlsZVJlZmVyZW5jZXNbXSA9IFtdO1xuXHRyZWFkb25seSByZWZlcmVuY2VzOiBPbmVSZWZlcmVuY2VbXSA9IFtdO1xuXG5cdHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlZmVyZW5jZVJhbmdlID0gbmV3IEVtaXR0ZXI8T25lUmVmZXJlbmNlPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlZmVyZW5jZVJhbmdlOiBFdmVudDxPbmVSZWZlcmVuY2U+ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWZlcmVuY2VSYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcihsaW5rczogTG9jYXRpb25MaW5rW10sIHRpdGxlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9saW5rcyA9IGxpbmtzO1xuXHRcdHRoaXMuX3RpdGxlID0gdGl0bGU7XG5cblx0XHQvLyBncm91cGluZyBhbmQgc29ydGluZ1xuXHRcdGNvbnN0IFtwcm92aWRlcnNGaXJzdF0gPSBsaW5rcztcblx0XHRsaW5rcy5zb3J0KFJlZmVyZW5jZXNNb2RlbC5fY29tcGFyZVJlZmVyZW5jZXMpO1xuXG5cdFx0bGV0IGN1cnJlbnQ6IEZpbGVSZWZlcmVuY2VzIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0aWYgKCFjdXJyZW50IHx8ICFleHRVcmkuaXNFcXVhbChjdXJyZW50LnVyaSwgbGluay51cmksIHRydWUpKSB7XG5cdFx0XHRcdC8vIG5ldyBncm91cFxuXHRcdFx0XHRjdXJyZW50ID0gbmV3IEZpbGVSZWZlcmVuY2VzKHRoaXMsIGxpbmsudXJpKTtcblx0XHRcdFx0dGhpcy5ncm91cHMucHVzaChjdXJyZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYXBwZW5kLCBjaGVjayBmb3IgZXF1YWxpdHkgZmlyc3QhXG5cdFx0XHRpZiAoY3VycmVudC5jaGlsZHJlbi5sZW5ndGggPT09IDAgfHwgUmVmZXJlbmNlc01vZGVsLl9jb21wYXJlUmVmZXJlbmNlcyhsaW5rLCBjdXJyZW50LmNoaWxkcmVuW2N1cnJlbnQuY2hpbGRyZW4ubGVuZ3RoIC0gMV0pICE9PSAwKSB7XG5cblx0XHRcdFx0Y29uc3Qgb25lUmVmID0gbmV3IE9uZVJlZmVyZW5jZShcblx0XHRcdFx0XHRwcm92aWRlcnNGaXJzdCA9PT0gbGluayxcblx0XHRcdFx0XHRjdXJyZW50LFxuXHRcdFx0XHRcdGxpbmssXG5cdFx0XHRcdFx0cmVmID0+IHRoaXMuX29uRGlkQ2hhbmdlUmVmZXJlbmNlUmFuZ2UuZmlyZShyZWYpXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMucmVmZXJlbmNlcy5wdXNoKG9uZVJlZik7XG5cdFx0XHRcdGN1cnJlbnQuY2hpbGRyZW4ucHVzaChvbmVSZWYpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLmdyb3Vwcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWZlcmVuY2VSYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5ncm91cHMubGVuZ3RoID0gMDtcblx0fVxuXG5cdGNsb25lKCk6IFJlZmVyZW5jZXNNb2RlbCB7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwodGhpcy5fbGlua3MsIHRoaXMuX3RpdGxlKTtcblx0fVxuXG5cdGdldCB0aXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90aXRsZTtcblx0fVxuXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdyb3Vwcy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRnZXQgYXJpYU1lc3NhZ2UoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5pc0VtcHR5KSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWEucmVzdWx0LjAnLCBcIk5vIHJlc3VsdHMgZm91bmRcIik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnJlZmVyZW5jZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWEucmVzdWx0LjEnLCBcIkZvdW5kIDEgc3ltYm9sIGluIHswfVwiLCB0aGlzLnJlZmVyZW5jZXNbMF0udXJpLmZzUGF0aCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmdyb3Vwcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYS5yZXN1bHQubjEnLCBcIkZvdW5kIHswfSBzeW1ib2xzIGluIHsxfVwiLCB0aGlzLnJlZmVyZW5jZXMubGVuZ3RoLCB0aGlzLmdyb3Vwc1swXS51cmkuZnNQYXRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcmlhLnJlc3VsdC5ubScsIFwiRm91bmQgezB9IHN5bWJvbHMgaW4gezF9IGZpbGVzXCIsIHRoaXMucmVmZXJlbmNlcy5sZW5ndGgsIHRoaXMuZ3JvdXBzLmxlbmd0aCk7XG5cdFx0fVxuXHR9XG5cblx0bmV4dE9yUHJldmlvdXNSZWZlcmVuY2UocmVmZXJlbmNlOiBPbmVSZWZlcmVuY2UsIG5leHQ6IGJvb2xlYW4pOiBPbmVSZWZlcmVuY2Uge1xuXG5cdFx0Y29uc3QgeyBwYXJlbnQgfSA9IHJlZmVyZW5jZTtcblxuXHRcdGxldCBpZHggPSBwYXJlbnQuY2hpbGRyZW4uaW5kZXhPZihyZWZlcmVuY2UpO1xuXHRcdGNvbnN0IGNoaWxkQ291bnQgPSBwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdGNvbnN0IGdyb3VwQ291bnQgPSBwYXJlbnQucGFyZW50Lmdyb3Vwcy5sZW5ndGg7XG5cblx0XHRpZiAoZ3JvdXBDb3VudCA9PT0gMSB8fCBuZXh0ICYmIGlkeCArIDEgPCBjaGlsZENvdW50IHx8ICFuZXh0ICYmIGlkeCA+IDApIHtcblx0XHRcdC8vIGN5Y2xpbmcgd2l0aGluIG9uZSBmaWxlXG5cdFx0XHRpZiAobmV4dCkge1xuXHRcdFx0XHRpZHggPSAoaWR4ICsgMSkgJSBjaGlsZENvdW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWR4ID0gKGlkeCArIGNoaWxkQ291bnQgLSAxKSAlIGNoaWxkQ291bnQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFyZW50LmNoaWxkcmVuW2lkeF07XG5cdFx0fVxuXG5cdFx0aWR4ID0gcGFyZW50LnBhcmVudC5ncm91cHMuaW5kZXhPZihwYXJlbnQpO1xuXHRcdGlmIChuZXh0KSB7XG5cdFx0XHRpZHggPSAoaWR4ICsgMSkgJSBncm91cENvdW50O1xuXHRcdFx0cmV0dXJuIHBhcmVudC5wYXJlbnQuZ3JvdXBzW2lkeF0uY2hpbGRyZW5bMF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlkeCA9IChpZHggKyBncm91cENvdW50IC0gMSkgJSBncm91cENvdW50O1xuXHRcdFx0cmV0dXJuIHBhcmVudC5wYXJlbnQuZ3JvdXBzW2lkeF0uY2hpbGRyZW5bcGFyZW50LnBhcmVudC5ncm91cHNbaWR4XS5jaGlsZHJlbi5sZW5ndGggLSAxXTtcblx0XHR9XG5cdH1cblxuXHRuZWFyZXN0UmVmZXJlbmNlKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBQb3NpdGlvbik6IE9uZVJlZmVyZW5jZSB8IHVuZGVmaW5lZCB7XG5cblx0XHRjb25zdCBuZWFyZXN0ID0gdGhpcy5yZWZlcmVuY2VzLm1hcCgocmVmLCBpZHgpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkeCxcblx0XHRcdFx0cHJlZml4TGVuOiBzdHJpbmdzLmNvbW1vblByZWZpeExlbmd0aChyZWYudXJpLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRvZmZzZXREaXN0OiBNYXRoLmFicyhyZWYucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gcG9zaXRpb24ubGluZU51bWJlcikgKiAxMDAgKyBNYXRoLmFicyhyZWYucmFuZ2Uuc3RhcnRDb2x1bW4gLSBwb3NpdGlvbi5jb2x1bW4pXG5cdFx0XHR9O1xuXHRcdH0pLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLnByZWZpeExlbiA+IGIucHJlZml4TGVuKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH0gZWxzZSBpZiAoYS5wcmVmaXhMZW4gPCBiLnByZWZpeExlbikge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH0gZWxzZSBpZiAoYS5vZmZzZXREaXN0IDwgYi5vZmZzZXREaXN0KSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH0gZWxzZSBpZiAoYS5vZmZzZXREaXN0ID4gYi5vZmZzZXREaXN0KSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0fSlbMF07XG5cblx0XHRpZiAobmVhcmVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVmZXJlbmNlc1tuZWFyZXN0LmlkeF07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWZlcmVuY2VBdChyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogUG9zaXRpb24pOiBPbmVSZWZlcmVuY2UgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHRoaXMucmVmZXJlbmNlcykge1xuXHRcdFx0aWYgKHJlZi51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRpZiAoUmFuZ2UuY29udGFpbnNQb3NpdGlvbihyZWYucmFuZ2UsIHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiByZWY7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZpcnN0UmVmZXJlbmNlKCk6IE9uZVJlZmVyZW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgdGhpcy5yZWZlcmVuY2VzKSB7XG5cdFx0XHRpZiAocmVmLmlzUHJvdmlkZXJGaXJzdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVmO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZWZlcmVuY2VzWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbXBhcmVSZWZlcmVuY2VzKGE6IExvY2F0aW9uLCBiOiBMb2NhdGlvbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIGV4dFVyaS5jb21wYXJlKGEudXJpLCBiLnVyaSkgfHwgUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBRS9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBd0M7QUFDakQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxVQUFVLGNBQWM7QUFDakMsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsaUJBQWlCO0FBRzFCLFNBQWlCLGFBQWE7QUFHOUIsU0FBUyxnQkFBZ0I7QUFFbEIsTUFBTSxhQUFhO0FBQUEsRUFNekIsWUFDVSxpQkFDQSxRQUNBLE1BQ0QsZ0JBQ1A7QUFKUTtBQUNBO0FBQ0E7QUFDRDtBQVJULFNBQVMsS0FBYSxpQkFBaUIsT0FBTztBQUFBLEVBUzFDO0FBQUEsRUFFSixJQUFJLE1BQU07QUFDVCxXQUFPLEtBQUssS0FBSztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxJQUFJLFFBQWdCO0FBQ25CLFdBQU8sS0FBSyxVQUFVLEtBQUssS0FBSyx3QkFBd0IsS0FBSyxLQUFLO0FBQUEsRUFDbkU7QUFBQSxFQUVBLElBQUksTUFBTSxPQUFlO0FBQ3hCLFNBQUssU0FBUztBQUNkLFNBQUssZUFBZSxJQUFJO0FBQUEsRUFDekI7QUFBQSxFQUVBLElBQUksY0FBc0I7QUFFekIsVUFBTSxVQUFVLEtBQUssT0FBTyxXQUFXLElBQUksR0FBRyxRQUFRLEtBQUssS0FBSztBQUVoRSxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFBcUI7QUFBQSxRQUNyQixTQUFTLEtBQUssR0FBRztBQUFBLFFBQUcsS0FBSyxNQUFNO0FBQUEsUUFBaUIsS0FBSyxNQUFNO0FB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
