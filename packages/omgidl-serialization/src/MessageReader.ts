import { CdrReader } from "@foxglove/cdr";
import {
  AnnotatedMessageDefinition,
  AnnotatedMessageDefinitionField,
  IDLMessageDefinition,
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

    return this.readComplexType(this.rootDefinition, reader, {
      isTopLevel: true,
      usesDelimiterHeader,
      usesMemberHeader,
    }) as R;
  }

  private readComplexType(
    complexDef: IDLMessageDefinition,
    reader: CdrReader,
    options: {
      isTopLevel: boolean;
      usesDelimiterHeader: boolean;
      usesMemberHeader: boolean;
    },
  ): Record<string, unknown> {
    const msg: Record<string, unknown> = {};

    const { usesDelimiterHeader, usesMemberHeader, isTopLevel } = options;
    const { typeUsesDelimiterHeader, typeUsesMemberHeader } = getHeaderNeeds(complexDef);

    const readDelimiterHeader = usesDelimiterHeader && typeUsesDelimiterHeader;
    const readMemberHeader = usesMemberHeader && typeUsesMemberHeader;

    // Delimiter header is only read/written at top level
    if (isTopLevel && readDelimiterHeader) {
      reader.dHeader();
    }

    const childOptions = {
      isTopLevel: false,
      usesDelimiterHeader,
      usesMemberHeader,
    };

    for (const field of complexDef.definitions) {
      if (field.isConstant === true) {
        continue;
      }
      const definitionId = getDefinitionId(field);

      let emHeaderSizeBytes = undefined;
      if (readMemberHeader) {
        const { id, objectSize: objectSizeBytes } = reader.emHeader();
        emHeaderSizeBytes = objectSizeBytes;
        // this can help spot misalignments in reading the data
        if (definitionId != undefined && id !== definitionId) {
          throw Error(
            `CDR message deserializer error. Expected ${definitionId} but EMHEADER contained ${id} for field "${
              field.name
            }" in ${complexDef.name ?? "unknown"}`,
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
            return this.readComplexType(nestedComplexDef, reader, childOptions);
          };
          const array = readNestedArray(complexDeserializer, arrayLengths, 0);
          msg[field.name] = array;
        } else {
          msg[field.name] = this.readComplexType(nestedComplexDef, reader, childOptions);
        }
      } else {
        const typeLength = typeToByteLength(field.type);
        if (typeLength == undefined) {
          throw new Error(`Unrecognized primitive type ${field.type}`);
        }
        const headerSpecifiedLength =
          emHeaderSizeBytes != undefined ? Math.ceil(emHeaderSizeBytes / typeLength) : undefined;

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
            msg[field.name] = readNestedArray(typedArrayDeserializer, arrayLengths.slice(0, -1), 0);
          } else {
            msg[field.name] = deser(reader, arrayLengths[0]!);
          }
        } else {
          const deser = deserializers.get(field.type);
          if (deser == undefined) {
            throw new Error(`Unrecognized primitive type ${field.type}`);
          }

          // fieldLength only used for `string` type primitives
          msg[field.name] = deser(reader, headerSpecifiedLength);
        }
      }
    }
    return msg;
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

function getHeaderNeeds(definition: AnnotatedMessageDefinition): {
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

function getDefinitionId(definition: AnnotatedMessageDefinitionField): number | undefined {
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
