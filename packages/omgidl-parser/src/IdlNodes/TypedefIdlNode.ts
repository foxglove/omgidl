import { IdlNode } from "./IdlNode";
import { ReferenceTypeIdlNode } from "./ReferenceTypeIdlNode";
import { TypedefAstNode } from "../astTypes";

export class TypedefIdlNode extends ReferenceTypeIdlNode<TypedefAstNode> {
  constructor(scopePath: string[], astNode: TypedefAstNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }
}
