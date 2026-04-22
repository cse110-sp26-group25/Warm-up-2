# Iteration 1 Review

## Query Data:
- Input tokens: 6.1k
- Output tokens: 113.2K
- Total tokens: 134.3K
- Query time: 24 minutes and 18 seconds

## Iteration Information:
|Category|Value / Description|
|--------|-------------------|
|Number of files| 16|
|Number of folders| 3|
|Lines of code| 5639|

## Observations:

### Downsides

#### Front end issues
1. The webpage starts with an avatar page, which has its own avatar.js file, but the box doesn't do anything and the "x" doesn't do anything. Currently we have to go into devtools to delete the avatar section.
2. None of the avatar based components are currently working, so we'll need to have the future iterations fix that. 
3. The chat box is not its own element, so it causes the wepage to get extremely long. Future iterations needs to make the chatbox its own scrollable element or limit the amount of chats inside it.
4. The only bet options are for 10 and 100, so we need to make more bet sizes available
5. There is a red bar at the top that is covering a lot of the stuff in the top, so we'll need to either remove it or keep it but make sure it flexes with the rest of the elements
6. The jackpot score tracker sits in the top right slightly offscreen. We'll need to fix that
7. There is no favicon for the webpage
8. The webpage is generally pretty boring 
9. Slot machine is 3x3 rather than the more usual 3x5
10. slot machine tracks time, THIS IS BADDDDDD we don't want users getting hit in the face with a clock while they are trying to gamble
11. There are no thematic animations in the program
12. The win effects are relatively minimal. For max effect we should have effects take over the whole screen if possible.
13. Ranks tab shows no rankings, which makes things feel pretty lonely.

#### Back end issues
1. Accessibility js file uses a lot of !important tags, but I'm not sure if this is a problem.
2. Colors are generally hard coded, so it would be nice to have them stored in variables and used as such in the code.
3. The JS code for the RNG system is still acccessible from the outside. I haven't figure out exactly how to rig the system yet, but it looks pretty vulnerable and I think I could exploit it with a bit more work.
4. There's still quite a bit of div soup in the html code

### Upsides

#### Good front end
1. The colors are pretty chill and easy to look at, but it's still leaning towards that black/blue schema
2. The webpage is generally pretty responsive and does well with different screen dimensions
3. There is functionality to turn off the music
4. Volume slider in the bottom left corner to change volume of background music
5. There is an option to turn off flashing lights in the bottom right
6. There is an option to reduce the amount of movement in the program
7. There is a contrast button that changes the webpage to have high contrast
8. Colors look pretty distinct, so there's not too much weird color blending
9. There is a light at the top of the machine which is similar to actual slot machines
10. UI is generally pretty easy to read
11. UX is pretty smooth

#### Good back end
1. Code is very modular
2. lots of comments
3. definite decrease in the amount of div slop there is
4. The majority of values are variables rather than magic numbers
5. Classes and IDs are generally pretty descriptive and self explanatory

## Notes for next iteration:
1. fix avatar functionalities
2. chat box needs to be its own element that can scroll
3. More bet sizes
4. Keep red bar, but move it out of the way of other elements or make it disappear
5. Move the jackpot to a less crowded part of the screen
6. Give the webpage a favicon
7. Make the webpage more interesting using an animation of a robot
8. change the slot machine's 3x3 into a 3x5
9. remove the clock
10. Bigger win effects that cover the whole screen for a short duration
11. generate rankings for the rankings tab
12. use variable colors rather than hard coding their values
13. make rng.js less accessible by dev tools
   