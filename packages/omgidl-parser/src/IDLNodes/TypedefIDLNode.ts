import { ReferenceTypeIDLNode } from "./ReferenceTypeIDLNode";
import { AnyIDLNode, ITypedefIDLNode } from "./interfaces";
import { TypedefASTNode } from "../astTypes";

export class TypedefIDLNode
  extends ReferenceTypeIDLNode<TypedefASTNode>
  implements ITypedefIDLNode
{
  constructor(scopePath: string[], astNode: TypedefASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
  }
}
