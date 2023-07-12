# @foxglove/omgidl-parser

> _OMG IDL schema definition parser_

[![npm version](https://img.shields.io/npm/v/@foxglove/omgidl-parser.svg?style=flat)](https://www.npmjs.com/package/@foxglove/omgidl-parser)

This package provides functions to parse raw `.idl` schemas into resolved, flattened message definitions using `@foxglove/omgidl-grammar`.

Output definitions can be passed to serializers with a specified root definition in `@foxglove/omgidl-serialization` to read and write CDR and XCDR2 messages.

## API

`parseIdl` - parses raw `.idl` schema string to resolved, flattened definitions.

`IDLNodeProcessor` - a class that takes semantic definitions outputted from `@foxglove/omgidl-grammar` and provides methods to iteratively resolve references in the definitions to be more complete for serialization. Also provides a method (`toMessageDefinitions`) to flatten the processed IDL to definitions that can be used for serialization.

## Known limitations (planned to be improved)

- no multidimensional array support (will fail)
- no union support (will fail)
- no support for encoding information of annotations outside of `@default` to `defaultValue`. Though parsing will not fail on these
- resolution of typedefs and constants is not fully recursive, it is only guaranteed to work 1 level deep. In other words, typedefs and constants cannot reference other definitions that reference further definitions of constants or typedefs.
