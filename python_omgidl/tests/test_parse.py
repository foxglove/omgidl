import unittest

from omgidl_parser.parse import parse_idl, Struct, Field, Module

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

if __name__ == "__main__":
    unittest.main()
