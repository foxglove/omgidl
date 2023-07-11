# OMGIDL Nearley Grammar

This repo contains a Nearley grammar that parses a subset of IDL to a semantic, nested array definition. This does not resolve definitions; it represents the raw structure and data of the idl schema. For usage in message serialization, more processing is required.

<b>NOTE: This is not meant to be used to check the correctness of IDL schema.</b>

## API

`parseIdlToNestedDefinitions` - Uses the IDL grammar to parse raw `.idl` text into a raw, unresolved nested definition tree.

`OMGIDL_GRAMMAR` - The compiled nearley grammar.

Also contains output types of the nested definitions. See `src/types.ts`.

## OMGIDL Subset Support

Check `src/parse.test.ts` to see what is supported by the grammar so far and what isn't supported yet.

Known limitations that are planned to be addressed are:

- no multidimensional array support (will fail)
- no union support (will fail)
- no support for encoding information of annotations outside of `@default` to `defaultValue`. Though parsing will not fail on these
- no support for leading `::` identifiers

## License

@foxglove/omgidl-grammar is licensed under the [MIT License](https://opensource.org/licenses/MIT).
