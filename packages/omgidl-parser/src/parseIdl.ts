import { MessageDefinition } from "@foxglove/message-definition";

import { IDLNodeProcessor } from "./IDLNodeProcessor";
import { parseIdlToAST } from "./parseIdlToAST";

/**
 * Parses IDL schema to flattened MessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseIdl(messageDefinition: string): MessageDefinition[] {
  const results = parseIdlToAST(messageDefinition);

  const result = results[0]!;

  const idlProcessor = new IDLNodeProcessor(result);
  idlProcessor.resolveEnumTypes();
  idlProcessor.resolveConstants();
  idlProcessor.resolveTypeDefs();
  idlProcessor.resolveComplexTypes();

  return idlProcessor.toMessageDefinitions();
}
