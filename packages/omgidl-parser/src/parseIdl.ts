import { MessageDefinition } from "@foxglove/message-definition";

import { IDLNodeProcessor } from "./IDLNodeProcessor";
import { parseIdlToAST } from "./parseIdlToAST";

/**
 * Parses IDL schema to flattened MessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseIdl(messageDefinition: string): MessageDefinition[] {
  const rawIdlDefinitions = parseIdlToAST(messageDefinition);

  const idlProcessor = new IDLNodeProcessor(rawIdlDefinitions);
  idlProcessor.resolveEnumTypes();
  idlProcessor.resolveConstants();
  idlProcessor.resolveTypeDefs();
  idlProcessor.resolveStructMemberComplexity();

  return idlProcessor.toAnnotatedMessageDefinitions();
}
