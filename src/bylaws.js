const _ = require('lodash');
const assert = require('assert');
const DELIMITER = '/';

// this is a bit awkward.  In the next version detection
// should be done either 1) via a reserved keyword or 2)
// by somehow via the observation that bylaw rules don't have any
// great-grandchildren
// leaf-nodes,
function isBylawRule(object) {
  return object
      && object.hasOwnProperty('actions')
      && object.hasOwnProperty('value');
}

function pathJoin(_pathArray, isAbsolute) {
  assert(_.isArray(_pathArray));

  if (_pathArray.length === 0) {
    return '/';
  }

  const pathArray = _pathArray.map((x) => {
    if (!x.match(/^[a-zA-Z0-9_-]+$/)) {
      throw new Error('Must use valid characters in bylaw path');
    }

    return x;
  });

  if (isAbsolute) {
    return ensureAbsolutePath(pathArray.join(DELIMITER));
  } else {
    return pathArray.join(DELIMITER);
  }
}

function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

function isAbsolutePath(path) {
  return path.length && path[0] === DELIMITER;
}

function removeLeadingSlash(path) {
  if (isAbsolutePath) {
    return path.substr(1)
  } else {
    return path;
  }
}

function pathStringToKeys(path) {
  return path.replace(/^\//, '').split(DELIMITER)
}

function ensureAbsolutePath(path) {
  if (isAbsolutePath(path)) {
    return path;
  } else {
    return DELIMITER + path;
  }
}

function resolvePath(path, currentPath = DELIMITER) {
  if (currentPath.length === 0 || currentPath[0] !== DELIMITER) {
    throw new Error('currentPath must be a non-empty absolute path');
  }

  const isAbsolute = isAbsolutePath(path);

  // find starting point before parsing
  let newPath
  if (isAbsolute) {
    newPath = [];
  } else {
    newPath = removeLeadingSlash(currentPath).split(DELIMITER);
  }

  const pathSegments = removeLeadingSlash(path).split(DELIMITER);

  pathSegments.forEach((segment) => {
    if (segment === '.') {
      //nothing
    } else if (segment === '..') {
      newPath.pop();
    } else if (segment) {
      newPath.push(segment);
    }
  });

  return pathJoin(newPath, true);
}

function mapSelectedNodes(_object, _isSelected, _mapFn, _currentPath = []) {
  const keyValuesPairs = _.entries(_object);

  return _.chain(_object).toPairs().map((pair) => {
    const [key, value] = pair;
    const currentPath = _currentPath.slice();
    currentPath.push(key);

    if (_isSelected(value)) {
      const mappedValue = _mapFn(value, currentPath);
      return [key, mappedValue];
    } else {
      return [key, mapSelectedNodes(value, _isSelected, _mapFn, currentPath)];
    }
  }).fromPairs().value();
}

// Traverses the tree and returns a last of nodes that return true
// when passed into _selectFn.
function selectNodesAndPaths(_object, _selectFn) {
  const nodes = [];

  const _selectNodes = (_object, _currentPath=[]) => {
    const keyValuesPairs = _.entries(_object);
    _.chain(_object).toPairs().each((pair) => {

      const [key, value] = pair;
      const currentPath = _currentPath.slice();
      currentPath.push(key);

      if (_selectFn(value)) {
        nodes.push([currentPath, value]);
      } else if (_.isObject(value)) {
        _selectNodes(value, currentPath);
      }
    }).fromPairs().value();
  };

  if (_selectFn(_object)) {
    nodes.push([[], _object]);
  } else {
    _selectNodes(_object);
  }

  return nodes;
}

function selectNodes(_object, _selectFn) {
  return _.map(
    selectNodesAndPaths(_object, _selectFn),
    x => x[1]
  );
}

const isLeafNode = _node => isBylawRule(_node) || _.isArray(_node);
const mapLeafNodes = _.curry(mapSelectedNodes)(_, isLeafNode, _);

function preprocessBylawRules(_bylawNode) {
  const tree = mapLeafNodes(
    _bylawNode,
    (_node, _currentPath) => {
      let node = _node;

      if (isBylawRule(node)) {
        node = [node];
      }

      if (isIterable(node)) {
        return _.map(node, (_x) => {
          const sources = _x.sources || [];

          // annotate the original node with some reference information
          return Object.assign({}, _x, {
            destPath:  pathJoin(_currentPath, true),
            sourcesAbsolute: sources.map(_source => resolvePath(_source, pathJoin(_currentPath, true))),
          });
        });
      } else {
        return node;
      }
  });

  return tree;
}

function selectRuleNodes (_object) {
  const nodes = selectNodes(_object, (node) => isBylawRule(node) || _.isArray(node));

  const unwrapped = _.map(nodes, (x) => {
    if (_.isArray(x)) {
      return x[0];
    }

    return x;
  });

  return unwrapped;
};

function getChildRulesAtPath(bylawNode, path) {
  const subTree = findNodeAtPath(bylawNode, path);
  return selectRuleNodes(subTree);
}

function findNodeAtPath(_bylawTree, _path) {
  let path = _path;

  if (_.isString(path)) {
    path = pathStringToKeys(path);
  }

  return _.get(_bylawTree, path);
}

// A rule X depends on another rule Y if the first rule has a source that is equal (or is a parent directory) to the destination path of rule Y.
// Could potentially be sped up by memoization
function getDependencies(_bylawTree, _rule, _visited=new Set()) {
  assert(_rule, 'rule must exist');

  if (_visited.has(_rule.destPath)) {
    return new Set()
  }
  _visited.add(_rule.destPath);

  const dependentRules = _.chain(_rule.sourcesAbsolute).flatMapDeep((sourcePath) => {
    return getChildRulesAtPath(_bylawTree, sourcePath);
  }).map((depRule) => {
    let dependentRules = new Set([depRule.destPath]);

    let ancestorDepRules = depRule.dependentRules ?
      depRule.dependentRules
      : getDependencies(_bylawTree, depRule, _visited);

    return new Set([...dependentRules, ...ancestorDepRules]);
  }).reduce((x, acc) => {
    return new Set([...acc, ...x])
  }, new Set()).value();

  _rule.dependentRules = dependentRules;
  if (dependentRules.has(_rule.destPath)) {
    throw new Error('Circular dependency detected');
  }

  return dependentRules;
};

function ruleOrderComparator(_bylawTree, _rule1, _rule2) {
  const getDeps = _.partial(getDependencies, _bylawTree);
  if (getDeps(_rule1).has(_rule2.destPath)) {
    //console.log(`${_rule1.destPath} depends on ${_rule2.destPath}`)
    return 1;
  } else if (getDeps(_rule2).has(_rule1.destPath)) {
    //console.log(`${_rule2.destPath} depends on ${_rule1.destPath}`)
    return -1;
  } else {
    //console.log('neither depends on the other')
    return 0;
  }
}

// returns an array of bylaw rules in order that reflects their execution order
function findExecutionOrder(_bylawTree) {
  const bylawTree = preprocessBylawRules(_bylawTree);
  let rules = selectRuleNodes(bylawTree);
  rules.sort(_.partial(ruleOrderComparator, _bylawTree));
  return rules;
}

const _defaultConfig = {
  updateStateAtPath: _.set,
  getStateAtPath: _.get,
  ruleMatcher: (rule, actionItem) => {
    return rule.actions.find(x => x === actionItem.type)
  },
};

function compileBylaws(_bylaws, _config=_defaultConfig) {
  const rules = findExecutionOrder(_bylaws);

  return (state, action) => {
    return _.chain(rules)
      .filter(rule => _config.ruleMatcher(rule,action))
      .reduce((state, rule) => {
        const args = [rule.destPath].concat(rule.sourcesAbsolute).map(path => _config.getStateAtPath(state, pathStringToKeys(path)));
        const value = rule.value.apply(null, args);
        const newState = _config.updateStateAtPath(state, pathStringToKeys(rule.destPath), value);
        // console.log(`Setting ${rule.destPath} to value ${value}`);

        return newState;
      }, state).value();
  };
}


module.exports = {
  resolvePath,
  mapSelectedNodes,
  selectNodesAndPaths,
  selectNodes,
  preprocessBylawRules,
  getDependencies,
  findExecutionOrder,
  compileBylaws,
};
