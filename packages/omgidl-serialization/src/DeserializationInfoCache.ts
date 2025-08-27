import { CdrReader } from "@foxglove/cdr";
import {
  IDLMessageDefinition,
  IDLMessageDefinitionField,
  IDLStructDefinition,
  IDLUnionDefinition,
} from "@foxglove/omgidl-parser";

import { UNION_DISCRIMINATOR_PROPERTY_KEY } from "./constants";
import {
  DEFAULT_BOOLEAN_VALUE,
  DEFAULT_BYTE_VALUE,
  DEFAULT_NUMERICAL_VALUE,
  DEFAULT_STRING_VALUE,
} from "./defaultValues";

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
  /** The bye length of the type. (ie: 2 bytes for Uint16) */
  typeLength: number;
  deserialize: ArrayDeserializer;
};

export type StructDeserializationInfo = HeaderOptions & {
  type: "struct";
  fieldsInOrder: FieldDeserializationInfo[];
  fieldsById: Map<number, FieldDeserializationInfo>;
  definition: IDLStructDefinition;
  /** optional allows for defaultValues to be calculated lazily */
  defaultValue?: Record<string, unknown>;
};

export type UnionDeserializationInfo = HeaderOptions & {
  type: "union";
  switchTypeDeser: Deserializer;
  switchTypeLength: number;
  definition: IDLUnionDefinition;
  /** optional allows for defaultValues to be calculated lazily */
  defaultValue?: Record<string, unknown>;
};

export type ComplexDeserializationInfo = StructDeserializationInfo | UnionDeserializationInfo;
export type PrimitiveTypeDeserInfo =
  | PrimitiveDeserializationInfo
  | PrimitiveArrayDeserializationInfo;

export type FieldDeserializationInfo<
  DeserInfo extends ComplexDeserializationInfo | PrimitiveTypeDeserInfo =
    | ComplexDeserializationInfo
    | PrimitiveTypeDeserInfo,
> = {
  name: string;
  type: string;
  typeDeserInfo: DeserInfo;
  isArray?: boolean;
  arrayLengths?: number[];
  definitionId?: number;
  /** Optional fields show undefined if not present in the message.
   * Non-optional fields show a default value per the spec:
   * https://www.omg.org/spec/DDS-XTypes/1.3/PDF 7.2.2.4.4.4.7
   */
  isOptional: boolean;
  isComplex: DeserInfo extends ComplexDeserializationInfo ? true : false;
  /** optional allows for defaultValues to be calculated lazily */
  defaultValue?: unknown;
};

export class DeserializationInfoCache {
  #definitions: Map<string, IDLMessageDefinition>;
  #complexDeserializationInfo = new Map<string, ComplexDeserializationInfo>();

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

    const fieldsInOrder = [];
    for (const field of definition.definitions) {
      if (field.isConstant === true) {
        continue;
      }
      fieldsInOrder.push(this.buildFieldDeserInfo(field));
    }
    // specifies the behavior of implicit ids for mutable members
    const autoidAnnotation = definition.annotations?.["autoid"];
    if (autoidAnnotation?.type === "const-param" && autoidAnnotation.value === "HASH") {
      throw new Error(
        "Hash autoid is not supported because OMGIDL docs do not specify a hashing algorithm.",
      );
    }

    const fieldsById = new Map<number, FieldDeserializationInfo>();
    // handle fields with explicit ids
    for (const field of fieldsInOrder) {
      if (field.definitionId != undefined) {
        fieldsById.set(field.definitionId, field);
      }
    }

    // fields without ids are implicitly assigned ids sequentially
    // assumes the implicit @autoid(SEQUENTIAL) annotation on mutable members
    let counter = 0;
    for (const field of fieldsInOrder) {
      if (field.definitionId != undefined) {
        continue;
      }
      while (fieldsById.get(counter) != undefined) {
        counter++;
      }
      fieldsById.set(counter, {
        ...field,
        definitionId: counter,
      });
      counter++;
    }

