import { Parser } from "nearley";

import { IDL_GRAMMAR } from "./grammar";
import { RawIdlDefinition } from "./types";

/** Uses the IDL grammar to initialize and use a Nearley parser to read the string argument */
export function parseIdl(definition: string): RawIdlDefinition[][] {
  const parser = new Parser(IDL_GRAMMAR);
  parser.feed(definition);
  parser.finish();
  return parser.results as RawIdlDefinition[][];
}
