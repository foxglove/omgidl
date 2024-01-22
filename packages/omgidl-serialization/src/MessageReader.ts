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

type HeaderOptions = {
  usesDelimiterHeader: boolean;
  usesMemberHeader: boolean;
};

type PrimitiveDeserializationInfo = {
  type: "primitive";
  typeLength: number;
  deserialize: Deserializer;
};

type PrimitiveArrayDeserializationInfo = {
  type: "array-primitive";
  typeLength: number;
  deserialize: ArrayDeserializer;
};

type StructDeserializationInfo = HeaderOptions & {
  type: "struct";
  fields: FieldDeserializationInfo[];
};

type UnionDeserializationInfo = HeaderOptions & {
  type: "union";
  switchTypeDeser: Deserializer;
  switchTypeLength: number;
  definition: IDLUnionDefinition;
};

type ComplexDeserializationInfo = StructDeserializationInfo | UnionDeserializationInfo;
type PrimitiveTypeDeserInfo = PrimitiveDeserializationInfo | PrimitiveArrayDeserializationInfo;

type FieldDeserializationInfo = {
  name: string;
  type: string;
  typeDeserInfo: ComplexDeserializationInfo | PrimitiveTypeDeserInfo;
  isArray?: boolean;
  arrayLengths?: number[];
  definitionId?: number;
};

export class MessageReader<T = unknown> {
  rootDeserializationInfo: ComplexDeserializationInfo;
  definitions: Map<string, IDLMessageDefinition>;
  complexDeserializationInfo: Map<string, ComplexDeserializationInfo> = new Map();

  constructor(rootDefinitionName: string, definitions: IDLMessageDefinition[]) {
    const rootDefinition = definitions.find((def) => def.name === rootDefinitionName);
    if (rootDefinition == undefined) {
      throw new Error(
        `Root definition name "${rootDefinitionName}" not found in schema definitions.`,
      );
    }
    this.definitions = new Map<string, IDLMessageDefinition>(
      definitions.map((def) => [def.name ?? "", def]),
    );

    // Build the deserialization info tree structure for the root definition.
    this.rootDeserializationInfo = this.buildComplexDeserializationInfo(rootDefinition);
  }

  // We template on R here for call site type information if the class type information T is not
  // known or available
  readMessage<R = T>(buffer: ArrayBufferView): R {
    const reader = new CdrReader(buffer);
    const usesDelimiterHeader = reader.usesDelimiterHeader;
    const usesMemberHeader = reader.usesMemberHeader;

    return this.readAggregatedType(
      this.rootDeserializationInfo,
      reader,
      {
        usesDelimiterHeader,
        usesMemberHeader,
      },
      {},
    ) as R;
  }

  private readAggregatedType(
    deserInfo: ComplexDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
    /** The size of the struct if known (like from an emHeader). If it is known we do not read in a dHeader */
    flags: { knownTypeSize?: number },
  ): Record<string, unknown> {
    const readDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;
    const readMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;

    // Delimiter header is only read/written if the size of the type is not yet known
    // (If it hasn't already been read in from a surrounding emHeader)
    if (flags.knownTypeSize == undefined && readDelimiterHeader) {
      reader.dHeader();
    }

    const msg =
      deserInfo.type === "struct"
        ? this.readStructType(deserInfo, reader, options)
        : this.readUnionType(deserInfo, reader, options);

    if (readMemberHeader) {
      reader.sentinelHeader();
    }
    return msg;
  }

  private readStructType(
    deserInfo: StructDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
  ): Record<string, unknown> {
    const readMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;

    const msg: Record<string, unknown> = {};
    for (const field of deserInfo.fields) {
      msg[field.name] = this.readMemberFieldValue(
        field,
        reader,
        {
          readMemberHeader,
        },
        options,
      );
    }

    return msg;
  }

