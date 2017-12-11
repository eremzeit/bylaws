const _ = require('lodash');
const assert = require('assert');

const enableDebugging = false;

const {
  pathStringToKeys,
  pathArrayToPathStr,
  pathJoin,
  isAbsolutePath,
  dirPathAndFileName,
  mapSelectedNodes,
  selectNodes,
  selectNodesAndPaths,
} = require('./paths');

function isBylawRule(object) {
  return object
      && object.__bylaw
}

function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }

  return typeof obj[Symbol.iterator] === 'function'
    && !_.isString(obj);
}

const isLeafNode = _node => isBylawRule(_node) || !_.isObject(_node);

const isValidLeafNode = _node => isBylawRule(_node) ||
  (_.isArray(_node) && !_node.find(x => !isBylawRule(x)));

// mapLeafNodes(node, mapFn) -> Array
const mapLeafNodes = _.curry(mapSelectedNodes)(_, isValidLeafNode, _);

function relativeToAbsolute(_currentPathStr) {
  return (_relativePath) => {
    if (isAbsolutePath(_relativePath)) {
      return _relativePath;
    } else {
      let [dirPath, fileName] = dirPathAndFileName(_currentPathStr);
      return pathJoin(dirPath, _relativePath);
    }
  };
}

const getTriggersActions = (_rule) => _.get(_rule, ['actions'], []);

