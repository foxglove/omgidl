import { CdrReader } from "@foxglove/cdr";
import {
  IDLMessageDefinition,
  IDLMessageDefinitionField,
  IDLUnionDefinition,
} from "@foxglove/omgidl-parser";

import {
  ComplexDeserializationInfo,
  DeserializationInfoCache,
  FieldDeserializationInfo,
  HeaderOptions,
  StructDeserializationInfo,
  UnionDeserializationInfo,
} from "./DeserializationInfoCache";

type AllFieldsSelection = {
  type: "all";
};

type NoFieldsSelection = {
  type: "none";
};

type ArraySliceSelection = {
  type: "slice";
  start: number;
  end: number;
  subSelection: FieldSelection;
};

type StructFieldSelection = {
  type: "fields";
  fields: { [fieldName: string]: FieldSelection };
};

export type FieldSelection =
  | AllFieldsSelection
  | NoFieldsSelection
  | StructFieldSelection
  | ArraySliceSelection;

const AllFieldsDefault: AllFieldsSelection = {
  type: "all",
};
const NoFieldsDefault: NoFieldsSelection = {
  type: "none",
};

export class MessageReader<T = unknown> {
  rootDeserializationInfo: ComplexDeserializationInfo;
  deserializationInfoCache: DeserializationInfoCache;

  constructor(rootDefinitionName: string, definitions: IDLMessageDefinition[]) {
    const rootDefinition = definitions.find((def) => def.name === rootDefinitionName);
    if (rootDefinition == undefined) {
      throw new Error(
        `Root definition name "${rootDefinitionName}" not found in schema definitions.`,
      );
    }

    // Build the deserialization info tree structure for the root definition.
    this.deserializationInfoCache = new DeserializationInfoCache(definitions);
    this.rootDeserializationInfo =
      this.deserializationInfoCache.getComplexDeserializationInfo(rootDefinition);
  }

