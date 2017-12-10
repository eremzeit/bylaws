const _ = require('lodash');
const assert = require('assert');

const {
  pathStringToKeys,
  pathArrayToPathStr,
  pathJoin,
  isAbsolutePath,
  dirPathAndFileName,
} = require('./paths');

// this is a bit awkward.  In the next version detection
// should be done either 1) via a reserved keyword or 2)
// by somehow via the observation that bylaw rules don't have any
// great-grandchildren
// leaf-nodes,
function isBylawRule(object) {
  return object
      && object.hasOwnProperty('value')
      && object.hasOwnProperty('triggers')
}

function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }

  return typeof obj[Symbol.iterator] === 'function';
}


function mapSelectedNodes(_object, _isSelected, _mapFn, _currentPath = []) {
  const keyValuesPairs = _.entries(_object);

  assert(!_.isString(_object), 'Object cannot be a string');

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

const getTriggersActions = (_rule) => _.get(_rule, ['triggers', 'actions'], []);
const getTriggersOnExec = (_rule) => _.get(_rule, ['triggers', 'onExec'], []);

function preprocessBylawRules(_bylawNode) {
  const tree = mapLeafNodes(
    _bylawNode,
    (_nodes, _currentPathArray) => {
      let nodes = _nodes;

      if (isBylawRule(nodes)) {
        nodes = [nodes];
      }

      if (isIterable(nodes) && !_.isString(nodes)) {
        return _.map(nodes, (_x) => {
          //console.log('_x:', _x)
          // annotate the original nodes with some reference information
          const destPath = pathArrayToPathStr(_currentPathArray, true);

          const sources = _x.sources || [];
          const triggers = getTriggersOnExec(_x) || [];

          const currentPathStr = pathArrayToPathStr(_currentPathArray, true);
          const sourcesAbsolute = sources.map(relativeToAbsolute(currentPathStr));
          const triggersAbsolute = triggers.map(relativeToAbsolute(currentPathStr));

//           console.log('')
//           console.log('processing node at:', destPath)
//           console.log('sources:', sourcesAbsolute)
//           console.log('triggers:', triggersAbsolute)
//
          //console.log(`abs sources at ${destPath}: `, sourcesAbsolute);
          const r = Object.assign({}, _x, {
            destPath,
            sourcesAbsolute,
            triggersAbsolute,
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


function getTriggerDependencies(_bylawTree, _rule, _visited=[]) {
  return getDependencies(_bylawTree, _rule, _visited, x => x.triggersAbsolute);
}

function getAllDependencies(_bylawTree, _rule, _visited=[]) {
  return getDependencies(
    _bylawTree,
    _rule,
    _visited,
    x => [].concat(x.triggersAbsolute).concat(x.sourcesAbsolute)
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
    // console.log('-----------------')
    // console.log('EXECUTING ', action)
    return _.chain(rules)


      // filter to those that match the action
      .filter(rule => _config.ruleMatcher(rule, action))

      // merge in all the dependent rules
      .map((primaryRule) => {
        // console.log('primaryRule: ', primaryRule.destPath);

        // Find the rules that this rule depends on
        const providerRules = _.values(getTriggerDependencies(bylawTree, primaryRule));

        // console.log(primaryRule.destPath, ' relies on:', providerRules.map(x => x.destPath));

        //find the rules that depend on this rule
        const dependantRules = rules.filter(r => {
          return getTriggerDependencies(bylawTree, r)[primaryRule.destPath];
        });

        //console.log(primaryRule.destPath, 'is relied on by', dependantRules.map(x => x.destPath));

        return [primaryRule].concat(providerRules).concat(dependantRules);
      })
      .flatten()
      .sortBy(rule => orderMap[rule.destPath])

       // clear out any duplicates
      .uniqBy(rule => rule.destPath)

      //.tap(rules => {
      //  console.log('execution order:', rules.map(x => x.destPath))
      //})

      // reduce our list of rules into the next state
      .reduce((state, rule) => {

        if(!rule.sourcesAbsolute) {
          console.log('missing!', rule);
        }

        const dependencyArgs = [rule.destPath].concat(rule.sourcesAbsolute).map(path => {
          return _config.getStateAtPath(state, pathStringToKeys(path));
        });

        //console.log(rule.destPath,':', dependencyArgs)
        const args = [action].concat(dependencyArgs);
        const value = rule.value.apply(null, args);

        const newState = _config.updateStateAtPath(state, pathStringToKeys(rule.destPath), value);

        return newState;
      }, state).value();
  };
}


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
};
