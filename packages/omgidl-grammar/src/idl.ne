@{%

// necessary to use keywords to avoid using the `reject` postprocessor which can cause poor perf
// having these as keywords removes ambiguity with `customType` rule
const keywords = [
  , "struct"
  , "module"
  , "enum"
  , "const"
  , "include"
  , "typedef"

  //types
  , "boolean"
  , "wstring"
  , "string"
  , "sequence"

  // Boolean types
  , "TRUE"
  , "FALSE"

  // numeric types
  , "byte"
  , "octet"
  , "wchar"
  , "char"
  , "double"
  , "float"
  , "int8"
  , "uint8"
  , "int16"
  , "uint16"
  , "int32"
  , "uint32"
  , "int64"
  , "uint64"
  , "unsigned"
  , "short"
  , "long"
];

const kwObject = keywords.reduce((obj, w) => {
  obj[w] = w;
  return obj;
}, {});

const moo = require("moo");
// Terminal tokens are in all caps
const lexer = moo.compile({
  SPACE: {match: /\s+/, lineBreaks: true},
  DECIMALEXP: /(?:(?:\d+\.\d*)|(?:\d*\.\d+)|(?:[0-9]+))[eE](?:[+|-])?[0-9]+/,
  DECIMAL: /(?:(?:\d+\.\d*)|(?:\d*\.\d+))/,
  INTEGER: /\d+/,
  COMMENT: /(?:\/\/[^\n]*)|(?:\/\*(?:.|\n)+?\*\/)/,
  HEX_LITERAL: /0x(?:[0-9a-fA-F])+?/,
  STRING: {match: /"(?:\\["\\rnu]|[^"\\])*"/, value: x => x.slice(1, -1)}, // remove outside quotes
  LCBR: '{',
  RCBR: '}',
  LBR: '[',
  RBR: ']',
  LT: '<',
  GT: '>',
  LPAR: '(',
  RPAR: ')',
  ';': ';',
  ',': ',',
  AT: '@',
  PND: '#',
  PT: ".",
  '/': "/",
  SIGN: /[+-]/,
  EQ: /=[^\n]*?/,
  NAME: {match: /[a-zA-Z_][a-zA-Z0-9_]*(?:\:\:[a-zA-Z][a-zA-Z0-9_]*)*/, type: moo.keywords(kwObject)},
});

// Ignore whitespace and comment tokens
const tokensToIgnore = ['SPACE', 'COMMENT'];
// requires us to override the lexer's next function
lexer.next = (next => () => {
  let token;
  while ((token = next.call(lexer)) && tokensToIgnore.includes(token.type)) {}
  return token;
})(lexer.next);

/*** Utiility functions ******/

// also used to parse tokens to strings since they start as an object
function join(d){
  return d.join("");
}

// used for combining AST components
function extend(objs) {
  return objs.reduce((r, p) => ({ ...r, ...p }), {});
}

function noop() {
  return null;
}

function getIntOrConstantValue(d) {
  const int = parseInt(d);
  if(!isNaN(int)) {
    return int;
  }

  // handle %NAME token
  return d?.value ? {usesConstant: true, name: d.value} : undefined;
}

function aggregateConstantUsage(dcl) {
  const entries = Object.entries(dcl).filter(
    ([key, value]) => value?.usesConstant === true
  ).map(([key, {name}]) => ([key, name]));
  if (entries.length === 0) {
    return dcl;
  }
  return {
    ...dcl,
    constantUsage: entries,
  };
}
%}

@lexer lexer

main -> (importDcl:* definition):+ {% d => {
  return d[0].flatMap(inner => inner[1]);
}
%}


# support <import> or "import" includes - just ignored
importDcl -> "#" "include" (%STRING | "<" %NAME ("/" %NAME):* "." "idl" ">") {% noop %}

moduleDcl  -> multiAnnotations "module" fieldName "{" (definition):+ "}" {%
function processModule(d) {
  const moduleName = d[2].name;
  const defs = d[4];
  // need to return array here to keep same signature as processComplexModule
  return {
    declarator: "module",
    name: moduleName,
    definitions: defs.flat(1),
  };
}
%}

