import { IDLMessageDefinition, IDLMessageDefinitionField } from "@foxglove/omgidl-parser";

import {
  DeserializationInfoCache,
  FieldDeserializationInfo,
  PRIMITIVE_ARRAY_DESERIALIZERS,
  PRIMITIVE_DESERIALIZERS,
} from "./DeserializationInfoCache";
import { UNION_DISCRIMINATOR_PROPERTY_KEY } from "./constants";

const TRANSFORM_DEFINITION: IDLMessageDefinition = {
  name: "geometry_msgs::msg::Transform",
  definitions: [
    { name: "translation", type: "geometry_msgs::msg::Vector3", isComplex: true },
    { name: "rotation", type: "geometry_msgs::msg::Quaternion", isComplex: true },
  ],
  aggregatedKind: "struct",
};
const VECTOR_DEFINITION: IDLMessageDefinition = {
  name: "geometry_msgs::msg::Vector3",
  definitions: [
    { name: "x", type: "float64", isComplex: false },
    { name: "y", type: "float64", isComplex: false },
    { name: "z", type: "float64", isComplex: false },
  ],
  aggregatedKind: "struct",
};
const QUATERNION_DEFINITION: IDLMessageDefinition = {
  name: "geometry_msgs::msg::Quaternion",
  definitions: [
    { name: "x", type: "float64", isComplex: false },
    { name: "y", type: "float64", isComplex: false },
    { name: "z", type: "float64", isComplex: false },
    { name: "w", type: "float64", isComplex: false },
  ],
  aggregatedKind: "struct",
};
const TIME_DEFINITION: IDLMessageDefinition = {
  name: "builtin_interfaces::Time",
  definitions: [
    { name: "sec", type: "int32", isComplex: false },
    { name: "nanosec", type: "uint32", isComplex: false },
  ],
  aggregatedKind: "struct",
};

const FLOAT64_PRIMITIVE_DESER_INFO = {
  type: "float64",
  typeDeserInfo: {
    type: "primitive",
    typeLength: 8,
    deserialize: PRIMITIVE_DESERIALIZERS.get("float64"),
  },
};

