const _ = require('lodash');
const assert = require('assert');

const chai = require('chai');
const { expect } = chai;

const {
  preprocessBylawRules,
  mapSelectedNodes,
  selectNodes,
  getDependencies,
  findExecutionOrder,
  compileBylaws,
} = require('../src/bylaws');

const suppose = require('suppose');

suppose.defineFixture('simple_deps', (config) => {
  return preprocessBylawRules({
    a: {
      sources: ['/c'],
      actions: ['FOO_ACTION'],
      value: _.identity,
    },
    b: {
      sources: ['/a'],
      actions: ['FOO_ACTION'],
      value: _.identity,
    },
    c: {
      sources: [],
      actions: ['FOO_ACTION'],
      value: _.identity,
    }
  });
});

suppose.defineFixture('obj_with_foo', (config) => {
  return {
    a: {
      aa: {
        aaa: 'foo',
      },
    },
    b: {
      ba:  {
        baa: 1,
        bab: 'foo',
      },
    }
  };
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

describe('preprocessBylawRules', () => {
  it('crawls the bylaw tree and returns the bylaw rules in an array', () => {
    const bylaws = {
      a: {
        aa: {
          actions: ['FOO'],
          value: _.identity,
          sources: ['/b'],
        },
      },
      b: {

      }
    };

    const transformedRules = preprocessBylawRules(bylaws);
    expect(transformedRules).to.eql({
      a: {
        aa: [{
          actions: ['FOO'],
          value: _.identity,
          destPath: '/a/aa',
          sources: ['/b'],
          sourcesAbsolute: ['/b'],
        }],
      },
      b: {},
    });
  });
});

describe('getDependencies', () => {
  it('returns a object of all the ancestor dependencies keyed by their destination path', () => {
    const bylaws = suppose('simple_deps').render();

    const aDeps = getDependencies(bylaws, bylaws.a[0]);
    expect(Array.from(aDeps.values())).to.eql(['/c']);

    const bDeps  = getDependencies(bylaws, bylaws.b[0]);
    expect(Array.from(bDeps.values())).to.eql(['/a', '/c']);

    const cDeps  = getDependencies(bylaws, bylaws.c[0]);
    expect(Array.from(cDeps.values())).to.eql([]);
  });

  it('Detects circular dependencies', () => {
    const circularDepTree = preprocessBylawRules({
      a: {
        sources: ['/c'],
        actions: [],
        value: _.identity,
      },
      b: {
        sources: ['/a'],
        actions: [],
        value: _.identity,
      },
      c: {
        sources: ['/b'],
        actions: [],
        value: _.identity,
      }
    });

    expect(
      () => getDependencies(circularDepTree, circularDepTree.a[0])
    ).to.throw('Circular dependency detected');
  });
});

describe('findExecutionOrder', () => {
  it('returns a object of all the ancestor dependencies keyed by their destination path', () => {
    const bylaws = suppose('simple_deps').render();
    const order = findExecutionOrder(bylaws);
    expect(order.map(x => x.destPath)).to.eql(['/c', '/a', '/b']);
  });
});

describe('compileBylaws', () => {
  it('returns a function that executes the bylaws', () => {
    const valueFn = (x='p', y='q') => {
      return `${x + y}`;
    };

    // b -> a -> c
    const bylaws = preprocessBylawRules({
      a: {
        sources: ['/c'],
        actions: ['FOO_ACTION'],
        value: valueFn,
      },
      b: {
        sources: ['/a'],
        actions: ['FOO_ACTION'],
        value: valueFn,
      },
      c: {
        sources: [],
        actions: ['FOO_ACTION'],
        value: valueFn,
      }
    });

    // const order = findExecutionOrder(bylaws);
    // console.log('order:', order)

    const initialState = {
      a: 'a',
      b: 'b',
      c: 'c',
    };

    const action = {
      type: 'FOO_ACTION',
    };

    const reducer = compileBylaws(bylaws);
    expect(_.isFunction(reducer)).to.be.true;

    const nextState = reducer(initialState, action);
    expect(nextState).to.eql({
      c: 'cq',
      a: 'acq',
      b: 'bacq',
    });
  });
});
