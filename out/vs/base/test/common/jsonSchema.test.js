import assert from "assert";
import { getCompressedContent } from "../../common/jsonSchema.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON Schema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getCompressedContent 1", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          description: "a",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        e: {
          type: "object",
          description: "e",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          type: "object",
          description: "a",
          properties: {
            b: {
              $ref: "#/$defs/_0"
            }
          }
        },
        e: {
          type: "object",
          description: "e",
          properties: {
            b: {
              $ref: "#/$defs/_0"
            }
          }
        }
      },
      $defs: {
        "_0": {
          type: "object",
          properties: {
            c: {
              type: "object",
              properties: {
                d: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
  test("getCompressedContent 2", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        e: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          $ref: "#/$defs/_0"
        },
        e: {
          $ref: "#/$defs/_0"
        }
      },
      $defs: {
        "_0": {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
  test("getCompressedContent 3", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          oneOf: [
            {
              allOf: [
                {
                  properties: {
                    name: {
                      type: "string"
                    },
                    description: {
                      type: "string"
                    }
                  }
                },
                {
                  properties: {
                    street: {
                      type: "string"
                    }
                  }
                }
              ]
            },
            {
              allOf: [
                {
                  properties: {
                    name: {
                      type: "string"
                    },
                    description: {
                      type: "string"
                    }
                  }
                },
                {
                  properties: {
                    river: {
                      type: "string"
                    }
                  }
                }
              ]
            },
            {
              allOf: [
                {
                  properties: {
                    name: {
                      type: "string"
                    },
                    description: {
                      type: "string"
                    }
                  }
                },
                {
                  properties: {
                    mountain: {
                      type: "string"
                    }
                  }
                }
              ]
            }
          ]
        },
        b: {
          type: "object",
          properties: {
            street: {
              properties: {
                street: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      "type": "object",
      "properties": {
        "a": {
          "type": "object",
          "oneOf": [
            {
              "allOf": [
                {
                  "$ref": "#/$defs/_0"
                },
                {
                  "$ref": "#/$defs/_1"
                }
              ]
            },
            {
              "allOf": [
                {
                  "$ref": "#/$defs/_0"
                },
                {
                  "properties": {
                    "river": {
                      "type": "string"
                    }
                  }
                }
              ]
            },
            {
              "allOf": [
                {
                  "$ref": "#/$defs/_0"
                },
                {
                  "properties": {
                    "mountain": {
                      "type": "string"
                    }
                  }
                }
              ]
            }
          ]
        },
        "b": {
          "type": "object",
          "properties": {
            "street": {
              "$ref": "#/$defs/_1"
            }
          }
        }
      },
      "$defs": {
        "_0": {
          "properties": {
            "name": {
              "type": "string"
            },
            "description": {
              "type": "string"
            }
          }
        },
        "_1": {
          "properties": {
            "street": {
              "type": "string"
            }
          }
        }
      }
    };
    const actual = getCompressedContent(schema);
    assert.deepEqual(actual, JSON.stringify(expected));
  });
  test("getCompressedContent 4", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        e: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        f: {
          type: "object",
          properties: {
            d: {
              type: "string"
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          $ref: "#/$defs/_0"
        },
        e: {
          $ref: "#/$defs/_0"
        },
        f: {
          $ref: "#/$defs/_1"
        }
      },
      $defs: {
        "_0": {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  $ref: "#/$defs/_1"
                }
              }
            }
          }
        },
        "_1": {
          type: "object",
          properties: {
            d: {
              type: "string"
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
  test("getCompressedContent 5", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "array",
          items: {
            type: "object",
            properties: {
              c: {
                type: "object",
                properties: {
                  d: {
                    type: "string"
                  }
                }
              }
            }
          }
        },
        e: {
          type: "array",
          items: {
            type: "object",
            properties: {
              c: {
                type: "object",
                properties: {
                  d: {
                    type: "string"
                  }
                }
              }
            }
          }
        },
        f: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        g: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          $ref: "#/$defs/_0"
        },
        e: {
          $ref: "#/$defs/_0"
        },
        f: {
          $ref: "#/$defs/_1"
        },
        g: {
          $ref: "#/$defs/_1"
        }
      },
      $defs: {
        "_0": {
          type: "array",
          items: {
            $ref: "#/$defs/_2"
          }
        },
        "_1": {
          type: "object",
          properties: {
            b: {
              $ref: "#/$defs/_2"
            }
          }
        },
        "_2": {
          type: "object",
          properties: {
            c: {
              type: "object",
              properties: {
                d: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGpzb25TY2hlbWEudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBnZXRDb21wcmVzc2VkQ29udGVudCwgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0pTT04gU2NoZW1hJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dldENvbXByZXNzZWRDb250ZW50IDEnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2EnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2UnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2EnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzAnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdlJyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCRkZWZzOiB7XG5cdFx0XHRcdCdfMCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcEVxdWFsKGdldENvbXByZXNzZWRDb250ZW50KHNjaGVtYSksIEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbXByZXNzZWRDb250ZW50IDInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBleHBlY3RlZDogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18wJ1xuXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCRkZWZzOiB7XG5cdFx0XHRcdCdfMCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChnZXRDb21wcmVzc2VkQ29udGVudChzY2hlbWEpLCBKU09OLnN0cmluZ2lmeShleHBlY3RlZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb21wcmVzc2VkQ29udGVudCAzJywgKCkgPT4ge1xuXG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhbGxPZjogW1xuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRzdHJlZXQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0YWxsT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cml2ZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0YWxsT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bW91bnRhaW46IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHN0cmVldDoge1xuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0c3RyZWV0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBleHBlY3RlZDogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J29uZU9mJzogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQnYWxsT2YnOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdCckcmVmJzogJyMvJGRlZnMvXzEnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQnYWxsT2YnOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQncml2ZXInOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQnYWxsT2YnOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQnbW91bnRhaW4nOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYic6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J3N0cmVldCc6IHtcblx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy8kZGVmcy9fMSdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnJGRlZnMnOiB7XG5cdFx0XHRcdCdfMCc6IHtcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCduYW1lJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnXzEnOiB7XG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQnc3RyZWV0Jzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGdldENvbXByZXNzZWRDb250ZW50KHNjaGVtYSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChhY3R1YWwsIEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbXByZXNzZWRDb250ZW50IDQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Zjoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0fSxcblx0XHRcdFx0ZToge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRmOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzEnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQkZGVmczoge1xuXHRcdFx0XHQnXzAnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18xJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J18xJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcEVxdWFsKGdldENvbXByZXNzZWRDb250ZW50KHNjaGVtYSksIEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbXByZXNzZWRDb250ZW50IDUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGY6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBleHBlY3RlZDogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzAnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGY6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMSdcblx0XHRcdFx0fSxcblx0XHRcdFx0Zzoge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18xJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0JGRlZnM6IHtcblx0XHRcdFx0J18wJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18yJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J18xJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzInXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnXzInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChnZXRDb21wcmVzc2VkQ29udGVudChzY2hlbWEpLCBKU09OLnN0cmluZ2lmeShleHBlY3RlZCkpO1xuXHR9KTtcblxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDRCQUF5QztBQUNsRCxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGVBQWUsTUFBTTtBQUUxQiwwQ0FBd0M7QUFFeEMsT0FBSywwQkFBMEIsTUFBTTtBQUVwQyxVQUFNLFNBQXNCO0FBQUEsTUFDM0IsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsR0FBRztBQUFBLFVBQ0YsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsWUFBWTtBQUFBLFlBQ1gsR0FBRztBQUFBLGNBQ0YsTUFBTTtBQUFBLGNBQ04sWUFBWTtBQUFBLGdCQUNYLEdBQUc7QUFBQSxrQkFDRixNQUFNO0FBQUEsa0JBQ04sWUFBWTtBQUFBLG9CQUNYLEdBQUc7QUFBQSxzQkFDRixNQUFNO0FBQUEsb0JBQ1A7QUFBQSxrQkFDRDtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0EsR0FBRztBQUFBLFVBQ0YsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsWUFBWTtBQUFBLFlBQ1gsR0FBRztBQUFBLGNBQ0YsTUFBTTtBQUFBLGNBQ04sWUFBWTtBQUFBLGdCQUNYLEdBQUc7QUFBQSxrQkFDRixNQUFNO0FBQUEs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
