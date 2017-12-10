const _ = require('lodash');
const assert = require('assert');
const sinon = require('sinon');
const chai = require('chai');
const { expect } = chai;

const {
  pathStringToKeys,
  pathArrayToPathStr,
  pathJoin,
  isAbsolutePath,
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
