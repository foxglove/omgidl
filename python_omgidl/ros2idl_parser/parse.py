from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Union, Any

from omgidl_parser.parse import (
    parse_idl,
    Field as IDLField,
    Struct as IDLStruct,
    Module as IDLModule,
    Constant as IDLConstant,
    Enum as IDLEnum,
    Typedef as IDLTypedef,
    Union as IDLUnion,
)


@dataclass
class MessageDefinitionField:
    type: str
    name: str
    isComplex: bool = False
    enumType: Optional[str] = None
    isArray: bool = False
    arrayLength: Optional[int] = None
    isConstant: bool = False
    value: Optional[Union[str, int]] = None
    valueText: Optional[str] = None
    upperBound: Optional[int] = None
    arrayUpperBound: Optional[int] = None
    defaultValue: Optional[Any] = None


@dataclass
class MessageDefinition:
    name: Optional[str]
    definitions: List[MessageDefinitionField] = field(default_factory=list)


ROS2IDL_HEADER = re.compile(r"={80}\nIDL: [a-zA-Z][\w]*(?:\/[a-zA-Z][\w]*)*")


def parse_ros2idl(message_definition: str) -> List[MessageDefinition]:
    """Parse ros2idl schema into message definitions."""
    idl_conformed = ROS2IDL_HEADER.sub("", message_definition)
    parsed = parse_idl(idl_conformed)
    typedefs = _collect_typedefs(parsed, [])
    message_defs: List[MessageDefinition] = []
    for definition in parsed:
        message_defs.extend(_process_definition(definition, [], typedefs))

    for msg in message_defs:
        if msg.name is not None:
            msg.name = _normalize_name(msg.name)
        for field in msg.definitions:
            field.type = _normalize_name(field.type)

        if msg.name in ("builtin_interfaces/msg/Time", "builtin_interfaces/msg/Duration"):
            for field in msg.definitions:
                if field.name == "nanosec":
                    field.name = "nsec"

    return message_defs


def _process_definition(
    defn: IDLStruct | IDLModule | IDLConstant | IDLEnum | IDLUnion | IDLTypedef,
    scope: List[str],
    typedefs: dict[str, IDLTypedef],
) -> List[MessageDefinition]:
    results: List[MessageDefinition] = []
    if isinstance(defn, IDLStruct):
        fields = [_convert_field(f, typedefs) for f in defn.fields]
        results.append(MessageDefinition(name="/".join([*scope, defn.name]), definitions=fields))
    elif isinstance(defn, IDLUnion):
        switch_type = _resolve_type(defn.switch_type, typedefs)
        fields = [MessageDefinitionField(type=switch_type, name="_d")]
        for case in defn.cases:
            fields.append(_convert_field(case.field, typedefs))
        if defn.default:
            fields.append(_convert_field(defn.default, typedefs))
        results.append(MessageDefinition(name="/".join([*scope, defn.name]), definitions=fields))
    elif isinstance(defn, IDLModule):
        const_fields = [
            _convert_constant(c, typedefs)
            for c in defn.definitions
            if isinstance(c, IDLConstant)
        ]
        if const_fields:
            results.append(
                MessageDefinition(name="/".join([*scope, defn.name]), definitions=const_fields)
            )
        for sub in defn.definitions:
            if isinstance(sub, (IDLModule, IDLStruct, IDLUnion)):
                results.extend(_process_definition(sub, [*scope, defn.name], typedefs))
    elif isinstance(defn, IDLConstant):
        results.append(
            MessageDefinition(
                name="/".join(scope), definitions=[_convert_constant(defn, typedefs)]
            )
        )
    # IDLEnum and IDLTypedef do not directly produce MessageDefinitions here
    return results


def _convert_field(field: IDLField, typedefs: dict[str, IDLTypedef]) -> MessageDefinitionField:
    t = field.type
    array_lengths = list(field.array_lengths)
    is_sequence = field.is_sequence
    seq_bound = field.sequence_bound
    visited: set[str] = set()
    while t in typedefs and t not in visited:
        visited.add(t)
        td = typedefs[t]
        t = td.type
        if td.array_lengths and not array_lengths and not is_sequence:
            array_lengths = list(td.array_lengths)
        if td.is_sequence:
            is_sequence = True
            if td.sequence_bound is not None:
                seq_bound = td.sequence_bound
    return MessageDefinitionField(
        type=t,
        name=field.name,
        isArray=bool(array_lengths) or is_sequence,
        arrayLength=array_lengths[0] if array_lengths else None,
        arrayUpperBound=seq_bound if is_sequence else None,
    )


def _convert_constant(const: IDLConstant, typedefs: dict[str, IDLTypedef]) -> MessageDefinitionField:
    t = _resolve_type(const.type, typedefs)
    return MessageDefinitionField(
        type=t,
        name=const.name,
        isConstant=True,
        value=const.value,
        valueText=str(const.value),
    )


def _normalize_name(name: str) -> str:
    return name.replace("::", "/") if "::" in name else name


def _collect_typedefs(
    defs: List[IDLStruct | IDLModule | IDLConstant | IDLEnum | IDLTypedef | IDLUnion],
    scope: List[str],
) -> dict[str, IDLTypedef]:
    typedefs: dict[str, IDLTypedef] = {}

    def collect(
        ds: List[IDLStruct | IDLModule | IDLConstant | IDLEnum | IDLTypedef | IDLUnion],
        sc: List[str],
    ):
        for d in ds:
            if isinstance(d, IDLTypedef):
                typedefs["::".join([*sc, d.name])] = d
            elif isinstance(d, IDLModule):
                collect(d.definitions, [*sc, d.name])

    collect(defs, scope)
    return typedefs


def _resolve_type(name: str, typedefs: dict[str, IDLTypedef]) -> str:
    t = name
    visited: set[str] = set()
    while t in typedefs and t not in visited:
        visited.add(t)
        td = typedefs[t]
        t = td.type
    return t
