import { localize } from "../../../../nls.js";
var SurveyQuestionType = /* @__PURE__ */ ((SurveyQuestionType2) => {
  SurveyQuestionType2["Segment"] = "segment";
  SurveyQuestionType2["Radio"] = "radio";
  return SurveyQuestionType2;
})(SurveyQuestionType || {});
const CopilotPMFSurvey = {
  id: "copilot-pmf",
  title: localize("survey.copilotPmf.title", "Help Us Improve GitHub Copilot"),
  description: localize("survey.copilotPmf.description", "This short survey helps us understand how well Copilot fits into your workflow."),
  questions: [
    {
      type: "segment" /* Segment */,
      id: "disappointment",
      required: true,
      telemetryKey: "score",
      asMeasurement: true,
      label: localize("survey.copilotPmf.q1", "How disappointed would you be if you could no longer use Copilot?"),
      options: [
        { id: "not-at-all", label: localize("survey.copilotPmf.q1.notAtAll", "Not at all") },
        { id: "slightly", label: localize("survey.copilotPmf.q1.slightly", "Slightly") },
        { id: "somewhat", label: localize("survey.copilotPmf.q1.somewhat", "Somewhat") },
        { id: "very", label: localize("survey.copilotPmf.q1.very", "Very") },
        { id: "extremely", label: localize("survey.copilotPmf.q1.extremely", "Extremely") }
      ]
    },
    {
      type: "radio" /* Radio */,
      id: "primary-benefit",
      telemetryKey: "primaryBenefit",
      label: localize("survey.copilotPmf.q2", "What has Copilot helped you with most recently?"),
      columns: 2,
      shuffleOptions: true,
      options: [
        { id: "shipping-faster", label: localize("survey.copilotPmf.q2.shippingFaster", "Shipping changes faster") },
        { id: "getting-unstuck", label: localize("survey.copilotPmf.q2.gettingUnstuck", "Getting unstuck on bugs") },
        { id: "multi-file", label: localize("survey.copilotPmf.q2.multiFile", "Making multi-file changes") },
        { id: "automating", label: localize("survey.copilotPmf.q2.automating", "Automating repetitive work") },
        { id: "understanding", label: localize("survey.copilotPmf.q2.understanding", "Understanding the codebase") },
        { id: "planning", label: localize("survey.copilotPmf.q2.planning", "Planning an approach") },
        { id: "reviewing", label: localize("survey.copilotPmf.q2.reviewing", "Improving or reviewing code") },
        { id: "no-clear-value", label: localize("survey.copilotPmf.q2.noClearValue", "I haven't gotten clear value yet") },
        { id: "other", label: localize("survey.copilotPmf.q2.other", "None of the above") }
      ]
    },
    {
      type: "radio" /* Radio */,
      id: "primary-friction",
      telemetryKey: "primaryFriction",
      label: localize("survey.copilotPmf.q3", "What most gets in your way?"),
      columns: 2,
      shuffleOptions: true,
      options: [
        { id: "trust", label: localize("survey.copilotPmf.q3.trust", "Output is hard to trust") },
        { id: "context", label: localize("survey.copilotPmf.q3.context", "Missing repo or project context") },
        { id: "bigger-tasks", label: localize("survey.copilotPmf.q3.biggerTasks", "Struggles with bigger tasks") },
        { id: "reviewing-time", label: localize("survey.copilotPmf.q3.reviewingTime", "Too much time reviewing") },
        { id: "steering", label: localize("survey.copilotPmf.q3.steering", "Too much steering needed") },
        { id: "slow", label: localize("survey.copilotPmf.q3.slow", "Too slow / breaks flow") },
        { id: "setup", label: localize("survey.copilotPmf.q3.setup", "Setup or integrations are hard") },
        { id: "security", label: localize("survey.copilotPmf.q3.security", "Security or permissions friction") },
        { id: "cost", label: localize("survey.copilotPmf.q3.cost", "Limits, cost, or billing") },
        { id: "other", label: localize("survey.copilotPmf.q3.other", "None of the above") }
      ]
    },
    {
      type: "segment" /* Segment */,
      id: "programming-experience",
      telemetryKey: "programmingExperience",
      asMeasurement: true,
      label: localize("survey.copilotPmf.q4", "How long have you been programming?"),
      options: [
        { id: "less-than-3", label: localize("survey.copilotPmf.q4.lessThan3", "<3 yr") },
        { id: "3-to-5", label: localize("survey.copilotPmf.q4.3to5", "3-5 yr") },
        { id: "6-to-9", label: localize("survey.copilotPmf.q4.6to9", "6-9 yr") },
        { id: "10-to-19", label: localize("survey.copilotPmf.q4.10to19", "10-19 yr") },
        { id: "20-plus", label: localize("survey.copilotPmf.q4.20plus", "20+ yr") }
      ]
    }
  ]
};
export {
  CopilotPMFSurvey,
  SurveyQuestionType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHN1cnZleXNcXGJyb3dzZXJcXHN1cnZleVF1ZXN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gU3VydmV5UXVlc3Rpb25UeXBlIHtcblx0U2VnbWVudCA9ICdzZWdtZW50Jyxcblx0UmFkaW8gPSAncmFkaW8nLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdXJ2ZXlPcHRpb24ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVN1cnZleVF1ZXN0aW9uQmFzZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IHJlYWRvbmx5IElTdXJ2ZXlPcHRpb25bXTtcblx0LyoqIFdoZW4gdHJ1ZSwgdGhlIHF1ZXN0aW9uIG11c3QgYmUgYW5zd2VyZWQgYmVmb3JlIHN1Ym1pc3Npb24uICovXG5cdHJlYWRvbmx5IHJlcXVpcmVkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSB0ZWxlbWV0cnkgZmllbGQgbmFtZSB0aGlzIGFuc3dlciBtYXBzIHRvIGluIHRoZSBgc3VydmV5L3N1Ym1pdGAgZXZlbnQuXG5cdCAqIFdoZW4gc2V0LCB0aGUgc2VsZWN0ZWQgb3B0aW9uIElEIChvciBudW1lcmljIGluZGV4IGlmIHtAbGluayBhc01lYXN1cmVtZW50fSBpcyB0cnVlKSBpcyBlbWl0dGVkIHVuZGVyIHRoaXMga2V5LlxuXHQgKi9cblx0cmVhZG9ubHkgdGVsZW1ldHJ5S2V5Pzogc3RyaW5nO1xuXHQvKiogV2hlbiB0cnVlLCB0aGUgYW5zd2VyIGlzIGxvZ2dlZCBhcyBhIG51bWVyaWMgaW5kZXggaW50byB0aGUgb3B0aW9ucyBhcnJheSAoMC1iYXNlZCkgd2l0aCBgaXNNZWFzdXJlbWVudGAuICovXG5cdHJlYWRvbmx5IGFzTWVhc3VyZW1lbnQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdXJ2ZXlTZWdtZW50UXVlc3Rpb24gZXh0ZW5kcyBJU3VydmV5UXVlc3Rpb25CYXNlIHtcblx0cmVhZG9ubHkgdHlwZTogU3VydmV5UXVlc3Rpb25UeXBlLlNlZ21lbnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1cnZleVJhZGlvUXVlc3Rpb24gZXh0ZW5kcyBJU3VydmV5UXVlc3Rpb25CYXNlIHtcblx0cmVhZG9ubHkgdHlwZTogU3VydmV5UXVlc3Rpb25UeXBlLlJhZGlvO1xuXHRyZWFkb25seSBjb2x1bW5zPzogbnVtYmVyO1xuXHQvKiogV2hlbiB0cnVlLCByYW5kb21pemUgYWxsIG9wdGlvbnMgZXhjZXB0IHRoZSBmaW5hbCBvcHRpb24uICovXG5cdHJlYWRvbmx5IHNodWZmbGVPcHRpb25zPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSVN1cnZleVF1ZXN0aW9uID0gSVN1cnZleVNlZ21lbnRRdWVzdGlvbiB8IElTdXJ2ZXlSYWRpb1F1ZXN0aW9uO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdXJ2ZXlEZWZpbml0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgcXVlc3Rpb25zOiByZWFkb25seSBJU3VydmV5UXVlc3Rpb25bXTtcbn1cblxuLyoqXG4gKiBQcm9kdWN0LU1hcmtldCBGaXQgc3VydmV5IGZvciBHaXRIdWIgQ29waWxvdC5cbiAqIEJhc2VkIG9uIHRoZSBTZWFuIEVsbGlzIFwidmVyeSBkaXNhcHBvaW50ZWRcIiB0ZXN0LlxuICovXG5leHBvcnQgY29uc3QgQ29waWxvdFBNRlN1cnZleTogSVN1cnZleURlZmluaXRpb24gPSB7XG5cdGlkOiAnY29waWxvdC1wbWYnLFxuXHR0aXRsZTogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnRpdGxlJywgXCJIZWxwIFVzIEltcHJvdmUgR2l0SHViIENvcGlsb3RcIiksXG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYuZGVzY3JpcHRpb24nLCBcIlRoaXMgc2hvcnQgc3VydmV5IGhlbHBzIHVzIHVuZGVyc3RhbmQgaG93IHdlbGwgQ29waWxvdCBmaXRzIGludG8geW91ciB3b3JrZmxvdy5cIiksXG5cdHF1ZXN0aW9uczogW1xuXHRcdHtcblx0XHRcdHR5cGU6IFN1cnZleVF1ZXN0aW9uVHlwZS5TZWdtZW50LFxuXHRcdFx0aWQ6ICdkaXNhcHBvaW50bWVudCcsXG5cdFx0XHRyZXF1aXJlZDogdHJ1ZSxcblx0XHRcdHRlbGVtZXRyeUtleTogJ3Njb3JlJyxcblx0XHRcdGFzTWVhc3VyZW1lbnQ6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnExJywgXCJIb3cgZGlzYXBwb2ludGVkIHdvdWxkIHlvdSBiZSBpZiB5b3UgY291bGQgbm8gbG9uZ2VyIHVzZSBDb3BpbG90P1wiKSxcblx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ25vdC1hdC1hbGwnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnExLm5vdEF0QWxsJywgXCJOb3QgYXQgYWxsXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzbGlnaHRseScsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTEuc2xpZ2h0bHknLCBcIlNsaWdodGx5XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzb21ld2hhdCcsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTEuc29tZXdoYXQnLCBcIlNvbWV3aGF0XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICd2ZXJ5JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMS52ZXJ5JywgXCJWZXJ5XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdleHRyZW1lbHknLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnExLmV4dHJlbWVseScsIFwiRXh0cmVtZWx5XCIpIH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogU3VydmV5UXVlc3Rpb25UeXBlLlJhZGlvLFxuXHRcdFx0aWQ6ICdwcmltYXJ5LWJlbmVmaXQnLFxuXHRcdFx0dGVsZW1ldHJ5S2V5OiAncHJpbWFyeUJlbmVmaXQnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMicsIFwiV2hhdCBoYXMgQ29waWxvdCBoZWxwZWQgeW91IHdpdGggbW9zdCByZWNlbnRseT9cIiksXG5cdFx0XHRjb2x1bW5zOiAyLFxuXHRcdFx0c2h1ZmZsZU9wdGlvbnM6IHRydWUsXG5cdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdHsgaWQ6ICdzaGlwcGluZy1mYXN0ZXInLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLnNoaXBwaW5nRmFzdGVyJywgXCJTaGlwcGluZyBjaGFuZ2VzIGZhc3RlclwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnZ2V0dGluZy11bnN0dWNrJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMi5nZXR0aW5nVW5zdHVjaycsIFwiR2V0dGluZyB1bnN0dWNrIG9uIGJ1Z3NcIikgfSxcblx0XHRcdFx0eyBpZDogJ211bHRpLWZpbGUnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLm11bHRpRmlsZScsIFwiTWFraW5nIG11bHRpLWZpbGUgY2hhbmdlc1wiKSB9LFxuXHRcdFx0XHR7IGlkOiAnYXV0b21hdGluZycsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTIuYXV0b21hdGluZycsIFwiQXV0b21hdGluZyByZXBldGl0aXZlIHdvcmtcIikgfSxcblx0XHRcdFx0eyBpZDogJ3VuZGVyc3RhbmRpbmcnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLnVuZGVyc3RhbmRpbmcnLCBcIlVuZGVyc3RhbmRpbmcgdGhlIGNvZGViYXNlXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdwbGFubmluZycsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTIucGxhbm5pbmcnLCBcIlBsYW5uaW5nIGFuIGFwcHJvYWNoXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdyZXZpZXdpbmcnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLnJldmlld2luZycsIFwiSW1wcm92aW5nIG9yIHJldmlld2luZyBjb2RlXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICduby1jbGVhci12YWx1ZScsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTIubm9DbGVhclZhbHVlJywgXCJJIGhhdmVuJ3QgZ290dGVuIGNsZWFyIHZhbHVlIHlldFwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnb3RoZXInLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLm90aGVyJywgXCJOb25lIG9mIHRoZSBhYm92ZVwiKSB9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdHtcblx0XHRcdHR5cGU6IFN1cnZleVF1ZXN0aW9uVHlwZS5SYWRpbyxcblx0XHRcdGlkOiAncHJpbWFyeS1mcmljdGlvbicsXG5cdFx0XHR0ZWxlbWV0cnlLZXk6ICdwcmltYXJ5RnJpY3Rpb24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMycsIFwiV2hhdCBtb3N0IGdldHMgaW4geW91ciB3YXk/XCIpLFxuXHRcdFx0Y29sdW1uczogMixcblx0XHRcdHNodWZmbGVPcHRpb25zOiB0cnVlLFxuXHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHR7IGlkOiAndHJ1c3QnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEzLnRydXN0JywgXCJPdXRwdXQgaXMgaGFyZCB0byB0cnVzdFwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnY29udGV4dCcsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMuY29udGV4dCcsIFwiTWlzc2luZyByZXBvIG9yIHByb2plY3QgY29udGV4dFwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnYmlnZ2VyLXRhc2tzJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5iaWdnZXJUYXNrcycsIFwiU3RydWdnbGVzIHdpdGggYmlnZ2VyIHRhc2tzXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdyZXZpZXdpbmctdGltZScsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMucmV2aWV3aW5nVGltZScsIFwiVG9vIG11Y2ggdGltZSByZXZpZXdpbmdcIikgfSxcblx0XHRcdFx0eyBpZDogJ3N0ZWVyaW5nJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5zdGVlcmluZycsIFwiVG9vIG11Y2ggc3RlZXJpbmcgbmVlZGVkXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzbG93JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5zbG93JywgXCJUb28gc2xvdyAvIGJyZWFrcyBmbG93XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzZXR1cCcsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMuc2V0dXAnLCBcIlNldHVwIG9yIGludGVncmF0aW9ucyBhcmUgaGFyZFwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnc2VjdXJpdHknLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEzLnNlY3VyaXR5JywgXCJTZWN1cml0eSBvciBwZXJtaXNzaW9ucyBmcmljdGlvblwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnY29zdCcsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMuY29zdCcsIFwiTGltaXRzLCBjb3N0LCBvciBiaWxsaW5nXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdvdGhlcicsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMub3RoZXInLCBcIk5vbmUgb2YgdGhlIGFib3ZlXCIpIH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogU3VydmV5UXVlc3Rpb25UeXBlLlNlZ21lbnQsXG5cdFx0XHRpZDogJ3Byb2dyYW1taW5nLWV4cGVyaWVuY2UnLFxuXHRcdFx0dGVsZW1ldHJ5S2V5OiAncHJvZ3JhbW1pbmdFeHBlcmllbmNlJyxcblx0XHRcdGFzTWVhc3VyZW1lbnQ6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnE0JywgXCJIb3cgbG9uZyBoYXZlIHlvdSBiZWVuIHByb2dyYW1taW5nP1wiKSxcblx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ2xlc3MtdGhhbi0zJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xNC5sZXNzVGhhbjMnLCBcIjwzIHlyXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICczLXRvLTUnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnE0LjN0bzUnLCBcIjMtNSB5clwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnNi10by05JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xNC42dG85JywgXCI2LTkgeXJcIikgfSxcblx0XHRcdFx0eyBpZDogJzEwLXRvLTE5JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xNC4xMHRvMTknLCBcIjEwLTE5IHlyXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICcyMC1wbHVzJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xNC4yMHBsdXMnLCBcIjIwKyB5clwiKSB9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRdLFxufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRWxCLElBQVcscUJBQVgsa0JBQVdBLHdCQUFYO0FBQ04sRUFBQUEsb0JBQUEsYUFBVTtBQUNWLEVBQUFBLG9CQUFBLFdBQVE7QUFGUyxTQUFBQTtBQUFBLEdBQUE7QUFpRFgsTUFBTSxtQkFBc0M7QUFBQSxFQUNsRCxJQUFJO0FBQUEsRUFDSixPQUFPLFNBQVMsMkJBQTJCLGdDQUFnQztBQUFBLEVBQzNFLGFBQWEsU0FBUyxpQ0FBaUMsaUZBQWlGO0FBQUEsRUFDeEksV0FBVztBQUFBLElBQ1Y7QUFBQSxNQUNDLE1BQU07QUFBQSxNQUNOLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLGNBQWM7QUFBQSxNQUNkLGVBQWU7QUFBQSxNQUNmLE9BQU8sU0FBUyx3QkFBd0IsbUVBQW1FO0FBQUEsTUFDM0csU0FBUztBQUFBLFFBQ1IsRUFBRSxJQUFJLGNBQWMsT0FBTyxTQUFTLGlDQUFpQyxZQUFZLEVBQUU7QUFBQSxRQUNuRixFQUFFLElBQUksWUFBWSxPQUFPLFNBQVMsaUNBQWlDLFVBQVUsRUFBRTtBQUFBLFFBQy9FLEVBQUUsSUFBSSxZQUFZLE9BQU8sU0FBUyxpQ0FBaUMsVUFBVSxFQUFFO0FBQUEsUUFDL0UsRUFBRSxJQUFJLFFBQVEsT0FBTyxTQUFTLDZCQUE2QixNQUFNLEVBQUU7QUFBQSxRQUNuRSxFQUFFLElBQUksYUFBYSxPQUFPLFNBQVMsa0NBQWtDLFdBQVcsRUFBRTtBQUFBLE1BQ25GO0FBQUEsSUFDRDtBQUFBLElBQ0E7QUFBQSxNQUNDLE1BQU07QUFBQSxNQUNOLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE9BQU8sU0FBUyx3QkFBd0IsaURBQWlEO0FBQUEsTUFDekYsU0FBUztBQUFBLE1BQ1QsZ0JBQWdCO0FBQUEsTUFDaEIsU0FBUztBQUFBLFFBQ1IsRUFBRSxJQUFJLG1CQUFtQixPQUFPLFNBQVMsdUNBQXVDLHlCQUF5QixFQUFFO0FBQUEsUUFDM0csRUFBRSxJQUFJLG1CQUFtQixPQUFPLFNBQVMsdUNBQXVDLHlCQUF5QixFQUFFO0FBQUEsUUFDM0csRUFBRSxJQUFJLGNBQWMsT0FBTyxTQUFTLGtDQUFrQywyQkFBMkIsRUFBRTtBQUFBLFFBQ25HLEVBQUUsSUFBSSxjQUFjLE9BQU8sU0FBUyxtQ0FBbUMsNEJBQTRCLEVBQUU7QUFBQSxRQUNyRyxFQUFFLElBQUksaUJBQWlCLE9BQU8sU0FBUyxzQ0FBc0MsNEJBQTRCLEVBQUU7QUFBQSxRQUMzRyxFQUFFLElBQUksWUFBWSxPQUFPLFNBQVMsaUNBQWlDLHNCQUFzQixFQUFFO0FBQUEsUUFDM0YsRUFBRSxJQUFJLGFBQWEsT0FBTyxTQUFTLGtDQUFrQyw2QkFBNkIsRUFBRTtBQUFBLFFBQ3BHLEVBQUUsSUFBSSxrQkFBa0IsT0FBTyxTQUFTLHFDQUFxQyxrQ0FBa0MsRUFBRTtBQUFBLFFBQ2pILEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyw4QkFBOEIsbUJBQW1CLEVBQUU7QUFBQSxNQUNuRjtBQUFBLElBQ0Q7QUFBQSxJQUNBO0FBQUEsTUFDQyxNQUFNO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxPQUFPLFNBQVMsd0JBQXdCLDZCQUE2QjtBQUFBLE1BQ3JFLFNBQVM7QUFBQSxNQUNULGdCQUFnQjtBQUFBLE1BQ2hCLFNBQVM7QUFBQSxRQUNSLEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyw4QkFBOEIseUJBQXlCLEVBQUU7QUFBQSxRQUN4RixFQUFFLElBQUksV0FBVyxPQUFPLFNBQVMsZ0NBQWdDLGlDQUFpQyxFQUFFO0FBQUEsUUFDcEcsRUFBRSxJQUFJLGdCQUFnQixPQUFPLFNBQVMsb0NBQW9DLDZCQUE2QixFQUFFO0FBQUEsUUFDekcsRUFBRSxJQUFJLGtCQUFrQixPQUFPLFNBQVMsc0NBQXNDLHlCQUF5QixFQUFFO0FBQUEsUUFDekcsRUFBRSxJQUFJLFlBQVksT0FBTyxTQUFTLGlDQUFpQywwQkFBMEIsRUFBRTtBQUFBLFFBQy9GLEVBQUUsSUFBSSxRQUFRLE9BQU8sU0FBUyw2QkFBNkIsd0JBQXdCLEVBQUU7QUFBQSxRQUNyRixFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsOEJBQThCLGdDQUFnQyxFQUFFO0FBQUEsUUFDL0YsRUFBRSxJQUFJLFlBQVksT0FBTyxTQUFTLGlDQUFpQyxrQ0FBa0MsRUFBRTtBQUFBLFFBQ3ZHLEVBQUUsSUFBSSxRQUFRLE9BQU8sU0FBUyw2QkFBNkIsMEJBQTBCLEVBQUU7QUFBQSxRQUN2RixFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsOEJBQThCLG1CQUFtQixFQUFFO0FBQUEsTUFDbkY7QUFBQSxJQUNEO0FBQUEsSUFDQTtBQUFBLE1BQ0MsTUFBTTtBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsZUFBZTtBQUFBLE1BQ2YsT0FBTyxTQUFTLHdCQUF3QixxQ0FBcUM7QUFBQSxNQUM3RSxTQUFTO0FBQUEsUUFDUixFQUFFLElBQUksZUFBZSxPQUFPLFNBQVMsa0NBQWtDLE9BQU8sRUFBRTtBQUFBLFFBQ2hGLEVBQUUsSUFBSSxVQUFVLE9BQU8sU0FBUyw2QkFBNkIsUUFBUSxFQUFFO0FBQUEsUUFDdkUsRUFBRSxJQUFJLFVBQVUsT0FBTyxTQUFTLDZCQUE2QixRQUFRLEVBQUU7QUFBQSxRQUN2RSxFQUFFLElBQUksWUFBWSxPQUFPLFNBQVMsK0JBQStCLFVBQVUsRUFBRTtBQUFBLFFBQzdFLEVBQUUsSUFBSSxXQUFXLE9BQU8sU0FBUywrQkFBK0IsUUFBUSxFQUFFO0FBQUEsTUFDM0U7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJTdXJ2ZXlRdWVzdGlvblR5cGUiXQp9Cg==
