import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { WatchingProblemCollector } from "../../common/problemCollectors.js";
import { ApplyToKind, FileLocationKind } from "../../common/problemMatcher.js";
class CountingRegExp extends RegExp {
  constructor() {
    super(...arguments);
    this.count = 0;
  }
  exec(value) {
    this.count++;
    return super.exec(value);
  }
}
suite("ProblemCollectors", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("does not retain replayed lines when a model is removed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const modelRemoved = store.add(new Emitter());
    const modelService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onModelAdded = Event.None;
        this.onModelRemoved = modelRemoved.event;
      }
      getModels() {
        return [];
      }
    }();
    const markerChanged = store.add(new Emitter());
    const markerService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onMarkerChanged = markerChanged.event;
      }
      read() {
        return [];
      }
    }();
    const problemPattern = new CountingRegExp("^never$");
    const problemMatcher = {
      owner: "test",
      applyTo: ApplyToKind.allDocuments,
      fileLocation: FileLocationKind.Absolute,
      pattern: { regexp: problemPattern },
      watching: {
        activeOnStart: true,
        beginsPattern: { regexp: /^begin$/ },
        endsPattern: { regexp: /^end$/ }
      }
    };
    const collector = store.add(new WatchingProblemCollector([problemMatcher], markerService, modelService));
    const resource = URI.parse("test:///file.ts");
    const model = new class extends mock() {
      constructor() {
        super(...arguments);
        this.uri = resource;
      }
    }();
    collector.processLine("output");
    await timeout(0);
    const matchCounts = [problemPattern.count];
    for (let i = 0; i < 2; i++) {
      modelRemoved.fire(model);
      markerChanged.fire([resource]);
      await timeout(600);
      matchCounts.push(problemPattern.count);
    }
    assert.deepStrictEqual(matchCounts, [1, 2, 3]);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFx0ZXN0XFxjb21tb25cXHByb2JsZW1Db2xsZWN0b3JzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgV2F0Y2hpbmdQcm9ibGVtQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb2JsZW1Db2xsZWN0b3JzLmpzJztcbmltcG9ydCB7IEFwcGx5VG9LaW5kLCBGaWxlTG9jYXRpb25LaW5kLCBQcm9ibGVtTWF0Y2hlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5cbmNsYXNzIENvdW50aW5nUmVnRXhwIGV4dGVuZHMgUmVnRXhwIHtcblx0Y291bnQgPSAwO1xuXG5cdG92ZXJyaWRlIGV4ZWModmFsdWU6IHN0cmluZyk6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwge1xuXHRcdHRoaXMuY291bnQrKztcblx0XHRyZXR1cm4gc3VwZXIuZXhlYyh2YWx1ZSk7XG5cdH1cbn1cblxuc3VpdGUoJ1Byb2JsZW1Db2xsZWN0b3JzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldGFpbiByZXBsYXllZCBsaW5lcyB3aGVuIGEgbW9kZWwgaXMgcmVtb3ZlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsUmVtb3ZlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJVGV4dE1vZGVsPigpKTtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25Nb2RlbEFkZGVkID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uTW9kZWxSZW1vdmVkID0gbW9kZWxSZW1vdmVkLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TW9kZWxzKCk6IElUZXh0TW9kZWxbXSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBtYXJrZXJDaGFuZ2VkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHJlYWRvbmx5IFVSSVtdPigpKTtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWFya2VyU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbk1hcmtlckNoYW5nZWQgPSBtYXJrZXJDaGFuZ2VkLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZCgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuID0gbmV3IENvdW50aW5nUmVnRXhwKCdebmV2ZXIkJyk7XG5cdFx0Y29uc3QgcHJvYmxlbU1hdGNoZXI6IFByb2JsZW1NYXRjaGVyID0ge1xuXHRcdFx0b3duZXI6ICd0ZXN0Jyxcblx0XHRcdGFwcGx5VG86IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cyxcblx0XHRcdGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSxcblx0XHRcdHBhdHRlcm46IHsgcmVnZXhwOiBwcm9ibGVtUGF0dGVybiB9LFxuXHRcdFx0d2F0Y2hpbmc6IHtcblx0XHRcdFx0YWN0aXZlT25TdGFydDogdHJ1ZSxcblx0XHRcdFx0YmVnaW5zUGF0dGVybjogeyByZWdleHA6IC9eYmVnaW4kLyB9LFxuXHRcdFx0XHRlbmRzUGF0dGVybjogeyByZWdleHA6IC9eZW5kJC8gfVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgY29sbGVjdG9yID0gc3RvcmUuYWRkKG5ldyBXYXRjaGluZ1Byb2JsZW1Db2xsZWN0b3IoW3Byb2JsZW1NYXRjaGVyXSwgbWFya2VyU2VydmljZSwgbW9kZWxTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZmlsZS50cycpO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dE1vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHVyaSA9IHJlc291cmNlO1xuXHRcdH07XG5cblx0XHRjb2xsZWN0b3IucHJvY2Vzc0xpbmUoJ291dHB1dCcpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgbWF0Y2hDb3VudHMgPSBbcHJvYmxlbVBhdHRlcm4uY291bnRdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyOyBpKyspIHtcblx0XHRcdG1vZGVsUmVtb3ZlZC5maXJlKG1vZGVsKTtcblx0XHRcdG1hcmtlckNoYW5nZWQuZmlyZShbcmVzb3VyY2VdKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNjAwKTtcblx0XHRcdG1hdGNoQ291bnRzLnB1c2gocHJvYmxlbVBhdHRlcm4uY291bnQpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWF0Y2hDb3VudHMsIFsxLCAyLCAzXSk7XG5cdH0pKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBSXhELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSx3QkFBd0M7QUFFOUQsTUFBTSx1QkFBdUIsT0FBTztBQUFBLEVBQXBDO0FBQUE7QUFDQyxpQkFBUTtBQUFBO0FBQUEsRUFFQyxLQUFLLE9BQXVDO0FBQ3BELFNBQUs7QUFDTCxXQUFPLE1BQU0sS0FBSyxLQUFLO0FBQUEsRUFDeEI7QUFDRDtBQUVBLE1BQU0scUJBQXFCLE1BQU07QUFDaEMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLDBEQUEwRCxNQUFNLG1CQUF5QixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDbEksVUFBTSxlQUFlLE1BQU0sSUFBSSxJQUFJLFFBQW9CLENBQUM7QUFDeEQsVUFBTSxlQUFlLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsTUFBcEM7QUFBQTtBQUN4QixhQUFrQixlQUFlLE1BQU07QUFDdkMsYUFBa0IsaUJBQWlCLGFBQWE7QUFBQTtBQUFBLE1BQ3ZDLFlBQTBCO0FBQUUsZUFBTyxDQUFDO0FBQUEsTUFBRztBQUFBLElBQ2pEO0FBRUEsVUFBTSxnQkFBZ0IsTUFBTSxJQUFJLElBQUksUUFBd0IsQ0FBQztBQUM3RCxVQUFNLGdCQUFnQixJQUFJLGNBQWMsS0FBcUIsRUFBRTtBQUFBLE1BQXJDO0FBQUE7QUFDekIsYUFBa0Isa0JBQWtCLGNBQWM7QUFBQTtBQUFBLE1BQ3pDLE9BQU87QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHO0FBQUEsSUFDOUI7QUFFQSxVQUFNLGlCQUFpQixJQUFJLGVBQWUsU0FBUztBQUNuRCxVQUFNLGlCQUFpQztBQUFBLE1BQ3RDLE9BQU87QUFBQSxNQUNQLFNBQVMsWUFBWTtBQUFBLE1BQ3JCLGNBQWMsaUJBQWlCO0FBQUEsTUFDL0IsU0FBUyxFQUFFLFFBQVEsZUFBZTtBQUFBLE1BQ2xDLFVBQVU7QUFBQSxRQUNULGVBQWU7QUFBQSxRQUNmLGVBQWUsRUFBRSxRQUFRLFVBQVU7QUFBQSxRQUNuQyxhQUFhLEVBQUUsUUFBUSxRQUFRO0FBQUEsTUFDaEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxZQUFZLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDLGNBQWMsR0FBRyxlQUFlLFlBQVksQ0FBQztBQUN2RyxVQUFNLFdBQVcsSUFBSSxNQUFNLGlCQUFpQjtBQUM1QyxVQUFNLFFBQVEsSUFBSSxjQUFjLEtBQWlCLEVBQUU7QUFBQSxNQUFqQztBQUFBO0FBQ2pCLGFBQWtCLE1BQU07QUFBQTtBQUFBLElBQ3pCO0FBRUEsY0FBVSxZQUFZLFFBQVE7QUFDOUIsVUFBTSxRQUFRLENBQUM7QUFDZixVQUFNLGNBQWMsQ0FBQyxlQUFlLEtBQUs7QUFFekMsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsbUJBQWEsS0FBSyxLQUFLO0FBQ3ZCLG9CQUFjLEtBQUssQ0FBQyxRQUFRLENBQUM7QUFDN0IsWUFBTSxRQUFRLEdBQUc7QUFDakIsa0JBQVksS0FBSyxlQUFlLEtBQUs7QUFBQSxJQUN0QztBQUVBLFdBQU8sZ0JBQWdCLGFBQWEsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDOUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