definition -> (
    typeDcl
  | constantDcl
  | moduleDcl
) semi {% d => d[0][0] %}

typeDcl -> (
    structWithAnnotations
  | typedefWithAnnotations
  | enumWithAnnotations
) {% d => d[0][0] %}

structWithAnnotations -> multiAnnotations struct {%
 // default values don't apply to structs so we can just ignore all annotations on structs
 d => d[1]
%}

enumWithAnnotations -> multiAnnotations enum {%
 // default values don't apply to enums so we can just ignore all annotations on enums
 d => d[1]
%}

enum ->  "enum" fieldName "{" fieldName ("," fieldName):* "}" {% d => {
  const name = d[1].name;
  const firstMember = d[3].name;
  const members = d[4]
    .flat(2)
    .map((m) => m?.name)
    .filter(Boolean);

  return {
    declarator: 'enum',
    name,
    enumerators: [firstMember, ...members],
  };
} %}

struct -> "struct" fieldName "{" (member):+ "}" {% d => {
  const name = d[1].name;
  const definitions = d[3].flat(2).filter(def => def !== null);
  return {
    declarator: 'struct',
    name,
    definitions,
  };
} %}

typedefWithAnnotations -> multiAnnotations (
   typedef allTypes fieldName arrayLength
 | typedef allTypes fieldName
 | typedef sequenceType fieldName
) {% d => {
  const def = aggregateConstantUsage(extend(d.flat(1)));
  
  return {
    declarator: "typedef",
    ...def,
  };
} %}

typedef -> "typedef" {% noop %}
constantDcl -> multiAnnotations constType{% d => d[1] %}

member -> fieldWithAnnotation semi {% d => d[0] %}

fieldWithAnnotation -> multiAnnotations fieldDcl {% d=> {
  let possibleAnnotations = [];
  if(d[0]) {
    possibleAnnotations = d[0];
  }
  const fields = d[1];
  const finalDefs = fields.map((def) =>
    aggregateConstantUsage(extend([...possibleAnnotations, def]))
  );
  return finalDefs;
} %}

fieldDcl -> (
     allTypes  multiFieldNames arrayLength
   | allTypes multiFieldNames
   | sequenceType multiFieldNames
 ) {% (d) => {
  const names = d[0].splice(1, 1)[0];
  // create a definition for each name
  const defs = names.map((nameObj) => ({
    ...extend([...d[0], nameObj]),
    declarator: "struct-member"
  }));
  return defs;
} %}

multiFieldNames -> fieldName ("," fieldName):* {%
 d => {
   const fieldNames = d.flat(2).filter( d => d !== null && d.name);
   return fieldNames;
 } %}

multiAnnotations -> annotation:* {%
  d => {
    return d[0] ? d[0].filter(d => d !== null) : null;
  }
%}

annotation -> at %NAME ("(" annotationParams ")"):? {% d => {
  const annotationName = d[1].value;
  if(annotationName === "default") {
    const params = d[2] ? d[2][1] : {};
    const defaultValue = params.value;
    return {defaultValue};
  }
  return null
} %}

annotationParams -> (multipleNamedAnnotationParams | literal) {% d => d[0][0] %}

multipleNamedAnnotationParams -> namedAnnotationParams ("," namedAnnotationParams):* {%
  d => extend([d[0], ...d[1].flatMap(([, param]) => param)])
%}

namedAnnotationParams -> (%NAME assignment) {% d => ({[d[0][0].value]: d[0][1].value}) %}
 | (%NAME) {% /** constants */ noop %} 

at -> "@" {% noop %}

constType -> (
     constKeyword numericType fieldName floatAssignment simple
   | constKeyword numericType fieldName intAssignment simple
   | constKeyword stringType fieldName stringAssignment simple
   | constKeyword booleanType fieldName booleanAssignment simple
   | constKeyword customType fieldName variableAssignment simple
) {% d => {
  const def = aggregateConstantUsage(extend(d[0]));
  return def;
} %}

constKeyword -> "const"  {% d => ({isConstant: true, declarator: "const"}) %}

