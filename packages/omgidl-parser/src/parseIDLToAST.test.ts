import { parseIDLToAST } from "./parseIDLToAST";

describe("IDL grammar", () => {
  it("parses a simple IDL", () => {
    const schema = `
        struct MyAction_Goal {
          int32 input_value;
        };
    `;

    expect(parseIDLToAST(schema)).toEqual([
      {
        declarator: "struct",
        definitions: [
          { isComplex: false, declarator: "struct-member", name: "input_value", type: "int32" },
        ],
        name: "MyAction_Goal",
      },
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

    expect(parseIDLToAST(schema)).toEqual([
      {
        name: "idl_parser",
        declarator: "module",
        definitions: [
          {
            name: "action",
            declarator: "module",
            definitions: [
              {
                name: "MyAction_Goal_Constants",
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "SHORT_CONSTANT",
                    type: "short",
                    value: -23,
                    valueText: "-23",
                  },
                ],
              },
              {
                name: "MyAction_Goal",
                declarator: "struct",
                definitions: [
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "input_value",
                    type: "int32",
                  },
                ],
              },
            ],
          },
        ],
      },
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

    expect(parseIDLToAST(schema)).toEqual([
      {
        name: "All_Numbers",
        declarator: "struct",
        definitions: [
          {
            type: "unsigned short",
            name: "unsigned_short_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "long",
            name: "long_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "unsigned long",
            name: "unsigned_long_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "long long",
            name: "long_long_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "unsigned long long",
            name: "unsigned_long_long_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "float",
            name: "float_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "double",
            name: "double_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "char",
            name: "char_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "wchar",
            name: "wchar_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "bool",
            name: "boolean_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "octet",
            name: "octet_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "int8",
            name: "int8_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "uint8",
            name: "uint8_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "int16",
            name: "int16_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "uint16",
            name: "uint16_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "int32",
            name: "int32_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "uint32",
            name: "uint32_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "int64",
            name: "int64_value",
            isComplex: false,
            declarator: "struct-member",
          },
          {
            type: "uint64",
            name: "uint64_value",
            isComplex: false,
            declarator: "struct-member",
          },
        ],
      },
    ]);
  });
  it("parses a module full of numeric constants", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "SHORT_CONSTANT",
                    type: "short",
                    value: -23,
                    valueText: "-23",
                  },
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "UNSIGNED_LONG_CONSTANT",
                    type: "unsigned long",
                    value: 42,
                    valueText: "42",
                  },
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "FLOAT_CONSTANT",
                    type: "float",
                    value: 1.25,
                    valueText: "1.25",
                  },
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "EXP_DOUBLE_CONSTANT",
                    type: "double",
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
    ]);
  });
  it("parses a module with various floating point default values", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "struct",
                definitions: [
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 19000000000 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_and_frac_with_positive_scientific",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 19000000000 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_and_frac_with_explicit_positive_scientific",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 1.1e-10 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_and_frac_with_negative_scientific",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 0.00009 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_and_frac",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 1 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_with_empty_frac",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 0.1 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "frac_only",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 900000 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_with_positive_scientific",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 900000 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_with_explicit_positive_scientific",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 0.00009 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "int_with_negative_scientific",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 8.7 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "fixed_int_and_frac",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 4 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "fixed_int_with_dot_only",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 0.3 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "fixed_frac_only",
                    type: "float",
                  },
                  {
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 7 },
                      },
                    },
                    isComplex: false,
                    declarator: "struct-member",
                    name: "fixed_int_only",
                    type: "float",
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
    ]);
  });
  it("parses a module with customTypes", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "struct",
                definitions: [
                  {
                    declarator: "struct-member",
                    name: "single_point",
                    type: "geometry::msg::Point",
                  },
                  {
                    declarator: "struct-member",
                    arrayLengths: [10],
                    isArray: true,
                    name: "points_with_length",
                    type: "geometry::msg::Point",
                  },
                  {
                    declarator: "struct-member",
                    arrayUpperBound: undefined,
                    isArray: true,
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
    ]);
  });
  it("parses a module with arbitrary annotations including default values", () => {
    const types = parseIDLToAST(
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
      @id(100) @default(100) uint32 uint32_with_default;
    };
  };
};
    `,
    );
    expect(types).toEqual([
      {
        name: "idl_parser",
        declarator: "module",
        definitions: [
          {
            name: "msg",
            declarator: "module",
            definitions: [
              {
                name: "MyMessage",
                declarator: "struct",
                annotations: {
                  verbatim: {
                    name: "verbatim",
                    type: "named-params",
                    namedParams: {
                      language: "comment",
                      text: "Documentation of MyMessage.Adjacent string literal.",
                    },
                  },
                  transfer_mode: {
                    name: "transfer_mode",
                    type: "const-param",
                    value: { usesConstant: true, name: "SHMEM_REF" },
                  },
                },
                definitions: [
                  {
                    name: "unsigned_short_value",
                    isComplex: false,
                    declarator: "struct-member",
                    type: "unsigned short",
                    annotations: {
                      default: {
                        name: "default",
                        type: "named-params",
                        namedParams: { value: 123 },
                      },
                    },
                  },
                  {
                    name: "long_value",
                    isComplex: false,
                    declarator: "struct-member",
                    type: "long",
                    annotations: {
                      key: {
                        name: "key",
                        type: "no-params",
                      },
                      range: {
                        name: "range",
                        type: "named-params",
                        namedParams: {
                          min: -10,
                          max: 10,
                        },
                      },
                    },
                  },
                  {
                    name: "unsigned_long_value",
                    isComplex: false,
                    declarator: "struct-member",
                    type: "unsigned long",
                    annotations: {
                      verbatim: {
                        name: "verbatim",
                        type: "named-params",
                        namedParams: {
                          language: "comment",
                          text: "",
                        },
                      },
                      arbitrary_annotation: {
                        name: "arbitrary_annotation",
                        type: "named-params",
                        namedParams: {
                          key1: "value1",
                          key2: true,
                          key3: 0.0,
                          key4: 10,
                        },
                      },
                      key: {
                        name: "key",
                        type: "no-params",
                      },
                    },
                  },
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "uint32_with_default",
                    type: "uint32",
                    annotations: {
                      id: {
                        name: "id",
                        type: "const-param",
                        value: 100,
                      },
                      default: {
                        name: "default",
                        type: "const-param",
                        value: 100,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });
  it("parses a module with a typedefs used in a struct", () => {
    const types = parseIDLToAST(
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
      {
        name: "idl_parser",
        declarator: "module",
        definitions: [
          {
            name: "action",
            declarator: "module",
            definitions: [
              {
                arrayUpperBound: 10,
                declarator: "typedef",
                isArray: true,
                isComplex: false,
                name: "int32arr",
                type: "int32",
              },
              {
                annotations: {
                  default: { name: "default", type: "named-params", namedParams: { value: 5 } },
                },
                declarator: "typedef",
                isComplex: false,
                name: "shortWithDefault",
                type: "short",
              },
              {
                name: "MyAction_Goal",
                declarator: "struct",
                definitions: [
                  {
                    declarator: "struct-member",
                    name: "intArray",
                    type: "int32arr",
                  },
                  {
                    declarator: "struct-member",
                    name: "short5",
                    type: "shortWithDefault",
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });
  it("parses a module with an multiple enclosed structs and modules", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "SHORT_CONSTANT",
                    type: "short",
                    value: -23,
                    valueText: "-23",
                  },
                ],
                name: "MyAction_Goal_Constants",
              },
              {
                declarator: "struct",
                definitions: [
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "input_value",
                    type: "int32",
                  },
                ],
                name: "MyAction_Goal",
              },
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "UNSIGNED_LONG_CONSTANT",
                    type: "unsigned long",
                    value: 42,
                    valueText: "42",
                  },
                ],
                name: "MyAction_Result_Constants",
              },
              {
                declarator: "struct",
                definitions: [
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "output_value",
                    type: "uint32",
                  },
                ],
                name: "MyAction_Result",
              },
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "FLOAT_CONSTANT",
                    type: "float",
                    value: 1.25,
                    valueText: "1.25",
                  },
                ],
                name: "MyAction_Feedback_Constants",
              },
              {
                declarator: "struct",
                definitions: [
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "progress_value",
                    type: "float",
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
    ]);
  });

  it("ignore #include statements in AST", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "SHORT_CONSTANT",
                    type: "short",
                    value: -23,
                    valueText: "-23",
                  },
                ],
                name: "MyAction_Goal_Constants",
              },
              {
                declarator: "struct",
                definitions: [
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "input_value",
                    type: "int32",
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
    ]);
  });
  it("parses a module full of string constants", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "STRING_CONSTANT",
                    type: "string",
                    upperBound: undefined,
                    value: "string_value",
                    valueText: "string_value",
                  },
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "WSTRING_CONSTANT",
                    type: "wstring",
                    upperBound: undefined,
                    value: "wstring_value_™",
                    valueText: "wstring_value_™",
                  },
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "EMPTY_STRING_CONSTANT",
                    type: "string",
                    upperBound: undefined,
                    value: "",
                    valueText: "",
                  },
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
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
    ]);
  });
  it("parses a module of all array types", () => {
    const types = parseIDLToAST(
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
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                declarator: "module",
                definitions: [
                  {
                    isComplex: false,
                    isConstant: true,
                    declarator: "const",
                    name: "UNSIGNED_LONG_CONSTANT",
                    type: "unsigned long",
                    value: 42,
                    valueText: "42",
                  },
                ],
                name: "MyMessage_Constants",
              },
              {
                declarator: "struct",
                definitions: [
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "bounded_string_value",
                    type: "string",
                    upperBound: 5,
                  },
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "wstring_value",
                    type: "wstring",
                    upperBound: undefined,
                  },
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "bounded_wstring_value",
                    type: "wstring",
                    upperBound: 23,
                  },
                  {
                    isComplex: false,
                    declarator: "struct-member",
                    name: "constant_bounded_wstring_value",
                    type: "wstring",
                    upperBound: { name: "UNSIGNED_LONG_CONSTANT", usesConstant: true },
                  },
                  {
                    arrayUpperBound: undefined,
                    isArray: true,
                    isComplex: false,
                    declarator: "struct-member",
                    name: "unbounded_short_values",
                    type: "short",
                  },
                  {
                    arrayUpperBound: 5,
                    isArray: true,
                    isComplex: false,
                    declarator: "struct-member",
                    name: "bounded_short_values",
                    type: "short",
                  },
                  {
                    arrayUpperBound: undefined,
                    isArray: true,
                    isComplex: false,
                    declarator: "struct-member",
                    name: "unbounded_values_of_bounded_strings",
                    type: "string",
                    upperBound: 3,
                  },
                  {
                    arrayUpperBound: 4,
                    isArray: true,
                    isComplex: false,
                    declarator: "struct-member",
                    name: "bounded_values_of_bounded_strings",
                    type: "string",
                    upperBound: 3,
                  },
                  {
                    arrayLengths: [23],
                    isArray: true,
                    isComplex: false,
                    declarator: "struct-member",
                    name: "array_short_values",
                    type: "short",
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
    const types = parseIDLToAST(msgDef);
    expect(types).toEqual([
      {
        declarator: "module",
        definitions: [
          {
            declarator: "module",
            definitions: [
              {
                isComplex: false,
                isConstant: true,
                declarator: "const",
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
            declarator: "struct",
            definitions: [
              {
                isComplex: false,
                declarator: "struct-member",
                name: "input_value",
                type: "int32",
              },
            ],
            name: "MyAction_Goal",
          },
        ],
        name: "action",
      },
    ]);
  });
  it("can parse multiple forward declarations on same line with default annotation", () => {
    const msgDef = `
      struct MyAction_Goal {
        @default(value=5)
        int32 int1, int2;
      };
    `;
    const types = parseIDLToAST(msgDef);
    expect(types).toEqual([
      {
        declarator: "struct",
        definitions: [
          {
            annotations: {
              default: { name: "default", type: "named-params", namedParams: { value: 5 } },
            },
            isComplex: false,
            declarator: "struct-member",
            name: "int1",
            type: "int32",
          },
          {
            annotations: {
              default: { name: "default", type: "named-params", namedParams: { value: 5 } },
            },
            isComplex: false,
            declarator: "struct-member",
            name: "int2",
            type: "int32",
          },
        ],
        name: "MyAction_Goal",
      },
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
    const types = parseIDLToAST(msgDef);
    expect(types).toEqual([
      {
        declarator: "enum",
        name: "COLORS",
        enumerators: [{ name: "RED" }, { name: "GREEN" }, { name: "BLUE" }],
      },
    ]);
  });
  it("parses enums with value overrides", () => {
    const msgDef = `
      enum COLORS {
        RED,
        @value(5)
        GREEN,
        BLUE
      };
    `;
    const types = parseIDLToAST(msgDef);
    expect(types).toEqual([
      {
        declarator: "enum",
        name: "COLORS",
        enumerators: [
          { name: "RED" },
          {
            name: "GREEN",
            annotations: { value: { name: "value", type: "const-param", value: 5 } },
          },
          { name: "BLUE" },
        ],
      },
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
    const types = parseIDLToAST(msgDef);
    expect(types).toEqual([
      {
        declarator: "module",
        name: "Scene",
        definitions: [
          {
            declarator: "enum",
            name: "COLORS",
            enumerators: [{ name: "RED" }, { name: "GREEN" }, { name: "BLUE" }],
          },
        ],
      },
    ]);
  });
  it("parses enums used as constants", () => {
    const msgDef = `
    enum COLORS {
      RED,
      GREEN,
      BLUE
    };
 
    module Scene {
      module DefaultColors {
        const COLORS red = COLORS::RED;
      };
      struct Line {
        @default(value=COLORS::GREEN)
        COLORS color;
      };
    };
    `;
    const types = parseIDLToAST(msgDef);
    expect(types).toEqual([
      {
        declarator: "enum",
        name: "COLORS",
        enumerators: [{ name: "RED" }, { name: "GREEN" }, { name: "BLUE" }],
      },
      {
        declarator: "module",
        name: "Scene",
        definitions: [
          {
            name: "DefaultColors",
            declarator: "module",
            definitions: [
              {
                isConstant: true,
                isComplex: false,
                declarator: "const",
                name: "red",
                type: "COLORS",
                value: {
                  name: "COLORS::RED",
                  usesConstant: true,
                },
                valueText: "COLORS::RED",
              },
            ],
          },
          {
            name: "Line",
            declarator: "struct",
            definitions: [
              {
                annotations: {
                  default: {
                    name: "default",
                    type: "named-params",
                    namedParams: {
                      value: { usesConstant: true, name: "COLORS::GREEN" },
                    },
                  },
                },
                declarator: "struct-member",
                name: "color",
                type: "COLORS",
              },
            ],
          },
        ],
      },
    ]);
  });
  it("parses multiple top level typedefs referencing each other", () => {
    const msgDef = `
    typedef sequence<short> shortSeq;
    typedef sequence<shortSeq> shortSeqSeq;
    `;
    expect(parseIDLToAST(msgDef)).toEqual([
      {
        name: "shortSeq",
        declarator: "typedef",
        isArray: true,
        arrayUpperBound: undefined,
        isComplex: false,
        type: "short",
      },
      {
        name: "shortSeqSeq",
        declarator: "typedef",
        isArray: true,
        type: "shortSeq",
      },
    ]);
  });

  it("can parse basic multi-dimensional arrays in typedefs", () => {
    const msgDef = `
      typedef float matrix[3][2];
    `;
    const types = parseIDLToAST(msgDef);

    expect(types).toEqual([
      {
        name: "matrix",
        arrayLengths: [3, 2],
        declarator: "typedef",
        isArray: true,
        isComplex: false,
        type: "float",
      },
    ]);
  });
  it("can parse basic multi-dimensional arrays in struct members", () => {
    const msgDef = `
      struct Camera {
        float matrix[3][2];
      };
    `;
    const types = parseIDLToAST(msgDef);

    expect(types).toEqual([
      {
        name: "Camera",
        declarator: "struct",
        definitions: [
          {
            name: "matrix",
            arrayLengths: [3, 2],
            declarator: "struct-member",
            isArray: true,
            isComplex: false,
            type: "float",
          },
        ],
      },
    ]);
  });

  it("can parse simple union declaration", () => {
    const msgDef = `
    union MyUnion switch (long) {
        case 1:
          long long_branch;
        case 3:
          float float_branch;
        case 4:
          char  char_branch;
        default:
          uint8 default;
    };
    struct Foo {
        MyUnion my_union;
    };
      `;
    const ast = parseIDLToAST(msgDef);
    expect(ast).toEqual([
      {
        name: "MyUnion",
        declarator: "union",
        switchType: "long",
        cases: [
          {
            predicates: [1],
            type: {
              name: "long_branch",
              isComplex: false,
              type: "long",
            },
          },
          {
            predicates: [3],
            type: {
              name: "float_branch",
              isComplex: false,
              type: "float",
            },
          },
          {
            predicates: [4],
            type: {
              name: "char_branch",
              isComplex: false,
              type: "char",
            },
          },
        ],
        defaultCase: {
          name: "default",
          isComplex: false,
          type: "uint8",
        },
      },
      {
        name: "Foo",
        declarator: "struct",
        definitions: [
          {
            name: "my_union",
            declarator: "struct-member",
            type: "MyUnion",
          },
        ],
      },
    ]);
  });

  it("can parse simple union declaration that has annotations on definitions", () => {
    const msgDef = `
    union MyUnion switch (long) {
        case 1:
          @id(100)
          long long_branch;
        case 3:
          @id(200)
          float float_branch;
        case 4:
          @id(300)
          char  char_branch;
        default:
          @id(400)
          uint8 default;
    };
    struct Foo {
        MyUnion my_union;
    };
      `;
    const ast = parseIDLToAST(msgDef);
    expect(ast).toEqual([
      {
        name: "MyUnion",
        declarator: "union",
        switchType: "long",
        cases: [
          {
            predicates: [1],
            type: {
              name: "long_branch",
              isComplex: false,
              type: "long",
              annotations: {
                id: {
                  name: "id",
                  type: "const-param",
                  value: 100,
                },
              },
            },
          },
          {
            predicates: [3],
            type: {
              name: "float_branch",
              isComplex: false,
              type: "float",
              annotations: {
                id: {
                  name: "id",
                  type: "const-param",
                  value: 200,
                },
              },
            },
          },
          {
            predicates: [4],
            type: {
              name: "char_branch",
              isComplex: false,
              type: "char",
              annotations: {
                id: {
                  name: "id",
                  type: "const-param",
                  value: 300,
                },
              },
            },
          },
        ],
        defaultCase: {
          name: "default",
          isComplex: false,
          type: "uint8",
          annotations: {
            id: {
              name: "id",
              type: "const-param",
              value: 400,
            },
          },
        },
      },
      {
        name: "Foo",
        declarator: "struct",
        definitions: [
          {
            name: "my_union",
            declarator: "struct-member",
            type: "MyUnion",
          },
        ],
      },
    ]);
  });
  it("can parse union that uses enums", () => {
    const msgDef = `
    enum ColorMode {
      GRAY, RGBA, RGB
    };
    union Color switch (ColorMode) {
        case ColorMode::GRAY:
          uint8 gray;
        case ColorMode::RGBA:
          uint8 rgba[4];
        default:
          uint8 rgb[3];
    };
    struct ColorSettings {
        Color chosenColor;
    };
      `;
    const ast = parseIDLToAST(msgDef);
    expect(ast).toEqual([
      {
        declarator: "enum",
        enumerators: [{ name: "GRAY" }, { name: "RGBA" }, { name: "RGB" }],
        name: "ColorMode",
      },
      {
        name: "Color",
        declarator: "union",
        switchType: "ColorMode",
        cases: [
          {
            predicates: [
              {
                name: "ColorMode::GRAY",
                usesConstant: true,
              },
            ],
            type: {
              isComplex: false,
              name: "gray",
              type: "uint8",
            },
          },
          {
            predicates: [
              {
                name: "ColorMode::RGBA",
                usesConstant: true,
              },
            ],
            type: {
              arrayLengths: [4],
              isArray: true,
              isComplex: false,
              name: "rgba",
              type: "uint8",
            },
          },
        ],
        defaultCase: {
          arrayLengths: [3],
          isArray: true,
          isComplex: false,
          name: "rgb",
          type: "uint8",
        },
      },
      {
        name: "ColorSettings",
        declarator: "struct",
        definitions: [
          {
            declarator: "struct-member",
            name: "chosenColor",
            type: "Color",
          },
        ],
      },
    ]);
  });
  it("can parse union that uses boolean", () => {
    const msgDef = `
    typedef boolean usesColor;
    union Color switch (usesColor) {
        case TRUE:
          uint8 rgba[4];
        case FALSE:
          uint8 gray;
    };
    struct ColorSettings {
        Color chosenColor;
    };
      `;

    const ast = parseIDLToAST(msgDef);
    expect(ast).toEqual([
      {
        name: "usesColor",
        isComplex: false,
        declarator: "typedef",
        type: "bool",
      },
      {
        name: "Color",
        declarator: "union",
        switchType: "usesColor",
        cases: [
          {
            predicates: [true],
            type: {
              name: "rgba",
              arrayLengths: [4],
              isArray: true,
              isComplex: false,
              type: "uint8",
            },
          },
          {
            predicates: [false],
            type: {
              name: "gray",
              isComplex: false,
              type: "uint8",
            },
          },
        ],
      },
      {
        name: "ColorSettings",
        declarator: "struct",
        definitions: [
          {
            name: "chosenColor",
            declarator: "struct-member",
            type: "Color",
          },
        ],
      },
    ]);
  });
  it("can parse struct with member of the same name", () => {
    const msgDef = `
    struct ColorSettings {
        uint8 ColorSettings;
    };
      `;

    const ast = parseIDLToAST(msgDef);
    expect(ast).toEqual([
      {
        name: "ColorSettings",
        declarator: "struct",
        definitions: [
          {
            name: "ColorSettings",
            isComplex: false,
            declarator: "struct-member",
            type: "uint8",
          },
        ],
      },
    ]);
  });
  /****************  Not supported by IDL (as far as I can tell) */
  it("cannot parse constants that reference other constants", () => {
    const msgDef = `
        const short SHORT_CONSTANT = -23;
        const short SHORT2 = SHORT_CONSTANT;
        struct ArrStruct {
          sequence<SHORT2> intArray;
        };
    `;
    expect(() => parseIDLToAST(msgDef)).toThrow(/unexpected NAME token/i);
  });
  it("cannot parse multiple const declarations in a single line", () => {
    const msgDef = `
      module action {
        module MyAction_Goal_Constants {
          const short short1, short2 = -23;
        };
      };
    `;
    expect(() => parseIDLToAST(msgDef)).toThrow(/unexpected , token/i);
  });
  it("can parse empty struct", () => {
    const msgDef = `
      struct a {
      };
    `;
    const ast = parseIDLToAST(msgDef);
    expect(ast).toEqual([
      {
        name: "a",
        declarator: "struct",
        definitions: [],
      },
    ]);
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
    expect(() => parseIDLToAST(msgDef)).toThrow(
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
    expect(() => parseIDLToAST(msgDef)).toThrow(/unexpected RCBR token: "}"/i);
  });
});
