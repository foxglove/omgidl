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
  makeNestedArray,
} from "./DeserializationInfoCache";
import { UNION_DISCRIMINATOR_PROPERTY_KEY } from "./constants";

/**
 * A single level of type nesting captured while decoding, ordered from the root type down to the
 * type being decoded when an error occurred. `value` is a live reference to the partially-filled
 * message object, so it reflects every field that was decoded before the failure.
 */
export type DecodeDebugFrame = {
  /** Name of the struct or union definition being decoded at this level. */
  type: string;
  /** The partially-decoded message object for this level. */
  value: Record<string, unknown>;
};

/** Result of {@link MessageReader.readMessageDebug}. */
export type DecodeDebugResult<R> =
  | { ok: true; message: R }
  | {
      ok: false;
      /** The error that stopped decoding. */
      error: Error;
      /** Byte offset within the buffer where decoding stopped, if known. */
      offset?: number;
      /** Type nesting from the root type to the deepest type being decoded, each with its partial value. */
      stack: DecodeDebugFrame[];
    };

/**
 * Opt-in debugging state. Holds the stack of partially-decoded messages so it can be inspected if
 * decoding throws. Debugging aid only; populated solely by {@link MessageReader.readMessageDebug}.
 */
type DecodeDebugState = {
  stack: DecodeDebugFrame[];
  /** CDR reader that is reading the current message. Needs to store it to report the offset information. */
  reader?: CdrReader;
};

export class MessageReader<T = unknown> {
  rootDeserializationInfo: ComplexDeserializationInfo;
  deserializationInfoCache: DeserializationInfoCache;
  /** Used for debugging. We do not error if the buffer end is not reached because it is possible this could cause
   * unexpected errors with user data. */
  #lastMessageBufferEndReached = false;
  /** Opt-in debugging state, only set while {@link readMessageDebug} is running. When undefined
   * (the production path) all debug bookkeeping is skipped and deserialization is unaffected. */
  #debug?: DecodeDebugState;

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
    if (this.#debug != undefined) {
      this.#debug.reader = reader;
    }
    // if true means that it is definitely using CDR2 (however doesn't apply to CDR2 Final (non PL_CDR and non DELIMITED_CDR2))
    const usesDelimiterHeader = reader.usesDelimiterHeader;
    const usesMemberHeader = reader.usesMemberHeader;

    const res = this.readAggregatedType(this.rootDeserializationInfo, reader, {
      usesDelimiterHeader,
      usesMemberHeader,
    }) as R;

    this.#lastMessageBufferEndReached = reader.isAtEnd();