function preprocessBylawRules(_bylawNode) {
  const tree = mapLeafNodes(
    _bylawNode,
    (_nodes, _currentPathArray) => {
      let nodes = _nodes;

      if (!isValidLeafNode(_nodes)) {
        // If we get here then our selection fn was incorrect or they inputed an invalid rule syntax
        console.error('Errant path:', _currentPathArray)
        throw new BylawError('Bylaw parsing error.  Did you call the bylaw function on your rule? ' + "'" + _nodes + "'");
      }

      if (_.isString(nodes)) {
        throw new BylawError('Bylaw parsing error.');
      } else if (isBylawRule(nodes)) {
        nodes = [nodes];
      }

      if (isIterable(nodes) && !_.isString(nodes)) {
        return _.map(nodes, (_x) => {
          //console.log('_x:', _x)
          // annotate the original nodes with some reference information
          const destPath = pathArrayToPathStr(_currentPathArray, true);

          const sources = _x.sources || [];

          const currentPathStr = pathArrayToPathStr(_currentPathArray, true);
          const sourcesAbsolute = sources.map(relativeToAbsolute(currentPathStr));

//           console.log('')
//           console.log('processing node at:', destPath)
//           console.log('sources:', sourcesAbsolute)
//
          //console.log(`abs sources at ${destPath}: `, sourcesAbsolute);
          const r = Object.assign({}, _x, {
            destPath,
            sourcesAbsolute,
          });

          //console.log('processed node:', r)
          return r;
        });
      } else {
        return nodes;
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

function isPathLeafNode(_bylawNode, _path) {
  return isLeafNode(findNodeAtPath(_bylawNode, _path));
}

function getSourceDependencies(_bylawTree, _rule, _visited=[]) {
  return getDependencies(_bylawTree, _rule, _visited, x => x.sourcesAbsolute);
}

function getTriggerDependencies(_bylawTree, _rule, _visited=[]) {
  return getDependencies(_bylawTree, _rule, _visited, x => x.triggersAbsolute);
}

function getAllDependencies(_bylawTree, _rule, _visited=[]) {
  return getDependencies(
    _bylawTree,
    _rule,
    _visited,
    x => [].concat(x.sourcesAbsolute)
  );
}

const ind = x => Array(x+2).join('    ');

// A rule X depends on another rule Y if the first rule has a source that is equal (or is a parent directory) to the destination path of rule Y.
// Could potentially be sped up by memoization
function getDependencies(_bylawTree, _rule, _visited=[], _pathSelector, _depth = 0) {
  //console.log(`deps for '${_rule.destPath}'`);
  assert(_rule, 'rule must exist');

  //console.log(`${ind(_depth)}getDependencies:(${_rule.destPath})`);

  if (_visited[_rule.destPath]) {
    return {};
  }

  _visited[_rule.destPath] = _rule;

  let dependentRules = _.chain(_pathSelector(_rule))
    .flatMap((depPath) => {
      const r = getChildRulesAtPath(_bylawTree, depPath);
      // console.log(ind(_depth), 'children:', r.map(x => x.destPath));
      return r;
    })

    .map((depRule) => {
      let ancestorDepRules = getDependencies(_bylawTree, depRule, _visited, _pathSelector, _depth + 1);

      if (ancestorDepRules[_rule.destPath]) {
        throw new Error(`Dependency cycle was detected at path: ${_rule.destPath}`);
      }

      return Object.assign({},
        {
          [depRule.destPath]: depRule
        },

        ancestorDepRules
      );
    })

    .reduce((x, acc) => {
      return Object.assign({}, acc, x);
    }, {})

    .value();

  // console.log(ind(_depth), '->', _.keys(dependentRules))
  // console.log('')
  return dependentRules;
};

function ruleOrderComparator(_bylawTree, _rule1, _rule2) {
  const getDeps = _.partial(getAllDependencies, _bylawTree);

  if (getDeps(_rule1)[_rule2.destPath]) {
    //console.log(`${_rule1.destPath} depends on ${_rule2.destPath}`)
    return 1;
  } else if (getDeps(_rule2)[_rule1.destPath]) {
    //console.log(`${_rule2.destPath} depends on ${_rule1.destPath}`)
    return -1;
  } else {
    //console.log('neither depends on the other')
    return 0;
  }
}

// returns an array of bylaw rules in order that reflects their execution order
function findExecutionOrder(_bylawTree) {
  let rules = selectRuleNodes(_bylawTree);
  rules.sort(_.partial(ruleOrderComparator, _bylawTree));
  return rules;
}

const _defaultConfig = {
  updateStateAtPath: _.set,
  getStateAtPath: _.get,
  ruleMatcher: (rule, actionItem) => {
    return getTriggersActions(rule).find(x => x === actionItem.type)
  },
};

function compileBylaws(_bylaws, _config=_defaultConfig) {
  const bylawTree = preprocessBylawRules(_bylaws);
  const rules = findExecutionOrder(bylawTree);

  //console.log('rules:', rules.map(x => _.pick(x, ['destPath', 'sourcesAbsolute', 'sourcesAbsolute'])))

  const orderMap = _.chain(rules)
    .map((x, i) => [x.destPath, i])
    .fromPairs()
    .value();

  return (state, action) => {
    log('-----------------')
    log('EXECUTING ', action)
    return _.chain(rules)

      // filter to those that match the action
      .filter(rule => _config.ruleMatcher(rule, action))

      // merge in all the dependent rules
      .map((primaryRule) => {
        //find the rules that depend on this rule
        const dependantRules = rules.filter(r => {
          return getAllDependencies(bylawTree, r)[primaryRule.destPath];
        });

        // log(primaryRule.destPath, 'is relied on by', dependantRules.map(x => x.destPath));

        return [primaryRule].concat(dependantRules);
      })
      .flatten()
      .sortBy(rule => orderMap[rule.destPath])

       // clear out any duplicates
      .uniqBy(rule => rule.destPath)

      .tap(rules => {
        log('execution order:', rules.map(x => x.destPath))
      })

      // reduce our list of rules into the next state
      .reduce((state, rule) => {
        let currentState = _config.getStateAtPath(state, pathStringToKeys(rule.destPath));

        if (_.isUndefined(currentState)) {
          currentState = rule.initialValue;
        }

        const dependencyArgs = rule.sourcesAbsolute.map(path => {
          return _config.getStateAtPath(state, pathStringToKeys(path));
        });

        const args = [action, currentState].concat(dependencyArgs);
        const value = rule.value.apply(null, args);
        log(rule.destPath,':', args, ' -> ')

        const newState = _config.updateStateAtPath(state, pathStringToKeys(rule.destPath), value);

        return newState;
      }, state).value();
  };
}

function bylaw(obj) {
  return Object.assign({}, obj, {__bylaw: true});
}

function log() {
  if (enableDebugging) {
    console.log.apply(null, Array.from(arguments));
  }
}

class BylawError extends Error {}


module.exports = {
  compileBylaws,
  mapSelectedNodes,
  selectNodesAndPaths,
  findExecutionOrder,
  selectNodes,
  preprocessBylawRules,
  getDependencies,
  getTriggerDependencies,
  getAllDependencies,
  bylaw,
  isBylawRule,
};
