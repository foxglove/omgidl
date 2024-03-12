import { CdrReader } from "@foxglove/cdr";
import {
  IDLMessageDefinition,
  IDLMessageDefinitionField,
  IDLUnionDefinition,
} from "@foxglove/omgidl-parser";

export type Deserializer = (
  reader: CdrReader,
  /**
   * Optional length only applied for string types as character length.
   * Prevents reader from reading sequence length again if already read via header.
   */
  length?: number,
) => boolean | number | bigint | string;

export type ArrayDeserializer = (
  reader: CdrReader,
  count: number,
) =>
  | boolean[]
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array
  | string[];

export type HeaderOptions = {
  usesDelimiterHeader: boolean;
  usesMemberHeader: boolean;
};

export type PrimitiveDeserializationInfo = {
  type: "primitive";
  typeLength: number;
  deserialize: Deserializer;
};

export type PrimitiveArrayDeserializationInfo = {
  type: "array-primitive";
  typeLength: number;
  deserialize: ArrayDeserializer;
};

export type StructDeserializationInfo = HeaderOptions & {
  type: "struct";
  fields: FieldDeserializationInfo[];
};

export type UnionDeserializationInfo = HeaderOptions & {
  type: "union";
  switchTypeDeser: Deserializer;
  switchTypeLength: number;
  definition: IDLUnionDefinition;
};

export type ComplexDeserializationInfo = StructDeserializationInfo | UnionDeserializationInfo;
export type PrimitiveTypeDeserInfo =
  | PrimitiveDeserializationInfo
  | PrimitiveArrayDeserializationInfo;

export type FieldDeserializationInfo = {
  name: string;
  type: string;
  typeDeserInfo: ComplexDeserializationInfo | PrimitiveTypeDeserInfo;
  isArray?: boolean;
  arrayLengths?: number[];
  definitionId?: number;
};

export class DeserializationInfoCache {
  #definitions: Map<string, IDLMessageDefinition>;
  #complexDeserializationInfo: Map<string, ComplexDeserializationInfo> = new Map();

  constructor(definitions: IDLMessageDefinition[]) {
    this.#definitions = new Map<string, IDLMessageDefinition>(
      definitions.map((def) => [def.name ?? "", def]),
    );
  }

  /**
   * Gets the deserialization info object for a complex definition (struct or union).
   * If not found in the cache, the deserialization info object will be built (including sub-types)
   * and added to the cache.
   *
   * @param definition Message definition
   * @returns Deserialization info
   */
  public getComplexDeserializationInfo(
    definition: IDLMessageDefinition,
  ): ComplexDeserializationInfo {
    if (definition.aggregatedKind === "module") {
      throw new Error(`Modules are not used in serialization`);
    }

    const cached = this.#complexDeserializationInfo.get(definition.name ?? "");
    if (cached) {
      return cached;
    }

    if (definition.aggregatedKind === "union") {
      const switchTypeDeser = PRIMITIVE_DESERIALIZERS.get(definition.switchType);
      const switchTypeLength = typeToByteLength(definition.switchType);

      if (switchTypeDeser == undefined || switchTypeLength == undefined) {
        throw new Error(
          `Unrecognized primitive type ${definition.switchType} in union ${
            definition.name ?? "unknown"
          }`,
        );
      }

      const deserInfo: UnionDeserializationInfo = {
        type: "union",
        ...getHeaderNeeds(definition),
        definition,
        switchTypeDeser,
        switchTypeLength,
      };

      this.#complexDeserializationInfo.set(definition.name ?? "", deserInfo);
      return deserInfo;
    }

    const deserInfo: StructDeserializationInfo = {
      type: "struct",
      ...getHeaderNeeds(definition),
      fields: definition.definitions.reduce(
        (fieldsAccum, fieldDef) =>
          fieldDef.isConstant === true
            ? fieldsAccum
            : fieldsAccum.concat(this.buildFieldDeserInfo(fieldDef)),
        [] as FieldDeserializationInfo[],
      ),
    };

    this.#complexDeserializationInfo.set(definition.name ?? "", deserInfo);
    return deserInfo;
  }

  /**
   * Builds the deserialization info object for a field definition which can be a complex or primitive type.
   *
   * @param definition Field definition
   * @returns Deserialization info
   */
  public buildFieldDeserInfo(definition: IDLMessageDefinitionField): FieldDeserializationInfo {
    const { name, type, isComplex, isArray, arrayLengths } = definition;

    if (isComplex === true) {
      let typeDeserInfo = this.#complexDeserializationInfo.get(type);
      if (!typeDeserInfo) {
        const fieldDefinition = this.#definitions.get(type);
        if (!fieldDefinition) {
          throw new Error(`Failed to find definition for type ${type}`);
        }
        typeDeserInfo = this.getComplexDeserializationInfo(fieldDefinition);
      }

      return {
        name,
        type,
        typeDeserInfo,
        isArray,
        arrayLengths,
        definitionId: getDefinitionId(definition),
      };
    }

    if (type === "wchar" || type === "wstring") {
      throw new Error(
        `'wchar' and 'wstring' types are not supported because they are implementation dependent`,
      );
    }

    const deserialize =
      isArray === true
        ? PRIMITIVE_ARRAY_DESERIALIZERS.get(type)
        : PRIMITIVE_DESERIALIZERS.get(type);
    if (!deserialize) {
      throw new Error(`Unrecognized primitive type ${type}`);
    }

    const typeLength = typeToByteLength(type);
    if (typeLength == undefined) {
      throw new Error(`Unrecognized primitive type ${type}`);
    }

    const fieldDeserInfo: PrimitiveTypeDeserInfo =
      isArray === true
        ? {
            type: "array-primitive",
            deserialize: deserialize as ArrayDeserializer,
            typeLength,
          }
        : {
            type: "primitive",
            deserialize: deserialize as Deserializer,
            typeLength,
          };

    return {
      name,
      type,
      typeDeserInfo: fieldDeserInfo,
      isArray,
      arrayLengths,
      definitionId: getDefinitionId(definition),
    };
  }
}

