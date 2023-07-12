# OMG IDL Nearley Grammar

> _OMG IDL parser to AST_

[![npm version](https://img.shields.io/npm/v/@foxglove/omgidl-parser.svg?style=flat)](https://www.npmjs.com/package/@foxglove/omgidl-parser)

This repo contains a grammar that parses a subset of IDL schema into an AST. This does not resolve definitions; it represents the raw structure and data of the IDL schema. For usage in message serialization, more processing is required.

## API

`parseIdlToNestedDefinitions` - Uses the IDL grammar to parse raw `.idl` text into a raw, unresolved nested definition tree.

Also contains output types of the nested definitions. See `src/types.ts`.

This package provides functions to parse raw `.idl` schemas into resolved, flattened message definitions using `@foxglove/omgidl-grammar`.

Output definitions can be passed to serializers with a specified root definition in `@foxglove/omgidl-serialization` to read and write CDR and XCDR2 messages.

`parseIdl` - parses raw `.idl` schema string to resolved, flattened definitions.

`IDLNodeProcessor` - a class that takes semantic definitions outputted from `@foxglove/omgidl-grammar` and provides methods to iteratively resolve references in the definitions to be more complete for serialization. Also provides a method (`toMessageDefinitions`) to flatten the processed IDL to definitions that can be used for serialization.

## OMG IDL Subset Support

Check `src/parse.test.ts` to see what is supported by the grammar so far and what isn't supported yet.

Known limitations:

- Multi-dimensional arrays are not supported
- Unions are not supported
- Annotations other than `@default` are currently discarded during parsing
- Leading `::` is not supported in scoped identifiers
- resolution of typedefs and constants is only guaranteed to work 1 level deep. In other words, typedefs and constants cannot reference other definitions that reference further definitions of constants or typedefs.
