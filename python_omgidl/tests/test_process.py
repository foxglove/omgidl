import unittest

from omgidl_parser import (
    parse_idl_message_definitions,
    IDLStructDefinition,
    IDLModuleDefinition,
    IDLUnionDefinition,
)


class TestProcess(unittest.TestCase):
    def test_parse_idl_message_definitions(self) -> None:
        schema = """
        const long CONST_TOP = 42;

        enum Color {
            RED,
            GREEN
        };

        module outer {
            const short A = 1;
            struct Inner { int32 value; };
        };

        typedef long MyLong;

        struct Holder {
            MyLong a;
            Color color;
            outer::Inner inner;
        };

        union MyUnion switch (Color) {
            case Color::RED: long a;
            default: outer::Inner b;
        };
        """
        defs = parse_idl_message_definitions(schema)
        by_name = {d.name: d for d in defs}

        inner = by_name["outer::Inner"]
        self.assertIsInstance(inner, IDLStructDefinition)
        self.assertEqual(inner.aggregatedKind, "struct")
        self.assertEqual(len(inner.definitions), 1)
        self.assertEqual(inner.definitions[0].name, "value")
        self.assertEqual(inner.definitions[0].type, "int32")

        outer_mod = by_name["outer"]
        self.assertIsInstance(outer_mod, IDLModuleDefinition)
        self.assertEqual(len(outer_mod.definitions), 1)
        self.assertEqual(outer_mod.definitions[0].name, "A")
        self.assertEqual(outer_mod.definitions[0].value, 1)

        color_mod = by_name["Color"]
        self.assertIsInstance(color_mod, IDLModuleDefinition)
        self.assertEqual({f.name: f.value for f in color_mod.definitions}, {"RED": 0, "GREEN": 1})

        holder = by_name["Holder"]
        self.assertIsInstance(holder, IDLStructDefinition)
        self.assertEqual([f.name for f in holder.definitions], ["a", "color", "inner"])
        self.assertEqual(holder.definitions[0].type, "int32")
        self.assertEqual(holder.definitions[1].type, "uint32")
        self.assertEqual(holder.definitions[1].enumType, "Color")
        self.assertTrue(holder.definitions[2].isComplex)
        self.assertEqual(holder.definitions[2].type, "outer::Inner")

        union_def = by_name["MyUnion"]
        self.assertIsInstance(union_def, IDLUnionDefinition)
        self.assertEqual(union_def.switchType, "uint32")
        self.assertEqual(len(union_def.cases), 1)
        self.assertEqual(union_def.cases[0].predicates, [0])
        self.assertEqual(union_def.cases[0].type.type, "int32")
        self.assertIsNotNone(union_def.defaultCase)
        self.assertEqual(union_def.defaultCase.type, "outer::Inner")

        top_module = by_name[""]
        self.assertIsInstance(top_module, IDLModuleDefinition)
        self.assertEqual(top_module.definitions[0].name, "CONST_TOP")
        self.assertEqual(top_module.definitions[0].value, 42)

    def test_variable_array_composition_with_typedef_chain(self) -> None:
        schema = """
        typedef sequence<int32, 10> int32arr;
        typedef int32arr int32arr2[2];
        struct ArrStruct {
            int32arr2 intArray;
        };
        """
        with self.assertRaises(ValueError):
            parse_idl_message_definitions(schema)

    def test_variable_array_composition_with_field_usage(self) -> None:
        schema = """
        typedef sequence<int32, 10> int32arr;
        struct ArrStruct {
            int32arr intArray[2];
        };
        """
        with self.assertRaises(ValueError):
            parse_idl_message_definitions(schema)

        schema2 = """
        typedef int32 int32arr[2];
        struct ArrStruct {
            sequence<int32arr> intArray;
        };
        """
        with self.assertRaises(ValueError):
            parse_idl_message_definitions(schema2)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
