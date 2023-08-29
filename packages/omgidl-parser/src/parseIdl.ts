import { parseIdlToAst } from "./parseIdlToAST";
import { buildMap, toIDLMessageDefinitions } from "./processIdl";
import { IdlMessageDefinition } from "./types";

/**
 * Parses IDL schema to flattened IDLMessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition with annotations
 */
export function parseIdl(messageDefinition: string): IdlMessageDefinition[] {
  const rawIdlDefinitions = parseIdlToAst(messageDefinition);

  const idlMap = buildMap(rawIdlDefinitions);
  return toIDLMessageDefinitions(idlMap);
}
