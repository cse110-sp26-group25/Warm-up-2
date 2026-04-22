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
   