  private readUnionType(
    deserInfo: UnionDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
  ): Record<string, unknown> {
    const readMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;

    // looks like unions print an emHeader for the switchType
    if (readMemberHeader) {
      const { objectSize: objectSizeBytes } = reader.emHeader();
      if (objectSizeBytes !== deserInfo.switchTypeLength) {
        throw new Error(
          `Expected switchType length of ${
            deserInfo.switchTypeLength
          } but got ${objectSizeBytes} for ${deserInfo.definition.name ?? ""}`,
        );
      }
    }
    const discriminatorValue = deserInfo.switchTypeDeser(reader) as number | boolean;

    // get case for switchtype value based on matching predicate
    const caseDefType = getCaseForDiscriminator(deserInfo.definition, discriminatorValue);
    if (!caseDefType) {
      throw new Error(
        `No matching case found in ${
          deserInfo.definition.name ?? ""
        } for discriminator value ${discriminatorValue.toString()}`,
      );
    }

    if (caseDefType.isComplex === true) {
      const deser = this.complexDeserializationInfo.get(caseDefType.type);
      if (!deser) {
        throw new Error(`Deserializer for union type ${caseDefType.type} not found.`);
      }

      return {
        [caseDefType.name]: this.readAggregatedType(deser, reader, options, {}),
      };
    } else {
      const primitiveField = this.buildFieldDeserInfo(caseDefType);
      return {
        [caseDefType.name]: this.readMemberFieldValue(
          primitiveField,
          reader,
          {
            readMemberHeader,
            parentName: deserInfo.definition.name,
          },
          options,
        ),
      };
    }
  }

  private readMemberFieldValue(
    field: FieldDeserializationInfo,
    reader: CdrReader,
    emHeaderOptions: { readMemberHeader: boolean; parentName?: string },
    childOptions: HeaderOptions,
  ): unknown {
    let emHeaderSizeBytes;
    if (emHeaderOptions.readMemberHeader) {
      const { id, objectSize: objectSizeBytes, lengthCode } = reader.emHeader();
      emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSizeBytes : undefined;

      // this can help spot misalignments in reading the data
      const definitionId = field.definitionId;
      if (definitionId != undefined && id !== definitionId) {
        throw Error(
          `CDR message deserializer error. Expected ${definitionId} but EMHEADER contained ${id} for field "${
            field.name
          }" in ${emHeaderOptions.parentName ?? "unknown"}`,
        );
      }
    }

    if (field.typeDeserInfo.type === "struct" || field.typeDeserInfo.type === "union") {
      if (field.isArray === true) {
        // For dynamic length arrays we need to read a uint32 prefix
        const arrayLengths = field.arrayLengths ?? [reader.sequenceLength()];
        return this.readComplexNestedArray(
          reader,
          childOptions,
          field.typeDeserInfo,
          arrayLengths,
          0,
        );
      } else {
        return this.readAggregatedType(field.typeDeserInfo, reader, childOptions, {
          knownTypeSize: emHeaderSizeBytes,
        });
      }
    } else {
      const headerSpecifiedLength =
        emHeaderSizeBytes != undefined
          ? Math.floor(emHeaderSizeBytes / field.typeDeserInfo.typeLength)
          : undefined;

      if (field.typeDeserInfo.type === "array-primitive") {
        const deser = field.typeDeserInfo.deserialize;
        const arrayLengths =
          field.arrayLengths ??
          // the byteLength written in the header doesn't help us determine count of strings in the array
          // This will be the next field in the message
          (field.type === "string"
            ? [reader.sequenceLength()]
            : [headerSpecifiedLength ?? reader.sequenceLength()]);

        if (arrayLengths.length > 1) {
          const typedArrayDeserializer = () => {
            return deser(reader, arrayLengths[arrayLengths.length - 1]!);
          };

          // last arrayLengths length is handled in deserializer. It returns an array
          return readNestedArray(typedArrayDeserializer, arrayLengths.slice(0, -1), 0);
        } else {
          return deser(reader, arrayLengths[0]!);
        }
      } else if (field.typeDeserInfo.type === "primitive") {
        return field.typeDeserInfo.deserialize(
          reader,
          headerSpecifiedLength, // fieldLength only used for `string` type primitives
        );
      } else {
        throw new Error(`Unhandled deserialization info type`);
      }
    }
  }

