import { parseIdlToAST } from "./parseIdlToAST";

describe("Unsupported IDL grammar features", () => {
  /**************** Not yet supported */
  it("cannot parse leading ::", () => {
    const msgDef = `
      typedef float coord[2];
      module msg {
        struct Point {
            ::coord loc;
            coord loc2;
        };
      };
      `;
    expect(() => parseIdlToAST(msgDef)).toThrow(/unexpected input/i);
  });

  it("cannot parse union declarations", () => {
    const msgDef = `
    union MyUnion switch (long) {
        case 1:
          long long_branch;
        case 3:
          float float_branch;
        case 4:
          char  char_branch;
    };
    struct Foo {
        MyUnion my_union;
    };
      `;
    expect(() => parseIdlToAST(msgDef)).toThrow(/union/i);
  });

  it("cannot parse multi-dimensional arrays", () => {
    const msgDef = `
      typedef float matrix[3][3];
    `;

    expect(() => parseIdlToAST(msgDef)).toThrow();
  });

  it("fails forward struct declarations", () => {
    const msgDef = `
      struct Foo;
      typedef Foo fooArray[5];
      struct Foo {
        uint32 a;
      };
      `;
    expect(() => parseIdlToAST(msgDef)).toThrow();
  });

  it("cannot parse wide string literals", () => {
    const msgDef = `
    const wstring WSTRING_CONSTANT = L"wstring_value";
      `;
    expect(() => parseIdlToAST(msgDef)).toThrow();
  });
  it("cannot properly parse octal literals", () => {
    const msgDef = `
    const short SHORT_CONSTANT = 014;
      `;
    expect(parseIdlToAST(msgDef)).toEqual([
      [
        {
          name: "SHORT_CONSTANT",
          declarator: "const",
          isConstant: true,
          isComplex: false,
          type: "short",
          // This should be 12, but the parser doesn't support octal literals
          value: 14,
          valueText: "014",
        },
      ],
    ]);
  });

  it("cannot parse hexadecimal literals", () => {
    const msgDef = `
    const short SHORT_CONSTANT = 0x0C;
      `;
    expect(() => parseIdlToAST(msgDef)).toThrow();
  });

  it("cannot parse escape sequence character literals", () => {
    const msgDef = `
    const short SHORT_CONSTANT = \n
      `;
    expect(() => parseIdlToAST(msgDef)).toThrow();
  });

  it.each(["+", "-", "*", "/", "%", "<<", ">>", "|", "&", "^"])(
    "cannot parse constant expression: %s",
    (operator) => {
      const msgDef = `
    const short SHORT_CONSTANT = 1 ${operator} 2;
      `;
      expect(() => parseIdlToAST(msgDef)).toThrow();
    },
  );
});
