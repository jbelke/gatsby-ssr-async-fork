"use strict";

exports.__esModule = true;

var _extends2 = require("babel-runtime/helpers/extends");

var _extends3 = _interopRequireDefault(_extends2);

var _objectWithoutProperties2 = require("babel-runtime/helpers/objectWithoutProperties");

var _objectWithoutProperties3 = _interopRequireDefault(_objectWithoutProperties2);

exports.inferObjectStructureFromNodes = inferObjectStructureFromNodes;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _require = require(`graphql`),
    GraphQLObjectType = _require.GraphQLObjectType,
    GraphQLBoolean = _require.GraphQLBoolean,
    GraphQLString = _require.GraphQLString,
    GraphQLFloat = _require.GraphQLFloat,
    GraphQLInt = _require.GraphQLInt,
    GraphQLList = _require.GraphQLList,
    GraphQLUnionType = _require.GraphQLUnionType;

var _ = require(`lodash`);
var invariant = require(`invariant`);
var moment = require(`moment`);
var mime = require(`mime`);
var isRelative = require(`is-relative`);
var isRelativeUrl = require(`is-relative-url`);
var normalize = require(`normalize-path`);
var systemPath = require(`path`);

var _require2 = require(`common-tags`),
    oneLine = _require2.oneLine;

var _require3 = require(`../redux`),
    store = _require3.store,
    getNode = _require3.getNode,
    getNodes = _require3.getNodes;

var _require4 = require(`../utils/path`),
    joinPath = _require4.joinPath;

var _require5 = require(`../redux/actions/add-page-dependency`),
    createPageDependency = _require5.createPageDependency;

var createTypeName = require(`./create-type-name`);
var createKey = require(`./create-key`);

var _require6 = require(`./data-tree-utils`),
    extractFieldExamples = _require6.extractFieldExamples,
    isEmptyObjectOrArray = _require6.isEmptyObjectOrArray;

var ISO_8601_FORMAT = [`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, `YYYYMMDD`, `YYYY-MM-DDTHHZ`, `YYYY-MM-DDTHH:mmZ`, `YYYY-MM-DDTHHmmZ`, `YYYY-MM-DDTHH:mm:ssZ`, `YYYY-MM-DDTHHmmssZ`, `YYYY-MM-DDTHH:mm:ss.SSSZ`, `YYYY-MM-DDTHHmmss.SSSZ`, `YYYY-[W]WW`, `YYYY[W]WW`, `YYYY-[W]WW-E`, `YYYY[W]WWE`, `YYYY-DDDD`, `YYYYDDDD`];

function inferGraphQLType(_ref) {
  var exampleValue = _ref.exampleValue,
      selector = _ref.selector,
      otherArgs = (0, _objectWithoutProperties3.default)(_ref, ["exampleValue", "selector"]);

  if (exampleValue == null || isEmptyObjectOrArray(exampleValue)) return;
  var fieldName = selector.split(`.`).pop();

  if (Array.isArray(exampleValue)) {
    exampleValue = exampleValue[0];

    if (exampleValue == null) return;

    var headType = void 0;
    // If the array contains objects, than treat them as "nodes"
    // and create an object type.
    if (_.isObject(exampleValue)) {
      headType = new GraphQLObjectType({
        name: createTypeName(fieldName),
        fields: inferObjectStructureFromNodes((0, _extends3.default)({}, otherArgs, {
          exampleValue,
          selector
        }))
      });
      // Else if the values are simple values, just infer their type.
    } else {
      var inferredType = inferGraphQLType((0, _extends3.default)({}, otherArgs, {
        exampleValue,
        selector
      }));
      invariant(inferredType, `Could not infer graphQL type for value: ${exampleValue}`);

      headType = inferredType.type;
    }
    return { type: new GraphQLList(headType) };
  }

  // Check if this is a date.
  // All the allowed ISO 8601 date-time formats used.
  var momentDate = moment.utc(exampleValue, ISO_8601_FORMAT, true);
  if (momentDate.isValid()) {
    return {
      type: GraphQLString,
      args: {
        formatString: {
          type: GraphQLString
        },
        fromNow: {
          type: GraphQLBoolean,
          description: oneLine`
            Returns a string generated with Moment.js' fromNow function`
        },
        difference: {
          type: GraphQLString,
          description: oneLine`
            Returns the difference between this date and the current time.
            Defaults to miliseconds but you can also pass in as the
            measurement years, months, weeks, days, hours, minutes,
            and seconds.`
        }
      },
      resolve(object, _ref2) {
        var fromNow = _ref2.fromNow,
            difference = _ref2.difference,
            formatString = _ref2.formatString;

        var date = void 0;
        if (object[fieldName]) {
          date = JSON.parse(JSON.stringify(object[fieldName]));
        } else {
          return;
        }
        if (formatString) {
          return moment.utc(date, ISO_8601_FORMAT, true).format(formatString);
        } else if (fromNow) {
          return moment.utc(date, ISO_8601_FORMAT, true).fromNow();
        } else if (difference) {
          return moment().diff(moment.utc(date, ISO_8601_FORMAT, true), difference);
        } else {
          return date;
        }
      }
    };
  }

  switch (typeof exampleValue) {
    case `boolean`:
      return { type: GraphQLBoolean };
    case `string`:
      return { type: GraphQLString };
    case `object`:
      return {
        type: new GraphQLObjectType({
          name: createTypeName(fieldName),
          fields: inferObjectStructureFromNodes((0, _extends3.default)({}, otherArgs, {
            exampleValue,
            selector
          }))
        })
      };
    case `number`:
      return _.isInteger(exampleValue) ? { type: GraphQLInt } : { type: GraphQLFloat };
    default:
      return null;
  }
}

