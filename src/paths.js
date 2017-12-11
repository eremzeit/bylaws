const _ = require('lodash');
const assert = require('assert');
const DELIMITER = '/';

function relativeFilePathToAbsolute (_cwdPathStr) {
  return (_relativePathStr) => {
    if (isAbsolutePath(_relativePathStr)) {
      return _relativePathStr;
    } else {
      const currentPathArray = pathStringToKeys(_cwdPathStr);
      const cwdPathArray = _.initial(currentPathArray);
      const fileName = _.last(currentPathArray);
      const dirPath = pathJoin(_relativePathStr, pathArrayToPathStr(cwdPathArray, true));
      const r = pathArrayToPathStr(pathJoin(dirPath, fileName));
      //onsole.log('relativePathToAbsolute', [_relativePathStr, _cwdPathStr, r]);
      return r;
    }
  };
};

// NOTE: dirPathStr must be exactly what it says, a path to a dir.  In this case,
// by dir we just mean a non-leaf node.  The '..' operator only works on directories
// so passing in a file path as an argument will confuse this function.
function pathJoin(path1, path2) {
  assert(!isAbsolutePath(path2), 'The second path must not be absolute');

  let path = [path1, path2].join(DELIMITER).replace(/[/]+/, '/');
  const pathSegments = pathStringToKeys(path);
  const isAbsolute = isAbsolutePath(path);
  let newPath = [];

  pathSegments.forEach((segment) => {
    if (segment === '.') {
      //nothing
    } else if (segment === '..') {
      if (newPath.length === 0) {
        throw new Error('Cannot resolve path below the root');
      }

      newPath.pop();
    } else if (segment) {
      newPath.push(segment);
    }


  });

  let result = pathArrayToPathStr(newPath);
  if (isAbsolute && result !== DELIMITER) {
    result = '/' + result;
  }

  return result;
}

function pathArrayToPathStr(_pathArray, isAbsolute) {
  let pathArray = _pathArray;

  if (_.isString(pathArray)) {
    pathArray = pathStringToKeys(pathArray);
  }

  if (pathArray.length === 0) {
    return '/';
  }

  pathArray = pathArray.map((x) => {
    if (!x.match(/^[_.\-a-zA-Z0-9]+$/)) {
      throw new Error(`Must use valid characters in bylaw path: '${x}'`);
    }

    return x;
  });

  if (isAbsolute) {
    return ensureAbsolutePath(pathArray.join(DELIMITER));
  } else {
    return pathArray.join(DELIMITER);
  }
}

function isAbsolutePath(path) {
  return path.length && path[0] === DELIMITER;
}

function removeLeadingSlash(path) {
  return path.replace(/^\//, '').replace(/\/$/, '')
}

function pathStringToKeys(_path) {
  assert(_.isString(_path), `path should be a string ${_path}`);

  const path = removeLeadingSlash(_path);
  if (path.length) {
    return path.split(DELIMITER)
  } else {
    return [];
  }
}

function ensureAbsolutePath(path) {
  if (isAbsolutePath(path)) {
    return path;
  } else {
    return DELIMITER + path;
  }
}



function dirPathAndFileName(filePath) {
  for (let i = filePath.length - 1; i >= 0; i--) {
    if (filePath[i] ===  DELIMITER) {
      let fileName = null;
      if (i < filePath.length - 1) {
        fileName = filePath.substring(i+1)
      }
      return [
        filePath.substring(0, i),
        fileName
      ];
    }
  }

  return [
    filePath,
    null
  ];
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
    } else if (_.isObject(value)){
      return [key, mapSelectedNodes(value, _isSelected, _mapFn, currentPath)];
    }
  }).compact().fromPairs().value();
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

module.exports = {
  pathStringToKeys,
  pathJoin,
  relativeFilePathToAbsolute,
  isAbsolutePath,
  pathArrayToPathStr,
  dirPathAndFileName,
  mapSelectedNodes,
  selectNodes,
  selectNodesAndPaths
};
