from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from lark import Lark, Transformer

# A very small subset grammar supporting modules and structs with primitive fields
IDL_GRAMMAR = r"""
start: definition+

definition: module | struct

module: "module" NAME "{" definition* "}" semicolon?

struct: "struct" NAME "{" field* "}" semicolon?

field: TYPE NAME array? semicolon

TYPE: /(unsigned\s+(short|long(\s+long)?)|long\s+double|double|float|int8|uint8|int16|uint16|int32|uint32|int64|uint64|byte|octet|wchar|char|string|wstring|boolean)/
NAME: /[A-Za-z_][A-Za-z0-9_]*/

array: "[" INT "]"

semicolon: ";"

%import common.INT
%import common.WS
%ignore WS
"""

@dataclass
class Field:
    name: str
    type: str
    array_length: Optional[int] = None

@dataclass
class Struct:
    name: str
    fields: List[Field] = field(default_factory=list)

@dataclass
class Module:
    name: str
    definitions: List[Struct | Module] = field(default_factory=list)

class _Transformer(Transformer):
    def start(self, items):
        return list(items)

    def definition(self, items):
        return items[0]
    def NAME(self, token):
        return str(token)

    def TYPE(self, token):
        # normalize type names
        t = str(token)
        return {
            "long double": "float64",
            "double": "float64",
            "float": "float32",
            "unsigned short": "uint16",
            "unsigned long long": "uint64",
            "unsigned long": "uint32",
            "long long": "int64",
            "long": "int32",
        }.get(t, t)

    def INT(self, token):
        return int(token)

    def array(self, items):
        (length,) = items
        return length

    def semicolon(self, _):
        return None

    def field(self, items):
        type_, name, *rest = items
        array_length = None
        for itm in rest:
            if isinstance(itm, int):
                array_length = itm
        return Field(name=name, type=type_, array_length=array_length)

    def struct(self, items):
        name = items[0]
        fields = [i for i in items[1:] if isinstance(i, Field)]
        return Struct(name=name, fields=fields)

    def module(self, items):
        name = items[0]
        definitions = [item for item in items[1:] if item is not None]
        return Module(name=name, definitions=definitions)


def parse_idl(source: str) -> List[Struct | Module]:
    parser = Lark(IDL_GRAMMAR, start="start")
    tree = parser.parse(source)
    return _Transformer().transform(tree)