    const deserInfo: StructDeserializationInfo = {
      type: "struct",
      ...getHeaderNeeds(definition),
      definition,
      fieldsById,
      fieldsInOrder,
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
        isOptional: isOptional(definition),
        isComplex: true,
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
      isComplex: false,
      isArray,
      arrayLengths,
      definitionId: getDefinitionId(definition),
      isOptional: isOptional(definition),
    };
  }

  /** Returns default value for given FieldDeserializationInfo.
   * If defaultValue is not defined on FieldDeserializationInfo, it will be calculated and set.
   */
  public getFieldDefault(deserInfo: FieldDeserializationInfo): unknown {
    if (deserInfo.defaultValue != undefined) {
      return deserInfo.defaultValue;
    }
    const { isArray, arrayLengths, type, isComplex } = deserInfo;

    if (isArray === true && arrayLengths == undefined) {
      deserInfo.defaultValue = [];
      return deserInfo.defaultValue;
    }
    let defaultValueGetter;
    if (isComplex) {
      defaultValueGetter = () => {
        return this.#getComplexDeserInfoDefault(
          deserInfo.typeDeserInfo as ComplexDeserializationInfo,
        );
      };
    } else {
      // fixed length arrays are filled with default values
      defaultValueGetter = PRIMITIVE_DEFAULT_VALUE_GETTERS.get(type);
      if (!defaultValueGetter) {
        throw new Error(`Failed to find default value getter for type ${type}`);
      }
    }
    // Used for fixed length arrays that may be nested
    const needsNestedArray = isArray === true && arrayLengths != undefined;
    deserInfo.defaultValue = needsNestedArray
      ? makeNestedArray(defaultValueGetter, arrayLengths, 0)
      : defaultValueGetter();
    return deserInfo.defaultValue;
  }

  /** Computes and sets the default value on the complex deserialization info */
  #getComplexDeserInfoDefault(deserInfo: ComplexDeserializationInfo): Record<string, unknown> {
    // if `structuredClone` is part of the environment, use it to clone the default message
    // want to avoid defaultValues having references to the same object
    if (deserInfo.defaultValue != undefined && typeof structuredClone !== "undefined") {
      return structuredClone(deserInfo.defaultValue);
    }
    deserInfo.defaultValue = {};
    const defaultMessage = deserInfo.defaultValue;
    if (deserInfo.type === "union") {
      const { definition: unionDef } = deserInfo;
      const { switchType } = unionDef;

      let defaultCase: IDLMessageDefinitionField | undefined = unionDef.defaultCase;
      // use existing default case if there is one
      if (!defaultCase) {
        // choose default based off of default value of switch case type
        const switchTypeDefaultGetter = PRIMITIVE_DEFAULT_VALUE_GETTERS.get(switchType);
        if (switchTypeDefaultGetter == undefined) {
          throw new Error(`Failed to find default value getter for type ${switchType}`);
        }
        const switchValue = switchTypeDefaultGetter() as number | boolean;

        defaultCase = unionDef.cases.find((c) => c.predicates.includes(switchValue))?.type;
        if (!defaultCase) {
          throw new Error(`Failed to find default case for union ${unionDef.name ?? ""}`);
        }
        defaultMessage[UNION_DISCRIMINATOR_PROPERTY_KEY] = switchValue;
      } else {
        // default exists, default value of switch case type is not needed
        defaultMessage[UNION_DISCRIMINATOR_PROPERTY_KEY] = undefined;
      }
      const defaultCaseDeserInfo = this.buildFieldDeserInfo(defaultCase);
      defaultMessage[defaultCaseDeserInfo.name] = this.getFieldDefault(defaultCaseDeserInfo);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (deserInfo.type === "struct") {
      for (const field of deserInfo.fieldsInOrder) {
        if (!field.isOptional) {
          defaultMessage[field.name] = this.getFieldDefault(field);
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (defaultMessage == undefined) {
      throw new Error(`Unrecognized complex type ${deserInfo.type as string}`);
    }
    return defaultMessage;
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

export const PRIMITIVE_DEFAULT_VALUE_GETTERS = new Map<string, () => unknown>([
  ["bool", () => DEFAULT_BOOLEAN_VALUE],
  ["int8", () => DEFAULT_BYTE_VALUE],
  ["uint8", () => DEFAULT_BYTE_VALUE],
  ["int16", () => DEFAULT_NUMERICAL_VALUE],
  ["uint16", () => DEFAULT_NUMERICAL_VALUE],
  ["int32", () => DEFAULT_NUMERICAL_VALUE],
  ["uint32", () => DEFAULT_NUMERICAL_VALUE],
  ["int64", () => DEFAULT_NUMERICAL_VALUE],
  ["uint64", () => DEFAULT_NUMERICAL_VALUE],
  ["float32", () => DEFAULT_NUMERICAL_VALUE],
  ["float64", () => DEFAULT_NUMERICAL_VALUE],
  ["string", () => DEFAULT_STRING_VALUE],
]);

export function makeNestedArray(
  getValue: () => unknown,
  arrayLengths: number[],
  depth: number,
): unknown[] {
  if (depth > arrayLengths.length - 1 || depth < 0) {
    throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
  }

  const array = [];

  for (let i = 0; i < arrayLengths[depth]!; i++) {
    if (depth === arrayLengths.length - 1) {
      array.push(getValue());
    } else {
      array.push(makeNestedArray(getValue, arrayLengths, depth + 1));
    }
  }

  return array;
}

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

function isOptional(definition: IDLMessageDefinitionField): boolean {
  const { annotations } = definition;

  if (!annotations) {
    return false;
  }

  return "optional" in annotations;
}

function getHeaderNeeds(definition: IDLMessageDefinition): {
  usesDelimiterHeader: boolean;
  usesMemberHeader: boolean;
} {
  const { annotations } = definition;

  if (annotations) {
    if ("final" in annotations) {
      return { usesDelimiterHeader: false, usesMemberHeader: false };
    }

    if ("mutable" in annotations) {
      return { usesDelimiterHeader: true, usesMemberHeader: true };
    }
  }

  // Default extensibility is appendable according to section 7.3.1.2.1.8 "Type
  // Extensibility and Mutability" (page 80) of DDS-XTypes v1.3
  return { usesDelimiterHeader: true, usesMemberHeader: false };
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (id != undefined && id.type === "const-param" && typeof id.value === "number") {
    return id.value;
  }

  return undefined;
}
