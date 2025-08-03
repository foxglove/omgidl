from __future__ import annotations

import struct
from typing import Any, Dict, List, Tuple

from omgidl_parser.parse import Struct, Field, Module, Union as IDLUnion

from .message_writer import (
    PRIMITIVE_FORMATS,
    PRIMITIVE_SIZES,
    EncapsulationKind,
    _LITTLE_ENDIAN_KINDS,
    _find_struct,
    _union_case_field,
    _padding,
    _primitive_size,
)
from .deserialization_info_cache import (
    DeserializationInfoCache,
    FieldDeserializationInfo,
    StructDeserializationInfo,
    UnionDeserializationInfo,
)


class MessageReader:
    """Deserialize CDR-encoded bytes into Python dictionaries.

    This is a minimal Python port of the TypeScript MessageReader. It supports
    primitive fields, fixed-length arrays, and variable-length sequences as
    produced by the simplified ``parse_idl`` parser.
    """

    def __init__(self, root_definition_name: str, definitions: List[Struct | Module | IDLUnion]) -> None:
        root = _find_struct(definitions, root_definition_name)
        if root is None:
            raise ValueError(
                f'Root definition name "{root_definition_name}" not found in schema definitions.'
            )
        self.cache = DeserializationInfoCache(definitions)
        self.root_info = self.cache.get_complex_deser_info(root)
        self._fmt_prefix = "<"
        self.encapsulation_kind = EncapsulationKind.CDR_LE

    # public API -------------------------------------------------------------
    def read_message(self, buffer: bytes | bytearray | memoryview) -> Dict[str, Any]:
        view = buffer if isinstance(buffer, memoryview) else memoryview(buffer)
        kind = EncapsulationKind(view[1])
        self.encapsulation_kind = kind
        little = kind in _LITTLE_ENDIAN_KINDS
        self._fmt_prefix = "<" if little else ">"
        offset = 4
        msg, _ = self._read_struct(self.root_info, view, offset)
        return msg

    # internal helpers ------------------------------------------------------
    def _read_struct(
        self, info: StructDeserializationInfo, view: memoryview, offset: int
    ) -> Tuple[Dict[str, Any], int]:
        msg: Dict[str, Any] = self.cache.get_complex_default(info)
        new_offset = offset
        for field in info.fields:
            value, new_offset = self._read_field(field, view, new_offset)
            msg[field.name] = value
        return msg, new_offset

    def _read_field(
        self, field: FieldDeserializationInfo, view: memoryview, offset: int
    ) -> Tuple[Any, int]:
        t = field.type
        if field.is_array:
            lengths = field.array_lengths or []
            return self._read_array(field, view, offset, lengths)
        if field.is_sequence:
            offset += _padding(offset, 4)
            length = struct.unpack_from(self._fmt_prefix + "I", view, offset)[0]
            offset += 4
            arr: List[Any] = []
            if t in ("string", "wstring"):
                for _ in range(length):
                    offset += _padding(offset, 4)
                    slen = struct.unpack_from(self._fmt_prefix + "I", view, offset)[0]
                    offset += 4
                    term = 1 if t == "string" else 2
                    data = bytes(view[offset : offset + slen - term])
                    offset += slen
                    s = data.decode("utf-8" if t == "string" else "utf-16-le")
                    if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                        raise ValueError(
                            f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                        )
                    arr.append(s)
            elif t in PRIMITIVE_SIZES:
                size = _primitive_size(t)
                fmt = self._fmt_prefix + PRIMITIVE_FORMATS[t]
                offset += _padding(offset, size)
                for _ in range(length):
                    val = struct.unpack_from(fmt, view, offset)[0]
                    offset += size
                    if t == "bool":
                        val = bool(val)
                    arr.append(val)
            else:
                if field.type_info is None:
                    raise ValueError(f"Unrecognized struct or union type {t}")
                for _ in range(length):
                    if isinstance(field.type_info, StructDeserializationInfo):
                        msg, offset = self._read_struct(field.type_info, view, offset)
                    else:
                        msg, offset = self._read_union(field.type_info, view, offset)
                    arr.append(msg)
            return arr, offset

        if t in ("string", "wstring"):
            offset += _padding(offset, 4)
            length = struct.unpack_from(self._fmt_prefix + "I", view, offset)[0]
            offset += 4
            term = 1 if t == "string" else 2
            data = bytes(view[offset : offset + length - term])
            offset += length
            s = data.decode("utf-8" if t == "string" else "utf-16-le")
            if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                raise ValueError(
                    f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                )
            return s, offset
        if t in PRIMITIVE_SIZES:
            size = _primitive_size(t)
            fmt = self._fmt_prefix + PRIMITIVE_FORMATS[t]
            offset += _padding(offset, size)
            val = struct.unpack_from(fmt, view, offset)[0]
            offset += size
            if t == "bool":
                val = bool(val)
            return val, offset

        if field.type_info is None:
            raise ValueError(f"Unrecognized struct or union type {t}")
        if isinstance(field.type_info, StructDeserializationInfo):
            return self._read_struct(field.type_info, view, offset)
        return self._read_union(field.type_info, view, offset)

    def _read_array(
        self,
        field: FieldDeserializationInfo,
        view: memoryview,
        offset: int,
        lengths: List[int],
    ) -> Tuple[Any, int]:
        t = field.type
        length = lengths[0]
        if len(lengths) > 1:
            arr: List[Any] = []
            for _ in range(length):
                sub, offset = self._read_array(field, view, offset, lengths[1:])
                arr.append(sub)
            return arr, offset

        if t in ("string", "wstring"):
            arr: List[str] = []
            for _ in range(length):
                offset += _padding(offset, 4)
                slen = struct.unpack_from(self._fmt_prefix + "I", view, offset)[0]
                offset += 4
                term = 1 if t == "string" else 2
                data = bytes(view[offset : offset + slen - term])
                offset += slen
                s = data.decode("utf-8" if t == "string" else "utf-16-le")
                if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                    raise ValueError(
                        f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                    )
                arr.append(s)
            return arr, offset

        if t in PRIMITIVE_SIZES:
            size = _primitive_size(t)
            fmt = self._fmt_prefix + PRIMITIVE_FORMATS[t]
            arr: List[Any] = []
            offset += _padding(offset, size)
            for _ in range(length):
                val = struct.unpack_from(fmt, view, offset)[0]
                offset += size
                if t == "bool":
                    val = bool(val)
                arr.append(val)
            return arr, offset

        if field.type_info is None:
            raise ValueError(f"Unrecognized struct or union type {t}")
        arr: List[Any] = []
        for _ in range(length):
            if isinstance(field.type_info, StructDeserializationInfo):
                msg, offset = self._read_struct(field.type_info, view, offset)
            else:
                msg, offset = self._read_union(field.type_info, view, offset)
            arr.append(msg)
        return arr, offset

    def _read_union(
        self, info: UnionDeserializationInfo, view: memoryview, offset: int
    ) -> Tuple[Dict[str, Any], int]:
        disc_field = Field(name="_d", type=info.definition.switch_type)
        disc_info = self.cache.build_field_info(disc_field)
        disc, offset = self._read_field(disc_info, view, offset)
        msg: Dict[str, Any] = {"_d": disc}
        case_field = _union_case_field(info.definition, disc)
        if case_field is None:
            return msg, offset
        case_info = self.cache.build_field_info(case_field)
        value, offset = self._read_field(case_info, view, offset)
        msg[case_field.name] = value
        return msg, offset