  // We template on R here for call site type information if the class type information T is not
  // known or available
  readMessage<R = T>(buffer: ArrayBufferView, fieldSelection?: FieldSelection): R {
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
      fieldSelection ?? AllFieldsDefault,
    ) as R;
  }

  private readAggregatedType(
    deserInfo: ComplexDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
    fieldSelection: FieldSelection,
    /** The size of the struct if known (like from an emHeader). If it is known we do not read in a dHeader */
    knownTypeSize?: number,
  ): Record<string, unknown> {
    const readDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;
    const readMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;

    // Delimiter header is only read/written if the size of the type is not yet known
    // (If it hasn't already been read in from a surrounding emHeader)
    if (knownTypeSize == undefined && readDelimiterHeader) {
      reader.dHeader();
    }

    let msg;
    if (deserInfo.type === "struct") {
      if (fieldSelection.type === "slice") {
        throw new Error(`Slices are not allowed for structs`);
      }
      msg = this.readStructType(deserInfo, reader, options, fieldSelection);
    } else {
      msg = this.readUnionType(deserInfo, reader, options, fieldSelection);
    }

    if (readMemberHeader) {
      reader.sentinelHeader();
    }
    return msg;
  }

  private readStructType(
    deserInfo: StructDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
    fieldSelection: AllFieldsSelection | NoFieldsSelection | StructFieldSelection,
  ): Record<string, unknown> {
    const readMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
    const childOptions = { readMemberHeader }; // Can probably use a global constant for that

    const msg: Record<string, unknown> = {};

    // If we do not have to read all fields and the struct has a known length, we can seek to
    // selected fields or directly seek to the end if there is no field to be read.
    if (!readMemberHeader && deserInfo.structLength != undefined && fieldSelection.type !== "all") {
      const structOffset = reader.offset;

      if (fieldSelection.type === "fields") {
        for (const [fieldName, subFields] of Object.entries(fieldSelection.fields)) {
          const field = deserInfo.fieldsByName[fieldName];
          if (field == undefined) {
            throw new Error(`Field ${fieldName} does not exist for type ${deserInfo.type}`);
          }

          reader.seekTo(structOffset + field.knownOffset!);
          msg[field.name] = this.readMemberFieldValue(
            field,
            reader,
            childOptions,
            options,
            subFields,
          );
        }
      }

      const endOfStructOffset = structOffset + deserInfo.structLength;
      if (endOfStructOffset !== reader.byteLength) {
        // We only seek if we do not seek to the very end of the buffer as otherwise the CDR reader
        // would (erroneously) raise an exception.
        reader.seekTo(endOfStructOffset);
      }

      return msg;
    }

    for (const field of deserInfo.fields) {
      const subFieldSelection =
        fieldSelection.type === "fields" ? fieldSelection.fields[field.name] : fieldSelection;

      const fieldValue = this.readMemberFieldValue(
        field,
        reader,
        childOptions,
        options,
        subFieldSelection ?? NoFieldsDefault,
      );

      if (
        fieldSelection.type === "all" ||
        (fieldSelection.type === "fields" && subFieldSelection != undefined)
      ) {
        msg[field.name] = fieldValue;
      }
    }

    return msg;
  }

  private readUnionType(
    deserInfo: UnionDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
    fieldSelection: FieldSelection,
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

    const fieldDeserInfo = this.deserializationInfoCache.buildFieldDeserInfo(caseDefType);
    return {
      [caseDefType.name]: this.readMemberFieldValue(
        fieldDeserInfo,
        reader,
        {
          readMemberHeader,
          parentName: deserInfo.definition.name,
        },
        options,
        fieldSelection,
      ),
    };
  }

  private readMemberFieldValue(
    field: FieldDeserializationInfo,
    reader: CdrReader,
    emHeaderOptions: { readMemberHeader: boolean; parentName?: string },
    childOptions: HeaderOptions,
    fieldSelection: FieldSelection,
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
        if (fieldSelection.type === "fields") {
          throw new Error("Field selection not allowed for arrays.");
        }

        // For dynamic length arrays we need to read a uint32 prefix
        const arrayLengths = field.arrayLengths ?? [reader.sequenceLength()];
        return this.readComplexNestedArray(
          reader,
          childOptions,
          field.typeDeserInfo,
          arrayLengths,
          0,
          fieldSelection,
        );
      } else {
        return this.readAggregatedType(
          field.typeDeserInfo,
          reader,
          childOptions,
          fieldSelection,
          emHeaderSizeBytes,
        );
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

  private readComplexNestedArray(
    reader: CdrReader,
    options: HeaderOptions,
    deserInfo: ComplexDeserializationInfo,
    arrayLengths: number[],
    depth: number,
    fieldSelection: AllFieldsSelection | NoFieldsSelection | ArraySliceSelection,
  ): unknown[] {
    if (depth > arrayLengths.length - 1 || depth < 0) {
      throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
    }

    const startIndex =
      fieldSelection.type === "slice"
        ? fieldSelection.start
        : fieldSelection.type === "all"
        ? 0
        : -1;
    const endIndex =
      fieldSelection.type === "slice"
        ? fieldSelection.end
        : fieldSelection.type === "all"
        ? Number.MAX_SAFE_INTEGER
        : -1;

    const array = [];
    for (let i = 0; i < arrayLengths[depth]!; i++) {
      const doRead = startIndex <= i && i <= endIndex;

      if (depth === arrayLengths.length - 1) {
        const elem = this.readAggregatedType(
          deserInfo,
          reader,
          options,
          doRead
            ? fieldSelection.type === "slice"
              ? fieldSelection.subSelection
              : fieldSelection
            : NoFieldsDefault,
        );
        array.push(doRead ? elem : undefined);
      } else {
        const elem = this.readComplexNestedArray(
          reader,
          options,
          deserInfo,
          arrayLengths,
          depth + 1,
          doRead ? fieldSelection : NoFieldsDefault,
        );
        array.push(doRead ? elem : undefined);
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
