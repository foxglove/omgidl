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
    module idl_parser {
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
          name: "idl_parser",
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
  it("parses a module full of numeric constants", () => {
    const types = parseIdl(
      `
module idl_parser {
  module msg {
    module MyMessage_Constants {
      const short SHORT_CONSTANT = -23;
      const unsigned long UNSIGNED_LONG_CONSTANT = 42;
      const float FLOAT_CONSTANT = 1.25;
      const double EXP_DOUBLE_CONSTANT = 1.25e-3;
    };
  };
};
    `,
    );
    expect(types).toEqual([
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
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "UNSIGNED_LONG_CONSTANT",
                      type: "uint32",
                      value: 42,
                      valueText: "42",
                    },
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "FLOAT_CONSTANT",
                      type: "float32",
                      value: 1.25,
                      valueText: "1.25",
                    },
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "EXP_DOUBLE_CONSTANT",
                      type: "float64",
                      value: 0.00125,
                      valueText: "1.25e-3",
                    },
                  ],
                  name: "MyMessage_Constants",
                },
              ],
              name: "msg",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module with various floating point default values", () => {
    const types = parseIdl(
      `
      module idl_parser {
        module msg {
          struct MyMessage {
            @default ( value=1.9e10 )
            float int_and_frac_with_positive_scientific;
            @default ( value=1.9e+10 )
            float int_and_frac_with_explicit_positive_scientific;
            @default ( value=1.1e-10)
            float int_and_frac_with_negative_scientific;
            @default ( value=0.00009 )
            float int_and_frac;
            @default ( value = 1. )
            float int_with_empty_frac;
            @default ( value = .1 )
            float frac_only;
            @default ( value=9e05 )
            float int_with_positive_scientific;
            @default ( value=9e+05 )
            float int_with_explicit_positive_scientific;
            @default ( value=9e-05 )
            float int_with_negative_scientific;
            @default ( value=8.7d )
            float fixed_int_and_frac;
            @default ( value=4.d )
            float fixed_int_with_dot_only;
            @default ( value=.3d )
            float fixed_frac_only;
            @default ( value=7d )
            float fixed_int_only;
          };
        };
      };
    `,
    );
    expect(types).toEqual([
      [
        {
          definitionType: "module",
          definitions: [
            {
              definitionType: "module",
              definitions: [
                {
                  definitionType: "struct",
                  definitions: [
                    {
                      constantUsage: [],
                      defaultValue: 19000000000,
                      isComplex: false,
                      name: "int_and_frac_with_positive_scientific",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 19000000000,
                      isComplex: false,
                      name: "int_and_frac_with_explicit_positive_scientific",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 1.1e-10,
                      isComplex: false,
                      name: "int_and_frac_with_negative_scientific",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 0.00009,
                      isComplex: false,
                      name: "int_and_frac",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 1,
                      isComplex: false,
                      name: "int_with_empty_frac",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 0.1,
                      isComplex: false,
                      name: "frac_only",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 900000,
                      isComplex: false,
                      name: "int_with_positive_scientific",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 900000,
                      isComplex: false,
                      name: "int_with_explicit_positive_scientific",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 0.00009,
                      isComplex: false,
                      name: "int_with_negative_scientific",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 8.7,
                      isComplex: false,
                      name: "fixed_int_and_frac",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 4,
                      isComplex: false,
                      name: "fixed_int_with_dot_only",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 0.3,
                      isComplex: false,
                      name: "fixed_frac_only",
                      type: "float32",
                    },
                    {
                      constantUsage: [],
                      defaultValue: 7,
                      isComplex: false,
                      name: "fixed_int_only",
                      type: "float32",
                    },
                  ],
                  name: "MyMessage",
                },
              ],
              name: "msg",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module with customTypes", () => {
    const types = parseIdl(
      `
module idl_parser {
  module msg {
    struct MyMessage {
      geometry::msg::Point single_point;
      geometry::msg::Point points_with_length[10];
      sequence<geometry::msg::Point> points_with_length_sequence;
    };
  };
};
    `,
    );
    expect(types).toEqual([
      [
        {
          definitionType: "module",
          definitions: [
            {
              definitionType: "module",
              definitions: [
                {
                  definitionType: "struct",
                  definitions: [
                    {
                      constantUsage: [],
                      isComplex: true,
                      name: "single_point",
                      type: "geometry::msg::Point",
                    },
                    {
                      arrayLength: 10,
                      constantUsage: [],
                      isArray: true,
                      isComplex: true,
                      name: "points_with_length",
                      type: "geometry::msg::Point",
                    },
                    {
                      arrayUpperBound: undefined,
                      constantUsage: [],
                      isArray: true,
                      isComplex: true,
                      name: "points_with_length_sequence",
                      type: "geometry::msg::Point",
                    },
                  ],
                  name: "MyMessage",
                },
              ],
              name: "msg",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module with arbitrary annotations including default values", () => {
    const types = parseIdl(
      `
module idl_parser {
  module msg {
    @verbatim ( language="comment", text="Documentation of MyMessage." "Adjacent string literal." )
    @transfer_mode(SHMEM_REF)
    struct MyMessage {
      @default ( value=123 )
      unsigned short unsigned_short_value;
      @key
      @range ( min=-10, max=10 )
      long long_value;
      @verbatim (language="comment", text="")
      @arbitrary_annotation ( key1="value1", key2=TRUE, key3=0.0, key4=10 )
      @key unsigned long unsigned_long_value;
    };
  };
};
    `,
    );
    expect(types).toEqual([
      [
        {
          definitionType: "module",
          definitions: [
            {
              definitionType: "module",
              definitions: [
                {
                  definitionType: "struct",
                  definitions: [
                    {
                      constantUsage: [],
                      defaultValue: 123,
                      isComplex: false,
                      name: "unsigned_short_value",
                      type: "uint16",
                    },
                    { constantUsage: [], isComplex: false, name: "long_value", type: "int32" },
                    {
                      constantUsage: [],
                      isComplex: false,
                      name: "unsigned_long_value",
                      type: "uint32",
                    },
                  ],
                  name: "MyMessage",
                },
              ],
              name: "msg",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module with a typedefs used in a struct", () => {
    const types = parseIdl(
      `
    module idl_parser {
      module action {
        typedef sequence<int32, 10> int32arr;
        @default (value=5)
        typedef short shortWithDefault;
        struct MyAction_Goal {
          int32arr intArray;
          shortWithDefault short5;
        };
      };
    };
    `,
    );
    expect(types).toEqual([
      [
        {
          definitionType: "module",
          definitions: [
            {
              definitionType: "module",
              definitions: [
                {
                  arrayUpperBound: 10,
                  constantUsage: [],
                  definitionType: "typedef",
                  isArray: true,
                  isComplex: false,
                  name: "int32arr",
                  type: "int32",
                },
                {
                  constantUsage: [],
                  defaultValue: 5,
                  definitionType: "typedef",
                  isComplex: false,
                  name: "shortWithDefault",
                  type: "int16",
                },
                {
                  definitionType: "struct",
                  definitions: [
                    { constantUsage: [], isComplex: false, name: "intArray", type: "int32arr" },
                    {
                      constantUsage: [],
                      isComplex: false,
                      name: "short5",
                      type: "shortWithDefault",
                    },
                  ],
                  name: "MyAction_Goal",
                },
              ],
              name: "action",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module with an multiple enclosed structs and modules", () => {
    const types = parseIdl(
      `
      module idl_parser {
        module action {
          module MyAction_Goal_Constants {
            const short SHORT_CONSTANT = -23;
          };
          struct MyAction_Goal {
            int32 input_value;
          };
          module MyAction_Result_Constants {
            const unsigned long UNSIGNED_LONG_CONSTANT = 42;
          };
          struct MyAction_Result {
            uint32 output_value;
          };
          module MyAction_Feedback_Constants {
            const float FLOAT_CONSTANT = 1.25;
          };
          struct MyAction_Feedback {
            float progress_value;
          };
        };
      };
    `,
    );
    expect(types).toEqual([
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
                {
                  definitionType: "module",
                  definitions: [
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "UNSIGNED_LONG_CONSTANT",
                      type: "uint32",
                      value: 42,
                      valueText: "42",
                    },
                  ],
                  name: "MyAction_Result_Constants",
                },
                {
                  definitionType: "struct",
                  definitions: [
                    { constantUsage: [], isComplex: false, name: "output_value", type: "uint32" },
                  ],
                  name: "MyAction_Result",
                },
                {
                  definitionType: "module",
                  definitions: [
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "FLOAT_CONSTANT",
                      type: "float32",
                      value: 1.25,
                      valueText: "1.25",
                    },
                  ],
                  name: "MyAction_Feedback_Constants",
                },
                {
                  definitionType: "struct",
                  definitions: [
                    {
                      constantUsage: [],
                      isComplex: false,
                      name: "progress_value",
                      type: "float32",
                    },
                  ],
                  name: "MyAction_Feedback",
                },
              ],
              name: "action",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });

  it("ignore #include statements in AST", () => {
    const types = parseIdl(
      `
   #include "OtherMessage.idl"
   #include <pkgname/msg/OtherMessage.idl>

    module idl_parser {
      module action {
        module MyAction_Goal_Constants {
          const short SHORT_CONSTANT = -23;
        };
        struct MyAction_Goal {
          int32 input_value;
        };
      };
    };
    `,
    );

    // same as above
    expect(types).toEqual([
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
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module full of string constants", () => {
    const types = parseIdl(
      `
module idl_parser {
  module msg {
    module MyMessage_Constants {
      const string STRING_CONSTANT = "string_value";
      const wstring WSTRING_CONSTANT = "wstring_value_\u2122";
      const string EMPTY_STRING_CONSTANT = "";
      const string COMBINED_STRING_CONSTANT = "part1 " "part2" " part3";
    };
  };
};
    `,
    );
    expect(types).toEqual([
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
                      name: "STRING_CONSTANT",
                      type: "string",
                      upperBound: undefined,
                      value: "string_value",
                      valueText: "string_value",
                    },
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "WSTRING_CONSTANT",
                      type: "string",
                      upperBound: undefined,
                      value: "wstring_value_™",
                      valueText: "wstring_value_™",
                    },
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "EMPTY_STRING_CONSTANT",
                      type: "string",
                      upperBound: undefined,
                      value: "",
                      valueText: "",
                    },
                    {
                      isComplex: false,
                      isConstant: true,
                      name: "COMBINED_STRING_CONSTANT",
                      type: "string",
                      upperBound: undefined,
                      value: "part1 part2 part3",
                      valueText: "part1 part2 part3",
                    },
                  ],
                  name: "MyMessage_Constants",
                },
              ],
              name: "msg",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("parses a module of all array types", () => {
    const types = parseIdl(
      `
      module idl_parser {
        module msg {
          module MyMessage_Constants {
            const unsigned long UNSIGNED_LONG_CONSTANT = 42;
          };
          struct MyMessage {
            string<5> bounded_string_value;
            wstring wstring_value;
            wstring<23> bounded_wstring_value;
            wstring<UNSIGNED_LONG_CONSTANT> constant_bounded_wstring_value;
            sequence<short> unbounded_short_values;
            sequence<short, 5> bounded_short_values;
            sequence<string<3>> unbounded_values_of_bounded_strings;
            sequence<string<3>, 4> bounded_values_of_bounded_strings;
            short array_short_values[23];
          };
        };
      };
    `,
    );

    expect(types).toEqual([
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
                      name: "UNSIGNED_LONG_CONSTANT",
                      type: "uint32",
                      value: 42,
                      valueText: "42",
                    },
                  ],
                  name: "MyMessage_Constants",
                },
                {
                  definitionType: "struct",
                  definitions: [
                    {
                      constantUsage: [],
                      isComplex: false,
                      name: "bounded_string_value",
                      type: "string",
                      upperBound: 5,
                    },
                    {
                      constantUsage: [],
                      isComplex: false,
                      name: "wstring_value",
                      type: "string",
                      upperBound: undefined,
                    },
                    {
                      constantUsage: [],
                      isComplex: false,
                      name: "bounded_wstring_value",
                      type: "string",
                      upperBound: 23,
                    },
                    {
                      constantUsage: [["upperBound", "UNSIGNED_LONG_CONSTANT"]],
                      isComplex: false,
                      name: "constant_bounded_wstring_value",
                      type: "string",
                      upperBound: { name: "UNSIGNED_LONG_CONSTANT", usesConstant: true },
                    },
                    {
                      arrayUpperBound: undefined,
                      constantUsage: [],
                      isArray: true,
                      isComplex: false,
                      name: "unbounded_short_values",
                      type: "int16",
                    },
                    {
                      arrayUpperBound: 5,
                      constantUsage: [],
                      isArray: true,
                      isComplex: false,
                      name: "bounded_short_values",
                      type: "int16",
                    },
                    {
                      arrayUpperBound: undefined,
                      constantUsage: [],
                      isArray: true,
                      isComplex: false,
                      name: "unbounded_values_of_bounded_strings",
                      type: "string",
                      upperBound: 3,
                    },
                    {
                      arrayUpperBound: 4,
                      constantUsage: [],
                      isArray: true,
                      isComplex: false,
                      name: "bounded_values_of_bounded_strings",
                      type: "string",
                      upperBound: 3,
                    },
                    {
                      arrayLength: 23,
                      constantUsage: [],
                      isArray: true,
                      isComplex: false,
                      name: "array_short_values",
                      type: "int16",
                    },
                  ],
                  name: "MyMessage",
                },
              ],
              name: "msg",
            },
          ],
          name: "idl_parser",
        },
      ],
    ]);
  });
  it("can parse comments", () => {
    const msgDef = `
      // All of these comments should be ignored
      module action {
        /** another comment */
        module MyAction_Goal_Constants /** maybe a sneaky one here */ {
          // two here of the same type
          // _another one_
          const string tricky = "/** is this a comment? */ // hopefully not"; // like I'm not even here
        };
        /** a multi
         * line
         * comment
         */
        struct MyAction_Goal {
          // two here of different types
          /** maybe one more that */
          int32 input_value; /** inline */
        };
      };
    `;
    const types = parseIdl(msgDef);
    expect(types).toEqual([
      [
        {
          definitionType: "module",
          definitions: [
            {
              definitionType: "module",
              definitions: [
                {
                  isComplex: false,
                  isConstant: true,
                  name: "tricky",
                  type: "string",
                  upperBound: undefined,
                  value: "/** is this a comment? */ // hopefully not",
                  valueText: "/** is this a comment? */ // hopefully not",
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
    ]);
  });
  it("can parse multiple forward declarations on same line with default annotation", () => {
    const msgDef = `
      struct MyAction_Goal {
        @default(value=5)
        int32 int1, int2;
      };
    `;
    const types = parseIdl(msgDef);
    expect(types).toEqual([
      [
        {
          definitionType: "struct",
          definitions: [
            { constantUsage: [], defaultValue: 5, isComplex: false, name: "int1", type: "int32" },
            { constantUsage: [], defaultValue: 5, isComplex: false, name: "int2", type: "int32" },
          ],
          name: "MyAction_Goal",
        },
      ],
    ]);
  });
  it("parses enums", () => {
    const msgDef = `
      enum COLORS {
        RED,
        GREEN,
        BLUE
      };
    `;
    const types = parseIdl(msgDef);
    expect(types).toEqual([
      [
        {
          definitionType: "enum",
          name: "COLORS",
          members: ["RED", "GREEN", "BLUE"],
        },
      ],
    ]);
  });
  it("parses enums in modules", () => {
    const msgDef = `
    module Scene {
      enum COLORS {
        RED,
        GREEN,
        BLUE
      };
    };
    `;
    const types = parseIdl(msgDef);
    expect(types).toEqual([
      [
        {
          definitionType: "module",
          name: "Scene",
          definitions: [
            {
              definitionType: "enum",
              name: "COLORS",
              members: ["RED", "GREEN", "BLUE"],
            },
          ],
        },
      ],
    ]);
  });
  /****************  Not supported by IDL (as far as I can tell) */
  it("cannot parse multiple const declarations in a single line", () => {
    const msgDef = `
      module action {
        module MyAction_Goal_Constants {
          const short short1, short2 = -23;
        };
      };
    `;
    expect(() => parseIdl(msgDef)).toThrow(/unexpected , token/i);
  });
  it("cannot parse empty struct", () => {
    const msgDef = `
      struct a {
      };
    `;
    expect(() => parseIdl(msgDef)).toThrow(/unexpected RCBR token/i);
  });
  /****************  Syntax Errors */
  it("missing bracket at the end will result in end of input error", () => {
    const msgDef = `
    module idl_parser {
      module action {
        module MyAction_Goal_Constants {
          const short SHORT_CONSTANT = -23;
        };
        struct MyAction_Goal {
          int32 input_value;
        };
      };
    `;
    expect(() => parseIdl(msgDef)).toThrow(
      `Could not parse message definition (unexpected end of input): '${msgDef}'`,
    );
  });
  it("cannot parse empty module", () => {
    const msgDef = `
    module idl_parser {
      module action {
        module MyAction_Goal_Constants {
        };
        struct MyAction_Goal {
          int32 input_value;
        };
      };
    };`;
    expect(() => parseIdl(msgDef)).toThrow(/unexpected RCBR token: "}"/i);
  });
});
