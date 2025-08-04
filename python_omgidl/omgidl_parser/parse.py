from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional
from typing import Union as TypingUnion

from lark import Lark, Transformer

# A slightly larger subset grammar supporting modules, structs, constants, enums,
# typedefs and unions
IDL_GRAMMAR = r"""
start: definition+

definition: annotations? (module
          | struct
          | constant
          | enum
          | typedef
          | union)
          | import_stmt
          | include_stmt

module: "module" NAME "{" definition* "}" semicolon?

struct: "struct" NAME "{" field* "}" semicolon?

enum: "enum" NAME "{" enumerator ("," enumerator)* "}" semicolon?

enumerator: annotations? NAME enum_value?
enum_value: "@value" "(" INT ")"

constant: "const" type NAME "=" const_value semicolon
const_value: STRING -> const_string
           | BOOL -> const_bool
           | const_sum

const_sum: const_atom ("+" const_atom)*

?const_atom: SIGNED_INT -> const_int
          | SIGNED_FLOAT -> const_float
          | scoped_name

typedef: "typedef" type NAME array? semicolon

union: "union" NAME "switch" "(" type ")" "{" union_case+ "}" semicolon?
union_case: "case" case_predicates ":" field
          | "default" ":" field
case_predicates: const_value ("," const_value)*

field: annotations? type NAME array? semicolon

import_stmt: "import" STRING semicolon

include_stmt: "#include" (STRING | "<" /[^>]+/ ">")

type: sequence_type
    | string_type
    | BUILTIN_TYPE
    | scoped_name

sequence_type: "sequence" "<" type ("," INT)? ">"

string_type: STRING_KW string_bound?
           | WSTRING_KW string_bound?

string_bound: "<" INT ">"

scoped_name: NAME ("::" NAME)*

BUILTIN_TYPE: /(unsigned\s+(short|long(\s+long)?)|long\s+double|double|float|short|long\s+long|long|int8|uint8|int16|uint16|int32|uint32|int64|uint64|byte|octet|wchar|char|boolean)/  # noqa: E501
STRING_KW: "string"
WSTRING_KW: "wstring"
NAME: /[A-Za-z_][A-Za-z0-9_]*/

array: ("[" INT "]")+

semicolon: ";"

%import common.INT
BOOL.2: /(?i)true|false/
%import common.SIGNED_INT
%import common.SIGNED_FLOAT
%import common.ESCAPED_STRING -> STRING
%import common.WS

COMMENT: /\/\/[^\n]*|\/\*[\s\S]*?\*\//
%ignore WS
%ignore COMMENT

annotation: "@" NAME ("(" const_value ")")?
annotations: annotation+
"""


@dataclass
class Field:
    name: str
    type: str
    array_lengths: List[int] = field(default_factory=list)
    is_sequence: bool = False
    sequence_bound: Optional[int] = None
    string_upper_bound: Optional[int] = None
    annotations: dict[str, Any] = field(default_factory=dict)


@dataclass
class Constant:
    name: str
    type: str
    value: TypingUnion[int, float, bool, str]
    annotations: dict[str, Any] = field(default_factory=dict)


@dataclass
class Enum:
    name: str
    enumerators: List[Constant] = field(default_factory=list)
    annotations: dict[str, Any] = field(default_factory=dict)


@dataclass
class Struct:
    name: str
    fields: List[Field] = field(default_factory=list)
    annotations: dict[str, Any] = field(default_factory=dict)


@dataclass
class Typedef:
    name: str
    type: str
    array_lengths: List[int] = field(default_factory=list)
    is_sequence: bool = False
    sequence_bound: Optional[int] = None
    annotations: dict[str, Any] = field(default_factory=dict)


@dataclass
class UnionCase:
    predicates: List[int | str]
    field: Field


@dataclass
class Union:
    name: str
    switch_type: str
    cases: List[UnionCase] = field(default_factory=list)
    default: Optional[Field] = None
    annotations: dict[str, Any] = field(default_factory=dict)


@dataclass
class Module:
    name: str
    definitions: List[Struct | Module | Constant | Enum | Typedef | Union] = field(
        default_factory=list
    )
    annotations: dict[str, Any] = field(default_factory=dict)


