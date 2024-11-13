import { ReferenceTypeIDLNode } from "./ReferenceTypeIDLNode";
import { ITypedefIDLNode } from "./interfaces";
import { TypedefASTNode } from "../astTypes";

export class TypedefIDLNode
  extends ReferenceTypeIDLNode<TypedefASTNode>
  implements ITypedefIDLNode {}
