import { MessageDefinition } from "@foxglove/message-definition";

import { IDLDefinitionMap } from "./IDLDefinitionMap";
import { IDLNodeProcessor } from "./IDLNodeProcessor";
import { parseIdlToAST } from "./parseIdlToAST";
import { IDLMessageDefinition } from "./types";

/**
 * Parses IDL schema to flattened IDLMessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition with annotations
 */
export function parseIdl(messageDefinition: string): IDLMessageDefinition[] {
  const rawIdlDefinitions = parseIdlToAST(messageDefinition);

  const idlProcessor = new IDLDefinitionMap(rawIdlDefinitions);
  return idlProcessor.toIDLMessageDefinitions();
}

/**
 * Parses IDL schema to flattened MessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseIdlToMessageDefinition(messageDefinition: string): MessageDefinition[] {
  const rawIdlDefinitions = parseIdlToAST(messageDefinition);

  const idlProcessor = new IDLNodeProcessor(rawIdlDefinitions);
  idlProcessor.resolveEnumTypes();
  idlProcessor.resolveConstantUsage();
  idlProcessor.resolveTypeDefComplexity();
  idlProcessor.resolveStructMember();

  return idlProcessor.toMessageDefinitions();
}
