import { ReferenceTypeIdlNode } from "./ReferenceTypeIdlNode";
import { AnyIdlNode, ITypedefIdlNode } from "./interfaces";
import { TypedefAstNode } from "../astTypes";

export class TypedefIdlNode
  extends ReferenceTypeIdlNode<TypedefAstNode>
  implements ITypedefIdlNode
{
  constructor(scopePath: string[], astNode: TypedefAstNode, idlMap: Map<string, AnyIdlNode>) {
    super(scopePath, astNode, idlMap);
  }
}
