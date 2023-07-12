# OMG IDL Nearley Grammar

> _OMG IDL parser to flattened message definitions for (de)serialization_

[![npm version](https://img.shields.io/npm/v/@foxglove/omgidl-parser.svg?style=flat)](https://www.npmjs.com/package/@foxglove/omgidl-parser)

This package provides functions to parse raw `.idl` schemas into resolved, flattened message definitions.

Output definitions can be passed to serializers with a specified root definition in `@foxglove/omgidl-serialization` to read and write CDR and XCDR2 messages.

## API

`parseIdl` - parses raw `.idl` schema string to resolved, flattened definitions.

## OMG IDL Subset Support

Check `src/parse.test.ts` to see what is supported by the grammar so far and what isn't supported yet.

Known limitations:

- Multi-dimensional arrays are not supported
- Unions are not supported
- Annotations other than `@default` are currently discarded during parsing
- Leading `::` is not supported in scoped identifiers
- resolution of typedefs and constants is only guaranteed to work 1 level deep. In other words, typedefs and constants cannot reference other definitions that reference further definitions of constants or typedefs.
