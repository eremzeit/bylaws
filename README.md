# bylaws
State management that scales

## Motivation

Via its functional approach to state management, Redux can be an scaleable way of managing state.  Bylaws on the other hand allows one to declaratively define state logic without having to handle a number of sticky details that come up as an grows in complexity.  For example, a common pattern is to normalize all of the models in the state tree into their ids and store the actual models in a entities object off the root of the state tree.  Naturally, when we design our reducer function we seek a seperations of concerns.  Passing the entire state tree to a reducer function that primarily focuses on updating a specific path of the state tree seems wrong.  Perhaps we could talk about passing only the required parts of the state tree to a helper reducer function, but in my experience the handoff of the global reducer function to the child helper reducers gets messy.  It's easy to lose track of how each helper function might be applied further up the tree.  Also, it's also possible to lose track of what order your sub-reducers need to be run for the logic to be calculated correctly.

Bylaws solves the trade-off between a "blind-parallel execution" and a "global-aware but linear execution".



## How does this relate to selector libraries like Reselect?

Reselect or other selector libraries share some overlap, depending on how you use them.  In idiomatic redux, the state tree is heavily normalized and selectors can be applied to denormalize that data into specific views of that data.  Selectors can also be used to boost performance for complicated state calculations by using dependency caching.

Bylaws on the other hand allows one to declaratively define state logic without having to handle a number of sticky details that come up as an app scales.  For example, a common pattern is to normalize all of the models in the state tree into their ids and store the actual models in a entities object higher in the state

## FAQ

### Does this with Immutable.js

Yes.  You can pass in your own generalized object getters and setter functions which bylaw will use when merging the calculated state into the existing state.


## Example


## Future Improvements

As of right now, bylaw rules only get executed as a result of matching against certain actions.  Eventually this library could be expanded to detect when a path in a state tree has been changed and cause all of the correct bylaw rules by executed. Alternatively, a bylaw that depends on a source could just automatically be run whenever that source updates.
