import { CdrReader } from "@foxglove/cdr";
import {
  AnnotatedMessageDefinition,
  AnnotatedMessageDefinitionField,
} from "@foxglove/omgidl-parser";

export type Deserializer = (
  reader: CdrReader,
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
  rootDefinition: AnnotatedMessageDefinition;
  definitions: Map<string, AnnotatedMessageDefinition>;

  constructor(rootDefinitionName: string, definitions: AnnotatedMessageDefinition[]) {
    const rootDefinition = definitions.find((def) => def.name === rootDefinitionName);
    if (rootDefinition == undefined) {
      throw new Error(
        `Root definition name "${rootDefinitionName}" not found in schema definitions.`,
      );
    }
    this.rootDefinition = rootDefinition;
    this.definitions = new Map<string, AnnotatedMessageDefinition>(
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
    complexDef: AnnotatedMessageDefinition,
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

      let fieldLength = field.arrayLength;
      if (readMemberHeader) {
        const { id, objectSize: objectSizeBytes } = reader.emHeader();
        const itemSize = typeToByteLength[field.type];
        if (itemSize != undefined) {
          fieldLength ??= Math.ceil(objectSizeBytes / itemSize);
        }
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
          const arrayLength = fieldLength ?? reader.sequenceLength();
          const array = [];
          for (let i = 0; i < arrayLength; i++) {
            array.push(this.readComplexType(nestedComplexDef, reader, childOptions));
          }
          msg[field.name] = array;
        } else {
          msg[field.name] = this.readComplexType(nestedComplexDef, reader, childOptions);
        }
      } else {
        if (field.isArray === true) {
          const deser = typedArrayDeserializers.get(field.type);
          if (deser == undefined) {
            throw new Error(`Unrecognized primitive array type ${field.type}[]`);
          }
          // For dynamic length arrays we need to read a uint32 prefix
          const arrayLength = fieldLength ?? reader.sequenceLength();
          msg[field.name] = deser(reader, arrayLength);
        } else {
          const deser = deserializers.get(field.type);
          if (deser == undefined) {
            throw new Error(`Unrecognized primitive type ${field.type}`);
          }
          msg[field.name] = deser(reader, fieldLength);
        }
      }
    }
    return msg;
  }
}

const typeToByteLength: Record<string, number> = {
  bool: 1,
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  int64: 8,
  uint64: 8,
  float32: 4,
  float64: 8,
  string: 1,
};

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
