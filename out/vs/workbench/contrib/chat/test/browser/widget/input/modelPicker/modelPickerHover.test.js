import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { NullOpenerService } from "../../../../../../../../platform/opener/test/common/nullOpenerService.js";
import { getModelHoverContent } from "../../../../../browser/widget/input/modelPicker/modelPickerHover.js";
function createModel(id, name) {
  return {
    identifier: `copilot-${id}`,
    metadata: {
      id,
      name,
      vendor: "copilot",
      version: id,
      family: "copilot",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {}
    }
  };
}
suite("ModelPickerHover", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("non-positive promo models have no promo hover presentation", () => {
    const results = [0, -10].map((discountPercent) => {
      const model = createModel(`discount-${discountPercent}`, `Discount ${discountPercent}`);
      model.metadata = {
        ...model.metadata,
        category: "powerful",
        priceCategory: "high",
        promo: { id: `test-promo-${discountPercent}`, discountPercent, endsAt: "2026-07-20T23:59:59Z", message: "Do not render this text" }
      };
      const hover = getModelHoverContent(model, false, void 0, NullOpenerService);
      assert.ok(hover);
      disposables.add(hover.disposable);
      return {
        discountPercent,
        category: hover.element.querySelector(".chat-model-hover-category")?.textContent,
        badges: Array.from(hover.element.querySelectorAll(".chat-model-hover-price-badge"), (element) => element.textContent),
        promoText: hover.element.querySelector(".chat-model-hover-promo-text")?.textContent
      };
    });
    assert.deepStrictEqual(results, [
      { discountPercent: 0, category: "Powerful", badges: ["High cost"], promoText: void 0 },
      { discountPercent: -10, category: "Powerful", badges: ["High cost"], promoText: void 0 }
    ]);
  });
  test("promo hover text omits the end date when the promo has none", () => {
    const results = ["2026-07-20T23:59:59Z", "not a date", void 0].map((endsAt) => {
      const model = createModel(`promo-${endsAt}`, `Promo ${endsAt}`);
      model.metadata = {
        ...model.metadata,
        promo: { id: `test-promo-${endsAt}`, discountPercent: 20, endsAt, message: "Limited time offer" }
      };
      const hover = getModelHoverContent(model, false, void 0, NullOpenerService);
      assert.ok(hover);
      disposables.add(hover.disposable);
      const promoText = hover.element.querySelector(".chat-model-hover-promo-text")?.textContent?.trim();
      return promoText?.replace(/Ends .+\.$/, "Ends <date>.");
    });
    assert.deepStrictEqual(results, [
      "Limited time offer Ends <date>.",
      "Limited time offer",
      "Limited time offer"
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFBpY2tlckhvdmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL3Rlc3QvY29tbW9uL251bGxPcGVuZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldE1vZGVsSG92ZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJIb3Zlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTW9kZWwoaWQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiBgY29waWxvdC0ke2lkfWAsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZSxcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0dmVyc2lvbjogaWQsXG5cdFx0XHRmYW1pbHk6ICdjb3BpbG90Jyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0fTtcbn1cblxuc3VpdGUoJ01vZGVsUGlja2VySG92ZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdub24tcG9zaXRpdmUgcHJvbW8gbW9kZWxzIGhhdmUgbm8gcHJvbW8gaG92ZXIgcHJlc2VudGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBbMCwgLTEwXS5tYXAoZGlzY291bnRQZXJjZW50ID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoYGRpc2NvdW50LSR7ZGlzY291bnRQZXJjZW50fWAsIGBEaXNjb3VudCAke2Rpc2NvdW50UGVyY2VudH1gKTtcblx0XHRcdG1vZGVsLm1ldGFkYXRhID0ge1xuXHRcdFx0XHQuLi5tb2RlbC5tZXRhZGF0YSxcblx0XHRcdFx0Y2F0ZWdvcnk6ICdwb3dlcmZ1bCcsXG5cdFx0XHRcdHByaWNlQ2F0ZWdvcnk6ICdoaWdoJyxcblx0XHRcdFx0cHJvbW86IHsgaWQ6IGB0ZXN0LXByb21vLSR7ZGlzY291bnRQZXJjZW50fWAsIGRpc2NvdW50UGVyY2VudCwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnRG8gbm90IHJlbmRlciB0aGlzIHRleHQnIH0sXG5cdFx0XHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBnZXRNb2RlbEhvdmVyQ29udGVudChtb2RlbCwgZmFsc2UsIHVuZGVmaW5lZCwgTnVsbE9wZW5lclNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChob3Zlci5kaXNwb3NhYmxlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc2NvdW50UGVyY2VudCxcblx0XHRcdFx0Y2F0ZWdvcnk6IGhvdmVyLmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmNoYXQtbW9kZWwtaG92ZXItY2F0ZWdvcnknKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGJhZGdlczogQXJyYXkuZnJvbShob3Zlci5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LW1vZGVsLWhvdmVyLXByaWNlLWJhZGdlJyksIGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCksXG5cdFx0XHRcdHByb21vVGV4dDogaG92ZXIuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuY2hhdC1tb2RlbC1ob3Zlci1wcm9tby10ZXh0Jyk/LnRleHRDb250ZW50LFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgW1xuXHRcdFx0eyBkaXNjb3VudFBlcmNlbnQ6IDAsIGNhdGVnb3J5OiAnUG93ZXJmdWwnLCBiYWRnZXM6IFsnSGlnaCBjb3N0J10sIHByb21vVGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGRpc2NvdW50UGVyY2VudDogLTEwLCBjYXRlZ29yeTogJ1Bvd2VyZnVsJywgYmFkZ2VzOiBbJ0hpZ2ggY29zdCddLCBwcm9tb1RleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tbyBob3ZlciB0ZXh0IG9taXRzIHRoZSBlbmQgZGF0ZSB3aGVuIHRoZSBwcm9tbyBoYXMgbm9uZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gWycyMDI2LTA3LTIwVDIzOjU5OjU5WicsICdub3QgYSBkYXRlJywgdW5kZWZpbmVkXS5tYXAoZW5kc0F0ID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoYHByb21vLSR7ZW5kc0F0fWAsIGBQcm9tbyAke2VuZHNBdH1gKTtcblx0XHRcdG1vZGVsLm1ldGFkYXRhID0ge1xuXHRcdFx0XHQuLi5tb2RlbC5tZXRhZGF0YSxcblx0XHRcdFx0cHJvbW86IHsgaWQ6IGB0ZXN0LXByb21vLSR7ZW5kc0F0fWAsIGRpc2NvdW50UGVyY2VudDogMjAsIGVuZHNBdCwgbWVzc2FnZTogJ0xpbWl0ZWQgdGltZSBvZmZlcicgfSxcblx0XHRcdH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0XHRjb25zdCBob3ZlciA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsLCBmYWxzZSwgdW5kZWZpbmVkLCBOdWxsT3BlbmVyU2VydmljZSk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGhvdmVyLmRpc3Bvc2FibGUpO1xuXHRcdFx0Y29uc3QgcHJvbW9UZXh0ID0gaG92ZXIuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuY2hhdC1tb2RlbC1ob3Zlci1wcm9tby10ZXh0Jyk/LnRleHRDb250ZW50Py50cmltKCk7XG5cdFx0XHQvLyBUaGUgZm9ybWF0dGVkIGRhdGUgaXMgbG9jYWxlL3RpbWV6b25lIGRlcGVuZGVudCwgc28gb25seSBhc3NlcnQgb24gdGhlIHNlbnRlbmNlIGFyb3VuZCBpdC5cblx0XHRcdHJldHVybiBwcm9tb1RleHQ/LnJlcGxhY2UoL0VuZHMgLitcXC4kLywgJ0VuZHMgPGRhdGU+LicpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLCBbXG5cdFx0XHQnTGltaXRlZCB0aW1lIG9mZmVyIEVuZHMgPGRhdGU+LicsXG5cdFx0XHQnTGltaXRlZCB0aW1lIG9mZmVyJyxcblx0XHRcdCdMaW1pdGVkIHRpbWUgb2ZmZXInLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsWUFBWSxJQUFZLE1BQXVEO0FBQ3ZGLFNBQU87QUFBQSxJQUNOLFlBQVksV0FBVyxFQUFFO0FBQUEsSUFDekIsVUFBVTtBQUFBLE1BQ1Q7QUFBQSxNQUNBO0FBQUEsTUFDQSxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixpQkFBaUI7QUFBQSxNQUNqQixzQkFBc0IsQ0FBQztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxvQkFBb0IsTUFBTTtBQUUvQixRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssOERBQThELE1BQU07QUFDeEUsVUFBTSxVQUFVLENBQUMsR0FBRyxHQUFHLEVBQUUsSUFBSSxxQkFBbUI7QUFDL0MsWUFBTSxRQUFRLFlBQVksWUFBWSxlQUFlLElBQUksWUFBWSxlQUFlLEVBQUU7QUFDdEYsWUFBTSxXQUFXO0FBQUEsUUFDaEIsR0FBRyxNQUFNO0FBQUEsUUFDVCxVQUFVO0FBQUEsUUFDVixlQUFlO0FBQUEsUUFDZixPQUFPLEVBQUUsSUFBSSxjQUFjLGVBQWUsSUFBSSxpQkFBaUIsUUFBUSx3QkFBd0IsU0FBUywwQkFBMEI7QUFBQSxNQUNuSTtBQUNBLFlBQU0sUUFBUSxxQkFBcUIsT0FBTyxPQUFPLFFBQVcsaUJBQWlCO0FBQzdFLGFBQU8sR0FBRyxLQUFLO0FBQ2Ysa0JBQVksSUFBSSxNQUFNLFVBQVU7QUFDaEMsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLFVBQVUsTUFBTSxRQUFRLGNBQWMsNEJBQTRCLEdBQUc7QUFBQSxRQUNyRSxRQUFRLE1BQU0sS0FBSyxNQUFNLFFBQVEsaUJBQWlCLCtCQUErQixHQUFHLGFBQVcsUUFBUSxXQUFXO0FBQUEsUUFDbEgsV0FBVyxNQUFNLFFBQVEsY0FBYyw4QkFBOEIsR0FBRztBQUFBLE1BQ3pFO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQy9CLEVBQUUsaUJBQWlCLEdBQUcsVUFBVSxZQUFZLFFBQVEsQ0FBQyxXQUFXLEdBQUcsV0FBVyxPQUFVO0FBQUEsTUFDeEYsRUFBRSxpQkFBaUIsS0FBSyxVQUFVLFlBQVksUUFBUSxDQUFDLFdBQVcsR0FBRyxXQUFXLE9BQVU7QUFBQSxJQUMzRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxVQUFNLFVBQVUsQ0FBQyx3QkFBd0IsY0FBYyxNQUFTLEVBQUUsSUFBSSxZQUFVO0FBQy9FLFlBQU0sUUFBUSxZQUFZLFNBQVMsTUFBTSxJQUFJLFNBQVMsTUFBTSxFQUFFO0FBQzlELFlBQU0sV0FBVztBQUFBLFFBQ2hCLEdBQUcsTUFBTTtBQUFBLFFBQ1QsT0FBTyxFQUFFLElBQUksY0FBYyxNQUFNLElBQUksaUJBQWlCLElBQUksUUFBUSxTQUFTLHFCQUFxQjtBQUFBLE1BQ2pHO0FBQ0EsWUFBTSxRQUFRLHFCQUFxQixPQUFPLE9BQU8sUUFBVyxpQkFBaUI7QUFDN0UsYUFBTyxHQUFHLEtBQUs7QUFDZixrQkFBWSxJQUFJLE1BQU0sVUFBVTtBQUNoQyxZQUFNLFlBQVksTUFBTSxRQUFRLGNBQWMsOEJBQThCLEdBQUcsYUFBYSxLQUFLO0FBRWpHLGFBQU8sV0FBVyxRQUFRLGNBQWMsY0FBYztBQUFBLElBQ3ZELENBQUM7QUFFRCxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
