import { CdrReader } from "@foxglove/cdr";
import {
  IDLMessageDefinition,
  IDLMessageDefinitionField,
  IDLStructDefinition,
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

export class MessageReader<T = unknown> {
  rootDefinition: IDLMessageDefinition;
  definitions: Map<string, IDLMessageDefinition>;

  constructor(rootDefinitionName: string, definitions: IDLMessageDefinition[]) {
    const rootDefinition = definitions.find((def) => def.name === rootDefinitionName);
    if (rootDefinition == undefined) {
      throw new Error(
        `Root definition name "${rootDefinitionName}" not found in schema definitions.`,
      );
    }
    this.rootDefinition = rootDefinition;
    this.definitions = new Map<string, IDLMessageDefinition>(
      definitions.map((def) => [def.name ?? "", def]),
    );
  }

  // We template on R here for call site type information if the class type information T is not
  // known or available
  readMessage<R = T>(buffer: ArrayBufferView): R {
    const reader = new CdrReader(buffer);
    const usesDelimiterHeader = reader.usesDelimiterHeader;
    const usesMemberHeader = reader.usesMemberHeader;

    return this.readAggregatedType(this.rootDefinition, reader, {
      usesDelimiterHeader,
      usesMemberHeader,
    }) as R;
  }

  private readAggregatedType(
    aggregatedDef: IDLMessageDefinition,
    reader: CdrReader,
    options: HeaderOptions,
    /** The size of the struct if known (like from an emHeader). If it is known we do not read in a dHeader */
    knownTypeSize?: number,
  ): Record<string, unknown> {
    const { usesDelimiterHeader, usesMemberHeader } = options;
    const { typeUsesDelimiterHeader, typeUsesMemberHeader } = getHeaderNeeds(aggregatedDef);

    const readDelimiterHeader = usesDelimiterHeader && typeUsesDelimiterHeader;
    const readMemberHeader = usesMemberHeader && typeUsesMemberHeader;

    // Delimiter header is only read/written if the size of the type is not yet known
    // (If it hasn't already been read in from a surrounding emHeader)
    if (knownTypeSize == undefined && readDelimiterHeader) {
      reader.dHeader();
    }
    let msg;
    switch (aggregatedDef.aggregatedKind) {
      case "struct":
        msg = this.readStructType(aggregatedDef, reader, options);
        break;
      case "union":
        msg = this.readUnionType(aggregatedDef, reader, options);
        break;
      case "module":
      default:
        throw Error(`Modules are not used in serialization`);
    }
    if (readMemberHeader) {
      reader.sentinelHeader();
    }
    return msg;
  }

  private readStructType(
    complexDef: IDLStructDefinition,
    reader: CdrReader,
    options: HeaderOptions,
  ): Record<string, unknown> {
    const msg: Record<string, unknown> = {};

    const { usesMemberHeader } = options;
    const { typeUsesMemberHeader } = getHeaderNeeds(complexDef);

    const readMemberHeader = usesMemberHeader && typeUsesMemberHeader;

    for (const field of complexDef.definitions) {
      if (field.isConstant === true) {
        continue;
      }

      msg[field.name] = this.readMemberFieldValue(
        field,
        reader,
        { readMemberHeader, parentName: complexDef.name },
        options,
      );
    }

    return msg;
  }

  private readUnionType(
    unionDef: IDLUnionDefinition,
    reader: CdrReader,
    options: HeaderOptions,
  ): Record<string, unknown> {
    const { usesMemberHeader } = options;
    const { typeUsesMemberHeader } = getHeaderNeeds(unionDef);

    const readMemberHeader = usesMemberHeader && typeUsesMemberHeader;

    // read switchtype value
    const switchTypeDeser = deserializers.get(unionDef.switchType);
    if (switchTypeDeser == undefined) {
      throw new Error(`Unrecognized switch discriminator type ${unionDef.switchType}`);
    }

    // looks like unions print an emHeader for the switchType
    if (readMemberHeader) {
      const { objectSize: objectSizeBytes } = reader.emHeader();
      const switchTypeLength = typeToByteLength(unionDef.switchType);
      if (switchTypeLength != undefined && objectSizeBytes !== switchTypeLength) {
        throw new Error(
          `Expected switchType length of ${switchTypeLength} but got ${objectSizeBytes} for ${
            unionDef.name ?? ""
          }`,
        );
      }
    }
    const discriminatorValue = switchTypeDeser(reader) as number | boolean;

    // get case for switchtype value based on matching predicate

    const caseDefType = getCaseForDiscriminator(unionDef, discriminatorValue);
    if (!caseDefType) {
      throw new Error(
        `No matching case found in ${
          unionDef.name ?? ""
        } for discriminator value ${discriminatorValue.toString()}`,
      );
    }

    // read case value
    const msg: Record<string, unknown> = {};
    msg[caseDefType.name] = this.readMemberFieldValue(
      caseDefType,
      reader,
      { readMemberHeader, parentName: unionDef.name },
      options,
    );
    return msg;
  }

  private readMemberFieldValue(
    field: IDLMessageDefinitionField,
    reader: CdrReader,
    emHeaderOptions: { readMemberHeader: boolean; parentName?: string },
    childOptions: HeaderOptions,
  ): unknown {
    const { readMemberHeader, parentName } = emHeaderOptions;
    const definitionId = getDefinitionId(field);
    let emHeaderSizeBytes;
    if (readMemberHeader) {
      const { id, objectSize: objectSizeBytes, lengthCode } = reader.emHeader();
      emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSizeBytes : undefined;
      // emHeaderSizeBytes = objectSizeBytes;
      // this can help spot misalignments in reading the data
      if (definitionId != undefined && id !== definitionId) {
        throw Error(
          `CDR message deserializer error. Expected ${definitionId} but EMHEADER contained ${id} for field "${
            field.name
          }" in ${parentName ?? "unknown"}`,
        );
      }
    }
    if (field.isComplex === true) {
      // Complex type
      const nestedComplexDef = this.definitions.get(field.type);
      if (nestedComplexDef == undefined) {
        throw new Error(`Unrecognized complex type ${field.type}`);
      }

      if (field.isArray === true) {
        // For dynamic length arrays we need to read a uint32 prefix
        const arrayLengths = field.arrayLengths ?? [reader.sequenceLength()];

        const complexDeserializer = () => {
          // We do not pass the emHeaderSizeBytes here because it is not the size of the underlying struct item
          return this.readAggregatedType(nestedComplexDef, reader, childOptions, undefined);
        };
        const array = readNestedArray(complexDeserializer, arrayLengths, 0);
        return array;
      } else {
        return this.readAggregatedType(nestedComplexDef, reader, childOptions, emHeaderSizeBytes);
      }
    } else {
      if (field.type === "wchar" || field.type === "wstring") {
        throw new Error(
          `'wchar' and 'wstring' types are not supported because they are implementation dependent`,
        );
      }
      const typeLength = typeToByteLength(field.type);
      if (typeLength == undefined) {
        throw new Error(`Unrecognized primitive type ${field.type}`);
      }
      const headerSpecifiedLength =
        emHeaderSizeBytes != undefined ? Math.floor(emHeaderSizeBytes / typeLength) : undefined;

      if (field.isArray === true) {
        const deser = typedArrayDeserializers.get(field.type);
        if (deser == undefined) {
          throw new Error(`Unrecognized primitive array type ${field.type}[]`);
        }

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
      } else {
        const deser = deserializers.get(field.type);
        if (deser == undefined) {
          throw new Error(`Unrecognized primitive type ${field.type}`);
        }

        // fieldLength only used for `string` type primitives
        return deser(reader, headerSpecifiedLength);
      }
    }
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
  typeUsesDelimiterHeader: boolean;
  typeUsesMemberHeader: boolean;
} {
  const { annotations } = definition;

  if (!annotations) {
    return { typeUsesDelimiterHeader: false, typeUsesMemberHeader: false };
  }

  if ("mutable" in annotations) {
    return { typeUsesDelimiterHeader: true, typeUsesMemberHeader: true };
  }
  if ("appendable" in annotations) {
    return { typeUsesDelimiterHeader: true, typeUsesMemberHeader: false };
  }
  return { typeUsesDelimiterHeader: false, typeUsesMemberHeader: false };
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

function useEmHeaderAsLength(lengthCode: number | undefined): boolean {
  return lengthCode != undefined && lengthCode >= 5;
}
