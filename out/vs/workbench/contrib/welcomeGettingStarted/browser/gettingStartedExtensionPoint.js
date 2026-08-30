import { localize } from "../../../../nls.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
const titleTranslated = localize("title", "Title");
const walkthroughsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "walkthroughs",
  jsonSchema: {
    description: localize("walkthroughs", "Contribute walkthroughs to help users getting started with your extension."),
    type: "array",
    items: {
      type: "object",
      required: ["id", "title", "description", "steps"],
      defaultSnippets: [{ body: { "id": "$1", "title": "$2", "description": "$3", "steps": [] } }],
      properties: {
        id: {
          type: "string",
          description: localize("walkthroughs.id", "Unique identifier for this walkthrough.")
        },
        title: {
          type: "string",
          description: localize("walkthroughs.title", "Title of walkthrough.")
        },
        icon: {
          type: "string",
          description: localize("walkthroughs.icon", "Relative path to the icon of the walkthrough. The path is relative to the extension location. If not specified, the icon defaults to the extension icon if available.")
        },
        description: {
          type: "string",
          description: localize("walkthroughs.description", "Description of walkthrough.")
        },
        featuredFor: {
          type: "array",
          description: localize("walkthroughs.featuredFor", "Walkthroughs that match one of these glob patterns appear as 'featured' in workspaces with the specified files. For example, a walkthrough for TypeScript projects might specify `tsconfig.json` here."),
          items: {
            type: "string"
          }
        },
        when: {
          type: "string",
          description: localize("walkthroughs.when", "Context key expression to control the visibility of this walkthrough.")
        },
        steps: {
          type: "array",
          description: localize("walkthroughs.steps", "Steps to complete as part of this walkthrough."),
          items: {
            type: "object",
            required: ["id", "title", "media"],
            defaultSnippets: [{
              body: {
                "id": "$1",
                "title": "$2",
                "description": "$3",
                "completionEvents": ["$5"],
                "media": {}
              }
            }],
            properties: {
              id: {
                type: "string",
                description: localize("walkthroughs.steps.id", "Unique identifier for this step. This is used to keep track of which steps have been completed.")
              },
              title: {
                type: "string",
                description: localize("walkthroughs.steps.title", "Title of step.")
              },
              description: {
                type: "string",
                description: localize("walkthroughs.steps.description.interpolated", "Description of step. Supports ``preformatted``, __italic__, and **bold** text. Use markdown-style links for commands or external links: {0}, {1}, or {2}. Links on their own line will be rendered as buttons.", `[${titleTranslated}](command:myext.command)`, `[${titleTranslated}](command:toSide:myext.command)`, `[${titleTranslated}](https://aka.ms)`)
              },
              button: {
                deprecationMessage: localize("walkthroughs.steps.button.deprecated.interpolated", "Deprecated. Use markdown links in the description instead, i.e. {0}, {1}, or {2}", `[${titleTranslated}](command:myext.command)`, `[${titleTranslated}](command:toSide:myext.command)`, `[${titleTranslated}](https://aka.ms)`)
              },
              media: {
                type: "object",
                description: localize("walkthroughs.steps.media", "Media to show alongside this step, either an image or markdown content."),
                oneOf: [
                  {
                    required: ["image", "altText"],
                    additionalProperties: false,
                    properties: {
                      path: {
                        deprecationMessage: localize("pathDeprecated", "Deprecated. Please use `image` or `markdown` instead")
                      },
                      image: {
                        description: localize("walkthroughs.steps.media.image.path.string", "Path to an image - or object consisting of paths to light, dark, and hc images - relative to extension directory. Depending on context, the image will be displayed from 400px to 800px wide, with similar bounds on height. To support HIDPI displays, the image will be rendered at 1.5x scaling, for example a 900 physical pixels wide image will be displayed as 600 logical pixels wide."),
                        oneOf: [
                          {
                            type: "string"
                          },
                          {
                            type: "object",
                            required: ["dark", "light", "hc", "hcLight"],
                            properties: {
                              dark: {
                                description: localize("walkthroughs.steps.media.image.path.dark.string", "Path to the image for dark themes, relative to extension directory."),
                                type: "string"
                              },
                              light: {
                                description: localize("walkthroughs.steps.media.image.path.light.string", "Path to the image for light themes, relative to extension directory."),
                                type: "string"
                              },
                              hc: {
                                description: localize("walkthroughs.steps.media.image.path.hc.string", "Path to the image for hc themes, relative to extension directory."),
                                type: "string"
                              },
                              hcLight: {
                                description: localize("walkthroughs.steps.media.image.path.hcLight.string", "Path to the image for hc light themes, relative to extension directory."),
                                type: "string"
                              }
                            }
                          }
                        ]
                      },
                      altText: {
                        type: "string",
                        description: localize("walkthroughs.steps.media.altText", "Alternate text to display when the image cannot be loaded or in screen readers.")
                      }
                    }
                  },
                  {
                    required: ["svg", "altText"],
                    additionalProperties: false,
                    properties: {
                      svg: {
                        description: localize("walkthroughs.steps.media.image.path.svg", "Path to an svg, color tokens are supported in variables to support theming to match the workbench."),
                        type: "string"
                      },
                      altText: {
                        type: "string",
                        description: localize("walkthroughs.steps.media.altText", "Alternate text to display when the image cannot be loaded or in screen readers.")
                      }
                    }
                  },
                  {
                    required: ["markdown"],
                    additionalProperties: false,
                    properties: {
                      path: {
                        deprecationMessage: localize("pathDeprecated", "Deprecated. Please use `image` or `markdown` instead")
                      },
                      markdown: {
                        description: localize("walkthroughs.steps.media.markdown.path", "Path to the markdown document, relative to extension directory."),
                        type: "string"
                      }
                    }
                  }
                ]
              },
              completionEvents: {
                description: localize("walkthroughs.steps.completionEvents", "Events that should trigger this step to become checked off. If empty or not defined, the step will check off when any of the step's buttons or links are clicked; if the step has no buttons or links it will check on when it is selected."),
                type: "array",
                items: {
                  type: "string",
                  defaultSnippets: [
                    {
                      label: "onCommand",
                      description: localize("walkthroughs.steps.completionEvents.onCommand", "Check off step when a given command is executed anywhere in VS Code."),
                      body: "onCommand:${1:commandId}"
                    },
                    {
                      label: "onLink",
                      description: localize("walkthroughs.steps.completionEvents.onLink", "Check off step when a given link is opened via a walkthrough step."),
                      body: "onLink:${2:linkId}"
                    },
                    {
                      label: "onView",
                      description: localize("walkthroughs.steps.completionEvents.onView", "Check off step when a given view is opened"),
                      body: "onView:${2:viewId}"
                    },
                    {
                      label: "onSettingChanged",
                      description: localize("walkthroughs.steps.completionEvents.onSettingChanged", "Check off step when a given setting is changed"),
                      body: "onSettingChanged:${2:settingName}"
                    },
                    {
                      label: "onContext",
                      description: localize("walkthroughs.steps.completionEvents.onContext", "Check off step when a context key expression is true."),
                      body: "onContext:${2:key}"
                    },
                    {
                      label: "onExtensionInstalled",
                      description: localize("walkthroughs.steps.completionEvents.extensionInstalled", "Check off step when an extension with the given id is installed. If the extension is already installed, the step will start off checked."),
                      body: "onExtensionInstalled:${3:extensionId}"
                    },
                    {
                      label: "onStepSelected",
                      description: localize("walkthroughs.steps.completionEvents.stepSelected", "Check off step as soon as it is selected."),
                      body: "onStepSelected"
                    }
                  ]
                }
              },
              doneOn: {
                description: localize("walkthroughs.steps.doneOn", "Signal to mark step as complete."),
                deprecationMessage: localize("walkthroughs.steps.doneOn.deprecation", "doneOn is deprecated. By default steps will be checked off when their buttons are clicked, to configure further use completionEvents"),
                type: "object",
                required: ["command"],
                defaultSnippets: [{ "body": { command: "$1" } }],
                properties: {
                  "command": {
                    description: localize("walkthroughs.steps.oneOn.command", "Mark step done when the specified command is executed."),
                    type: "string"
                  }
                }
              },
              when: {
                type: "string",
                description: localize("walkthroughs.steps.when", "Context key expression to control the visibility of this step.")
              }
            }
          }
        }
      }
    }
  },
  activationEventsGenerator: function* (walkthroughContributions) {
    for (const walkthroughContribution of walkthroughContributions) {
      if (walkthroughContribution.id) {
        yield `onWalkthrough:${walkthroughContribution.id}`;
      }
    }
  }
});
export {
  walkthroughsExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcYnJvd3NlclxcZ2V0dGluZ1N0YXJ0ZWRFeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXYWxrdGhyb3VnaCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcblxuY29uc3QgdGl0bGVUcmFuc2xhdGVkID0gbG9jYWxpemUoJ3RpdGxlJywgXCJUaXRsZVwiKTtcblxuZXhwb3J0IGNvbnN0IHdhbGt0aHJvdWdoc0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVdhbGt0aHJvdWdoW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICd3YWxrdGhyb3VnaHMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMnLCBcIkNvbnRyaWJ1dGUgd2Fsa3Rocm91Z2hzIHRvIGhlbHAgdXNlcnMgZ2V0dGluZyBzdGFydGVkIHdpdGggeW91ciBleHRlbnNpb24uXCIpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndGl0bGUnLCAnZGVzY3JpcHRpb24nLCAnc3RlcHMnXSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyAnaWQnOiAnJDEnLCAndGl0bGUnOiAnJDInLCAnZGVzY3JpcHRpb24nOiAnJDMnLCAnc3RlcHMnOiBbXSB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLmlkJywgXCJVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyB3YWxrdGhyb3VnaC5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMudGl0bGUnLCBcIlRpdGxlIG9mIHdhbGt0aHJvdWdoLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpY29uOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuaWNvbicsIFwiUmVsYXRpdmUgcGF0aCB0byB0aGUgaWNvbiBvZiB0aGUgd2Fsa3Rocm91Z2guIFRoZSBwYXRoIGlzIHJlbGF0aXZlIHRvIHRoZSBleHRlbnNpb24gbG9jYXRpb24uIElmIG5vdCBzcGVjaWZpZWQsIHRoZSBpY29uIGRlZmF1bHRzIHRvIHRoZSBleHRlbnNpb24gaWNvbiBpZiBhdmFpbGFibGUuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLmRlc2NyaXB0aW9uJywgXCJEZXNjcmlwdGlvbiBvZiB3YWxrdGhyb3VnaC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmVhdHVyZWRGb3I6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLmZlYXR1cmVkRm9yJywgXCJXYWxrdGhyb3VnaHMgdGhhdCBtYXRjaCBvbmUgb2YgdGhlc2UgZ2xvYiBwYXR0ZXJucyBhcHBlYXIgYXMgJ2ZlYXR1cmVkJyBpbiB3b3Jrc3BhY2VzIHdpdGggdGhlIHNwZWNpZmllZCBmaWxlcy4gRm9yIGV4YW1wbGUsIGEgd2Fsa3Rocm91Z2ggZm9yIFR5cGVTY3JpcHQgcHJvamVjdHMgbWlnaHQgc3BlY2lmeSBgdHNjb25maWcuanNvbmAgaGVyZS5cIiksXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLndoZW4nLCBcIkNvbnRleHQga2V5IGV4cHJlc3Npb24gdG8gY29udHJvbCB0aGUgdmlzaWJpbGl0eSBvZiB0aGlzIHdhbGt0aHJvdWdoLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGVwczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMnLCBcIlN0ZXBzIHRvIGNvbXBsZXRlIGFzIHBhcnQgb2YgdGhpcyB3YWxrdGhyb3VnaC5cIiksXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndGl0bGUnLCAnbWVkaWEnXSxcblx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0XHRcdCdpZCc6ICckMScsICd0aXRsZSc6ICckMicsICdkZXNjcmlwdGlvbic6ICckMycsXG5cdFx0XHRcdFx0XHRcdFx0J2NvbXBsZXRpb25FdmVudHMnOiBbJyQ1J10sXG5cdFx0XHRcdFx0XHRcdFx0J21lZGlhJzoge30sXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmlkJywgXCJVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBzdGVwLiBUaGlzIGlzIHVzZWQgdG8ga2VlcCB0cmFjayBvZiB3aGljaCBzdGVwcyBoYXZlIGJlZW4gY29tcGxldGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy50aXRsZScsIFwiVGl0bGUgb2Ygc3RlcC5cIilcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkRlc2NyaXB0aW9uIG9mIHN0ZXAuIFN1cHBvcnRzIGBgcHJlZm9ybWF0dGVkYGAsIF9faXRhbGljX18sIGFuZCAqKmJvbGQqKiB0ZXh0LiBVc2UgbWFya2Rvd24tc3R5bGUgbGlua3MgZm9yIGNvbW1hbmRzIG9yIGV4dGVybmFsIGxpbmtzOiB7MH0sIHsxfSwgb3IgezJ9LiBMaW5rcyBvbiB0aGVpciBvd24gbGluZSB3aWxsIGJlIHJlbmRlcmVkIGFzIGJ1dHRvbnMuXCIsIGBbJHt0aXRsZVRyYW5zbGF0ZWR9XShjb21tYW5kOm15ZXh0LmNvbW1hbmQpYCwgYFske3RpdGxlVHJhbnNsYXRlZH1dKGNvbW1hbmQ6dG9TaWRlOm15ZXh0LmNvbW1hbmQpYCwgYFske3RpdGxlVHJhbnNsYXRlZH1dKGh0dHBzOi8vYWthLm1zKWApXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGJ1dHRvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5idXR0b24uZGVwcmVjYXRlZC5pbnRlcnBvbGF0ZWQnLCBcIkRlcHJlY2F0ZWQuIFVzZSBtYXJrZG93biBsaW5rcyBpbiB0aGUgZGVzY3JpcHRpb24gaW5zdGVhZCwgaS5lLiB7MH0sIHsxfSwgb3IgezJ9XCIsIGBbJHt0aXRsZVRyYW5zbGF0ZWR9XShjb21tYW5kOm15ZXh0LmNvbW1hbmQpYCwgYFske3RpdGxlVHJhbnNsYXRlZH1dKGNvbW1hbmQ6dG9TaWRlOm15ZXh0LmNvbW1hbmQpYCwgYFske3RpdGxlVHJhbnNsYXRlZH1dKGh0dHBzOi8vYWthLm1zKWApLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhJywgXCJNZWRpYSB0byBzaG93IGFsb25nc2lkZSB0aGlzIHN0ZXAsIGVpdGhlciBhbiBpbWFnZSBvciBtYXJrZG93biBjb250ZW50LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydpbWFnZScsICdhbHRUZXh0J10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3BhdGhEZXByZWNhdGVkJywgXCJEZXByZWNhdGVkLiBQbGVhc2UgdXNlIGBpbWFnZWAgb3IgYG1hcmtkb3duYCBpbnN0ZWFkXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpbWFnZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMubWVkaWEuaW1hZ2UucGF0aC5zdHJpbmcnLCBcIlBhdGggdG8gYW4gaW1hZ2UgLSBvciBvYmplY3QgY29uc2lzdGluZyBvZiBwYXRocyB0byBsaWdodCwgZGFyaywgYW5kIGhjIGltYWdlcyAtIHJlbGF0aXZlIHRvIGV4dGVuc2lvbiBkaXJlY3RvcnkuIERlcGVuZGluZyBvbiBjb250ZXh0LCB0aGUgaW1hZ2Ugd2lsbCBiZSBkaXNwbGF5ZWQgZnJvbSA0MDBweCB0byA4MDBweCB3aWRlLCB3aXRoIHNpbWlsYXIgYm91bmRzIG9uIGhlaWdodC4gVG8gc3VwcG9ydCBISURQSSBkaXNwbGF5cywgdGhlIGltYWdlIHdpbGwgYmUgcmVuZGVyZWQgYXQgMS41eCBzY2FsaW5nLCBmb3IgZXhhbXBsZSBhIDkwMCBwaHlzaWNhbCBwaXhlbHMgd2lkZSBpbWFnZSB3aWxsIGJlIGRpc3BsYXllZCBhcyA2MDAgbG9naWNhbCBwaXhlbHMgd2lkZS5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydkYXJrJywgJ2xpZ2h0JywgJ2hjJywgJ2hjTGlnaHQnXSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkYXJrOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmltYWdlLnBhdGguZGFyay5zdHJpbmcnLCBcIlBhdGggdG8gdGhlIGltYWdlIGZvciBkYXJrIHRoZW1lcywgcmVsYXRpdmUgdG8gZXh0ZW5zaW9uIGRpcmVjdG9yeS5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmltYWdlLnBhdGgubGlnaHQuc3RyaW5nJywgXCJQYXRoIHRvIHRoZSBpbWFnZSBmb3IgbGlnaHQgdGhlbWVzLCByZWxhdGl2ZSB0byBleHRlbnNpb24gZGlyZWN0b3J5LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMubWVkaWEuaW1hZ2UucGF0aC5oYy5zdHJpbmcnLCBcIlBhdGggdG8gdGhlIGltYWdlIGZvciBoYyB0aGVtZXMsIHJlbGF0aXZlIHRvIGV4dGVuc2lvbiBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRoY0xpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmltYWdlLnBhdGguaGNMaWdodC5zdHJpbmcnLCBcIlBhdGggdG8gdGhlIGltYWdlIGZvciBoYyBsaWdodCB0aGVtZXMsIHJlbGF0aXZlIHRvIGV4dGVuc2lvbiBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFsdFRleHQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMubWVkaWEuYWx0VGV4dCcsIFwiQWx0ZXJuYXRlIHRleHQgdG8gZGlzcGxheSB3aGVuIHRoZSBpbWFnZSBjYW5ub3QgYmUgbG9hZGVkIG9yIGluIHNjcmVlbiByZWFkZXJzLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnc3ZnJywgJ2FsdFRleHQnXSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c3ZnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5tZWRpYS5pbWFnZS5wYXRoLnN2ZycsIFwiUGF0aCB0byBhbiBzdmcsIGNvbG9yIHRva2VucyBhcmUgc3VwcG9ydGVkIGluIHZhcmlhYmxlcyB0byBzdXBwb3J0IHRoZW1pbmcgdG8gbWF0Y2ggdGhlIHdvcmtiZW5jaC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFsdFRleHQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMubWVkaWEuYWx0VGV4dCcsIFwiQWx0ZXJuYXRlIHRleHQgdG8gZGlzcGxheSB3aGVuIHRoZSBpbWFnZSBjYW5ub3QgYmUgbG9hZGVkIG9yIGluIHNjcmVlbiByZWFkZXJzLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ21hcmtkb3duJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3BhdGhEZXByZWNhdGVkJywgXCJEZXByZWNhdGVkLiBQbGVhc2UgdXNlIGBpbWFnZWAgb3IgYG1hcmtkb3duYCBpbnN0ZWFkXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMubWVkaWEubWFya2Rvd24ucGF0aCcsIFwiUGF0aCB0byB0aGUgbWFya2Rvd24gZG9jdW1lbnQsIHJlbGF0aXZlIHRvIGV4dGVuc2lvbiBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRjb21wbGV0aW9uRXZlbnRzOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuY29tcGxldGlvbkV2ZW50cycsIFwiRXZlbnRzIHRoYXQgc2hvdWxkIHRyaWdnZXIgdGhpcyBzdGVwIHRvIGJlY29tZSBjaGVja2VkIG9mZi4gSWYgZW1wdHkgb3Igbm90IGRlZmluZWQsIHRoZSBzdGVwIHdpbGwgY2hlY2sgb2ZmIHdoZW4gYW55IG9mIHRoZSBzdGVwJ3MgYnV0dG9ucyBvciBsaW5rcyBhcmUgY2xpY2tlZDsgaWYgdGhlIHN0ZXAgaGFzIG5vIGJ1dHRvbnMgb3IgbGlua3MgaXQgd2lsbCBjaGVjayBvbiB3aGVuIGl0IGlzIHNlbGVjdGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICdvbkNvbW1hbmQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmNvbXBsZXRpb25FdmVudHMub25Db21tYW5kJywgJ0NoZWNrIG9mZiBzdGVwIHdoZW4gYSBnaXZlbiBjb21tYW5kIGlzIGV4ZWN1dGVkIGFueXdoZXJlIGluIFZTIENvZGUuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9keTogJ29uQ29tbWFuZDokezE6Y29tbWFuZElkfSdcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiAnb25MaW5rJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLm9uTGluaycsICdDaGVjayBvZmYgc3RlcCB3aGVuIGEgZ2l2ZW4gbGluayBpcyBvcGVuZWQgdmlhIGEgd2Fsa3Rocm91Z2ggc3RlcC4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRib2R5OiAnb25MaW5rOiR7MjpsaW5rSWR9J1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICdvblZpZXcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmNvbXBsZXRpb25FdmVudHMub25WaWV3JywgJ0NoZWNrIG9mZiBzdGVwIHdoZW4gYSBnaXZlbiB2aWV3IGlzIG9wZW5lZCcpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJvZHk6ICdvblZpZXc6JHsyOnZpZXdJZH0nXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJ29uU2V0dGluZ0NoYW5nZWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmNvbXBsZXRpb25FdmVudHMub25TZXR0aW5nQ2hhbmdlZCcsICdDaGVjayBvZmYgc3RlcCB3aGVuIGEgZ2l2ZW4gc2V0dGluZyBpcyBjaGFuZ2VkJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9keTogJ29uU2V0dGluZ0NoYW5nZWQ6JHsyOnNldHRpbmdOYW1lfSdcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiAnb25Db250ZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLm9uQ29udGV4dCcsICdDaGVjayBvZmYgc3RlcCB3aGVuIGEgY29udGV4dCBrZXkgZXhwcmVzc2lvbiBpcyB0cnVlLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJvZHk6ICdvbkNvbnRleHQ6JHsyOmtleX0nXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJ29uRXh0ZW5zaW9uSW5zdGFsbGVkJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLmV4dGVuc2lvbkluc3RhbGxlZCcsICdDaGVjayBvZmYgc3RlcCB3aGVuIGFuIGV4dGVuc2lvbiB3aXRoIHRoZSBnaXZlbiBpZCBpcyBpbnN0YWxsZWQuIElmIHRoZSBleHRlbnNpb24gaXMgYWxyZWFkeSBpbnN0YWxsZWQsIHRoZSBzdGVwIHdpbGwgc3RhcnQgb2ZmIGNoZWNrZWQuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9keTogJ29uRXh0ZW5zaW9uSW5zdGFsbGVkOiR7MzpleHRlbnNpb25JZH0nXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJ29uU3RlcFNlbGVjdGVkJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLnN0ZXBTZWxlY3RlZCcsICdDaGVjayBvZmYgc3RlcCBhcyBzb29uIGFzIGl0IGlzIHNlbGVjdGVkLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJvZHk6ICdvblN0ZXBTZWxlY3RlZCdcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRvbmVPbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmRvbmVPbicsIFwiU2lnbmFsIHRvIG1hcmsgc3RlcCBhcyBjb21wbGV0ZS5cIiksXG5cdFx0XHRcdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmRvbmVPbi5kZXByZWNhdGlvbicsIFwiZG9uZU9uIGlzIGRlcHJlY2F0ZWQuIEJ5IGRlZmF1bHQgc3RlcHMgd2lsbCBiZSBjaGVja2VkIG9mZiB3aGVuIHRoZWlyIGJ1dHRvbnMgYXJlIGNsaWNrZWQsIHRvIGNvbmZpZ3VyZSBmdXJ0aGVyIHVzZSBjb21wbGV0aW9uRXZlbnRzXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1hbmQnXSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7ICdib2R5JzogeyBjb21tYW5kOiAnJDEnIH0gfV0sXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J2NvbW1hbmQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm9uZU9uLmNvbW1hbmQnLCBcIk1hcmsgc3RlcCBkb25lIHdoZW4gdGhlIHNwZWNpZmllZCBjb21tYW5kIGlzIGV4ZWN1dGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMud2hlbicsIFwiQ29udGV4dCBrZXkgZXhwcmVzc2lvbiB0byBjb250cm9sIHRoZSB2aXNpYmlsaXR5IG9mIHRoaXMgc3RlcC5cIilcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qICh3YWxrdGhyb3VnaENvbnRyaWJ1dGlvbnMpIHtcblx0XHRmb3IgKGNvbnN0IHdhbGt0aHJvdWdoQ29udHJpYnV0aW9uIG9mIHdhbGt0aHJvdWdoQ29udHJpYnV0aW9ucykge1xuXHRcdFx0aWYgKHdhbGt0aHJvdWdoQ29udHJpYnV0aW9uLmlkKSB7XG5cdFx0XHRcdHlpZWxkIGBvbldhbGt0aHJvdWdoOiR7d2Fsa3Rocm91Z2hDb250cmlidXRpb24uaWR9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSxrQkFBa0IsU0FBUyxTQUFTLE9BQU87QUFFMUMsTUFBTSw2QkFBNkIsbUJBQW1CLHVCQUF1QztBQUFBLEVBQ25HLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFBQSxJQUNYLGFBQWEsU0FBUyxnQkFBZ0IsNEVBQTRFO0FBQUEsSUFDbEgsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sVUFBVSxDQUFDLE1BQU0sU0FBUyxlQUFlLE9BQU87QUFBQSxNQUNoRCxpQkFBaUIsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLE1BQU0sU0FBUyxNQUFNLGVBQWUsTUFBTSxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7QUFBQSxNQUMzRixZQUFZO0FBQUEsUUFDWCxJQUFJO0FBQUEsVUFDSCxNQUFNO0FBQUEsVUFDTixhQUFhLFNBQVMsbUJBQW1CLHlDQUF5QztBQUFBLFFBQ25GO0FBQUEsUUFDQSxPQUFPO0FBQUEs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
