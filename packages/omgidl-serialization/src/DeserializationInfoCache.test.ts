import { IDLMessageDefinition } from "@foxglove/omgidl-parser";

import {
  DeserializationInfoCache,
  PRIMITIVE_ARRAY_DESERIALIZERS,
  PRIMITIVE_DESERIALIZERS,
} from "./DeserializationInfoCache";

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

  it("creates deserialization info for struct with complext fields", () => {
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

  it("can build primitive field deserialization info", () => {
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

  it("can build primitive array field deserialization info", () => {
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

  it("can build complex field deserialization info", () => {
    const deserializationInfoCache = new DeserializationInfoCache([TIME_DEFINITION]);
    const timeFieldDeserInfo = deserializationInfoCache.buildFieldDeserInfo({
      isComplex: true,
      name: "time",
      type: "builtin_interfaces::Time",
    });
    expect(timeFieldDeserInfo.typeDeserInfo).toMatchObject({
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
