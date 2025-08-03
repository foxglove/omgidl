from __future__ import annotations

from dataclasses import dataclass
import copy
from typing import Any, Dict, List, Optional, Union

from omgidl_parser.parse import Field, Module, Struct, Union as IDLUnion

from .constants import UNION_DISCRIMINATOR_PROPERTY_KEY

DEFAULT_BOOLEAN_VALUE = False
DEFAULT_NUMERICAL_VALUE = 0
DEFAULT_STRING_VALUE = ""
DEFAULT_BYTE_VALUE = 0

PRIMITIVE_DEFAULTS: Dict[str, Any] = {
    "bool": DEFAULT_BOOLEAN_VALUE,
    "int8": DEFAULT_BYTE_VALUE,
    "uint8": DEFAULT_BYTE_VALUE,
    "int16": DEFAULT_NUMERICAL_VALUE,
    "uint16": DEFAULT_NUMERICAL_VALUE,
    "int32": DEFAULT_NUMERICAL_VALUE,
    "uint32": DEFAULT_NUMERICAL_VALUE,
    "int64": DEFAULT_NUMERICAL_VALUE,
    "uint64": DEFAULT_NUMERICAL_VALUE,
    "float32": DEFAULT_NUMERICAL_VALUE,
    "float64": DEFAULT_NUMERICAL_VALUE,
    "string": DEFAULT_STRING_VALUE,
    "wstring": DEFAULT_STRING_VALUE,
}


@dataclass
class FieldDeserializationInfo:
    name: str
    type: str
    type_info: Optional["ComplexDeserializationInfo"]
    is_array: bool
    array_lengths: Optional[List[int]]
    is_sequence: bool
    is_optional: bool
    string_upper_bound: Optional[int]
    sequence_bound: Optional[int]
    default_value: Any | None = None
    id: int | None = None


@dataclass
class StructDeserializationInfo:
    type: str
    fields: List[FieldDeserializationInfo]
    definition: Struct
    uses_delimiter_header: bool
    uses_member_header: bool
    default_value: Optional[Dict[str, Any]] = None


@dataclass
class UnionDeserializationInfo:
    type: str
    definition: IDLUnion
    uses_delimiter_header: bool
    uses_member_header: bool
    default_value: Optional[Dict[str, Any]] = None


ComplexDeserializationInfo = Union[StructDeserializationInfo, UnionDeserializationInfo]