  /**
   * Builds the deserialization info object for a field definition which can be a complex or primitive type.
   *
   * @param definition Field definition
   * @returns Deserialization info
   */
  private buildFieldDeserInfo(definition: IDLMessageDefinitionField): FieldDeserializationInfo {
    const { name, type, isComplex, isArray, arrayLengths } = definition;

    if (isComplex === true) {
      let typeDeserInfo = this.complexDeserializationInfo.get(type);
      if (!typeDeserInfo) {
        const fieldDefinition = this.definitions.get(type);
        if (!fieldDefinition) {
          throw new Error(`Failed to find definition for type ${type}`);
        }
        typeDeserInfo = this.buildComplexDeserializationInfo(fieldDefinition);
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
      isArray === true ? typedArrayDeserializers.get(type) : deserializers.get(type);
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

  /**
   * Builds the deserialization info object for a complex definition (struct or union).
   * If not found in the cache, deserialization infos of sub-types will be build automatically
   * and added to the cache.
   *
   * @param definition Message definition
   * @returns Deserialization info
   */
  private buildComplexDeserializationInfo(
    definition: IDLMessageDefinition,
  ): ComplexDeserializationInfo {
    if (definition.aggregatedKind === "module") {
      throw new Error(`Modules are not used in serialization`);
    }

    const cached = this.complexDeserializationInfo.get(definition.name ?? "");
    if (cached) {
      return cached;
    }

    if (definition.aggregatedKind === "union") {
      const switchTypeDeser = deserializers.get(definition.switchType);
      const switchTypeLength = typeToByteLength(definition.switchType);

      if (switchTypeDeser == undefined || switchTypeLength == undefined) {
        throw new Error(
          `Unrecognized primitive type ${definition.switchType} in union ${
            definition.name ?? "unknown"
          }`,
        );
      }

      return {
        type: "union",
        ...getHeaderNeeds(definition),
        definition,
        switchTypeDeser,
        switchTypeLength,
      };
    }

    const deserInfo: StructDeserializationInfo = {
      type: "struct",
      ...getHeaderNeeds(definition),
      fields: definition.definitions
        .filter((def) => def.isConstant !== true)
        .map((fieldDef) => this.buildFieldDeserInfo(fieldDef)),
    };

    this.complexDeserializationInfo.set(definition.name ?? "", deserInfo);
    return deserInfo;
  }

  private readComplexNestedArray(
    reader: CdrReader,
    options: HeaderOptions,
    deserInfo: ComplexDeserializationInfo,
    arrayLengths: number[],
    depth: number,
  ): unknown[] {
    if (depth > arrayLengths.length - 1 || depth < 0) {
      throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
    }

    const array = [];
    for (let i = 0; i < arrayLengths[depth]!; i++) {
      if (depth === arrayLengths.length - 1) {
        array.push(this.readAggregatedType(deserInfo, reader, options, {}));
      } else {
        array.push(
          this.readComplexNestedArray(reader, options, deserInfo, arrayLengths, depth + 1),
        );
      }
    }

    return array;
  }
}

function readNestedArray(deser: () => unknown, arrayLengths: number[], depth: number): unknown[] {
  if (depth > arrayLengths.length - 1 || depth < 0) {
    throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
  }

  const array = [];

  for (let i = 0; i < arrayLengths[depth]!; i++) {
    if (depth === arrayLengths.length - 1) {
      array.push(deser());
    } else {
      array.push(readNestedArray(deser, arrayLengths, depth + 1));
    }
  }

  return array;
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

const deserializers = new Map<string, Deserializer>([
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

const typedArrayDeserializers = new Map<string, ArrayDeserializer>([
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

function getCaseForDiscriminator(
  unionDef: IDLUnionDefinition,
  discriminatorValue: number | boolean,
): IDLMessageDefinitionField | undefined {
  for (const caseDef of unionDef.cases) {
    for (const predicate of caseDef.predicates) {
      if (predicate === discriminatorValue) {
        return caseDef.type;
      }
    }
  }
  return unionDef.defaultCase;
}

/** Only length Codes >= 5 should allow for emHeader sizes to be used in place of other integer lengths */
function useEmHeaderAsLength(lengthCode: number | undefined): boolean {
  return lengthCode != undefined && lengthCode >= 5;
}
