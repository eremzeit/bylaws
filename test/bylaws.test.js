const _ = require('lodash');
const assert = require('assert');
const sinon = require('sinon');
const chai = require('chai');
const { expect } = chai;
const suppose = require('suppose');

const {
  makeBylawReducer,
  selectNodesAndPaths,
  findExecutionOrder,
  preprocessBylawRules,
  getDependencies,
  getAllDependencies,
  getTriggerDependencies,
  bylaw,
  isBylawRule,
} = require('../src/bylaws');


suppose.defineFixture('simple_deps', (config) => {
  return preprocessBylawRules({
    a: bylaw({
      actions: ['FOO_ACTION'],
      sources: ['/c'],
      value: _.identity,
    }),
    b: bylaw({
      actions: ['FOO_ACTION'],
      sources: ['/a'],
      value: _.identity,
    }),
    c: bylaw({
      actions: ['FOO_ACTION'],
      value: _.identity,
    })
  });
});

suppose.defineFixture('path_params', (config) => {
  return preprocessBylawRules({
    a: {
      '{b}/{c}/{d}': bylaw({
        actions: ['FOO_ACTION'],

        // allows us to define the domain (the set of all possible inputs) that this
        // dynamic rule needs to keep tabs for.
        whereIsIn: {
          b: ['foo', 'bar', 'baz'],

          c: (domain) => {
            //domain.keys.b
            //domain.keys.c
            //domain.keys.d
            //domain.parent

            return bVal.keys();
          },

          d: (cKey, cVal) => {
            //domain.keys.b
            //domain.keys.c
            //domain.keys.d
            //domain.parent
            return cVal.keys();
          }
        },

        nextValue: (domain) {
          // domain.sources
          // domain.params.b
          // domain.params.c
          // domain.params.d
          // domain.current
          // domain.action
          //
          return nextState;
        },
      }),
    },
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

describe('bylaw', () => {
  it('tags an object that can be recognized as a rule rule', () => {
    expect(bylaw({})).to.eql({__bylaw:true});
  });
});

describe('isBylawRule', () => {
  it('can recognize when an object is a bylaw rule', () => {
    expect(
      isBylawRule(
        bylaw({})
      )
    ).to.equal(true);
  });
});

describe('preprocessBylawRules', () => {
  it('crawls the bylaw tree and returns the bylaw rules in an array', () => {
    const bylaws = {
      a: {
        aa: bylaw({
          actions: ['FOO'],
          value: _.identity,
          sources: ['/b'],
        }),
      },
      b: {

      }
    };

    const transformedRules = preprocessBylawRules(bylaws);
    expect(transformedRules).to.eql({
      a: {
        aa: [{
          __bylaw: true,
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

//[describe('getTriggerDependencies', () => {
//[  it('returns a object of all the ancestor dependencies keyed by their destination path', () => {
//[    const bylaws = suppose('simple_deps').render();
//[
//[    const aDeps = getTriggerDependencies(bylaws, bylaws.a[0]);
//[    expect(_.keys(aDeps)).to.eql(['/c']);
//[
//[    const bDeps  = getTriggerDependencies(bylaws, bylaws.b[0]);
//[    expect(_.keys(bDeps)).to.eql(['/a', '/c']);
//[
//[    const cDeps  = getTriggerDependencies(bylaws, bylaws.c[0]);
//[    expect(_.keys(cDeps)).to.eql([]);
//[  });
//[});

describe('getAllDependencies', () => {
  it('Detects circular dependencies', () => {
    // a -> c -> b -> a
    const circularDepTree = preprocessBylawRules({
      a: bylaw({
        actions: [],
        sources: ['/c'],
        value: _.identity,
      }),
      b: bylaw({
        actions: [],
        sources: ['/a'],
        value: _.identity,
      }),
      c: bylaw({
        actions: [],
        sources: ['/b'],
        value: _.identity,
      })
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

describe('makeBylawReducer', () => {
  it('returns a function that executes the bylaws', () => {
    let count = 0;
    const valueFn = (action, arg1, arg2) => {
      return arg1 + arg2;
    };

    // dependency chain is a -> b -> c -> d
    const bylaws = preprocessBylawRules({
      a: bylaw({
        actions: ['FOO_ACTION'],
        sources: ['/b'],
        value: valueFn,
      }),
      b: bylaw({
        actions: ['FOO_ACTION'],
        sources: ['/c'],
        value: valueFn,
      }),
      c: bylaw({
        actions: ['FOO_ACTION'],
        sources: ['/d'],
        value: valueFn,
      }),
      d: bylaw({
        actions: ['FOO_ACTION'],
        sources: [],
        value: () => 'd'
      }),
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

    const reducer = makeBylawReducer(bylaws);
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

    const bylawReducer = makeBylawReducer({
      currentGame: {
        player1Score: bylaw({
          actions: ['INC_PLAYER1_SCORE'],
          initialValue: 0,
          value: incScore,
        }),

        player2Score: bylaw({
          actions: ['INC_PLAYER2_SCORE'],
          initialValue: 0,
          value: incScore,
        }),

        winner: bylaw({
          sources: ['./player1Score', './player2Score'],
          value: (action, winner, score1, score2) => {
            const targetScore = 5;
            if (score1 >= targetScore) {
              return 'player1';
            } else if (score2 >= targetScore) {
              return 'player2';
            }
          }
        }),
      },

      highScore: bylaw({
        initialValue: 0,
        sources: ['./currentGame/player1Score', './currentGame/player2Score'],
        value: (action, highScore, score1, score2) => {
          return _.max([highScore, score1, score2]);
        }
      }),
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

  it('can handle dynamic paths', () => {


  });
});
