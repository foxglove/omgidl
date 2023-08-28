import { Parser } from "nearley";

import { RawIdlDefinition } from "./astTypes";
import { IDL_GRAMMAR } from "./grammar";

/** Uses the IDL grammar to initialize and use a Nearley parser to read the string argument
 * @returns - array of parsed IDL definitions
 */
export function parseIdlToAST(definition: string): RawIdlDefinition[] {
  const parser = new Parser(IDL_GRAMMAR);
  parser.feed(definition);
  parser.finish();

  const results = parser.results as RawIdlDefinition[][];
  if (results.length === 0) {
    throw new Error(
      `Could not parse message definition (unexpected end of input): '${definition}'`,
    );
  }
  if (results.length > 1) {
    throw new Error(`Ambiguous grammar: '${definition}'`);
  }
  // narrowed it down to 1 array of definitions
  return results[0]!;
}