class _Transformer(Transformer):
    _NORMALIZATION = {
        "long double": "float64",
        "double": "float64",
        "float": "float32",
        "short": "int16",
        "unsigned short": "uint16",
        "unsigned long long": "uint64",
        "unsigned long": "uint32",
        "long long": "int64",
        "long": "int32",
    }

    _BUILTIN_TYPES = {
        "float64",
        "float32",
        "int16",
        "uint16",
        "uint64",
        "uint32",
        "int64",
        "int32",
        "int8",
        "uint8",
        "byte",
        "octet",
        "wchar",
        "char",
        "string",
        "wstring",
        "boolean",
    }

    def __init__(self):
        super().__init__()
        # Map identifiers (constants and enum values) to their evaluated numeric values
        self._constants: dict[str, int | float | bool | str] = {}

    def start(self, items):
        return [item for item in items if item is not None]

    def definition(self, items):
        if len(items) == 1:
            return items[0]
        annotations, decl = items
        if decl is None:
            return None
        if isinstance(annotations, dict) and hasattr(decl, "annotations"):
            decl.annotations = annotations
        return decl

    def NAME(self, token):
        return str(token)

    def scoped_name(self, items):
        return "::".join(items)

    def type(self, items):
        (t,) = items
        if isinstance(t, tuple):
            if t[0] == "sequence":
                inner, bound = t[1], t[2]
                return ("sequence", self._NORMALIZATION.get(inner, inner), bound)
            base, bound = t
            return (self._NORMALIZATION.get(base, base), bound)
        if isinstance(t, str):
            return self._NORMALIZATION.get(t, t)
        token = str(t)
        return self._NORMALIZATION.get(token, token)

    def sequence_type(self, items):
        inner = items[0]
        bound = items[1] if len(items) > 1 else None
        return ("sequence", inner, bound)

    def string_type(self, items):
        base = str(items[0])
        bound = items[1] if len(items) > 1 else None
        if bound is not None:
            return (base, bound)
        return base

    def string_bound(self, items):
        (value,) = items
        return value

    def INT(self, token):
        return int(token)

    def const_int(self, items):
        (token,) = items
        return int(token)

    def STRING(self, token):
        return str(token)[1:-1]

    def array(self, items):
        return [int(itm) for itm in items]

    def semicolon(self, _):
        return None

    def import_stmt(self, _items):
        return None

    def include_stmt(self, _items):
        return None

    def annotation(self, items):
        name = items[0]
        value = items[1] if len(items) > 1 else True
        return (name, value)

    def annotations(self, items):
        return dict(items)

    def field(self, items):
        idx = 0
        annotations = {}
        if items and isinstance(items[0], dict):
            annotations = items[0]
            idx = 1
        type_, name, *rest = items[idx:]
        array_lengths: List[int] = []
        for itm in rest:
            if isinstance(itm, list):
                array_lengths = itm
        is_sequence = False
        sequence_bound = None
        string_upper_bound = None
        if isinstance(type_, tuple):
            if type_[0] == "sequence":
                is_sequence = True
                sequence_bound = type_[2]
                type_ = type_[1]
                if isinstance(type_, tuple):
                    string_upper_bound = type_[1]
                    type_ = type_[0]
            else:
                string_upper_bound = type_[1]
                type_ = type_[0]
        return Field(
            name=name,
            type=type_,
            array_lengths=array_lengths,
            is_sequence=is_sequence,
            sequence_bound=sequence_bound,
            string_upper_bound=string_upper_bound,
            annotations=annotations,
        )

    def const_string(self, items):
        (value,) = items
        return value

    def const_bool(self, items):
        (token,) = items
        return str(token).lower() == "true"

    def const_float(self, items):
        (token,) = items
        return float(token)

    def const_sum(self, items):
        total = None
        for idx, item in enumerate(items):
            if isinstance(item, str):
                if item not in self._constants:
                    raise ValueError(f"Unknown identifier '{item}'")
                val = self._constants[item]
            else:
                val = item
            if idx == 0:
                total = val
            else:
                if not isinstance(total, (int, float)) or not isinstance(
                    val, (int, float)
                ):
                    raise ValueError("Addition only allowed on numeric constants")
                total += val
        return total

    def const_value(self, items):
        (value,) = items
        return value

    def constant(self, items):
        # items: TYPE, NAME, value, None
        type_, name, value, _ = items
        const = Constant(name=name, type=type_, value=value)
        self._constants[name] = value
        return const

    def typedef(self, items):
        type_, name, *rest = items
        array_lengths: List[int] = []
        for itm in rest:
            if isinstance(itm, list):
                array_lengths = itm
        is_sequence = False
        sequence_bound = None
        if isinstance(type_, tuple) and type_[0] == "sequence":
            is_sequence = True
            sequence_bound = type_[2]
            type_ = type_[1]
        return Typedef(
            name=name,
            type=type_,
            array_lengths=array_lengths,
            is_sequence=is_sequence,
            sequence_bound=sequence_bound,
        )

    def case_predicates(self, items):
        return items

    def union_case(self, items):
        if len(items) == 1:
            (field,) = items
            predicates: List[int | str] = []
        else:
            predicates, field = items
        return UnionCase(predicates=predicates, field=field)

    def union(self, items):
        name = items[0]
        switch_type = items[1]
        cases: List[UnionCase] = []
        default: Optional[Field] = None
        for itm in items[2:]:
            if isinstance(itm, UnionCase):
                if itm.predicates:
                    cases.append(itm)
                else:
                    default = itm.field
        return Union(name=name, switch_type=switch_type, cases=cases, default=default)

    def enum_value(self, items):
        (_, _, val, _) = items
        return val

    def enumerator(self, items):
        idx = 0
        if items and isinstance(items[0], dict):
            idx = 1
        name = items[idx]
        value = items[idx + 1] if len(items) > idx + 1 else None
        return (name, value)

    def enum(self, items):
        name = items[0]
        enumerators_raw = [it for it in items[1:] if isinstance(it, tuple)]
        constants: List[Constant] = []
        current = -1
        for enum_name, enum_val in enumerators_raw:
            if enum_val is not None:
                current = enum_val
            else:
                current += 1
            constants.append(Constant(name=enum_name, type="uint32", value=current))
            # Register enumerator both as unscoped and scoped (EnumName::Enumerator)
            self._constants[enum_name] = current
            self._constants[f"{name}::{enum_name}"] = current
        return Enum(name=name, enumerators=constants)

    def struct(self, items):
        name = items[0]
        fields = [i for i in items[1:] if isinstance(i, Field)]
        return Struct(name=name, fields=fields)

    def module(self, items):
        name = items[0]
        definitions = [item for item in items[1:] if item is not None]
        return Module(name=name, definitions=definitions)

    def resolve_types(
        self, definitions: List[Struct | Module | Constant | Enum | Typedef | Union]
    ):
        named_types: set[str] = set()

        def collect(
            defs: List[Struct | Module | Constant | Enum | Typedef | Union],
            scope: List[str],
        ):
            for d in defs:
                if isinstance(d, (Struct, Union, Typedef)):
                    full = "::".join([*scope, d.name])
                    named_types.add(full)
                if isinstance(d, Module):
                    collect(d.definitions, [*scope, d.name])

        collect(definitions, [])

        def resolve_field(f: Field, scope: List[str]):
            if f.type in self._BUILTIN_TYPES:
                return
            if f.type.startswith("::"):
                f.type = f.type[2:]
                return
            if "::" in f.type:
                return
            resolved = None
            for i in range(len(scope), -1, -1):
                candidate = "::".join([*scope[:i], f.type])
                if candidate in named_types:
                    resolved = candidate
                    break
            if resolved:
                f.type = resolved

        def resolve(
            defs: List[Struct | Module | Constant | Enum | Typedef | Union],
            scope: List[str],
        ):
            for d in defs:
                if isinstance(d, Struct):
                    for f in d.fields:
                        resolve_field(f, scope)
                elif isinstance(d, Union):
                    d.switch_type = self._NORMALIZATION.get(
                        d.switch_type, d.switch_type
                    )
                    if (
                        d.switch_type not in self._BUILTIN_TYPES
                        and not d.switch_type.startswith("::")
                        and "::" not in d.switch_type
                    ):
                        for i in range(len(scope), -1, -1):
                            candidate = "::".join([*scope[:i], d.switch_type])
                            if candidate in named_types:
                                d.switch_type = candidate
                                break
                    for case in d.cases:
                        resolve_field(case.field, scope)
                    if d.default:
                        resolve_field(d.default, scope)
                elif isinstance(d, Typedef):
                    if (
                        d.type not in self._BUILTIN_TYPES
                        and not d.type.startswith("::")
                        and "::" not in d.type
                    ):
                        for i in range(len(scope), -1, -1):
                            candidate = "::".join([*scope[:i], d.type])
                            if candidate in named_types:
                                d.type = candidate
                                break
                elif isinstance(d, Module):
                    resolve(d.definitions, [*scope, d.name])

        resolve(definitions, [])


def parse_idl(source: str) -> List[Struct | Module | Constant | Enum | Typedef | Union]:
    parser = Lark(IDL_GRAMMAR, start="start")
    tree = parser.parse(source)
    transformer = _Transformer()
    result = transformer.transform(tree)
    transformer.resolve_types(result)
    return result
