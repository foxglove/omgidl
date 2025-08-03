import unittest

from omgidl_parser.parse import parse_idl, Struct, Field
from omgidl_serialization import MessageWriter


class TestMessageWriter(unittest.TestCase):
    def test_primitive_fields(self) -> None:
        schema = """
        struct A {
            int32 num;
            uint8 flag;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        msg = {"num": 5, "flag": 7}
        written = writer.write_message(msg)
        expected = bytes([0, 1, 0, 0, 5, 0, 0, 0, 7])
        self.assertEqual(written, expected)
        self.assertEqual(writer.calculate_byte_size(msg), len(expected))

    def test_uint8_array(self) -> None:
        schema = """
        struct A {
            uint8 data[4];
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        msg = {"data": [1, 2, 3, 4]}
        written = writer.write_message(msg)
        expected = bytes([0, 1, 0, 0, 1, 2, 3, 4])
        self.assertEqual(written, expected)
        self.assertEqual(writer.calculate_byte_size(msg), len(expected))

    def test_string_field(self) -> None:
        schema = """
        struct A {
            string name;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        msg = {"name": "hi"}
        written = writer.write_message(msg)
        expected = bytes([0, 1, 0, 0, 3, 0, 0, 0, 104, 105, 0])
        self.assertEqual(written, expected)
        self.assertEqual(writer.calculate_byte_size(msg), len(expected))

    def test_nested_struct(self) -> None:
        inner = Struct(name="Inner", fields=[Field(name="num", type="int32")])
        outer = Struct(name="Outer", fields=[Field(name="inner", type="Inner")])
        defs = [inner, outer]
        writer = MessageWriter("Outer", defs)
        msg = {"inner": {"num": 5}}
        written = writer.write_message(msg)
        expected = bytes([0, 1, 0, 0, 5, 0, 0, 0])
        self.assertEqual(written, expected)
        self.assertEqual(writer.calculate_byte_size(msg), len(expected))

    def test_variable_length_sequence(self) -> None:
        defs = [Struct(name="A", fields=[Field(name="data", type="int32")])]
        writer = MessageWriter("A", defs)
        msg = {"data": [3, 7]}
        written = writer.write_message(msg)
        expected = bytes([
            0, 1, 0, 0,
            2, 0, 0, 0,
            3, 0, 0, 0,
            7, 0, 0, 0,
        ])
        self.assertEqual(written, expected)
        self.assertEqual(writer.calculate_byte_size(msg), len(expected))

    def test_sequence_of_structs(self) -> None:
        inner = Struct(name="Inner", fields=[Field(name="num", type="int32")])
        outer = Struct(name="Outer", fields=[Field(name="inners", type="Inner")])
        defs = [inner, outer]
        writer = MessageWriter("Outer", defs)
        msg = {"inners": [{"num": 1}, {"num": 2}]}
        written = writer.write_message(msg)
        expected = bytes([
            0, 1, 0, 0,
            2, 0, 0, 0,
            1, 0, 0, 0,
            2, 0, 0, 0,
        ])
        self.assertEqual(written, expected)
        self.assertEqual(writer.calculate_byte_size(msg), len(expected))


if __name__ == "__main__":
    unittest.main()
