import { MessageDefinitionField } from "@foxglove/message-definition";

export type RawIdlDefinition = ModuleDefinition | StructDefinition | EnumDefinition;

export interface ModuleDefinition {
  definitionType: "module";
  name: string;
  definitions: RawIdlDefinition[] | RawIdlFieldDefinition[];
}

export interface StructDefinition {
  definitionType: "struct";
  name: string;
  definitions: RawIdlFieldDefinition[];
}

export interface EnumDefinition {
  definitionType: "enum";
  name: string;
  members: string[];
}

export type RawIdlFieldDefinition = MessageDefinitionField & {
  definitionType: "typedef" | undefined;
  /**
   * Map of a key on a MessageDefinitionField to the string identifier of the constant used in that field
   * key example: value arrayLength, arrayUpperBound, defaultValue, upperBound
   * This can be used to resolve those string identifiers to their respective values
   */
  constantUsage?: [keyof MessageDefinitionField, string][];
};
