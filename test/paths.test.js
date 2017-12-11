const _ = require('lodash');
const assert = require('assert');
const sinon = require('sinon');
const chai = require('chai');
const { expect } = chai;
const suppose = require('suppose');

const {
  pathStringToKeys,
  pathArrayToPathStr,
  pathJoin,
  isAbsolutePath,
  mapSelectedNodes,
  selectNodes,
} = require('../src/paths');

describe('pathStringToKeys', () => {
  it('parses the path strings', () => {
    expect(pathStringToKeys('/a/b')).to.eql(['a', 'b']);
    expect(pathStringToKeys('./a/b')).to.eql(['.', 'a', 'b']);
    expect(pathStringToKeys('/')).to.eql([]);
  });
});

describe('pathJoin', () => {
  it('resolves paths', () => {
    expect(pathJoin('/a/b/c', 'd')).to.equal('/a/b/c/d');
    expect(pathJoin('/a/b/c', '../d')).to.equal('/a/b/d');
    expect(pathJoin('/a/b/c', '../../d')).to.equal('/a/d');
    expect(pathJoin('/', './')).to.equal('/');
  });
});


describe('isAbsolutePath', () => {
  it('returns whether the path is absolute or not', () => {
    expect(isAbsolutePath('/')).to.equal(true);
    expect(isAbsolutePath('a')).to.equal(false);
    expect(isAbsolutePath('/a/b/c')).to.equal(true);
    expect(isAbsolutePath('/a/b/c/..')).to.equal(true);
    expect(isAbsolutePath('a/b/c/..')).to.equal(false);
    expect(isAbsolutePath('./a/b/c/..')).to.equal(false);
  });
});

describe('mapSelectedNodes', () => {
  it('maps over each node in the tree and sets a new value for each node where isSelected=true', () => {
    const objectTree = suppose('obj_with_foo').render();

    const verify = (tree, val) => (
      tree.a.aa.aaa === val
      &&  tree.b.ba.baa === 1
      && tree.b.ba.bab === val
    );

    expect(verify(objectTree, 'foo'));
    const newTree = mapSelectedNodes(objectTree, x => x === 'foo', x => 'bar');
    expect(verify(newTree, 'bar'));
  });
});



describe('selectNodes', () => {
  it('returns an array of the nodes that match the condition', () => {
    const objectTree = suppose('obj_with_foo').render();
    const nodes = selectNodes(objectTree, x => x === 'foo');
    expect(nodes.length).to.equal(2)
  });
});
