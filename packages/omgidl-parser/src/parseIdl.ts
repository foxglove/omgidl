import { MessageDefinition } from "@foxglove/message-definition";
import { RawIdlDefinition, parseIdlToNestedDefinitions } from "@foxglove/omgidl-grammar";

import { IDLNodeProcessor } from "./IDLNodeProcessor";

/**
 *
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseIdl(messageDefinition: string): MessageDefinition[] {
  return buildIdlType(messageDefinition);
}

function buildIdlType(messageDefinition: string): MessageDefinition[] {
  const results = parseIdlToNestedDefinitions(messageDefinition);

  const result = results[0]!;
  const processedResult = processIdlDefinitions(result);

  return processedResult;
}

/** Resolves enum, constant and typedef usage in schema to make each member in the schema not referential beyond complex types.
 * Flattens down into a single array
 */
function processIdlDefinitions(definitions: RawIdlDefinition[]): MessageDefinition[] {
  const idlProcessor = new IDLNodeProcessor(definitions);

  idlProcessor.resolveEnumTypes();
  idlProcessor.resolveConstants();
  idlProcessor.resolveTypeDefs();
  idlProcessor.resolveComplexTypes();

  return idlProcessor.toMessageDefinitions();
}
