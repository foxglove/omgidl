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
import { UNION_DISCRIMINATOR_PROPERTY_KEY } from "./constants";

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
  readMessage<R = T>(buffer: ArrayBufferView): R {
    const reader = new CdrReader(buffer);
    const usesDelimiterHeader = reader.usesDelimiterHeader;
    const usesMemberHeader = reader.usesMemberHeader;

    return this.readAggregatedType(this.rootDeserializationInfo, reader, {
      usesDelimiterHeader,
      usesMemberHeader,
    }) as R;
  }

  private readAggregatedType(
    deserInfo: ComplexDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
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

    const msg =
      deserInfo.type === "struct"
        ? this.readStructType(deserInfo, reader, options)
        : this.readUnionType(deserInfo, reader, options);

    if (readMemberHeader && this.#unusedEmHeader?.readSentinelHeader !== true) {
      reader.sentinelHeader();
    }
    // clear emHeader for aggregated type, since if it was defined, it would've likely been used
    // as the sentinel header
    this.#unusedEmHeader = undefined;
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

    const fieldDeserInfo = this.deserializationInfoCache.buildFieldDeserInfo(caseDefType);

    return {
      [UNION_DISCRIMINATOR_PROPERTY_KEY]: discriminatorValue,
      [caseDefType.name]: this.readMemberFieldValue(
        fieldDeserInfo,
        reader,
        {
          readMemberHeader,
          parentName: deserInfo.definition.name,
        },
        options,
      ),
    };
  }

  /** Holds the return value of the previously unused emHeader.
   * emHeaders remain unused if their return ID does not match the field ID.
   * They become used if a field is encountered that uses the unusedEmHeader.id or
   * if the unusedEmheader is a sentinel header.
   **/
  #unusedEmHeader?: ReturnType<CdrReader["emHeader"]>;

  private readMemberFieldValue(
    field: FieldDeserializationInfo,
    reader: CdrReader,
    emHeaderOptions: { readMemberHeader: boolean; parentName?: string },
    childOptions: HeaderOptions,
  ): unknown {
    let emHeaderSizeBytes;
    if (emHeaderOptions.readMemberHeader) {
      /** If the unusedEmHeader is a sentinel header, then all remaining fields in the struct are absent. */
      if (this.#unusedEmHeader?.readSentinelHeader === true) {
        return undefined;
      }

      const emHeader = this.#unusedEmHeader ?? reader.emHeader();

      const definitionId = field.definitionId;

      if (definitionId != undefined && emHeader.id !== definitionId) {
        // ID mismatch, save emHeader for next field. Could also be a sentinel header
        this.#unusedEmHeader = emHeader;
        return undefined;
      }

      // emHeader is now being used and should be cleared
      this.#unusedEmHeader = undefined;
      const { objectSize: objectSizeBytes, lengthCode } = emHeader;

      emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSizeBytes : undefined;
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
        return this.readAggregatedType(
          field.typeDeserInfo,
          reader,
          childOptions,
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
  ): unknown[] {
    if (depth > arrayLengths.length - 1 || depth < 0) {
      throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
    }

    const array = [];
    for (let i = 0; i < arrayLengths[depth]!; i++) {
      if (depth === arrayLengths.length - 1) {
        array.push(this.readAggregatedType(deserInfo, reader, options));
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
