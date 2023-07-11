# OMG IDL Nearley Grammar

> _OMG IDL parser to AST_

[![npm version](https://img.shields.io/npm/v/@foxglove/omgidl-grammar.svg?style=flat)](https://www.npmjs.com/package/@foxglove/omgidl-grammar)

This repo contains a grammar that parses a subset of IDL schema into an AST. This does not resolve definitions; it represents the raw structure and data of the IDL schema. For usage in message serialization, more processing is required.

## API

`parseIdlToNestedDefinitions` - Uses the IDL grammar to parse raw `.idl` text into a raw, unresolved nested definition tree.

Also contains output types of the nested definitions. See `src/types.ts`.

## OMGIDL Subset Support

Check `src/parse.test.ts` to see what is supported by the grammar so far and what isn't supported yet.

Known limitations:

- Multi-dimensional arrays are not supported
- Unions are not supported
- Annotations other than `@default` are currently discarded during parsing
- Leading `::` is not supported in scoped identifiers