function inferFromMapping(value, mapping, fieldSelector, types) {
  var matchedTypes = types.filter(function (type) {
    return type.name === mapping[fieldSelector];
  });
  if (_.isEmpty(matchedTypes)) {
    console.log(`Couldn't find a matching node type for "${fieldSelector}"`);
    return;
  }

  var findNode = function findNode(fieldValue, path) {
    var linkedType = mapping[fieldSelector];
    var linkedNode = _.find(getNodes(), function (n) {
      return n.internal.type === linkedType && n.id === fieldValue;
    });
    if (linkedNode) {
      createPageDependency({ path, nodeId: linkedNode.id });
      return linkedNode;
    }
  };

  if (_.isArray(value)) {
    return {
      type: new GraphQLList(matchedTypes[0].nodeObjectType),
      resolve: function resolve(node, a, b, _ref3) {
        var fieldName = _ref3.fieldName;

        var fieldValue = node[fieldName];

        if (fieldValue) {
          return fieldValue.map(function (value) {
            return findNode(value, b.path);
          });
        } else {
          return null;
        }
      }
    };
  }

  return {
    type: matchedTypes[0].nodeObjectType,
    resolve: function resolve(node, a, b, _ref4) {
      var fieldName = _ref4.fieldName;

      var fieldValue = node[fieldName];

      if (fieldValue) {
        return findNode(fieldValue, b.path);
      } else {
        return null;
      }
    }
  };
}

function findLinkedNode(value, linkedField, path) {
  var linkedNode = void 0;
  // If the field doesn't link to the id, use that for searching.
  if (linkedField) {
    linkedNode = getNodes().find(function (n) {
      return n[linkedField] === value;
    });
    // Else the field is linking to the node's id, the default.
  } else {
    linkedNode = getNode(value);
  }

  if (linkedNode) {
    if (path) {
      createPageDependency({ path, nodeId: linkedNode.id });
    }
    return linkedNode;
  }
}

