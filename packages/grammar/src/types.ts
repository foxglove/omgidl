import { MessageDefinitionField } from "@foxglove/message-definition";

export type RawIdlDefinition = {
  definitions: (RawIdlDefinition | RawIdlFieldDefinition)[];
  name: string;
  definitionType: "module" | "struct";
};

export type RawIdlFieldDefinition = Partial<MessageDefinitionField> & {
  definitions: undefined;
  definitionType: "typedef";
  constantUsage?: [keyof MessageDefinitionField, string][];
};
