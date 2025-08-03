import unittest

from omgidl_parser.parse import (
    parse_idl,
    Struct,
    Field,
    Module,
    Constant,
    Enum,
    Typedef,
    Union,
    UnionCase,
)

class TestParseIDL(unittest.TestCase):
    def test_parse_struct(self):
        schema = """
        struct A {
            int32 num;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(result, [Struct(name="A", fields=[Field(name="num", type="int32")])])

    def test_annotations(self):
        schema = """
        @topic
        struct A {
            @default(5) int32 num;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Struct(
                    name="A",
                    fields=[
                        Field(
                            name="num",
                            type="int32",
                            annotations={"default": 5},
                        )
                    ],
                    annotations={"topic": True},
                )
            ],
        )

    def test_module_with_struct(self):
        schema = """
        module outer {
            struct B {
                uint8 val;
            };
        };
        """
        result = parse_idl(schema)
        self.assertEqual(result, [
            Module(name="outer", definitions=[Struct(name="B", fields=[Field(name="val", type="uint8")])])
        ])

    def test_fixed_array_field(self):
        schema = """
        struct A {
            int32 nums[3];
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [Struct(name="A", fields=[Field(name="nums", type="int32", array_lengths=[3])])],
        )

    def test_multidimensional_array_field(self):
        schema = """
        struct A {
            int32 nums[2][3];
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [Struct(name="A", fields=[Field(name="nums", type="int32", array_lengths=[2, 3])])],
        )

    def test_constant_in_module(self):
        schema = """
        module outer {
            const short A = -1;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(result, [
            Module(name="outer", definitions=[Constant(name="A", type="int16", value=-1)])
        ])

    def test_sequence_field(self):
        schema = """
        struct A {
            sequence<int32> nums;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Struct(
                    name="A",
                    fields=[
                        Field(name="nums", type="int32", is_sequence=True)
                    ],
                )
            ],
        )

    def test_bounded_sequence_field(self):
        schema = """
        struct A {
            sequence<int32, 5> nums;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Struct(
                    name="A",
                    fields=[
                        Field(
                            name="nums",
                            type="int32",
                            is_sequence=True,
                            sequence_bound=5,
                        )
                    ],
                )
            ],
        )

    def test_bounded_string_field(self):
        schema = """
        struct A {
            string<5> name;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Struct(
                    name="A",
                    fields=[
                        Field(
                            name="name",
                            type="string",
                            is_sequence=False,
                            sequence_bound=None,
                            string_upper_bound=5,
                        )
                    ],
                )
            ],
        )

    def test_enum(self):
        schema = """
        enum COLORS {
            RED,
            GREEN,
            BLUE
        };
        """
        result = parse_idl(schema)
        self.assertEqual(result, [
            Enum(
                name="COLORS",
                enumerators=[
                    Constant(name="RED", type="uint32", value=0),
                    Constant(name="GREEN", type="uint32", value=1),
                    Constant(name="BLUE", type="uint32", value=2),
                ],
            )
        ])

    def test_user_defined_type_reference(self):
        schema = """
        module outer {
            struct A {
                int32 num;
            };
            struct B {
                A a;
            };
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Module(
                    name="outer",
                    definitions=[
                        Struct(name="A", fields=[Field(name="num", type="int32")]),
                        Struct(name="B", fields=[Field(name="a", type="outer::A")]),
                    ],
                )
            ],
        )

    def test_nested_module_resolution(self):
        schema = """
        module outer {
            struct A { int32 num; };
            module inner {
                struct B { A a; };
            };
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Module(
                    name="outer",
                    definitions=[
                        Struct(name="A", fields=[Field(name="num", type="int32")]),
                        Module(
                            name="inner",
                            definitions=[
                                Struct(name="B", fields=[Field(name="a", type="outer::A")])
                            ],
                        ),
                    ],
                )
            ],
        )

    def test_constant_expression(self):
        schema = """\
        const long A = 1;
        const long B = A + 1;
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Constant(name="A", type="int32", value=1),
                Constant(name="B", type="int32", value=2),
            ],
        )

    def test_constant_enum_reference(self):
        schema = """\
        enum COLORS {
            RED,
            GREEN,
            BLUE
        };
        const short FOO = COLORS::GREEN + 2;
        const short BAR = BLUE;
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Enum(
                    name="COLORS",
                    enumerators=[
                        Constant(name="RED", type="uint32", value=0),
                        Constant(name="GREEN", type="uint32", value=1),
                        Constant(name="BLUE", type="uint32", value=2),
                    ],
                ),
                Constant(name="FOO", type="int16", value=3),
                Constant(name="BAR", type="int16", value=2),
            ],
        )

    def test_constant_types_and_references(self):
        schema = """\
        const float PI = 3.14;
        const boolean FLAG = true;
        const string GREETING = "hello";
        const string GREETING2 = GREETING;
        const float PI2 = PI;
        const boolean FLAG2 = FLAG;
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Constant(name="PI", type="float32", value=3.14),
                Constant(name="FLAG", type="boolean", value=True),
                Constant(name="GREETING", type="string", value="hello"),
                Constant(name="GREETING2", type="string", value="hello"),
                Constant(name="PI2", type="float32", value=3.14),
                Constant(name="FLAG2", type="boolean", value=True),
            ],
        )

    def test_typedef(self):
        schema = """
        typedef long MyLong;
        struct Holder { MyLong value; };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Typedef(name="MyLong", type="int32"),
                Struct(name="Holder", fields=[Field(name="value", type="MyLong")]),
            ],
        )

    def test_union(self):
        schema = """
        union MyUnion switch (uint8) {
            case 0, 1: int32 a;
            case 2: string b;
            default: float c;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [
                Union(
                    name="MyUnion",
                    switch_type="uint8",
                    cases=[
                        UnionCase(predicates=[0, 1], field=Field(name="a", type="int32")),
                        UnionCase(predicates=[2], field=Field(name="b", type="string")),
                    ],
                    default=Field(name="c", type="float32"),
                )
            ],
        )

    def test_skip_import_and_include(self):
        schema = """
        import "foo.idl";
        #include "bar.idl"
        struct A { int32 x; };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [Struct(name="A", fields=[Field(name="x", type="int32")])],
        )

    def test_ignore_comments(self):
        schema = """
        // line comment
        /* block
           comment */
        struct A {
            int32 x; // trailing comment
        };
        """
        result = parse_idl(schema)
        self.assertEqual(
            result,
            [Struct(name="A", fields=[Field(name="x", type="int32")])],
        )

if __name__ == "__main__":
    unittest.main()
