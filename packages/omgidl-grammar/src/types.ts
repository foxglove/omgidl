import { MessageDefinitionField } from "@foxglove/message-definition";

export type RawIdlDefinition = {
  definitions: (RawIdlDefinition | RawIdlFieldDefinition)[];
  name: string;
  definitionType: "module" | "struct";
};

export type RawIdlFieldDefinition = Partial<MessageDefinitionField> & {
  definitions: undefined;
  definitionType: "typedef";
  /**
   * Map of a key on a MessageDefinitionField to the string identifier of the constant used in that field
   * key example: value arrayLength, arrayUpperBound, defaultValue, upperBound
   * This can be used to resolve those string identifiers to their respective values
   */
  constantUsage?: [keyof MessageDefinitionField, string][];
};
