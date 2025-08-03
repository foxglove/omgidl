import unittest

from ros2idl_parser import parse_ros2idl, MessageDefinition, MessageDefinitionField
from omgidl_serialization import UNION_DISCRIMINATOR_PROPERTY_KEY


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
                            isArray=False,
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

    def test_union_definition(self):
        schema = """
        typedef long MyLong;
        union MyUnion switch (uint8) {
          case 0: MyLong as_long;
          case 1: string as_string;
        };
        struct Container { MyUnion value; };
        """
        types = parse_ros2idl(schema)
        self.assertEqual(
            types,
            [
                MessageDefinition(
                    name="MyUnion",
                    definitions=[
                        MessageDefinitionField(
                            type="uint8", name=UNION_DISCRIMINATOR_PROPERTY_KEY
                        ),
                        MessageDefinitionField(type="int32", name="as_long"),
                        MessageDefinitionField(type="string", name="as_string"),
                    ],
                ),
                MessageDefinition(
                    name="Container",
                    definitions=[
                        MessageDefinitionField(type="MyUnion", name="value")
                    ],
                ),
            ],
        )


if __name__ == "__main__":
    unittest.main()
