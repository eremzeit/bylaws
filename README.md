# bylaws
State management that scales

## Motivation

Via its functional style model of the app lifecycle, Redux can be a scaleable way of holding application *state*. However, Bylaws gives you a clean way to structure your reducer.

Bylaws lets you declaratively define state logic without having to handle a number of sticky details that come up as an grows in complexity.  For example, a common pattern is to normalize all of the models in the state tree into their ids and store the actual models in a entities object off the root of the state tree.  Naturally, when we design our reducer function we seek a seperations of concerns.  Passing the entire state tree to a reducer function that primarily focuses on updating a specific path of the state tree seems wrong.  Perhaps we could talk about passing only the required parts of the state tree to a helper reducer function, but in my experience the handoff of the global reducer function to the child helper reducers gets messy.  It's easy to lose track of how each helper function might be applied further up the tree.  Also, it's also possible to lose track of what order your sub-reducers need to be run for the logic to be calculated correctly.

Bylaws solves the trade-off between a "blind-parallel execution" and a "global-aware but linear execution".



## How does this relate to selector libraries like Reselect?

Reselect or other selector libraries share some overlap, depending on how you use them.  In idiomatic redux, the state tree is heavily normalized and selectors can be applied to denormalize that data into specific views of that data.  Selectors can also be used to boost performance for complicated state calculations by using dependency caching.

Bylaws on the other hand allows one to declaratively define state logic without having to handle a number of sticky details that come up as an app scales.  For example, a common pattern is to normalize all of the models in the state tree into their ids and store the actual models in a entities object higher in the state

## FAQ

### Does this with Immutable.js

Yes.  You can pass in your own generalized object getters and setter functions which bylaw will use when merging the calculated state into the existing state.


## Example

```javascript
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
```



## Future Improvements

As of right now, bylaw rules only get executed as a result of matching against certain actions.  Eventually this library could be expanded to detect when a path in a state tree has been changed and cause all of the correct bylaw rules by executed. Alternatively, a bylaw that depends on a source could just automatically be run whenever that source updates.
