import unittest

from omgidl_parser.parse import parse_idl, Struct, Field, Module, Constant, Enum

class TestParseIDL(unittest.TestCase):
    def test_parse_struct(self):
        schema = """
        struct A {
            int32 num;
        };
        """
        result = parse_idl(schema)
        self.assertEqual(result, [Struct(name="A", fields=[Field(name="num", type="int32", array_length=None)])])

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
            Module(name="outer", definitions=[Struct(name="B", fields=[Field(name="val", type="uint8", array_length=None)])])
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
            [Struct(name="A", fields=[Field(name="nums", type="int32", array_length=3)])],
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
                        Field(name="nums", type="int32", array_length=None, is_sequence=True)
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
                        Struct(name="A", fields=[Field(name="num", type="int32", array_length=None)]),
                        Struct(name="B", fields=[Field(name="a", type="outer::A", array_length=None)]),
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
                        Struct(name="A", fields=[Field(name="num", type="int32", array_length=None)]),
                        Module(
                            name="inner",
                            definitions=[
                                Struct(name="B", fields=[Field(name="a", type="outer::A", array_length=None)])
                            ],
                        ),
                    ],
                )
            ],
        )

if __name__ == "__main__":
    unittest.main()
