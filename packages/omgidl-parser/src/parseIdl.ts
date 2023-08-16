import { MessageDefinition } from "@foxglove/message-definition";

import { IDLNodeProcessor } from "./IDLNodeProcessor";
import { parseIdlToAST } from "./parseIdlToAST";
import { AnnotatedMessageDefinition } from "./types";

/**
 * Parses IDL schema to flattened AnnotatedMessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition with annotations
 */
export function parseIdl(messageDefinition: string): AnnotatedMessageDefinition[] {
  const rawIdlDefinitions = parseIdlToAST(messageDefinition);

  const idlProcessor = new IDLNodeProcessor(rawIdlDefinitions);
  idlProcessor.resolveEnumTypes();
  idlProcessor.resolveConstantUsage();
  idlProcessor.resolveTypeDefComplexity();
  idlProcessor.resolveStructMember();

  return idlProcessor.toAnnotatedMessageDefinitions();
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
