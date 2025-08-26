import { CdrReader, EncapsulationKind } from "@foxglove/cdr";
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
  makeNestedArray,
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  readMessage<R = T>(buffer: ArrayBufferView): R {
    const reader = new CdrReader(buffer);
    // if true means that it is definitely using CDR2 (however doesn't apply to CDR2 Final (non PL_CDR and non DELIMITED_CDR2))
    const usesDelimiterHeader = reader.usesDelimiterHeader;
    const usesMemberHeader = reader.usesMemberHeader;

    return this.readAggregatedType(this.rootDeserializationInfo, reader, {
      usesDelimiterHeader,
      usesMemberHeader,
      isCDR2: readerIsCDR2(reader),
    }) as R;
  }

  private readAggregatedType(
    deserInfo: ComplexDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions & { isCDR2: boolean },
    /** The size of the struct if known (like from an emHeader). If it is known we do not read in a dHeader */
    knownTypeSize?: number,
  ): Record<string, unknown> {
    const readDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;

    let typeEndOffset: number | undefined =
      knownTypeSize != undefined ? reader.offset + knownTypeSize : undefined;
    // Delimiter header is only read/written if the size of the type is not yet known
    // (If it hasn't already been read in from a surrounding emHeader)
    if (knownTypeSize == undefined && readDelimiterHeader) {
      const objectSize = reader.dHeader();
      typeEndOffset = reader.offset + objectSize;
    }

    const msg =
      deserInfo.type === "struct"
        ? this.readStructType(deserInfo, reader, options, typeEndOffset)
        : this.readUnionType(deserInfo, reader, options, typeEndOffset);

    return msg;
  }

  private readStructType(
    deserInfo: StructDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions & { isCDR2: boolean },
    /** if this is present it means that the struct is CDR2 */
    typeEndOffset: number | undefined,
  ): Record<string, unknown> {
    const usesMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
    const usesDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;

    const msg: Record<string, unknown> = {};

    const needsToReadSentinelHeader = !usesDelimiterHeader && usesMemberHeader; // XCDR1 mutable
    // this keeps track of whether we've read the sentinel header to close the struct for XCDR1
    let structIsEnded = false;
    const fieldNamesRead = new Set<string>();

    // There's a few ways we should be reading structs
    // 1. Struct is mutable. It has a typeEndOffset. Read based off each EMHEADER. Meaning that we need to read the EMHEADER to determine what the field is and then use the emHeader to read the field.
    // 2. Struct is appendable. It has a typeEndOffset. Read schema definition from top to bottom, there may be unknown or missing fields that we need to account for.
    // 3. Read solely based off of the schema definition (FINAL or XCDR1). Meaning that we can assume all the fields are in the exact same order and count as the schema definition.
    if (usesMemberHeader) {
      // HANDLE MUTABLE STRUCT
      // XCDR2 uses typeEndOffset to determine the end of the struct
      // XCDR1 uses a sentinel header to determine the end of the struct

      // loop until struct is ended: XCDR2 uses typeEndOffset, XCDR1 uses a sentinel header
      for (;;) {
        if (typeEndOffset != undefined && reader.offset >= typeEndOffset) {
          // end of struct
          structIsEnded = true;
          break;
        }

        if (!options.isCDR2 && this.maybeConsumeSentinelHeader(reader)) {
          // end of struct
          structIsEnded = true;
          break;
        }

        const { objectSize, id, readSentinelHeader, lengthCode } = reader.emHeader();
        // end of struct, this accounts for XCDR1 mutable structs
        if (readSentinelHeader === true) {
          structIsEnded = true;
          break;
        }

        const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : undefined;
        const field = deserInfo.fieldsById.get(id);
        if (field == undefined) {
          try {
            reader.seekTo(reader.offset + objectSize);
          } catch (err) {
            if (err instanceof Error && err.message.includes("outside the data range")) {
              // end of message, cannot seek to end of byte array
              break;
            }
          }
          continue;
        }

        fieldNamesRead.add(field.name);

        msg[field.name] = this.readMemberFieldValue(
          field,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-struct>",
            emHeaderSizeBytes,
            isCDR2: options.isCDR2,
          },
          options,
        );
      } // END OF MUTABLE FIELD LOOP
    } else {
      // HANDLE APPENDABLE OR FINAL STRUCT
      // Appendable structs are treated the same as final structs except that they have a typeEndOffset
      // from the DHeader for XCDR2 (has typeEndOffset), or a sentinel header for XCDR1.

      for (const field of deserInfo.fieldsInOrder) {
        if (typeEndOffset != undefined && reader.offset >= typeEndOffset) {
          // end of struct
          // if this happens then it likely means that the schema we have has been appended to but the message
          // was written using a schema with fewer fields.
          structIsEnded = true;
          break;
        }
        if (!options.isCDR2 && this.maybeConsumeSentinelHeader(reader)) {
          // end of struct
          structIsEnded = true;
          break;
        }

        if (field.isOptional) {
          fieldNamesRead.add(field.name);
          msg[field.name] = this.readOptionalFinalMember(
            field,
            reader,
            options,
            deserInfo.definition.name,
          );
          continue;
        }

        // handles optional xcdr2 fields (from is_present=true) and all non-optional fields
        fieldNamesRead.add(field.name);
        msg[field.name] = this.readMemberFieldValue(
          field,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-struct>",
            isCDR2: options.isCDR2,
          },
          options,
        );
      } // END OF FIELD FOR LOOP

      // there's a chance that even after reading through all the fields that we still have more bytes to read because the message was written with a schema that has more fields than the one we have.
      // seek to the end of the struct because we can't read in any more.
      if (typeEndOffset != undefined && reader.offset < typeEndOffset) {
        reader.seekTo(typeEndOffset);
      }
    } // END OF APPENDABLE OR FINAL STRUCT

    // set unread fields to defaults
    for (const field of deserInfo.fieldsInOrder) {
      if (fieldNamesRead.has(field.name)) {
        continue;
      }

      if (field.isOptional) {
        msg[field.name] = undefined;
      } else {
        msg[field.name] = this.deserializationInfoCache.getFieldDefault(field);
      }
    }

    if (needsToReadSentinelHeader && !structIsEnded) {
      // if the sentinel header was not read to close the struct then we need to read it now
      reader.sentinelHeader();
    }

    return msg;
  }

  private readUnionType(
    deserInfo: UnionDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions & { isCDR2: boolean },
    typeEndOffset?: number,
  ): Record<string, unknown> {
    const usesMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
    const usesDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;

    // unions print an emHeader for the switchType
    if (usesMemberHeader) {
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

    // Discriminator case determination: Section 7.4.1.4.4.4.2 of https://www.omg.org/spec/IDL/4.2/PDF
    // get case for switchtype value based on matching predicate
    let caseDefType = getCaseForDiscriminator(deserInfo.definition, discriminatorValue);
    // If no case is found, use the default case
    caseDefType ??= deserInfo.definition.defaultCase;

    const fieldDeserInfo = caseDefType
      ? this.deserializationInfoCache.buildFieldDeserInfo(caseDefType)
      : undefined;

    // if no matching case and no default case, only return discriminator value
    if (!fieldDeserInfo || !caseDefType) {
      return {
        [UNION_DISCRIMINATOR_PROPERTY_KEY]: discriminatorValue,
      };
    }

    let caseDefValue: unknown = undefined;

    // even if the union is ended we need to set the defaults
    if (usesMemberHeader) {
      const needsToReadSentinelHeader = !usesDelimiterHeader && usesMemberHeader; // XCDR1 mutable
      // MUTABLE UNION
      let unionIsEnded = false;
      if (typeEndOffset != undefined && reader.offset >= typeEndOffset) {
        // XCDR2
        unionIsEnded = true;
      } else if (!options.isCDR2 && this.maybeConsumeSentinelHeader(reader)) {
        // XCDR1
        unionIsEnded = true;
      }
      if (unionIsEnded) {
        // if the offset is already at the end of the union then the value of the caseDef is undefined or it's default value
        if (fieldDeserInfo.isOptional) {
          caseDefValue = undefined;
        } else {
          caseDefValue = this.deserializationInfoCache.getFieldDefault(fieldDeserInfo);
        }
      } else {
        const { objectSize, readSentinelHeader, lengthCode } = reader.emHeader();
        if (readSentinelHeader === true) {
          throw new Error("Read sentinel header after it was already consumed for union case");
        }

        const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : undefined;
        caseDefValue = this.readMemberFieldValue(
          fieldDeserInfo,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-union>",
            emHeaderSizeBytes,
            isCDR2: options.isCDR2,
          },
          options,
        );
        if (needsToReadSentinelHeader) {
          reader.sentinelHeader();
        }
      }
    } else {
      // APPENDABLE AND FINAL UNION HANDLING

      if (fieldDeserInfo.isOptional) {
        caseDefValue = this.readOptionalFinalMember(
          fieldDeserInfo,
          reader,
          options,
          deserInfo.definition.name,
        );
      } else {
        caseDefValue = this.readMemberFieldValue(
          fieldDeserInfo,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-union>",
            isCDR2: options.isCDR2,
          },
          options,
        );
      }
    }

    return {
      [UNION_DISCRIMINATOR_PROPERTY_KEY]: discriminatorValue,
      [caseDefType.name]: caseDefValue,
    };
  }

  /**
   * Reads an optional final member of a struct or union.
   * Check for sentinel header before using.
   * @param field - The field to read.
   * @param reader - The reader to read from.
   * @param options - The options to use.
   * @returns The value of the field.
   */
  private readOptionalFinalMember(
    field: FieldDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions & { isCDR2: boolean },
    parentName?: string,
  ): unknown {
    if (options.isCDR2) {
      // if it's XCDR2 then it uses an is_present flag to determine if the field is present
      const isPresent = Boolean(reader.int8());
      if (!isPresent) {
        return undefined;
      }
      return this.readMemberFieldValue(
        field,
        reader,
        {
          ...options,
          parentName: parentName ?? "<unnamed-struct>",
          isCDR2: options.isCDR2,
        },
        options,
      );
    } else {
      // XCDR1 treats optional fields as mutable members
      const { objectSize, lengthCode } = reader.emHeader();

      if (objectSize === 0) {
        return undefined;
      }
      const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : undefined;
      return this.readMemberFieldValue(
        field,
        reader,
        {
          ...options,
          parentName: parentName ?? "<unnamed-struct>",
          emHeaderSizeBytes,
          isCDR2: options.isCDR2,
        },
        options,
      );
    }
  }

  private readMemberFieldValue(
    field: FieldDeserializationInfo,
    reader: CdrReader,
    headerOptions: {
      usesMemberHeader: boolean;
      usesDelimiterHeader: boolean;
      parentName: string;
      emHeaderSizeBytes?: number;
      isCDR2: boolean;
    },
    childOptions: HeaderOptions,
  ): unknown {
    const emHeaderSizeBytes = headerOptions.emHeaderSizeBytes;

    try {
      if (field.typeDeserInfo.type === "struct" || field.typeDeserInfo.type === "union") {
        if (field.isArray === true) {
          // sequences and arrays have dHeaders only when emHeaders were not already written
          if (
            headerOptions.usesDelimiterHeader &&
            !((!headerOptions.isCDR2 && field.isOptional) || headerOptions.usesMemberHeader)
          ) {
            // return value is ignored because we don't do partial deserialization
            // in that case it would be used to skip the field if it was irrelevant
            reader.dHeader();
          }
          // For dynamic length arrays we need to read a uint32 prefix
          const arrayLengths = field.arrayLengths ?? [reader.sequenceLength()];
          return this.readComplexNestedArray(
            reader,
            { ...childOptions, isCDR2: headerOptions.isCDR2 },
            field.typeDeserInfo,
            arrayLengths,
            0,
          );
        } else {
          return this.readAggregatedType(
            field.typeDeserInfo,
            reader,
            { ...childOptions, isCDR2: headerOptions.isCDR2 },
            emHeaderSizeBytes,
          );
        }
      } else {
        // if emheader specified a length it is meant to be used as the sequence length instead of reading the sequence length again
        const headerSpecifiedLength =
          emHeaderSizeBytes != undefined
            ? Math.floor(emHeaderSizeBytes / field.typeDeserInfo.typeLength)
            : undefined;

        if (field.typeDeserInfo.type === "array-primitive") {
          const deser = field.typeDeserInfo.deserialize;

          // SEQUENCE and ARRAY types need dHeaders -- this should only ever happen here for strings
          // since they are the only type that we call "primitive" here but are not "primitive" to XCDR
          // P_ARRAY and P_SEQUENCE types -- never have a dHeader (anything that's not a string here)
          // sequences and arrays have dHeaders only when emHeaders were not already written
          if (
            headerOptions.usesDelimiterHeader &&
            headerSpecifiedLength == undefined &&
            field.type === "string"
          ) {
            // return value is ignored because we don't do partial deserialization
            // in that case it would be used to skip the field if it was irrelevant
            reader.dHeader();
          }

          // Sequence types will never have an arrayLengths defined
          const arrayLengths = field.arrayLengths ?? [
            headerSpecifiedLength ?? reader.sequenceLength(),
          ];
          if (arrayLengths.length === 1) {
            return deser(reader, arrayLengths[0]!);
          }
          // Multi-dimensional array types.
          const typedArrayDeserializer = () => {
            return deser(reader, arrayLengths[arrayLengths.length - 1]!);
          };

          // last arrayLengths length is handled in deserializer. It returns an array
          return makeNestedArray(typedArrayDeserializer, arrayLengths.slice(0, -1), 0);

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        } else if (field.typeDeserInfo.type === "primitive") {
          return field.typeDeserInfo.deserialize(
            reader,
            headerSpecifiedLength, // fieldLength only used for `string` type primitives
          );
        } else {
          throw new Error(`Unhandled deserialization info type`);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        err.message = `${err.message} in field ${field.name} of ${headerOptions.parentName} at location ${reader.offset}.`;
      }
      throw err;
    }
  }

  private readComplexNestedArray(
    reader: CdrReader,
    options: HeaderOptions & { isCDR2: boolean },
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

  /**
   * Checks if the reader is at a sentinel header and consumes it if it is.
   * Should only use for XCDR1 mutable structs and unions.
   * @param reader - The reader to check.
   * @returns true if it consumed the sentinel header, false otherwise.
   */
  private maybeConsumeSentinelHeader(reader: CdrReader): boolean {
    const offsetBefore = reader.offset;
    try {
      reader.sentinelHeader();
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Expected SENTINEL_PI")) {
        // reset the reader to the original offset
        reader.offset = offsetBefore;
        return false;
      } else if (err instanceof RangeError) {
        // it's possible that the buffer is out of bounds
        reader.offset = offsetBefore;
        return false;
      } else {
        throw err;
      }
    }
  }
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

function readerIsCDR2(reader: CdrReader): boolean {
  switch (reader.kind) {
    case EncapsulationKind.CDR_BE:
    case EncapsulationKind.CDR_LE:
    case EncapsulationKind.PL_CDR_BE:
    case EncapsulationKind.PL_CDR_LE:
      return false;
    case EncapsulationKind.CDR2_BE:
    case EncapsulationKind.CDR2_LE:
    case EncapsulationKind.DELIMITED_CDR2_BE:
    case EncapsulationKind.DELIMITED_CDR2_LE:
    case EncapsulationKind.PL_CDR2_BE:
    case EncapsulationKind.PL_CDR2_LE:
    case EncapsulationKind.RTPS_CDR2_BE:
    case EncapsulationKind.RTPS_CDR2_LE:
    case EncapsulationKind.RTPS_DELIMITED_CDR2_BE:
    case EncapsulationKind.RTPS_DELIMITED_CDR2_LE:
    case EncapsulationKind.RTPS_PL_CDR2_BE:
    case EncapsulationKind.RTPS_PL_CDR2_LE:
      return true;
  }
}
