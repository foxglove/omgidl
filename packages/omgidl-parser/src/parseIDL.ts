import { parseIDLToAST } from "./parseIDLToAST";
import { buildMap, toIDLMessageDefinitions } from "./processIDL";
import { IDLMessageDefinition } from "./types";

/**
 * Parses IDL schema to flattened IDLMessageDefinitions that can be used to serialize/deserialize messages
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition with annotations
 */
export function parseIDL(messageDefinition: string): IDLMessageDefinition[] {
  const rawIDLDefinitions = parseIDLToAST(messageDefinition);

  const idlMap = buildMap(rawIDLDefinitions);
  return toIDLMessageDefinitions(idlMap);
}
