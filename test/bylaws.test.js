const _ = require('lodash');
const assert = require('assert');
const sinon = require('sinon');
const chai = require('chai');
const { expect } = chai;

const {
  compileBylaws,
  mapSelectedNodes,
  selectNodesAndPaths,
  findExecutionOrder,
  selectNodes,
  preprocessBylawRules,
  getDependencies,
  getAllDependencies,
  getTriggerDependencies,
} = require('../src/bylaws');

const suppose = require('suppose');

suppose.defineFixture('simple_deps', (config) => {
  return preprocessBylawRules({
    a: {
      triggers: {
        actions: ['FOO_ACTION'],
        onExec: ['/c'],
      },

      sources: ['/c'],
      value: _.identity,
    },
    b: {
      triggers: {
        actions: ['FOO_ACTION'],
        onExec: ['/a'],
      },
      sources: ['/a'],
      value: _.identity,
    },
    c: {
      triggers: {
        onExec: [],
        actions: ['FOO_ACTION'],
      },
      sources: [],
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
          triggers: {
            actions: ['FOO'],
          },
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
          triggers: {
            actions: ['FOO'],
          },
          value: _.identity,
          destPath: '/a/aa',
          sources: ['/b'],
          sourcesAbsolute: ['/b'],
          triggersAbsolute: [],
        }],
      },
      b: {},
    });
  });
});

describe('getTriggerDependencies', () => {
  it('returns a object of all the ancestor dependencies keyed by their destination path', () => {
    const bylaws = suppose('simple_deps').render();

    const aDeps = getTriggerDependencies(bylaws, bylaws.a[0]);
    expect(_.keys(aDeps)).to.eql(['/c']);

    const bDeps  = getTriggerDependencies(bylaws, bylaws.b[0]);
    expect(_.keys(bDeps)).to.eql(['/a', '/c']);

    const cDeps  = getTriggerDependencies(bylaws, bylaws.c[0]);
    expect(_.keys(cDeps)).to.eql([]);
  });
});

describe('getAllDependencies', () => {
  it('Detects circular dependencies', () => {
    // a -> c -> b -> a
    const circularDepTree = preprocessBylawRules({
      a: {
        triggers: {
          actions: [],
        },
        sources: ['/c'],
        value: _.identity,
      },
      b: {
        triggers: {
          actions: [],
        },
        sources: ['/a'],
        value: _.identity,
      },
      c: {
        triggers: {
          actions: [],
        },
        sources: ['/b'],
        value: _.identity,
      }
    });

    expect(
      () => getAllDependencies(circularDepTree, circularDepTree.a[0])
    ).to.throw('Dependency cycle');
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
    let count = 0;
    const valueFn = (action, arg1, arg2) => {
      return arg1 + arg2;
    };
    // const valueFn = sinon.spy((action, arg1, arg2) => {
    //   return arg1 + arg2;
    // });

    // dependency chain is a -> b -> c -> d
    const bylaws = preprocessBylawRules({
      a: {
        triggers: {
          actions: ['FOO_ACTION'],
        },
        sources: ['/b'],
        value: valueFn,
      },
      b: {
        triggers: {
          actions: ['FOO_ACTION'],
        },
        sources: ['/c'],
        value: valueFn,
      },
      c: {
        triggers: {
          actions: ['FOO_ACTION'],
        },
        sources: ['/d'],
        value: valueFn,
      },
      d: {
        triggers: {
          actions: ['FOO_ACTION'],
        },
        sources: [],
        value: () => 'd'
      }
    });

    const initialState = {
      a: 'a',
      b: 'b',
      c: 'c',
      d: 'd'
    };

    const action = {
      type: 'FOO_ACTION',
    };

    const reducer = compileBylaws(bylaws);
    expect(_.isFunction(reducer)).to.be.true;

    const nextState = reducer(initialState, action);
    expect(nextState).to.eql({
      a: 'abcd',
      b: 'bcd',
      c: 'cd',
      d: 'd',
    });
  });


  it('handles proper execution of a game-like state tree', () => {
    const incScore = (action, score = 0) => score + 1;


    const bylawReducer = compileBylaws({
      currentGame: {
        player1Score: {
          triggers: {
            actions: ['INC_PLAYER1_SCORE'],
          },
          value: incScore,
        },
        player2Score: {
          triggers: {
            actions: ['INC_PLAYER2_SCORE'],
          },
          value: incScore,
        },

        winner: {
          triggers: {
            onExec: ['./player2Score', './player1Score'],
          },
          sources: ['./player1Score', './player2Score'],
          value: (action, winner, score1, score2) => {
            const targetScore = 5;
            if (score1 >= targetScore) {
              return 'player1';
            } else if (score2 >= targetScore) {
              return 'player2';
            }
          }
        },
      },

      highScore: {
        default: 0,

        triggers: {
          onExec: ['/currentGame/player1Score', '/currentGame/player2Score'],
        },

        sources: ['/currentGame/player1Score', '/currentGame/player2Score'],
        value: (action, highScore, score1, score2) => _.max([highScore, score1, score2])
      },
    });

    const state = _.chain([])
      .concat(_.times(4, () => ({ type: 'INC_PLAYER1_SCORE' })))
      .concat(_.times(5, () => ({ type: 'INC_PLAYER2_SCORE' })))
      .reduce(bylawReducer, {})
      .value();

    expect(_.get(state, ['currentGame', 'player1Score'])).to.equal(4);
    expect(_.get(state, ['currentGame', 'player2Score'])).to.equal(5);
    expect(_.get(state, ['currentGame', 'winner'])).to.equal('player2');
    expect(_.get(state, ['highScore'])).to.equal(5);
  });
});