fieldName -> %NAME {% d => ({name: d[0].value}) %}


sequenceType -> "sequence" "<" allTypes ("," (INT|%NAME) ):? ">" {% d => {
  const arrayUpperBound = d[3] !== null ? getIntOrConstantValue(d[3][1][0]) : undefined;
  const typeObj = d[2];
  return {
    ...typeObj,
    isArray: true,
    arrayUpperBound,
  };
}%}

arrayLength -> "[" (INT|%NAME) "]" {%
  ([, intOrName]) => ({isArray: true, arrayLength: getIntOrConstantValue(intOrName ? intOrName[0] : undefined) })
%}

assignment -> (
    floatAssignment
  | intAssignment
  | stringAssignment
  | booleanAssignment
  | variableAssignment
) {% d => d[0][0] %}

floatAssignment ->   %EQ (SIGNED_FLOAT | FLOAT) {% ([, num]) => ({valueText: num[0], value: parseFloat(num[0])}) %}
intAssignment -> %EQ (SIGNED_INT | INT) {% ([, num]) => ({valueText: num[0], value: parseInt(num[0])}) %}
stringAssignment -> %EQ STR {% ([, str]) => ({valueText: str, value: str}) %}
booleanAssignment -> %EQ BOOLEAN {% ([, bool]) => ({valueText: bool, value: bool === "TRUE"}) %}
variableAssignment -> %EQ %NAME {% ([, name]) => ({valueText: name.value, value: {usesConstant: true, name: name.value}}) %}

allTypes -> (
    primitiveTypes
  | customType
) {% d => d[0][0] %}

primitiveTypes -> (
    stringType
  | numericType
  | booleanType
) {% d => ({...d[0][0], isComplex: false}) %}

customType -> %NAME {% d => {
  const typeName = d[0].value;

  // post process will go through and replace typedefs with their actual type
  return {type: typeName };
}%}

stringType ->  ("string"|"wstring") ("<" (INT | %NAME) ">"):? {% d => {
  let strLength = undefined;
  if(d[1] !== null) {
    strLength = getIntOrConstantValue(d[1][1] ? d[1][1][0] : undefined);
  }
  return {type: "string", upperBound: strLength};
} %}

booleanType -> "boolean" {% d => ({type: "bool"}) %}

numericType -> (
    "byte"
  | "octet"
  | "wchar"
  | "char"
  | "long" "double"
  | "double"
  | "float"
  | "int8"
  | "uint8"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "int64"
  | "uint64"
  | "unsigned" "short"
  | "short"
  | "unsigned" "long" "long"
  | "long" "long"
  | "unsigned" "long"
  | "long"
) {% (d) => {
  const typeString = d[0].map((t) => t?.value).filter(t => !!t).join(" ");
  return { type: typeString };
}
%}

literal -> (booleanLiteral | strLiteral | floatLiteral | intLiteral) {% d => d[0][0] %}

booleanLiteral -> BOOLEAN {% d => ({value: d[0] === "TRUE"}) %}

strLiteral -> STR {% d => ({value: d[0]}) %}

floatLiteral -> (SIGNED_FLOAT | FLOAT) {% d => ({value: parseFloat(d[0][0])}) %}

intLiteral -> (SIGNED_INT | INT) {% d => ({value: parseInt(d[0][0])}) %}

# ALL CAPS return strings rather than objects or null (terminals)

BOOLEAN -> ("TRUE" | "FALSE" ) {% join %}

# need to support mutliple adjacent strings as a single string
STR -> %STRING:+  {% d => {
  return join(d.flat(1).filter(d => d !== null));
}%}

SIGNED_FLOAT -> ("+"|"-") FLOAT {% join %}

FLOAT -> (%DECIMAL|%DECIMALEXP) {% join %}
 | (%DECIMAL "d") {% d => d[0][0].value %}
 | (INT "d") {% d => d[0][0] %}


SIGNED_INT -> ("+"|"-") INT  {% join %}

# convert token to string so that its easier to work with
INT -> %INTEGER {% join %}

semi -> ";" {% noop %}

simple -> null {% () => ({isComplex: false}) %}