function typeToByteLength(type: string): number | undefined {
  switch (type) {
    case "bool":
    case "int8":
    case "uint8":
    case "string":
      return 1;
    case "int16":
    case "uint16":
      return 2;
    case "int32":
    case "uint32":
    case "float32":
      return 4;
    case "int64":
    case "uint64":
    case "float64":
      return 8;
    default:
      return undefined;
  }
}

export const PRIMITIVE_DESERIALIZERS = new Map<string, Deserializer>([
  ["bool", (reader) => Boolean(reader.int8())],
  ["int8", (reader) => reader.int8()],
  ["uint8", (reader) => reader.uint8()],
  ["int16", (reader) => reader.int16()],
  ["uint16", (reader) => reader.uint16()],
  ["int32", (reader) => reader.int32()],
  ["uint32", (reader) => reader.uint32()],
  ["int64", (reader) => reader.int64()],
  ["uint64", (reader) => reader.uint64()],
  ["float32", (reader) => reader.float32()],
  ["float64", (reader) => reader.float64()],
  ["string", (reader, length) => reader.string(length)],
]);

export const PRIMITIVE_ARRAY_DESERIALIZERS = new Map<string, ArrayDeserializer>([
  ["bool", readBoolArray],
  ["int8", (reader, count) => reader.int8Array(count)],
  ["uint8", (reader, count) => reader.uint8Array(count)],
  ["int16", (reader, count) => reader.int16Array(count)],
  ["uint16", (reader, count) => reader.uint16Array(count)],
  ["int32", (reader, count) => reader.int32Array(count)],
  ["uint32", (reader, count) => reader.uint32Array(count)],
  ["int64", (reader, count) => reader.int64Array(count)],
  ["uint64", (reader, count) => reader.uint64Array(count)],
  ["float32", (reader, count) => reader.float32Array(count)],
  ["float64", (reader, count) => reader.float64Array(count)],
  ["string", readStringArray],
]);

function readBoolArray(reader: CdrReader, count: number): boolean[] {
  const array = new Array<boolean>(count);
  for (let i = 0; i < count; i++) {
    array[i] = Boolean(reader.int8());
  }
  return array;
}

function readStringArray(reader: CdrReader, count: number): string[] {
  const array = new Array<string>(count);
  for (let i = 0; i < count; i++) {
    array[i] = reader.string();
  }
  return array;
}

function getHeaderNeeds(definition: IDLMessageDefinition): {
  usesDelimiterHeader: boolean;
  usesMemberHeader: boolean;
} {
  const { annotations } = definition;

  if (!annotations) {
    return { usesDelimiterHeader: false, usesMemberHeader: false };
  }

  if ("mutable" in annotations) {
    return { usesDelimiterHeader: true, usesMemberHeader: true };
  }
  if ("appendable" in annotations) {
    return { usesDelimiterHeader: true, usesMemberHeader: false };
  }
  return { usesDelimiterHeader: false, usesMemberHeader: false };
}

function getDefinitionId(definition: IDLMessageDefinitionField): number | undefined {
  const { annotations } = definition;

  if (!annotations) {
    return undefined;
  }

  if (!("id" in annotations)) {
    return undefined;
  }

  const id = annotations.id;
  if (id != undefined && id.type === "const-param" && typeof id.value === "number") {
    return id.value;
  }

  return undefined;
}
