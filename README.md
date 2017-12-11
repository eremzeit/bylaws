# bylaws
Scaleable reducer architecture for Redux applications.

## Motivation

In the Redux architecture, the app is separated into the 1) business logic
(reducers) 2) view (components) and 3) side-effects (middleware/sagas).  This dilineation, along
with the restriction of one-way data flow, allows better separation of concerns.  Each phase
can be run in isolation from the other phases and side-effects and asynchrony are implemented separately
from the higher-level behavior of the app.

On the other hand, it has been my experience that as a Redux app grows, it can be difficult to architect the app's
reducer in a way thats easy to understand what code is modifying what state.

#### Simple Approach

The simplest approach would be to make the top-level reducer calculate the next state by iterating through a
list of reducers that each operate on the state in a particular order.  Each state would receive the root
state and would return the next root state to be given to the next reducer and so forth.

In this architecture, each reducer could operate on any part of the state tree and could respond to any action.  Because
each reducer can read and write to the entire state, it has the same problems as using global variables.  Because multiple
reducers might choose to write to the state at a particular path, there's no guarantee of safety.  Also, the logic
that operates on a particular state path needs to also be aware of the specific path that it needs to write to.


####  Sub-reducer Approach

In the interests of separations of concerns we might try to break up our app reducer into multiple functions where each
function handles a specific domain of the state tree.  We might implement various helper functions where each receives some limited portion
of sub-state and is resonsible for returning the next iteration of that sub-state.  This is the approach taken in the `combineReducers`
function supplied with Redux itself, which automatically breaks up the root state into sub-states, feeds them to the appropriate reducer and
then writes it back to the appropriate part of the state tree.

Using sub-reducers, however, has it's own complications.  First, as the app becomes complicated, it's easy for it to become unclear, for any
piece of reducer code, what part of the state it's operating on.  Second, bugs frequently arise from running the sub-reducers in the incorrect
order.


#### The Solution: `bylaws`

Bylaws allows us to define for each path in the state tree:
1) a list of actions that can trigger updates to this path
2) a pure function that defines the next value at that path
3) a list of state paths that that function needs to properly execute the next path

That is, for an app reducer written as a set of bylaws, you can navigate to a specific state path and see all of the logic that can affect
that state.  Behind the scenes, `bylaws` is able to infer the correct order to execute the reducers given dependencies declared the bylaw
definition.  In the example below, the bylaw at path `/currentGame/winner` declares `./player1Score` as a source dependency.  Because bylaws
understands using the same pathing notation that's used to describe filesytems, `./player1Score` is relative path that refers to the `player1Score`
node in the same level of the tree.  As such, whenever `player1Score` is updated, `bylaws` knows that it should also re-execute the reducer
at `/currentGame/winner`.


## Example

```javascript
const incScore = (action, score = 0) => score + 1;

// A single object tree defines the entire reducer behavior
const bylawReducer = makeBylawReducer({
  currentGame: {

    // This implies
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


// Now simulate some game play
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

## FAQ

### Does this with Immutable.js

Yes.  You can pass in your own generalized object getters and setter functions which bylaw will use when merging the calculated state into the existing state.

