import assert from "assert";
import { PlanReviewFeedbackService } from "../../browser/planReviewFeedback/planReviewFeedbackService.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AgentEditorCommentsBridge } from "../../../../services/agentEditorComments/common/agentEditorComments.js";
import { Event } from "../../../../../base/common/event.js";
function createService(store) {
  return store.add(new PlanReviewFeedbackService(store.add(new AgentEditorCommentsBridge())));
}
function feedbackSummary(items) {
  return items.map((f) => `${f.line}:${f.column}`);
}
function createRegistration(overrides) {
  return {
    sessionResource: URI.parse("test://session/1"),
    actions: [{ id: "approve", label: "Approve", default: true }],
    hasOverallFeedback: () => false,
    submitFeedback: async () => true,
    submitAction: async () => {
    },
    reject: async () => {
    },
    ...overrides
  };
}
suite("PlanReviewFeedbackService - Ordering", () => {
  const store = new DisposableStore();
  let service;
  let planUri;
  setup(() => {
    service = createService(store);
    planUri = URI.parse("file:///plan.md");
    store.add(service.registerPlanReview(planUri, createRegistration()));
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("items sorted by line number", () => {
    service.addFeedback(planUri, 20, 1, "line 20");
    service.addFeedback(planUri, 5, 1, "line 5");
    service.addFeedback(planUri, 10, 1, "line 10");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
      "5:1",
      "10:1",
      "20:1"
    ]);
  });
  test("items sorted by line then column", () => {
    service.addFeedback(planUri, 10, 20, "col 20");
    service.addFeedback(planUri, 10, 5, "col 5");
    service.addFeedback(planUri, 10, 10, "col 10");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
      "10:5",
      "10:10",
      "10:20"
    ]);
  });
  test("removing feedback preserves ordering", () => {
    const id1 = service.addFeedback(planUri, 30, 1, "line 30");
    service.addFeedback(planUri, 10, 1, "line 10");
    service.addFeedback(planUri, 20, 1, "line 20");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
      "10:1",
      "20:1",
      "30:1"
    ]);
    service.removeFeedback(planUri, id1);
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
      "10:1",
      "20:1"
    ]);
  });
  test("same line number items are stable", () => {
    const id1 = service.addFeedback(planUri, 10, 1, "first");
    const id2 = service.addFeedback(planUri, 10, 1, "second");
    const items = service.getFeedback(planUri);
    assert.strictEqual(items[0].id, id1);
    assert.strictEqual(items[1].id, id2);
  });
  test("clear removes all items", () => {
    service.addFeedback(planUri, 1, 1, "a");
    service.addFeedback(planUri, 2, 1, "b");
    service.addFeedback(planUri, 3, 1, "c");
    assert.strictEqual(service.getFeedback(planUri).length, 3);
    service.clearFeedback(planUri);
    assert.strictEqual(service.getFeedback(planUri).length, 0);
  });
  test("update feedback changes text", () => {
    const id = service.addFeedback(planUri, 10, 1, "original");
    service.updateFeedback(planUri, id, "updated");
    const items = service.getFeedback(planUri);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].text, "updated");
    assert.strictEqual(items[0].line, 10);
  });
  test("comments preserve their selection range", () => {
    const range = {
      startLineNumber: 5,
      startColumn: 2,
      endLineNumber: 7,
      endColumn: 12
    };
    service.addComment(planUri, range, "selected text");
    assert.deepStrictEqual(service.getComments(planUri), [{
      id: service.getFeedback(planUri)[0].id,
      resource: planUri,
      range,
      body: "selected text"
    }]);
  });
});
suite("PlanReviewFeedbackService - Navigation", () => {
  const store = new DisposableStore();
  let service;
  let planUri;
  setup(() => {
    service = createService(store);
    planUri = URI.parse("file:///plan.md");
    store.add(service.registerPlanReview(planUri, createRegistration()));
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("navigation follows sorted order", () => {
    service.addFeedback(planUri, 20, 1, "line 20");
    service.addFeedback(planUri, 5, 1, "line 5");
    service.addFeedback(planUri, 10, 1, "line 10");
    const first = service.getNextFeedback(planUri, true);
    assert.strictEqual(first.line, 5);
    const second = service.getNextFeedback(planUri, true);
    assert.strictEqual(second.line, 10);
    const third = service.getNextFeedback(planUri, true);
    assert.strictEqual(third.line, 20);
    const fourth = service.getNextFeedback(planUri, true);
    assert.strictEqual(fourth.line, 5);
  });
  test("navigation backwards", () => {
    service.addFeedback(planUri, 5, 1, "line 5");
    service.addFeedback(planUri, 10, 1, "line 10");
    service.addFeedback(planUri, 20, 1, "line 20");
    const first = service.getNextFeedback(planUri, false);
    assert.strictEqual(first.line, 20);
    const second = service.getNextFeedback(planUri, false);
    assert.strictEqual(second.line, 10);
    const third = service.getNextFeedback(planUri, false);
    assert.strictEqual(third.line, 5);
    const fourth = service.getNextFeedback(planUri, false);
    assert.strictEqual(fourth.line, 20);
  });
  test("navigation bearings reflect sorted position", () => {
    service.addFeedback(planUri, 20, 1, "line 20");
    service.addFeedback(planUri, 5, 1, "line 5");
    service.addFeedback(planUri, 10, 1, "line 10");
    let bearing = service.getNavigationBearing(planUri);
    assert.strictEqual(bearing.activeIdx, -1);
    assert.strictEqual(bearing.totalCount, 3);
    service.getNextFeedback(planUri, true);
    bearing = service.getNavigationBearing(planUri);
    assert.strictEqual(bearing.activeIdx, 0);
    service.getNextFeedback(planUri, true);
    bearing = service.getNavigationBearing(planUri);
    assert.strictEqual(bearing.activeIdx, 1);
    service.getNextFeedback(planUri, true);
    bearing = service.getNavigationBearing(planUri);
    assert.strictEqual(bearing.activeIdx, 2);
  });
  test("navigation returns undefined for empty feedback", () => {
    const result = service.getNextFeedback(planUri, true);
    assert.strictEqual(result, void 0);
  });
  test("setNavigationAnchor updates the anchor", () => {
    const id = service.addFeedback(planUri, 10, 1, "line 10");
    service.addFeedback(planUri, 20, 1, "line 20");
    service.setNavigationAnchor(planUri, id);
    const bearing = service.getNavigationBearing(planUri);
    assert.strictEqual(bearing.activeIdx, 0);
  });
});
suite("PlanReviewFeedbackService - Registration", () => {
  const store = new DisposableStore();
  let service;
  setup(() => {
    service = createService(store);
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("isActivePlanReview returns false before registration", () => {
    const planUri = URI.parse("file:///plan.md");
    assert.strictEqual(service.isActivePlanReview(planUri), false);
  });
  test("isActivePlanReview returns true after registration", () => {
    const planUri = URI.parse("file:///plan.md");
    store.add(service.registerPlanReview(planUri, createRegistration()));
    assert.strictEqual(service.isActivePlanReview(planUri), true);
  });
  test("isActivePlanReview returns false after dispose", () => {
    const planUri = URI.parse("file:///plan.md");
    const registration = service.registerPlanReview(planUri, createRegistration());
    assert.strictEqual(service.isActivePlanReview(planUri), true);
    registration.dispose();
    assert.strictEqual(service.isActivePlanReview(planUri), false);
  });
  test("feedback cannot be added to unregistered plan", () => {
    const planUri = URI.parse("file:///plan.md");
    const id = service.addFeedback(planUri, 1, 1, "text");
    assert.strictEqual(id, "");
    assert.strictEqual(service.getFeedback(planUri).length, 0);
  });
  test("dispose clears feedback items", () => {
    const planUri = URI.parse("file:///plan.md");
    const registration = service.registerPlanReview(planUri, createRegistration());
    service.addFeedback(planUri, 1, 1, "text");
    assert.strictEqual(service.getFeedback(planUri).length, 1);
    registration.dispose();
    assert.strictEqual(service.getFeedback(planUri).length, 0);
  });
  test("onDidChangeRegistrations fires on register and dispose", () => {
    const planUri = URI.parse("file:///plan.md");
    let fireCount = 0;
    store.add(service.onDidChangeRegistrations(() => fireCount++));
    const registration = service.registerPlanReview(planUri, createRegistration());
    assert.strictEqual(fireCount, 1);
    registration.dispose();
    assert.strictEqual(fireCount, 2);
  });
  test("comment eligibility changes when a review is registered or disposed", () => {
    const planUri = URI.parse("file:///plan.md");
    const planService = createService(store);
    let fireCount = 0;
    store.add(planService.onDidChangeComments(() => fireCount++));
    const registration = planService.registerPlanReview(planUri, createRegistration());
    registration.dispose();
    assert.strictEqual(fireCount, 2);
  });
  test("disposing a superseded registration leaves the active registration intact", () => {
    const planUri = URI.parse("file:///plan.md");
    const firstSession = URI.parse("test://session/first");
    const secondSession = URI.parse("test://session/second");
    const scopes = [];
    store.add(service.onDidChangePlanReviewScope((event) => scopes.push(`${event.active ? "active" : "inactive"}:${event.sessionResource.path.slice(1)}`)));
    const first = service.registerPlanReview(planUri, createRegistration({ sessionResource: firstSession }));
    store.add(service.registerPlanReview(planUri, createRegistration({ sessionResource: secondSession })));
    first.dispose();
    assert.deepStrictEqual({
      activeSession: service.getPlanReview(planUri)?.sessionResource.toString(),
      scopes
    }, {
      activeSession: secondSession.toString(),
      scopes: [
        "active:first",
        "inactive:first",
        "active:second"
      ]
    });
  });
  test("disposing the active registration restores the previous registration", () => {
    const planUri = URI.parse("file:///plan.md");
    const firstSession = URI.parse("test://session/first");
    const secondSession = URI.parse("test://session/second");
    const scopes = [];
    store.add(service.onDidChangePlanReviewScope((event) => scopes.push(`${event.active ? "active" : "inactive"}:${event.sessionResource.path.slice(1)}`)));
    store.add(service.registerPlanReview(planUri, createRegistration({ sessionResource: firstSession })));
    const second = service.registerPlanReview(planUri, createRegistration({ sessionResource: secondSession }));
    second.dispose();
    assert.deepStrictEqual({
      activeSession: service.getPlanReview(planUri)?.sessionResource.toString(),
      scopes
    }, {
      activeSession: firstSession.toString(),
      scopes: [
        "active:first",
        "inactive:first",
        "active:second",
        "inactive:second",
        "active:first"
      ]
    });
  });
  test("onDidChangeFeedback fires on add and remove", () => {
    const planUri = URI.parse("file:///plan.md");
    store.add(service.registerPlanReview(planUri, createRegistration()));
    let fireCount = 0;
    store.add(service.onDidChangeFeedback(() => fireCount++));
    const id = service.addFeedback(planUri, 1, 1, "text");
    assert.strictEqual(fireCount, 1);
    service.removeFeedback(planUri, id);
    assert.strictEqual(fireCount, 2);
  });
});
suite("PlanReviewFeedbackService - Submit", () => {
  const store = new DisposableStore();
  let service;
  setup(() => {
    service = createService(store);
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("submitAllFeedback delegates to the registered review", async () => {
    const planUri = URI.parse("file:///plan.md");
    let submitCount = 0;
    store.add(service.registerPlanReview(planUri, createRegistration({
      submitFeedback: async () => {
        submitCount++;
        return true;
      }
    })));
    service.addFeedback(planUri, 1, 1, "fix this");
    service.addFeedback(planUri, 45, 45, "change that");
    const didSubmit = await service.submitAllFeedback(planUri);
    assert.deepStrictEqual({ submitCount, didSubmit }, { submitCount: 1, didSubmit: true });
  });
  test("submitAllFeedback does nothing when no items", async () => {
    const planUri = URI.parse("file:///plan.md");
    let called = false;
    store.add(service.registerPlanReview(planUri, createRegistration({
      submitFeedback: async () => {
        called = true;
        return true;
      }
    })));
    await service.submitAllFeedback(planUri);
    assert.strictEqual(called, false);
  });
  test("submitAllFeedback delegates when only overall feedback exists", async () => {
    const planUri = URI.parse("file:///plan.md");
    let called = false;
    store.add(service.registerPlanReview(planUri, createRegistration({
      hasOverallFeedback: () => true,
      submitFeedback: async () => {
        called = true;
        return true;
      }
    })));
    await service.submitAllFeedback(planUri);
    assert.strictEqual(called, true);
  });
  test("submitAllFeedback returns false when the registered review does not submit", async () => {
    const planUri = URI.parse("file:///plan.md");
    store.add(service.registerPlanReview(planUri, createRegistration({
      submitFeedback: async () => false
    })));
    service.addFeedback(planUri, 1, 1, "fix this");
    assert.strictEqual(await service.submitAllFeedback(planUri), false);
  });
  test("submitPlanAction delegates the selected action", async () => {
    const planUri = URI.parse("file:///plan.md");
    const action = { id: "autopilot", label: "Implement with Autopilot" };
    let submittedAction;
    store.add(service.registerPlanReview(planUri, createRegistration({
      actions: [action],
      submitAction: async (submitted) => {
        submittedAction = submitted.id;
      }
    })));
    await service.submitPlanAction(planUri, action);
    assert.strictEqual(submittedAction, "autopilot");
  });
  test("rejectPlan delegates rejection", async () => {
    const planUri = URI.parse("file:///plan.md");
    let rejected = false;
    store.add(service.registerPlanReview(planUri, createRegistration({
      reject: async () => {
        rejected = true;
      }
    })));
    await service.rejectPlan(planUri);
    assert.strictEqual(rejected, true);
  });
});
suite("PlanReviewFeedbackService - Provider-backed navigation", () => {
  const store = new DisposableStore();
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("navigation and bearings use comments from the selected provider", () => {
    const planUri = URI.parse("file:///plan.md");
    const relatedUri = URI.parse("file:///related.ts");
    const bridge = store.add(new AgentEditorCommentsBridge());
    const service = store.add(new PlanReviewFeedbackService(bridge));
    const reveals = [];
    store.add(bridge.onDidRevealComment((event) => reveals.push(`${event.resource.toString()}:${event.id}`)));
    store.add(service.registerPlanReview(planUri, createRegistration()));
    store.add(bridge.registerProvider({
      priority: 100,
      onDidChangeComments: Event.None,
      onDidRevealComment: Event.None,
      acceptsComments: (resource) => resource.toString() === planUri.toString(),
      getComments: () => [
        { id: "plan", resource: planUri, range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 }, body: "Plan" },
        { id: "related", resource: relatedUri, range: { startLineNumber: 7, startColumn: 1, endLineNumber: 7, endColumn: 2 }, body: "Related" }
      ],
      addComment: () => {
      },
      deleteComment: () => {
      }
    }));
    const first = service.getNextFeedback(planUri, true);
    const second = service.getNextFeedback(planUri, true);
    assert.deepStrictEqual({
      first: first?.id,
      second: second?.id,
      bearing: service.getNavigationBearing(planUri),
      reveals
    }, {
      first: "plan",
      second: "related",
      bearing: { activeIdx: 1, totalCount: 2 },
      reveals: [
        `${planUri.toString()}:plan`,
        `${relatedUri.toString()}:related`
      ]
    });
  });
  test("pre-existing hidden comments remain excluded after becoming visible", () => {
    const planUri = URI.parse("file:///plan.md");
    const bridge = store.add(new AgentEditorCommentsBridge());
    const service = store.add(new PlanReviewFeedbackService(bridge));
    const comments = [];
    store.add(bridge.registerProvider({
      priority: 100,
      onDidChangeComments: Event.None,
      onDidRevealComment: Event.None,
      acceptsComments: () => true,
      getComments: () => comments,
      getCommentIds: () => ["existing"],
      addComment: () => {
      },
      deleteComment: () => {
      }
    }));
    store.add(service.registerPlanReview(planUri, createRegistration()));
    comments.push(
      { id: "existing", resource: planUri, range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 }, body: "Existing" },
      { id: "new", resource: planUri, range: { startLineNumber: 7, startColumn: 1, endLineNumber: 7, endColumn: 2 }, body: "New" }
    );
    assert.deepStrictEqual(service.getFeedback(planUri).map((item) => item.id), ["new"]);
  });
  test("submission feedback excludes and preserves comments that predate the review", () => {
    const planUri = URI.parse("file:///plan.md");
    const relatedUri = URI.parse("file:///related.ts");
    const bridge = store.add(new AgentEditorCommentsBridge());
    const service = store.add(new PlanReviewFeedbackService(bridge));
    const comments = [{
      id: "existing",
      resource: relatedUri,
      range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 },
      body: "Existing session feedback"
    }];
    const deleted = [];
    store.add(bridge.registerProvider({
      priority: 100,
      onDidChangeComments: Event.None,
      onDidRevealComment: Event.None,
      acceptsComments: (resource) => resource.toString() === planUri.toString(),
      getComments: () => comments,
      addComment: () => {
      },
      deleteComment: (_resource, id) => {
        deleted.push(id);
        const index = comments.findIndex((comment) => comment.id === id);
        if (index !== -1) {
          comments.splice(index, 1);
        }
      }
    }));
    store.add(service.registerPlanReview(planUri, createRegistration()));
    comments.push({
      id: "plan-review",
      resource: planUri,
      range: { startLineNumber: 7, startColumn: 1, endLineNumber: 7, endColumn: 2 },
      body: "Plan review feedback"
    });
    const feedback = service.getFeedback(planUri);
    service.clearFeedback(planUri);
    assert.deepStrictEqual({
      feedback: feedback.map((item) => item.id),
      deleted,
      remaining: comments.map((comment) => comment.id)
    }, {
      feedback: ["plan-review"],
      deleted: ["plan-review"],
      remaining: ["existing"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElQbGFuUmV2aWV3RmVlZGJhY2tSZWdpc3RyYXRpb24sIElQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLCBQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wbGFuUmV2aWV3RmVlZGJhY2svcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSwgSUFnZW50RWRpdG9yQ29tbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50RWRpdG9yQ29tbWVudHMvY29tbW9uL2FnZW50RWRpdG9yQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2Uoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2Uge1xuXHRyZXR1cm4gc3RvcmUuYWRkKG5ldyBQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlKHN0b3JlLmFkZChuZXcgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSgpKSkpO1xufVxuXG5mdW5jdGlvbiBmZWVkYmFja1N1bW1hcnkoaXRlbXM6IHJlYWRvbmx5IHsgbGluZTogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9W10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiBpdGVtcy5tYXAoZiA9PiBgJHtmLmxpbmV9OiR7Zi5jb2x1bW59YCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJlZ2lzdHJhdGlvbihvdmVycmlkZXM/OiBQYXJ0aWFsPElQbGFuUmV2aWV3RmVlZGJhY2tSZWdpc3RyYXRpb24+KTogSVBsYW5SZXZpZXdGZWVkYmFja1JlZ2lzdHJhdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzEnKSxcblx0XHRhY3Rpb25zOiBbeyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnLCBkZWZhdWx0OiB0cnVlIH1dLFxuXHRcdGhhc092ZXJhbGxGZWVkYmFjazogKCkgPT4gZmFsc2UsXG5cdFx0c3VibWl0RmVlZGJhY2s6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0c3VibWl0QWN0aW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0cmVqZWN0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5zdWl0ZSgnUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSAtIE9yZGVyaW5nJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc2VydmljZTogSVBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2U7XG5cdGxldCBwbGFuVXJpOiBVUkk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0b3JlKTtcblx0XHRwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2l0ZW1zIHNvcnRlZCBieSBsaW5lIG51bWJlcicsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIwLCAxLCAnbGluZSAyMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgNSwgMSwgJ2xpbmUgNScpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMTAsIDEsICdsaW5lIDEwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZlZWRiYWNrU3VtbWFyeShzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpKSwgW1xuXHRcdFx0JzU6MScsXG5cdFx0XHQnMTA6MScsXG5cdFx0XHQnMjA6MScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW1zIHNvcnRlZCBieSBsaW5lIHRoZW4gY29sdW1uJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMTAsIDIwLCAnY29sIDIwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMCwgNSwgJ2NvbCA1Jyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMCwgMTAsICdjb2wgMTAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmVlZGJhY2tTdW1tYXJ5KHNlcnZpY2UuZ2V0RmVlZGJhY2socGxhblVyaSkpLCBbXG5cdFx0XHQnMTA6NScsXG5cdFx0XHQnMTA6MTAnLFxuXHRcdFx0JzEwOjIwJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgZmVlZGJhY2sgcHJlc2VydmVzIG9yZGVyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlkMSA9IHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMzAsIDEsICdsaW5lIDMwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMCwgMSwgJ2xpbmUgMTAnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIwLCAxLCAnbGluZSAyMCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmZWVkYmFja1N1bW1hcnkoc2VydmljZS5nZXRGZWVkYmFjayhwbGFuVXJpKSksIFtcblx0XHRcdCcxMDoxJyxcblx0XHRcdCcyMDoxJyxcblx0XHRcdCczMDoxJyxcblx0XHRdKTtcblxuXHRcdHNlcnZpY2UucmVtb3ZlRmVlZGJhY2socGxhblVyaSwgaWQxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZlZWRiYWNrU3VtbWFyeShzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpKSwgW1xuXHRcdFx0JzEwOjEnLFxuXHRcdFx0JzIwOjEnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW1lIGxpbmUgbnVtYmVyIGl0ZW1zIGFyZSBzdGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaWQxID0gc2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMCwgMSwgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3QgaWQyID0gc2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMCwgMSwgJ3NlY29uZCcpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5pZCwgaWQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMV0uaWQsIGlkMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyIHJlbW92ZXMgYWxsIGl0ZW1zJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMSwgMSwgJ2EnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIsIDEsICdiJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAzLCAxLCAnYycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RmVlZGJhY2socGxhblVyaSkubGVuZ3RoLCAzKTtcblx0XHRzZXJ2aWNlLmNsZWFyRmVlZGJhY2socGxhblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RmVlZGJhY2socGxhblVyaSkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIGZlZWRiYWNrIGNoYW5nZXMgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBpZCA9IHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMTAsIDEsICdvcmlnaW5hbCcpO1xuXHRcdHNlcnZpY2UudXBkYXRlRmVlZGJhY2socGxhblVyaSwgaWQsICd1cGRhdGVkJyk7XG5cblx0XHRjb25zdCBpdGVtcyA9IHNlcnZpY2UuZ2V0RmVlZGJhY2socGxhblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLnRleHQsICd1cGRhdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLmxpbmUsIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWVudHMgcHJlc2VydmUgdGhlaXIgc2VsZWN0aW9uIHJhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0ge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0c3RhcnRDb2x1bW46IDIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiA3LFxuXHRcdFx0ZW5kQ29sdW1uOiAxMixcblx0XHR9O1xuXG5cdFx0KHNlcnZpY2UgYXMgUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSkuYWRkQ29tbWVudChwbGFuVXJpLCByYW5nZSwgJ3NlbGVjdGVkIHRleHQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHNlcnZpY2UgYXMgUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSkuZ2V0Q29tbWVudHMocGxhblVyaSksIFt7XG5cdFx0XHRpZDogc2VydmljZS5nZXRGZWVkYmFjayhwbGFuVXJpKVswXS5pZCxcblx0XHRcdHJlc291cmNlOiBwbGFuVXJpLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRib2R5OiAnc2VsZWN0ZWQgdGV4dCcsXG5cdFx0fV0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSAtIE5hdmlnYXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzZXJ2aWNlOiBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZTtcblx0bGV0IHBsYW5Vcmk6IFVSSTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RvcmUpO1xuXHRcdHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCBjcmVhdGVSZWdpc3RyYXRpb24oKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbmF2aWdhdGlvbiBmb2xsb3dzIHNvcnRlZCBvcmRlcicsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIwLCAxLCAnbGluZSAyMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgNSwgMSwgJ2xpbmUgNScpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMTAsIDEsICdsaW5lIDEwJyk7XG5cblx0XHQvLyBFeHBlY3RlZCBvcmRlcjogNSwgMTAsIDIwXG5cdFx0Y29uc3QgZmlyc3QgPSBzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhwbGFuVXJpLCB0cnVlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmxpbmUsIDUpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kID0gc2VydmljZS5nZXROZXh0RmVlZGJhY2socGxhblVyaSwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQubGluZSwgMTApO1xuXG5cdFx0Y29uc3QgdGhpcmQgPSBzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhwbGFuVXJpLCB0cnVlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkLmxpbmUsIDIwKTtcblxuXHRcdC8vIFdyYXBzIGFyb3VuZFxuXHRcdGNvbnN0IGZvdXJ0aCA9IHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHBsYW5VcmksIHRydWUpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91cnRoLmxpbmUsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uIGJhY2t3YXJkcycsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDUsIDEsICdsaW5lIDUnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEwLCAxLCAnbGluZSAxMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMjAsIDEsICdsaW5lIDIwJyk7XG5cblx0XHQvLyBGaXJzdCBiYWNrd2FyZCBuYXYgZ29lcyB0byBsYXN0IGl0ZW1cblx0XHRjb25zdCBmaXJzdCA9IHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHBsYW5VcmksIGZhbHNlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmxpbmUsIDIwKTtcblxuXHRcdGNvbnN0IHNlY29uZCA9IHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHBsYW5VcmksIGZhbHNlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5saW5lLCAxMCk7XG5cblx0XHRjb25zdCB0aGlyZCA9IHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHBsYW5VcmksIGZhbHNlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkLmxpbmUsIDUpO1xuXG5cdFx0Ly8gV3JhcHMgYXJvdW5kXG5cdFx0Y29uc3QgZm91cnRoID0gc2VydmljZS5nZXROZXh0RmVlZGJhY2socGxhblVyaSwgZmFsc2UpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91cnRoLmxpbmUsIDIwKTtcblx0fSk7XG5cblx0dGVzdCgnbmF2aWdhdGlvbiBiZWFyaW5ncyByZWZsZWN0IHNvcnRlZCBwb3NpdGlvbicsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIwLCAxLCAnbGluZSAyMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgNSwgMSwgJ2xpbmUgNScpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMTAsIDEsICdsaW5lIDEwJyk7XG5cblx0XHQvLyBCZWZvcmUgbmF2aWdhdGlvbiwgbm8gYW5jaG9yXG5cdFx0bGV0IGJlYXJpbmcgPSBzZXJ2aWNlLmdldE5hdmlnYXRpb25CZWFyaW5nKHBsYW5VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWFyaW5nLmFjdGl2ZUlkeCwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWFyaW5nLnRvdGFsQ291bnQsIDMpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gZmlyc3QgKDUpXG5cdFx0c2VydmljZS5nZXROZXh0RmVlZGJhY2socGxhblVyaSwgdHJ1ZSk7XG5cdFx0YmVhcmluZyA9IHNlcnZpY2UuZ2V0TmF2aWdhdGlvbkJlYXJpbmcocGxhblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlYXJpbmcuYWN0aXZlSWR4LCAwKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIHNlY29uZCAoMTApXG5cdFx0c2VydmljZS5nZXROZXh0RmVlZGJhY2socGxhblVyaSwgdHJ1ZSk7XG5cdFx0YmVhcmluZyA9IHNlcnZpY2UuZ2V0TmF2aWdhdGlvbkJlYXJpbmcocGxhblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlYXJpbmcuYWN0aXZlSWR4LCAxKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIHRoaXJkICgyMClcblx0XHRzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhwbGFuVXJpLCB0cnVlKTtcblx0XHRiZWFyaW5nID0gc2VydmljZS5nZXROYXZpZ2F0aW9uQmVhcmluZyhwbGFuVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVhcmluZy5hY3RpdmVJZHgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uIHJldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBmZWVkYmFjaycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhwbGFuVXJpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXROYXZpZ2F0aW9uQW5jaG9yIHVwZGF0ZXMgdGhlIGFuY2hvcicsICgpID0+IHtcblx0XHRjb25zdCBpZCA9IHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMTAsIDEsICdsaW5lIDEwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAyMCwgMSwgJ2xpbmUgMjAnKTtcblxuXHRcdHNlcnZpY2Uuc2V0TmF2aWdhdGlvbkFuY2hvcihwbGFuVXJpLCBpZCk7XG5cdFx0Y29uc3QgYmVhcmluZyA9IHNlcnZpY2UuZ2V0TmF2aWdhdGlvbkJlYXJpbmcocGxhblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlYXJpbmcuYWN0aXZlSWR4LCAwKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UgLSBSZWdpc3RyYXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzZXJ2aWNlOiBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RvcmUpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNBY3RpdmVQbGFuUmV2aWV3IHJldHVybnMgZmFsc2UgYmVmb3JlIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc0FjdGl2ZVBsYW5SZXZpZXcocGxhblVyaSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNBY3RpdmVQbGFuUmV2aWV3IHJldHVybnMgdHJ1ZSBhZnRlciByZWdpc3RyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJyk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJQbGFuUmV2aWV3KHBsYW5VcmksIGNyZWF0ZVJlZ2lzdHJhdGlvbigpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNBY3RpdmVQbGFuUmV2aWV3KHBsYW5VcmkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNBY3RpdmVQbGFuUmV2aWV3IHJldHVybnMgZmFsc2UgYWZ0ZXIgZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBzZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCBjcmVhdGVSZWdpc3RyYXRpb24oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNBY3RpdmVQbGFuUmV2aWV3KHBsYW5VcmkpLCB0cnVlKTtcblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzQWN0aXZlUGxhblJldmlldyhwbGFuVXJpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmZWVkYmFjayBjYW5ub3QgYmUgYWRkZWQgdG8gdW5yZWdpc3RlcmVkIHBsYW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJyk7XG5cdFx0Y29uc3QgaWQgPSBzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEsIDEsICd0ZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RmVlZGJhY2socGxhblVyaSkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBjbGVhcnMgZmVlZGJhY2sgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJyk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKCkpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMSwgMSwgJ3RleHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRGZWVkYmFjayhwbGFuVXJpKS5sZW5ndGgsIDEpO1xuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RmVlZGJhY2socGxhblVyaSkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VSZWdpc3RyYXRpb25zIGZpcmVzIG9uIHJlZ2lzdGVyIGFuZCBkaXNwb3NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGxldCBmaXJlQ291bnQgPSAwO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlUmVnaXN0cmF0aW9ucygoKSA9PiBmaXJlQ291bnQrKykpO1xuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlQ291bnQsIDEpO1xuXG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZUNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWVudCBlbGlnaWJpbGl0eSBjaGFuZ2VzIHdoZW4gYSByZXZpZXcgaXMgcmVnaXN0ZXJlZCBvciBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRjb25zdCBwbGFuU2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RvcmUpO1xuXHRcdGxldCBmaXJlQ291bnQgPSAwO1xuXHRcdHN0b3JlLmFkZChwbGFuU2VydmljZS5vbkRpZENoYW5nZUNvbW1lbnRzKCgpID0+IGZpcmVDb3VudCsrKSk7XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBwbGFuU2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKCkpO1xuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZUNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zaW5nIGEgc3VwZXJzZWRlZCByZWdpc3RyYXRpb24gbGVhdmVzIHRoZSBhY3RpdmUgcmVnaXN0cmF0aW9uIGludGFjdCcsICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vc2Vjb25kJyk7XG5cdFx0Y29uc3Qgc2NvcGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlUGxhblJldmlld1Njb3BlKGV2ZW50ID0+IHNjb3Blcy5wdXNoKGAke2V2ZW50LmFjdGl2ZSA/ICdhY3RpdmUnIDogJ2luYWN0aXZlJ306JHtldmVudC5zZXNzaW9uUmVzb3VyY2UucGF0aC5zbGljZSgxKX1gKSkpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBzZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCBjcmVhdGVSZWdpc3RyYXRpb24oeyBzZXNzaW9uUmVzb3VyY2U6IGZpcnN0U2Vzc2lvbiB9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJQbGFuUmV2aWV3KHBsYW5VcmksIGNyZWF0ZVJlZ2lzdHJhdGlvbih7IHNlc3Npb25SZXNvdXJjZTogc2Vjb25kU2Vzc2lvbiB9KSkpO1xuXHRcdGZpcnN0LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlU2Vzc2lvbjogc2VydmljZS5nZXRQbGFuUmV2aWV3KHBsYW5VcmkpPy5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdHNjb3Blcyxcblx0XHR9LCB7XG5cdFx0XHRhY3RpdmVTZXNzaW9uOiBzZWNvbmRTZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRzY29wZXM6IFtcblx0XHRcdFx0J2FjdGl2ZTpmaXJzdCcsXG5cdFx0XHRcdCdpbmFjdGl2ZTpmaXJzdCcsXG5cdFx0XHRcdCdhY3RpdmU6c2Vjb25kJyxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2luZyB0aGUgYWN0aXZlIHJlZ2lzdHJhdGlvbiByZXN0b3JlcyB0aGUgcHJldmlvdXMgcmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vZmlyc3QnKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi9zZWNvbmQnKTtcblx0XHRjb25zdCBzY29wZXM6IHN0cmluZ1tdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VQbGFuUmV2aWV3U2NvcGUoZXZlbnQgPT4gc2NvcGVzLnB1c2goYCR7ZXZlbnQuYWN0aXZlID8gJ2FjdGl2ZScgOiAnaW5hY3RpdmUnfToke2V2ZW50LnNlc3Npb25SZXNvdXJjZS5wYXRoLnNsaWNlKDEpfWApKSk7XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKHsgc2Vzc2lvblJlc291cmNlOiBmaXJzdFNlc3Npb24gfSkpKTtcblx0XHRjb25zdCBzZWNvbmQgPSBzZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCBjcmVhdGVSZWdpc3RyYXRpb24oeyBzZXNzaW9uUmVzb3VyY2U6IHNlY29uZFNlc3Npb24gfSkpO1xuXHRcdHNlY29uZC5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZVNlc3Npb246IHNlcnZpY2UuZ2V0UGxhblJldmlldyhwbGFuVXJpKT8uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRzY29wZXMsXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlU2Vzc2lvbjogZmlyc3RTZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRzY29wZXM6IFtcblx0XHRcdFx0J2FjdGl2ZTpmaXJzdCcsXG5cdFx0XHRcdCdpbmFjdGl2ZTpmaXJzdCcsXG5cdFx0XHRcdCdhY3RpdmU6c2Vjb25kJyxcblx0XHRcdFx0J2luYWN0aXZlOnNlY29uZCcsXG5cdFx0XHRcdCdhY3RpdmU6Zmlyc3QnLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VGZWVkYmFjayBmaXJlcyBvbiBhZGQgYW5kIHJlbW92ZScsICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKCkpKTtcblxuXHRcdGxldCBmaXJlQ291bnQgPSAwO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlRmVlZGJhY2soKCkgPT4gZmlyZUNvdW50KyspKTtcblxuXHRcdGNvbnN0IGlkID0gc2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxLCAxLCAndGV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlQ291bnQsIDEpO1xuXG5cdFx0c2VydmljZS5yZW1vdmVGZWVkYmFjayhwbGFuVXJpLCBpZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVDb3VudCwgMik7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlIC0gU3VibWl0JywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc2VydmljZTogSVBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0b3JlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3N1Ym1pdEFsbEZlZWRiYWNrIGRlbGVnYXRlcyB0byB0aGUgcmVnaXN0ZXJlZCByZXZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJyk7XG5cdFx0bGV0IHN1Ym1pdENvdW50ID0gMDtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKHtcblx0XHRcdHN1Ym1pdEZlZWRiYWNrOiBhc3luYyAoKSA9PiB7IHN1Ym1pdENvdW50Kys7IHJldHVybiB0cnVlOyB9LFxuXHRcdH0pKSk7XG5cblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEsIDEsICdmaXggdGhpcycpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgNDUsIDQ1LCAnY2hhbmdlIHRoYXQnKTtcblxuXHRcdGNvbnN0IGRpZFN1Ym1pdCA9IGF3YWl0IHNlcnZpY2Uuc3VibWl0QWxsRmVlZGJhY2socGxhblVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3VibWl0Q291bnQsIGRpZFN1Ym1pdCB9LCB7IHN1Ym1pdENvdW50OiAxLCBkaWRTdWJtaXQ6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1Ym1pdEFsbEZlZWRiYWNrIGRvZXMgbm90aGluZyB3aGVuIG5vIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGxldCBjYWxsZWQgPSBmYWxzZTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKHtcblx0XHRcdHN1Ym1pdEZlZWRiYWNrOiBhc3luYyAoKSA9PiB7IGNhbGxlZCA9IHRydWU7IHJldHVybiB0cnVlOyB9LFxuXHRcdH0pKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnN1Ym1pdEFsbEZlZWRiYWNrKHBsYW5VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc3VibWl0QWxsRmVlZGJhY2sgZGVsZWdhdGVzIHdoZW4gb25seSBvdmVyYWxsIGZlZWRiYWNrIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRsZXQgY2FsbGVkID0gZmFsc2U7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJQbGFuUmV2aWV3KHBsYW5VcmksIGNyZWF0ZVJlZ2lzdHJhdGlvbih7XG5cdFx0XHRoYXNPdmVyYWxsRmVlZGJhY2s6ICgpID0+IHRydWUsXG5cdFx0XHRzdWJtaXRGZWVkYmFjazogYXN5bmMgKCkgPT4geyBjYWxsZWQgPSB0cnVlOyByZXR1cm4gdHJ1ZTsgfSxcblx0XHR9KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5zdWJtaXRBbGxGZWVkYmFjayhwbGFuVXJpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJtaXRBbGxGZWVkYmFjayByZXR1cm5zIGZhbHNlIHdoZW4gdGhlIHJlZ2lzdGVyZWQgcmV2aWV3IGRvZXMgbm90IHN1Ym1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKHtcblx0XHRcdHN1Ym1pdEZlZWRiYWNrOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0XHR9KSkpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMSwgMSwgJ2ZpeCB0aGlzJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5zdWJtaXRBbGxGZWVkYmFjayhwbGFuVXJpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJtaXRQbGFuQWN0aW9uIGRlbGVnYXRlcyB0aGUgc2VsZWN0ZWQgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IHsgaWQ6ICdhdXRvcGlsb3QnLCBsYWJlbDogJ0ltcGxlbWVudCB3aXRoIEF1dG9waWxvdCcgfTtcblx0XHRsZXQgc3VibWl0dGVkQWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJQbGFuUmV2aWV3KHBsYW5VcmksIGNyZWF0ZVJlZ2lzdHJhdGlvbih7XG5cdFx0XHRhY3Rpb25zOiBbYWN0aW9uXSxcblx0XHRcdHN1Ym1pdEFjdGlvbjogYXN5bmMgc3VibWl0dGVkID0+IHsgc3VibWl0dGVkQWN0aW9uID0gc3VibWl0dGVkLmlkOyB9LFxuXHRcdH0pKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnN1Ym1pdFBsYW5BY3Rpb24ocGxhblVyaSwgYWN0aW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBY3Rpb24sICdhdXRvcGlsb3QnKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0UGxhbiBkZWxlZ2F0ZXMgcmVqZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGxldCByZWplY3RlZCA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCBjcmVhdGVSZWdpc3RyYXRpb24oe1xuXHRcdFx0cmVqZWN0OiBhc3luYyAoKSA9PiB7IHJlamVjdGVkID0gdHJ1ZTsgfSxcblx0XHR9KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWplY3RQbGFuKHBsYW5VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlamVjdGVkLCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UgLSBQcm92aWRlci1iYWNrZWQgbmF2aWdhdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbmF2aWdhdGlvbiBhbmQgYmVhcmluZ3MgdXNlIGNvbW1lbnRzIGZyb20gdGhlIHNlbGVjdGVkIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGNvbnN0IHJlbGF0ZWRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVsYXRlZC50cycpO1xuXHRcdGNvbnN0IGJyaWRnZSA9IHN0b3JlLmFkZChuZXcgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlKGJyaWRnZSkpO1xuXHRcdGNvbnN0IHJldmVhbHM6IHN0cmluZ1tdID0gW107XG5cdFx0c3RvcmUuYWRkKGJyaWRnZS5vbkRpZFJldmVhbENvbW1lbnQoZXZlbnQgPT4gcmV2ZWFscy5wdXNoKGAke2V2ZW50LnJlc291cmNlLnRvU3RyaW5nKCl9OiR7ZXZlbnQuaWR9YCkpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclBsYW5SZXZpZXcocGxhblVyaSwgY3JlYXRlUmVnaXN0cmF0aW9uKCkpKTtcblx0XHRzdG9yZS5hZGQoYnJpZGdlLnJlZ2lzdGVyUHJvdmlkZXIoe1xuXHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdG9uRGlkQ2hhbmdlQ29tbWVudHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFJldmVhbENvbW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRhY2NlcHRzQ29tbWVudHM6IHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHBsYW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdGdldENvbW1lbnRzOiAoKSA9PiBbXG5cdFx0XHRcdHsgaWQ6ICdwbGFuJywgcmVzb3VyY2U6IHBsYW5VcmksIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMywgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogMiB9LCBib2R5OiAnUGxhbicgfSxcblx0XHRcdFx0eyBpZDogJ3JlbGF0ZWQnLCByZXNvdXJjZTogcmVsYXRlZFVyaSwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiA3LCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNywgZW5kQ29sdW1uOiAyIH0sIGJvZHk6ICdSZWxhdGVkJyB9LFxuXHRcdFx0XSxcblx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHRcdGRlbGV0ZUNvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhwbGFuVXJpLCB0cnVlKTtcblx0XHRjb25zdCBzZWNvbmQgPSBzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhwbGFuVXJpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3Q6IGZpcnN0Py5pZCxcblx0XHRcdHNlY29uZDogc2Vjb25kPy5pZCxcblx0XHRcdGJlYXJpbmc6IHNlcnZpY2UuZ2V0TmF2aWdhdGlvbkJlYXJpbmcocGxhblVyaSksXG5cdFx0XHRyZXZlYWxzLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0OiAncGxhbicsXG5cdFx0XHRzZWNvbmQ6ICdyZWxhdGVkJyxcblx0XHRcdGJlYXJpbmc6IHsgYWN0aXZlSWR4OiAxLCB0b3RhbENvdW50OiAyIH0sXG5cdFx0XHRyZXZlYWxzOiBbXG5cdFx0XHRcdGAke3BsYW5VcmkudG9TdHJpbmcoKX06cGxhbmAsXG5cdFx0XHRcdGAke3JlbGF0ZWRVcmkudG9TdHJpbmcoKX06cmVsYXRlZGAsXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmUtZXhpc3RpbmcgaGlkZGVuIGNvbW1lbnRzIHJlbWFpbiBleGNsdWRlZCBhZnRlciBiZWNvbWluZyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGNvbnN0IGJyaWRnZSA9IHN0b3JlLmFkZChuZXcgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlKGJyaWRnZSkpO1xuXHRcdGNvbnN0IGNvbW1lbnRzOiBJQWdlbnRFZGl0b3JDb21tZW50W10gPSBbXTtcblx0XHRzdG9yZS5hZGQoYnJpZGdlLnJlZ2lzdGVyUHJvdmlkZXIoe1xuXHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdG9uRGlkQ2hhbmdlQ29tbWVudHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFJldmVhbENvbW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRhY2NlcHRzQ29tbWVudHM6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRDb21tZW50czogKCkgPT4gY29tbWVudHMsXG5cdFx0XHRnZXRDb21tZW50SWRzOiAoKSA9PiBbJ2V4aXN0aW5nJ10sXG5cdFx0XHRhZGRDb21tZW50OiAoKSA9PiB7IH0sXG5cdFx0XHRkZWxldGVDb21tZW50OiAoKSA9PiB7IH0sXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCBjcmVhdGVSZWdpc3RyYXRpb24oKSkpO1xuXHRcdGNvbW1lbnRzLnB1c2goXG5cdFx0XHR7IGlkOiAnZXhpc3RpbmcnLCByZXNvdXJjZTogcGxhblVyaSwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAzLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMywgZW5kQ29sdW1uOiAyIH0sIGJvZHk6ICdFeGlzdGluZycgfSxcblx0XHRcdHsgaWQ6ICduZXcnLCByZXNvdXJjZTogcGxhblVyaSwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiA3LCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNywgZW5kQ29sdW1uOiAyIH0sIGJvZHk6ICdOZXcnIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRGZWVkYmFjayhwbGFuVXJpKS5tYXAoaXRlbSA9PiBpdGVtLmlkKSwgWyduZXcnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1Ym1pc3Npb24gZmVlZGJhY2sgZXhjbHVkZXMgYW5kIHByZXNlcnZlcyBjb21tZW50cyB0aGF0IHByZWRhdGUgdGhlIHJldmlldycsICgpID0+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRjb25zdCByZWxhdGVkVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlbGF0ZWQudHMnKTtcblx0XHRjb25zdCBicmlkZ2UgPSBzdG9yZS5hZGQobmV3IEFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UoKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgUGxhblJldmlld0ZlZWRiYWNrU2VydmljZShicmlkZ2UpKTtcblx0XHRjb25zdCBjb21tZW50cyA9IFt7XG5cdFx0XHRpZDogJ2V4aXN0aW5nJyxcblx0XHRcdHJlc291cmNlOiByZWxhdGVkVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAzLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMywgZW5kQ29sdW1uOiAyIH0sXG5cdFx0XHRib2R5OiAnRXhpc3Rpbmcgc2Vzc2lvbiBmZWVkYmFjaycsXG5cdFx0fV07XG5cdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoYnJpZGdlLnJlZ2lzdGVyUHJvdmlkZXIoe1xuXHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdG9uRGlkQ2hhbmdlQ29tbWVudHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFJldmVhbENvbW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRhY2NlcHRzQ29tbWVudHM6IHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHBsYW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdGdldENvbW1lbnRzOiAoKSA9PiBjb21tZW50cyxcblx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHRcdGRlbGV0ZUNvbW1lbnQ6IChfcmVzb3VyY2UsIGlkKSA9PiB7XG5cdFx0XHRcdGRlbGV0ZWQucHVzaChpZCk7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gY29tbWVudHMuZmluZEluZGV4KGNvbW1lbnQgPT4gY29tbWVudC5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0Y29tbWVudHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJQbGFuUmV2aWV3KHBsYW5VcmksIGNyZWF0ZVJlZ2lzdHJhdGlvbigpKSk7XG5cdFx0Y29tbWVudHMucHVzaCh7XG5cdFx0XHRpZDogJ3BsYW4tcmV2aWV3Jyxcblx0XHRcdHJlc291cmNlOiBwbGFuVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiA3LCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNywgZW5kQ29sdW1uOiAyIH0sXG5cdFx0XHRib2R5OiAnUGxhbiByZXZpZXcgZmVlZGJhY2snLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmVlZGJhY2sgPSBzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpO1xuXHRcdHNlcnZpY2UuY2xlYXJGZWVkYmFjayhwbGFuVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZmVlZGJhY2s6IGZlZWRiYWNrLm1hcChpdGVtID0+IGl0ZW0uaWQpLFxuXHRcdFx0ZGVsZXRlZCxcblx0XHRcdHJlbWFpbmluZzogY29tbWVudHMubWFwKGNvbW1lbnQgPT4gY29tbWVudC5pZCksXG5cdFx0fSwge1xuXHRcdFx0ZmVlZGJhY2s6IFsncGxhbi1yZXZpZXcnXSxcblx0XHRcdGRlbGV0ZWQ6IFsncGxhbi1yZXZpZXcnXSxcblx0XHRcdHJlbWFpbmluZzogWydleGlzdGluZyddLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFB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