class DeserializationInfoCache:
    """Cache of deserialization metadata for message definitions."""

    def __init__(self, definitions: List[Struct | Module | IDLUnion]) -> None:
        self._definitions = definitions
        self._complex_cache: Dict[str, ComplexDeserializationInfo] = {}

    def get_complex_deser_info(self, definition: Struct | IDLUnion) -> ComplexDeserializationInfo:
        cached = self._complex_cache.get(definition.name)
        if cached is not None:
            return cached

        uses_delim, uses_member = _get_header_needs(definition)
        if isinstance(definition, IDLUnion):
            info: ComplexDeserializationInfo = UnionDeserializationInfo(
                type="union",
                definition=definition,
                uses_delimiter_header=uses_delim,
                uses_member_header=uses_member,
            )
        else:
            fields = [self.build_field_info(f, i + 1) for i, f in enumerate(definition.fields)]
            info = StructDeserializationInfo(
                type="struct",
                fields=fields,
                definition=definition,
                uses_delimiter_header=uses_delim,
                uses_member_header=uses_member,
            )
        self._complex_cache[definition.name] = info
        return info

    def build_field_info(self, field: Field, field_id: int | None = None) -> FieldDeserializationInfo:
        type_info: Optional[ComplexDeserializationInfo] = None
        struct_def = _find_struct(self._definitions, field.type)
        if struct_def is not None:
            type_info = self.get_complex_deser_info(struct_def)
        else:
            union_def = _find_union(self._definitions, field.type)
            if union_def is not None:
                type_info = self.get_complex_deser_info(union_def)
        return FieldDeserializationInfo(
            name=field.name,
            type=field.type,
            type_info=type_info,
            is_array=bool(field.array_lengths),
            array_lengths=field.array_lengths or None,
            is_sequence=field.is_sequence,
            is_optional="optional" in field.annotations,
            string_upper_bound=field.string_upper_bound,
            sequence_bound=field.sequence_bound,
            default_value=field.annotations.get("default"),
            id=field.annotations.get("id", field_id),
        )

    def get_field_default(self, info: FieldDeserializationInfo) -> Any:
        if info.default_value is not None:
            return copy.deepcopy(info.default_value)

        if info.is_array or info.is_sequence:
            if info.array_lengths and not info.is_sequence:
                def getter() -> Any:
                    return self._base_field_default(info)
                info.default_value = make_nested_array(getter, info.array_lengths, 0)
            else:
                info.default_value = []
        else:
            info.default_value = self._base_field_default(info)
        return copy.deepcopy(info.default_value)

    def _base_field_default(self, info: FieldDeserializationInfo) -> Any:
        if info.type_info is not None:
            return self._get_complex_default(info.type_info)
        if info.type not in PRIMITIVE_DEFAULTS:
            raise ValueError(f"Failed to find default value for type {info.type}")
        return copy.deepcopy(PRIMITIVE_DEFAULTS[info.type])

    def _get_complex_default(self, info: ComplexDeserializationInfo) -> Dict[str, Any]:
        if info.default_value is not None:
            return copy.deepcopy(info.default_value)

        if isinstance(info, StructDeserializationInfo):
            msg: Dict[str, Any] = {}
            for field in info.fields:
                if not field.is_optional or field.default_value is not None:
                    msg[field.name] = self.get_field_default(field)
            info.default_value = msg
        else:
            union_def = info.definition
            if union_def.default is not None:
                default_field_info = self.build_field_info(union_def.default)
                msg = {
                    UNION_DISCRIMINATOR_PROPERTY_KEY: None,
                    default_field_info.name: self.get_field_default(default_field_info),
                }
            else:
                disc_field_info = self.build_field_info(
                    Field(name=UNION_DISCRIMINATOR_PROPERTY_KEY, type=union_def.switch_type)
                )
                switch_val = self.get_field_default(disc_field_info)
                case_field = _union_case_field(union_def, switch_val)
                if case_field is None:
                    raise ValueError(f"Failed to find default case for union {union_def.name}")
                case_info = self.build_field_info(case_field)
                msg = {
                    UNION_DISCRIMINATOR_PROPERTY_KEY: switch_val,
                    case_info.name: self.get_field_default(case_info),
                }
            info.default_value = msg
        return copy.deepcopy(info.default_value)


    def get_complex_default(self, info: ComplexDeserializationInfo) -> Dict[str, Any]:
        return self._get_complex_default(info)

def make_nested_array(get_value: Any, array_lengths: List[int], depth: int) -> List[Any]:
    if depth > len(array_lengths) - 1 or depth < 0:
        raise ValueError(f"Invalid depth {depth} for array of length {len(array_lengths)}")
    arr: List[Any] = []
    for _ in range(array_lengths[depth]):
        if depth == len(array_lengths) - 1:
            arr.append(get_value())
        else:
            arr.append(make_nested_array(get_value, array_lengths, depth + 1))
    return arr


def _get_header_needs(definition: Struct | IDLUnion) -> tuple[bool, bool]:
    annotations = getattr(definition, "annotations", {}) or {}
    if "mutable" in annotations:
        return (True, True)
    if "appendable" in annotations:
        return (True, False)
    return (False, False)


def _find_struct(defs: List[Struct | Module], name: str) -> Optional[Struct]:
    for d in defs:
        if isinstance(d, Struct) and d.name == name:
            return d
        if isinstance(d, Module):
            found = _find_struct(d.definitions, name)
            if found is not None:
                return found
    return None


def _find_union(defs: List[Struct | Module | IDLUnion], name: str) -> Optional[IDLUnion]:
    for d in defs:
        if isinstance(d, IDLUnion) and d.name == name:
            return d
        if isinstance(d, Module):
            found = _find_union(d.definitions, name)  # type: ignore[arg-type]
            if found is not None:
                return found
    return None


def _union_case_field(union_def: IDLUnion, discriminator: Any) -> Optional[Field]:
    for case in union_def.cases:
        predicates = getattr(case, "predicates", None)
        if predicates is not None:
            if discriminator in predicates:
                return case.field
        value = getattr(case, "value", None)
        if value == discriminator:
            return case.field
    if union_def.default is not None:
        return union_def.default
    return None
