import { Grammar } from "nearley";

import nearleyIDL from "./idl.ne";

export const IDL_GRAMMAR = Grammar.fromCompiled(nearleyIDL);
