import unittest
from array import array

from omgidl_parser.parse import parse_idl, Struct, Field
from omgidl_serialization import MessageWriter, MessageReader, EncapsulationKind


class TestMessageReader(unittest.TestCase):
    def test_roundtrip_primitive_fields(self) -> None:
        schema = """
        struct A {
            int32 num;
            uint8 flag;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"num": 5, "flag": 7}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_union(self) -> None:
        schema = """
        union U switch (uint8) {
            case 0:
                uint8 a;
            case 1:
                uint8 b;
        };
        struct A { U u; };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"u": {"_d": 0, "a": 7}}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_big_endian_roundtrip(self) -> None:
        schema = """
        struct A {
            int32 num;
            uint8 flag;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs, encapsulation_kind=EncapsulationKind.CDR_BE)
        reader = MessageReader("A", defs)
        msg = {"num": 5, "flag": 7}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_pl_cdr2_header_roundtrip(self) -> None:
        schema = """
        struct A {
            int32 num;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs, encapsulation_kind=EncapsulationKind.PL_CDR2_LE)
        reader = MessageReader("A", defs)
        msg = {"num": 42}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_uint8_array(self) -> None:
        schema = """
        struct A {
            uint8 data[4];
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"data": array('B', [1, 2, 3, 4])}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_multidimensional_uint8_array(self) -> None:
        schema = """
        struct A {
            uint8 data[2][3];
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"data": [array('B', [1, 2, 3]), array('B', [4, 5, 6])]}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_string_field(self) -> None:
        schema = """
        struct A {
            string name;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"name": "hi"}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_bounded_string_field(self) -> None:
        schema = """
        struct A {
            string<5> name;
        };
        """
        defs = parse_idl(schema)
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"name": "hello"}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_reader_bounded_string_enforced(self) -> None:
        schema_unbounded = """
        struct A {
            string name;
        };
        """
        defs_unbounded = parse_idl(schema_unbounded)
        writer = MessageWriter("A", defs_unbounded)
        buf = writer.write_message({"name": "toolong"})
        schema_bounded = """
        struct A {
            string<5> name;
        };
        """
        defs_bounded = parse_idl(schema_bounded)
        reader = MessageReader("A", defs_bounded)
        with self.assertRaises(ValueError):
            reader.read_message(buf)

    def test_roundtrip_nested_struct(self) -> None:
        inner = Struct(name="Inner", fields=[Field(name="num", type="int32")])
        outer = Struct(name="Outer", fields=[Field(name="inner", type="Inner")])
        defs = [inner, outer]
        writer = MessageWriter("Outer", defs)
        reader = MessageReader("Outer", defs)
        msg = {"inner": {"num": 5}}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_variable_length_sequence(self) -> None:
        defs = [Struct(name="A", fields=[Field(name="data", type="int32", is_sequence=True)])]
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"data": array('i', [3, 7])}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_typed_float_sequence(self) -> None:
        defs = [Struct(name="A", fields=[Field(name="data", type="float32", is_sequence=True)])]
        writer = MessageWriter("A", defs)
        reader = MessageReader("A", defs)
        msg = {"data": array('f', [1.0, 2.0])}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)

    def test_roundtrip_sequence_of_structs(self) -> None:
        inner = Struct(name="Inner", fields=[Field(name="num", type="int32")])
        outer = Struct(name="Outer", fields=[Field(name="inners", type="Inner", is_sequence=True)])
        defs = [inner, outer]
        writer = MessageWriter("Outer", defs)
        reader = MessageReader("Outer", defs)
        msg = {"inners": [{"num": 1}, {"num": 2}]}
        buf = writer.write_message(msg)
        decoded = reader.read_message(buf)
        self.assertEqual(decoded, msg)


if __name__ == "__main__":
    unittest.main()