    return res;
  }

  /**
   * Decodes a message like {@link readMessage}, but if decoding throws it returns the partial decode
   * state instead of discarding it. The result reports how far decoding progressed: the
   * partially-decoded message tree at each level of type nesting, the byte offset where decoding
   * stopped, and the error.
   *
   * This is strictly a debugging aid. It does not change deserialization behavior and is not meant
   * for production decode paths.
   */
  readMessageDebug<R = T>(buffer: ArrayBufferView): DecodeDebugResult<R> {
    this.#debug = { stack: [] };
    try {
      const message = this.readMessage<R>(buffer);
      return { ok: true, message };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
        offset: this.#debug.reader?.offset,
        stack: this.#debug.stack,
      };
    } finally {
      this.#debug = undefined;
    }
  }

  public lastMessageBufferEndReached(): boolean {
    return this.#lastMessageBufferEndReached;
  }

  /** Pushes a partial message onto the debug stack. No-op unless debugging is enabled. */
  #debugEnter(deserInfo: ComplexDeserializationInfo, value: Record<string, unknown>): void {
    this.#debug?.stack.push({ type: deserInfo.definition.name ?? "<unnamed>", value });
  }

  /** Pops the current partial message off the debug stack on a successful read. No-op unless
   * debugging is enabled. On an error the frame is intentionally left in place for inspection. */
  #debugExit(): void {
    this.#debug?.stack.pop();
  }

  private readAggregatedType(
    deserInfo: ComplexDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
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
    options: HeaderOptions,
    /** if this is present it means that the struct is CDR2 */
    typeEndOffset: number | undefined,
  ): Record<string, unknown> {
    const usesMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
    const usesDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;

    const msg: Record<string, unknown> = {};
    this.#debugEnter(deserInfo, msg);

    // There's a few ways we should be reading structs
    // 1. Struct is mutable. It has a typeEndOffset. Read based off each EMHEADER. Meaning that we need to read the EMHEADER to determine what the field is and then use the emHeader to read the field.
    // 2. Struct is appendable. It has a typeEndOffset. Read schema definition from top to bottom, there may be unknown or missing fields that we need to account for.
    // 3. Read solely based off of the schema definition (FINAL or XCDR1). Meaning that we can assume all the fields are in the exact same order and count as the schema definition.
    if (usesMemberHeader) {
      const fieldIndexesRead = new Set<number>();
      // HANDLE MUTABLE STRUCT
      // XCDR2 uses typeEndOffset to determine the end of the struct
      // XCDR1 uses a sentinel header to determine the end of the struct

      // loop until struct is ended: XCDR2 uses typeEndOffset, XCDR1 uses a sentinel header
      for (;;) {
        const atEndOfStruct = typeEndOffset != undefined && reader.offset >= typeEndOffset;
        if (atEndOfStruct) {
          break;
        }

        const { objectSize, id, readSentinelHeader, lengthCode } = reader.emHeader();

        // end of struct, this accounts for XCDR1 mutable structs
        if (readSentinelHeader === true) {
          break;
        }

        const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : undefined;
        const fieldIndex = deserInfo.fieldIndexById.get(id);
        const field = fieldIndex != undefined ? deserInfo.fieldsInOrder[fieldIndex] : undefined;
        // if it's an unknown field then we skip reading it.
        if (field == undefined || fieldIndex == undefined) {
          reader.seekTo(reader.offset + objectSize);
          continue;
        }

        fieldIndexesRead.add(fieldIndex);

        msg[field.name] = this.readMemberFieldValue(
          field,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-struct>",
            emHeaderSizeBytes,
          },
          options,
        );
      } // END OF MUTABLE FIELD LOOP

      // set unread fields to defaults
      for (let idx = 0; idx < deserInfo.fieldsInOrder.length; idx++) {
        const field = deserInfo.fieldsInOrder[idx]!;
        if (fieldIndexesRead.has(idx)) {
          continue;
        }

        if (field.isOptional) {
          msg[field.name] = undefined;
        } else {
          msg[field.name] = this.deserializationInfoCache.getFieldDefault(field);
        }
      }
    } else {
      // HANDLE APPENDABLE OR FINAL STRUCT
      // Appendable structs are treated the same as final structs except that they have a typeEndOffset
      // from the DHeader for XCDR2 (has typeEndOffset), or a sentinel header for XCDR1.

      for (const field of deserInfo.fieldsInOrder) {
        if (typeEndOffset != undefined && reader.offset >= typeEndOffset) {
          // end of struct
          // if this happens then it likely means that the schema we have has been appended to but the message
          // was written using a schema with fewer fields.
          break;
        }

        if (field.isOptional) {
          msg[field.name] = this.readOptionalFinalMember(
            field,
            reader,
            options,
            deserInfo.definition.name,
          );
          continue;
        }

        // handles optional xcdr2 fields (from is_present=true) and all non-optional fields
        msg[field.name] = this.readMemberFieldValue(
          field,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-struct>",
          },
          options,
        );
      } // END OF FIELD FOR LOOP
      if (typeEndOffset != undefined && reader.offset < typeEndOffset) {
        throw new Error(
          `Buffer for Appendable/Final struct ${deserInfo.definition.name ?? ""} was not read completely. This could be because the schema is missing fields that are present on the message.`,
        );
      }
    } // END OF APPENDABLE OR FINAL STRUCT
    this.#debugExit();
    return msg;
  }

  private readUnionType(
    deserInfo: UnionDeserializationInfo,
    reader: CdrReader,
    options: HeaderOptions,
    typeEndOffset?: number,
  ): Record<string, unknown> {
    const usesMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
    const usesDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;

    // Debug-only running view of the union, populated with the discriminator as it is decoded so the
    // partial state is meaningful if a later read throws. Not created on the production path.
    const debugValue: Record<string, unknown> | undefined = this.#debug ? {} : undefined;
    if (debugValue) {
      this.#debugEnter(deserInfo, debugValue);
    }

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

    if (debugValue) {
      debugValue[UNION_DISCRIMINATOR_PROPERTY_KEY] = discriminatorValue;
    }

    const fieldDeserInfo = caseDefType
      ? this.deserializationInfoCache.buildFieldDeserInfo(caseDefType)
      : undefined;

    const hasSentinelHeader = !usesDelimiterHeader && usesMemberHeader; // XCDR1 mutable

    // if no matching case and no default case, only return discriminator value
    if (!fieldDeserInfo || !caseDefType) {
      if (typeEndOffset != undefined) {
        reader.seekTo(typeEndOffset);
      } else if (hasSentinelHeader) {
        for (;;) {
          const { objectSize, readSentinelHeader } = reader.emHeader();
          // This is PL_CDR, so objectSize is the byte length of the member
          // body.
          //
          // From DDS-XTypes v1.3, section 7.4.1.2 Parameterized CDR Encoding:
          //
          // > Unlike it is stated in [RTPS] Sub Clause 9.4.2.11
          // > “ParameterList”, the value of the parameter length is the exact
          // > length of the serialized member.
          reader.seek(objectSize);
          if (readSentinelHeader === true) {
            break;
          }
        }
      } else {
        throw new Error(
          "union's case is unknown, but cannot skip its body because its length is indeterminate",
        );
      }

      this.#debugExit();
      return {
        [UNION_DISCRIMINATOR_PROPERTY_KEY]: discriminatorValue,
      };
    }

    let caseDefValue: unknown = undefined;

    // even if the union is ended we need to set the defaults
    if (usesMemberHeader) {
      // MUTABLE UNION
      const atEndOfUnion = typeEndOffset != undefined && reader.offset >= typeEndOffset;
      const emHeader = !atEndOfUnion ? reader.emHeader() : undefined;
      if (atEndOfUnion || emHeader?.readSentinelHeader === true) {
        // if the offset is already at the end of the union then the value of the caseDef is undefined or it's default value
        if (fieldDeserInfo.isOptional) {
          caseDefValue = undefined;
        } else {
          caseDefValue = this.deserializationInfoCache.getFieldDefault(fieldDeserInfo);
        }
      } else {
        // should be read before
        const { objectSize, lengthCode } = emHeader!;

        const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : undefined;
        caseDefValue = this.readMemberFieldValue(
          fieldDeserInfo,
          reader,
          {
            usesDelimiterHeader,
            usesMemberHeader,
            parentName: deserInfo.definition.name ?? "<unnamed-union>",
            emHeaderSizeBytes,
          },
          options,
        );
        if (hasSentinelHeader) {
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
          },
          options,
        );
      }
    }

    this.#debugExit();
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
    options: HeaderOptions,
    parentName?: string,
  ): unknown {
    if (reader.isCDR2) {
      // if it's XCDR2 then it uses an is_present flag to determine if the field is present

      const isPresent = reader.isPresentFlag();
      if (!isPresent) {
        return undefined;
      }

      return this.readMemberFieldValue(
        field,
        reader,
        {
          ...options,
          parentName: parentName ?? "<unnamed-struct>",
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
            !((!reader.isCDR2 && field.isOptional) || headerOptions.usesMemberHeader)
          ) {
            // return value is ignored because we don't do partial deserialization
            // in that case it would be used to skip the field if it was irrelevant
            reader.dHeader();
          }
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