function inferFromFieldName(value, selector, types) {
  var isArray = false;
  if (_.isArray(value)) {
    isArray = true;
    // Reduce values to nodes with unique types.
    value = _.uniqBy(value, function (v) {
      return getNode(v).internal.type;
    });
  }

  var key = selector.split(`.`).pop();

  var _key$split = key.split(`___`),
      linkedField = _key$split[2];

  var validateLinkedNode = function validateLinkedNode(linkedNode) {
    invariant(linkedNode, oneLine`
        Encountered an error trying to infer a GraphQL type for: "${selector}".
        There is no corresponding node with the ${linkedField || `id`}
        field matching: "${value}"
      `);
  };
  var validateField = function validateField(linkedNode, field) {
    invariant(field, oneLine`
        Encountered an error trying to infer a GraphQL type for: "${selector}".
        There is no corresponding GraphQL type "${linkedNode.internal.type}" available
        to link to this node.
      `);
  };

  var findNodeType = function findNodeType(node) {
    return types.find(function (type) {
      return type.name === node.internal.type;
    });
  };

  if (isArray) {
    var linkedNodes = value.map(function (v) {
      return findLinkedNode(v);
    });
    linkedNodes.forEach(function (node) {
      return validateLinkedNode(node);
    });
    var fields = linkedNodes.map(function (node) {
      return findNodeType(node);
    });
    fields.forEach(function (field, i) {
      return validateField(linkedNodes[i], field);
    });

    var type = void 0;
    // If there's more than one type, we'll create a union type.
    if (fields.length > 1) {
      type = new GraphQLUnionType({
        name: `Union_${key}_${fields.map(function (f) {
          return f.name;
        }).join(`__`)}`,
        description: `Union interface for the field "${key}" for types [${fields.map(function (f) {
          return f.name;
        }).join(`, `)}]`,
        types: fields.map(function (f) {
          return f.nodeObjectType;
        }),
        resolveType: function resolveType(data) {
          return fields.find(function (f) {
            return f.name == data.internal.type;
          }).nodeObjectType;
        }
      });
    } else {
      type = fields[0].nodeObjectType;
    }

    return {
      type: new GraphQLList(type),
      resolve: function resolve(node, a) {
        var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        var fieldValue = node[key];
        if (fieldValue) {
          return fieldValue.map(function (value) {
            return findLinkedNode(value, linkedField, b.path);
          });
        } else {
          return null;
        }
      }
    };
  }

  var linkedNode = findLinkedNode(value, linkedField);
  validateLinkedNode(linkedNode);
  var field = findNodeType(linkedNode);
  validateField(linkedNode, field);
  return {
    type: field.nodeObjectType,
    resolve: function resolve(node, a) {
      var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      var fieldValue = node[key];
      if (fieldValue) {
        var result = findLinkedNode(fieldValue, linkedField, b.path);
        return result;
      } else {
        return null;
      }
    }
  };
}

function findRootNode(node) {
  // Find the root node.
  var rootNode = node;
  var whileCount = 0;
  while ((rootNode._PARENT || rootNode.parent) && (getNode(rootNode.parent) !== undefined || getNode(rootNode._PARENT)) && whileCount < 101) {
    if (rootNode._PARENT) {
      rootNode = getNode(rootNode._PARENT);
    } else {
      rootNode = getNode(rootNode.parent);
    }
    whileCount += 1;
    if (whileCount > 100) {
      console.log(`It looks like you have a node that's set its parent as itself`, rootNode);
    }
  }

  return rootNode;
}

function shouldInferFile(nodes, key, value) {
  var looksLikeFile = _.isString(value) && mime.lookup(value) !== `application/octet-stream` &&
  // domains ending with .com
  mime.lookup(value) !== `application/x-msdownload` && isRelative(value) && isRelativeUrl(value);

  if (!looksLikeFile) {
    return false;
  }

  // Find the node used for this example.
  var node = nodes.find(function (n) {
    return _.get(n, key) === value;
  });

  if (!node) {
    // Try another search as our "key" isn't always correct e.g.
    // it doesn't support arrays so the right key could be "a.b[0].c" but
    // this function will get "a.b.c".
    //
    // We loop through every value of nodes until we find
    // a match.
    var visit = function visit(current) {
      var selector = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      var fn = arguments[2];

      for (var i = 0, keys = Object.keys(current); i < keys.length; i++) {
        var _key = keys[i];
        var _value = current[_key];

        if (_value === undefined || _value === null) continue;

        if (typeof _value === `object` || typeof _value === `function`) {
          visit(current[_key], selector.concat([_key]), fn);
          continue;
        }

        var proceed = fn(current[_key], _key, selector, current);

        if (proceed === false) {
          break;
        }
      }
    };

    var isNormalInteger = function isNormalInteger(str) {
      return (/^\+?(0|[1-9]\d*)$/.test(str)
      );
    };

    node = nodes.find(function (n) {
      var isMatch = false;
      visit(n, [], function (v, k, selector, parent) {
        if (v === value) {
          // Remove integers as they're for arrays, which our passed
          // in object path doesn't have.
          var normalizedSelector = selector.map(function (s) {
            return isNormalInteger(s) ? `` : s;
          }).filter(function (s) {
            return s !== ``;
          });
          var fullSelector = `${normalizedSelector.join(`.`)}.${k}`;
          if (fullSelector === key) {
            isMatch = true;
            return false;
          }
        }

        // Not a match so we continue
        return true;
      });

      return isMatch;
    });

    // Still no node.
    if (!node) {
      return false;
    }
  }

  var rootNode = findRootNode(node);

  // Only nodes transformed (ultimately) from a File
  // can link to another File.
  if (rootNode.internal.type !== `File`) {
    return false;
  }

  var pathToOtherNode = normalize(joinPath(rootNode.dir, value));
  var otherFileExists = getNodes().some(function (n) {
    return n.absolutePath === pathToOtherNode;
  });
  return otherFileExists;
}

