import { Grammar } from "nearley";

import nearleyIdl from "./idl.ne";

export const IDL_GRAMMAR = Grammar.fromCompiled(nearleyIdl);
