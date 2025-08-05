import unittest

from ros2idl_parser import MessageDefinition, MessageDefinitionField, parse_ros2idl


class TestParseRos2idl(unittest.TestCase):
    def test_module_with_struct_and_constants(self):
        schema = """
        module rosidl_parser {
          module action {
            module MyAction_Goal_Constants {
              const short SHORT_CONSTANT = -23;
            };
            struct MyAction_Goal {
              int32 input_value;
            };
          };
        };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="rosidl_parser/action/MyAction_Goal_Constants",
                    definitions=[
                        MessageDefinitionField(
                            type="int16",
                            name="SHORT_CONSTANT",
                            isConstant=True,
                            value=-23,
                            valueText="-23",
                        )
                    ],
                ),
                MessageDefinition(
                    name="rosidl_parser/action/MyAction_Goal",
                    definitions=[
                        MessageDefinitionField(
                            type="int32",
                            name="input_value",
                        )
                    ],
                ),
            ],
        )

    def test_builtin_time_normalization(self):
        schema = """
        module builtin_interfaces {
          module msg {
            struct Time {
              int32 sec;
              uint32 nanosec;
            };
          };
        };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="builtin_interfaces/msg/Time",
                    definitions=[
                        MessageDefinitionField(type="int32", name="sec"),
                        MessageDefinitionField(type="uint32", name="nsec"),
                    ],
                )
            ],
        )

    def test_sequence_field(self):
        schema = """
        module pkg {
          module msg {
            struct Seq {
              sequence<int32> data;
            };
          };
        };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="pkg/msg/Seq",
                    definitions=[
                        MessageDefinitionField(type="int32", name="data", isArray=True)
                    ],
                )
            ],
        )

    def test_bounded_sequence_field(self):
        schema = """
        module pkg {
          module msg {
            struct Seq {
              sequence<int32, 7> data;
            };
          };
        };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="pkg/msg/Seq",
                    definitions=[
                        MessageDefinitionField(
                            type="int32",
                            name="data",
                            isArray=True,
                            arrayUpperBound=7,
                        )
                    ],
                )
            ],
        )

    def test_typedef_resolution(self):
        schema = """
        typedef long MyLong;
        struct Holder { MyLong data; };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="Holder",
                    definitions=[MessageDefinitionField(type="int32", name="data")],
                )
            ],
        )

    def test_struct_field_is_complex(self):
        schema = """
        module rosidl_parser {
          module msg {
            struct MyMessage {
              geometry::msg::Point single_point;
            };
          };
        };
        module geometry {
          module msg {
            struct Point { float x; };
          };
        };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="rosidl_parser/msg/MyMessage",
                    definitions=[
                        MessageDefinitionField(
                            type="geometry/msg/Point",
                            name="single_point",
                            isComplex=True,
                        )
                    ],
                ),
                MessageDefinition(
                    name="geometry/msg/Point",
                    definitions=[MessageDefinitionField(type="float32", name="x")],
                ),
            ],
        )

    def test_enum_reference(self):
        schema = """
        enum COLORS {
          RED,
          GREEN,
          BLUE
        };
        struct Line { COLORS color; };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="COLORS",
                    definitions=[
                        MessageDefinitionField(
                            type="uint32",
                            name="RED",
                            isConstant=True,
                            value=0,
                            valueText="0",
                        ),
                        MessageDefinitionField(
                            type="uint32",
                            name="GREEN",
                            isConstant=True,
                            value=1,
                            valueText="1",
                        ),
                        MessageDefinitionField(
                            type="uint32",
                            name="BLUE",
                            isConstant=True,
                            value=2,
                            valueText="2",
                        ),
                    ],
                ),
                MessageDefinition(
                    name="Line",
                    definitions=[
                        MessageDefinitionField(
                            type="uint32", name="color", enumType="COLORS"
                        )
                    ],
                ),
            ],
        )

    def test_scoped_enum_reference(self):
        schema = """
        module colors {
          enum Palette {
            RED,
            GREEN
          };
        };
        struct Pixel { colors::Palette tone; };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="colors/Palette",
                    definitions=[
                        MessageDefinitionField(
                            type="uint32",
                            name="RED",
                            isConstant=True,
                            value=0,
                            valueText="0",
                        ),
                        MessageDefinitionField(
                            type="uint32",
                            name="GREEN",
                            isConstant=True,
                            value=1,
                            valueText="1",
                        ),
                    ],
                ),
                MessageDefinition(
                    name="Pixel",
                    definitions=[
                        MessageDefinitionField(
                            type="uint32", name="tone", enumType="colors/Palette"
                        )
                    ],
                ),
            ],
        )

    def test_union_definition_not_supported(self):
        schema = """
        union MyUnion switch (uint8) {
          case 0: string as_string;
        };
        """
        with self.assertRaises(ValueError):
            parse_ros2idl(schema)

    def test_multi_dimensional_array_not_supported(self):
        schema = """
        struct MultiArray { int32 data[3][5]; };
        """
        with self.assertRaises(ValueError):
            parse_ros2idl(schema)


if __name__ == "__main__":
    unittest.main()