// Look for fields that are pointing at a file — if the field has a known
// extension then assume it should be a file field.
function inferFromUri(key, types) {
  var fileField = types.find(function (type) {
    return type.name === `File`;
  });

  if (!fileField) return;

  return {
    type: fileField.nodeObjectType,
    resolve: function resolve(node, a, _ref5) {
      var path = _ref5.path;

      var fieldValue = node[key];

      if (!fieldValue) {
        return null;
      }

      // Find File node for this node (we assume the node is something
      // like markdown which would be a child node of a File node).
      var parentFileNode = findRootNode(node);

      // Use the parent File node to create the absolute path to
      // the linked file.
      var fileLinkPath = normalize(systemPath.resolve(parentFileNode.dir, fieldValue));

      // Use that path to find the linked File node.
      var linkedFileNode = _.find(getNodes(), function (n) {
        return n.internal.type === `File` && n.absolutePath === fileLinkPath;
      });

      if (linkedFileNode) {
        createPageDependency({
          path,
          nodeId: linkedFileNode.id
        });
        return linkedFileNode;
      } else {
        return null;
      }
    }
  };
}

var EXCLUDE_KEYS = {
  id: 1,
  parent: 1,
  children: 1

  // Call this for the top level node + recursively for each sub-object.
  // E.g. This gets called for Markdown and then for its frontmatter subobject.
};function inferObjectStructureFromNodes(_ref6) {
  var nodes = _ref6.nodes,
      types = _ref6.types,
      selector = _ref6.selector,
      _ref6$exampleValue = _ref6.exampleValue,
      exampleValue = _ref6$exampleValue === undefined ? extractFieldExamples(nodes) : _ref6$exampleValue;

  var config = store.getState().config;
  var isRoot = !selector;
  var mapping = config && config.mapping;

  // Ensure nodes have internal key with object.
  nodes = nodes.map(function (n) {
    return n.internal ? n : (0, _extends3.default)({}, n, { internal: {} });
  });

  var inferredFields = {};
  _.each(exampleValue, function (value, key) {
    // Remove fields common to the top-level of all nodes.  We add these
    // elsewhere so don't need to infer their type.
    if (isRoot && EXCLUDE_KEYS[key]) return;

    // Several checks to see if a field is pointing to custom type
    // before we try automatic inference.
    var nextSelector = selector ? `${selector}.${key}` : key;
    var fieldSelector = `${nodes[0].internal.type}.${nextSelector}`;

    var fieldName = key;
    var inferredField = void 0;

    // First check for manual field => type mappings in the site's
    // gatsby-config.js
    if (mapping && _.includes(Object.keys(mapping), fieldSelector)) {
      inferredField = inferFromMapping(value, mapping, fieldSelector, types);

      // Second if the field has a suffix of ___node. We use then the value
      // (a node id) to find the node and use that node's type as the field
    } else if (_.includes(key, `___NODE`)) {
      ;
      var _key$split2 = key.split(`___`);

      fieldName = _key$split2[0];

      inferredField = inferFromFieldName(value, nextSelector, types);

      // Third if the field is pointing to a file (from another file).
    } else if (nodes[0].internal.type !== `File` && _.isString(value) && shouldInferFile(nodes, nextSelector, value)) {
      inferredField = inferFromUri(key, types);
    }

    // Finally our automatic inference of field value type.
    if (!inferredField) {
      inferredField = inferGraphQLType({
        nodes,
        types,
        exampleValue: value,
        selector: selector ? `${selector}.${key}` : key
      });
    }

    if (!inferredField) return;

    // Replace unsupported values
    inferredFields[createKey(fieldName)] = inferredField;
  });

  return inferredFields;
}
//# sourceMappingURL=infer-graphql-type.js.map