import { parseIdlToAst } from "./parseIdlToAST";

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
    expect(() => parseIdlToAst(msgDef)).toThrow(/unexpected : token/i);
  });

  it("fails forward struct declarations", () => {
    const msgDef = `
      struct Foo;
      typedef Foo fooArray[5];
      struct Foo {
        uint32 a;
      };
      `;
    expect(() => parseIdlToAst(msgDef)).toThrow();
  });

  it("cannot parse wide string literals", () => {
    const msgDef = `
    const wstring WSTRING_CONSTANT = L"wstring_value";
      `;
    expect(() => parseIdlToAst(msgDef)).toThrow();
  });
  it("cannot properly parse octal literals", () => {
    const msgDef = `
    const short SHORT_CONSTANT = 014;
      `;
    expect(parseIdlToAst(msgDef)).toEqual([
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
    ]);
  });

  it("cannot parse hexadecimal literals", () => {
    const msgDef = `
    const short SHORT_CONSTANT = 0x0C;
      `;
    expect(() => parseIdlToAst(msgDef)).toThrow();
  });

  it("cannot parse escape sequence character literals", () => {
    const msgDef = `
    const short SHORT_CONSTANT = \n
      `;
    expect(() => parseIdlToAst(msgDef)).toThrow();
  });

  it.each(["+", "-", "*", "/", "%", "<<", ">>", "|", "&", "^"])(
    "cannot parse constant expression: %s",
    (operator) => {
      const msgDef = `
    const short SHORT_CONSTANT = 1 ${operator} 2;
      `;
      expect(() => parseIdlToAst(msgDef)).toThrow();
    },
  );
});
