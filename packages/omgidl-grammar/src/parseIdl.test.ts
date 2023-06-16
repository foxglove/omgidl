import { parseIdl } from "./parseIdl";

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

  it("parses a nested IDL with constants", () => {
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
          name: "rosidl_parser",
          definitionType: "module",
          definitions: [
            {
              name: "action",
              definitionType: "module",
              definitions: [
                {
                  name: "MyAction_Goal_Constants",
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
                },
                {
                  name: "MyAction_Goal",
                  definitionType: "struct",
                  definitions: [
                    { constantUsage: [], isComplex: false, name: "input_value", type: "int32" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    ]);
  });
  it("parses all numerical types", () => {
    const schema = `
        struct All_Numbers {
          unsigned short unsigned_short_value;
          long long_value;
          unsigned long unsigned_long_value;
          long long long_long_value;
          unsigned long long unsigned_long_long_value;
          float float_value;
          double double_value;
          char char_value;
          wchar wchar_value;
          boolean boolean_value;
          octet octet_value;
          int8 int8_value;
          uint8 uint8_value;
          int16 int16_value;
          uint16 uint16_value;
          int32 int32_value;
          uint32 uint32_value;
          int64 int64_value;
          uint64 uint64_value;
        };
    `;

    expect(parseIdl(schema)).toEqual([
      [
        {
          name: "All_Numbers",
          definitionType: "struct",
          definitions: [
            {
              constantUsage: [],
              type: "uint16",
              name: "unsigned_short_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "int32",
              name: "long_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "uint32",
              name: "unsigned_long_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "int64",
              name: "long_long_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "uint64",
              name: "unsigned_long_long_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "float32",
              name: "float_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "float64",
              name: "double_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "char",
              name: "char_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "char",
              name: "wchar_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "bool",
              name: "boolean_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "byte",
              name: "octet_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "int8",
              name: "int8_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "uint8",
              name: "uint8_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "int16",
              name: "int16_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "uint16",
              name: "uint16_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "int32",
              name: "int32_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "uint32",
              name: "uint32_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "int64",
              name: "int64_value",
              isComplex: false,
            },
            {
              constantUsage: [],
              type: "uint64",
              name: "uint64_value",
              isComplex: false,
            },
          ],
        },
      ],
    ]);
  });
});
