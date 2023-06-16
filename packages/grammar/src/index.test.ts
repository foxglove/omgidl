import { parseIdl } from "./parser";

describe("IDL grammar", () => {
  it("parses a simple IDL", () => {
    const schema = `
        struct MyAction_Goal {
          int32 input_value;
        };
    `;

    expect(parseIdl(schema)).toEqual([
      [
        {
          definitionType: "struct",
          definitions: [
            { constantUsage: [], isComplex: false, name: "input_value", type: "int32" },
          ],
          name: "MyAction_Goal",
        },
      ],
    ]);
  });
  it("parses a nested IDL", () => {
    const schema = `
    module rosidl_parser {
      module action {
        module MyAction_Goal_Constants {
          const short SHORT_CONSTANT = -23;
        };
        struct MyAction_Goal {
          int32 input_value;
        };
      };
    };
    `;

    expect(parseIdl(schema)).toEqual([
      [
        {
          definitionType: "module",
          definitions: [
            {
              definitionType: "module",
              definitions: [
                {
                  definitionType: "module",
                  definitions: [
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "SHORT_CONSTANT",
                      type: "int16",
                      value: -23,
                      valueText: "-23",
                    },
                  ],
                  name: "MyAction_Goal_Constants",
                },
                {
                  definitionType: "struct",
                  definitions: [
                    { constantUsage: [], isComplex: false, name: "input_value", type: "int32" },
                  ],
                  name: "MyAction_Goal",
                },
              ],
              name: "action",
            },
          ],
          name: "rosidl_parser",
        },
      ],
    ]);
  });
});