function makeFieldDeserFromComplexDef(
  complexDefinition: IDLMessageDefinition,
  deserializationInfoCache: DeserializationInfoCache,
): FieldDeserializationInfo {
  return deserializationInfoCache.buildFieldDeserInfo({
    name: `${complexDefinition.name ?? ""}_field`,
    type: complexDefinition.name ?? "",
    isComplex: true,
  } as IDLMessageDefinitionField);
}
describe("DeserializationInfoCache", () => {
  it("creates deserialization info for struct with primitive fields", () => {
    const deserializationInfoCache = new DeserializationInfoCache([TIME_DEFINITION]);
    const timeDeserInfo = deserializationInfoCache.getComplexDeserializationInfo(TIME_DEFINITION);
    expect(timeDeserInfo).toMatchObject({
      type: "struct",
      fields: [
        {
          name: "sec",
          type: "int32",
          typeDeserInfo: {
            type: "primitive",
            typeLength: 4,
            deserialize: PRIMITIVE_DESERIALIZERS.get("int32"),
          },
        },
        {
          name: "nanosec",
          type: "uint32",
          typeDeserInfo: {
            type: "primitive",
            typeLength: 4,
            deserialize: PRIMITIVE_DESERIALIZERS.get("uint32"),
          },
        },
      ],
    });
  });

  it("creates deserialization info for struct with complex fields", () => {
    const deserializationInfoCache = new DeserializationInfoCache([
      TRANSFORM_DEFINITION,
      VECTOR_DEFINITION,
      QUATERNION_DEFINITION,
    ]);
    const timeDeserInfo =
      deserializationInfoCache.getComplexDeserializationInfo(TRANSFORM_DEFINITION);
    expect(timeDeserInfo).toMatchObject({
      type: "struct",
      fields: [
        {
          name: "translation",
          type: "geometry_msgs::msg::Vector3",
          typeDeserInfo: {
            type: "struct",
            fields: [
              {
                name: "x",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
              {
                name: "y",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
              {
                name: "z",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
            ],
          },
        },
        {
          name: "rotation",
          type: "geometry_msgs::msg::Quaternion",
          typeDeserInfo: {
            type: "struct",
            fields: [
              {
                name: "x",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
              {
                name: "y",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
              {
                name: "z",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
              {
                name: "w",
                ...FLOAT64_PRIMITIVE_DESER_INFO,
              },
            ],
          },
        },
      ],
    });
  });

  it("creates deserialization info for primitive field", () => {
    const deserializationInfoCache = new DeserializationInfoCache([]);
    const fieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      name: "some_field_name",
      type: "float64",
    });
    expect(fieldDeserInfo).toMatchObject({
      name: "some_field_name",
      ...FLOAT64_PRIMITIVE_DESER_INFO,
    });
  });

  it("creates deserialization info for primitive array field", () => {
    const deserializationInfoCache = new DeserializationInfoCache([]);
    const fieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      name: "some_array_field",
      type: "float64",
      isArray: true,
    });
    expect(fieldDeserInfo).toMatchObject({
      name: "some_array_field",
      type: "float64",
      isArray: true,
      typeDeserInfo: {
        type: "array-primitive",
        typeLength: 8,
        deserialize: PRIMITIVE_ARRAY_DESERIALIZERS.get("float64"),
      },
    });
  });

  it("creates deserialization info for complex field", () => {
    const deserializationInfoCache = new DeserializationInfoCache([TIME_DEFINITION]);
    const timeFieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      isComplex: true,
      name: "time",
      type: "builtin_interfaces::Time",
    });
    expect(timeFieldDeserInfo).toMatchObject({
      name: "time",
      type: "builtin_interfaces::Time",
      typeDeserInfo: {
        type: "struct",
        fields: [
          {
            name: "sec",
            type: "int32",
            typeDeserInfo: {
              type: "primitive",
              typeLength: 4,
              deserialize: PRIMITIVE_DESERIALIZERS.get("int32"),
            },
          },
          {
            name: "nanosec",
            type: "uint32",
            typeDeserInfo: {
              type: "primitive",
              typeLength: 4,
              deserialize: PRIMITIVE_DESERIALIZERS.get("uint32"),
            },
          },
        ],
      },
    });
  });

  it("creates deserialization info for complex array field", () => {
    const deserializationInfoCache = new DeserializationInfoCache([VECTOR_DEFINITION]);
    const timeFieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      isComplex: true,
      isArray: true,
      name: "vectors",
      type: "geometry_msgs::msg::Vector3",
    });
    expect(timeFieldDeserInfo).toMatchObject({
      name: "vectors",
      type: "geometry_msgs::msg::Vector3",
      isArray: true,
      typeDeserInfo: {
        type: "struct",
        fields: [
          {
            name: "x",
            ...FLOAT64_PRIMITIVE_DESER_INFO,
          },
          {
            name: "y",
            ...FLOAT64_PRIMITIVE_DESER_INFO,
          },
          {
            name: "z",
            ...FLOAT64_PRIMITIVE_DESER_INFO,
          },
        ],
      },
    });
  });
  it("creates default value for struct with primitive fields", () => {
    const deserializationInfoCache = new DeserializationInfoCache([TIME_DEFINITION]);
    const fieldDeserInfo = makeFieldDeserFromComplexDef(TIME_DEFINITION, deserializationInfoCache);
    expect(deserializationInfoCache.getFieldDefault(fieldDeserInfo)).toMatchObject({
      sec: 0,
      nanosec: 0,
    });
  });

  it("creates default value for struct with complex fields", () => {
    const deserializationInfoCache = new DeserializationInfoCache([
      TRANSFORM_DEFINITION,
      VECTOR_DEFINITION,
      QUATERNION_DEFINITION,
    ]);
    const fieldDeserInfo = makeFieldDeserFromComplexDef(
      TRANSFORM_DEFINITION,
      deserializationInfoCache,
    );
    expect(deserializationInfoCache.getFieldDefault(fieldDeserInfo)).toMatchObject({
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 0 },
    });
  });

  it("creates default value for primitive field", () => {
    const deserializationInfoCache = new DeserializationInfoCache([]);
    const fieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      name: "some_field_name",
      type: "float64",
    });
    expect(deserializationInfoCache.getFieldDefault(fieldDeserInfo)).toEqual(0);
  });
  it("creates correct default for a complex array field", () => {
    const deserializationInfoCache = new DeserializationInfoCache([VECTOR_DEFINITION]);
    const vectorFieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      isComplex: true,
      isArray: true,
      name: "vectors",
      type: "geometry_msgs::msg::Vector3",
    });
    expect(deserializationInfoCache.getFieldDefault(vectorFieldDeserInfo)).toEqual([]);
  });
  it("creates correct default for a union field with a default case", () => {
    const unionDefinition: IDLMessageDefinition = {
      name: "test::Union",
      aggregatedKind: "union",
      switchType: "uint32",
      cases: [
        {
          predicates: [0],
          type: { name: "a", type: "int32", isComplex: false },
        },
        {
          predicates: [1],
          type: { name: "b", type: "float64", isComplex: false },
        },
      ],
      defaultCase: { name: "c", type: "string", isComplex: false },
    };
    const deserializationInfoCache = new DeserializationInfoCache([unionDefinition]);
    const fieldDeserInfo = makeFieldDeserFromComplexDef(unionDefinition, deserializationInfoCache);
    expect(deserializationInfoCache.getFieldDefault(fieldDeserInfo)).toEqual({
      [UNION_DISCRIMINATOR_PROPERTY_KEY]: undefined,
      c: "",
    });
  });
  it("creates correct default for a union field without a default case", () => {
    const unionDefinition: IDLMessageDefinition = {
      name: "test::Union",
      aggregatedKind: "union",
      switchType: "uint32",
      cases: [
        {
          predicates: [1],
          type: { name: "a", type: "uint8", isComplex: false },
        },
        {
          predicates: [0], // default case because default value for switch case is 0
          type: { name: "b", type: "float64", isComplex: false },
        },
      ],
    };
    const deserializationInfoCache = new DeserializationInfoCache([unionDefinition]);
    const fieldDeserInfo = makeFieldDeserFromComplexDef(unionDefinition, deserializationInfoCache);
    expect(deserializationInfoCache.getFieldDefault(fieldDeserInfo)).toEqual({
      [UNION_DISCRIMINATOR_PROPERTY_KEY]: 0,
      b: 0,
    });
  });
  it("creates correct default for a struct field with optional and non-optional members", () => {
    const unionDefinition: IDLMessageDefinition = {
      name: "test::Message",
      aggregatedKind: "struct",
      definitions: [
        { name: "a", type: "uint32", isComplex: false },
        {
          name: "b",
          type: "uint32",
          isComplex: false,
          annotations: {
            optional: { type: "no-params", name: "optional" },
          },
        },
      ],
    };
    const deserializationInfoCache = new DeserializationInfoCache([unionDefinition]);
    const fieldDeserInfo = makeFieldDeserFromComplexDef(unionDefinition, deserializationInfoCache);
    expect(deserializationInfoCache.getFieldDefault(fieldDeserInfo)).toEqual({
      a: 0,
      b: undefined,
    });
  });
  it("throws if required type definitions are not found", () => {
    const deserializationInfoCache = new DeserializationInfoCache([TIME_DEFINITION]);
    expect(() =>
      deserializationInfoCache.getComplexDeserializationInfo(TRANSFORM_DEFINITION),
    ).toThrow();
    expect(() =>
      deserializationInfoCache.buildFieldDeserInfo({
        name: "foo",
        type: "some/unknown_type",
      }),
    ).toThrow();
  });
});
