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

if __name__ == "__main__":
    unittest.main()
