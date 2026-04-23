# Iteration 3 Review

## Query Data:
- Input tokens: 12.2k
- Output tokens: 159.3k
- Total tokens: 261.5k
- Query time: 16 minutes and 27 seconds

## Iteration Information:
|Category|Value / Description|
|--------|-------------------|
|Number of files| 6|
|Number of folders| 0|
|Lines of code| 853 added 96 removed|

## Observations:

### Downsides

#### Front end issues
1. The spinning sound does not sound like a slot machine.
2. I hear random dings sometimes? I'm not sure if that's supposed to be remenicent of the ambient noise of other slot machines.
3. I think the robot mascot is speaking but the speech bubble is completly cut off.
4. The comonents do not shrink and grow proprerly when the screen resizes. 

#### Back end issues
1. The leaderboard does not work when attemping to save your game. It always claims you're number 1.
2. There are still a lot of hardcoded variables. Less so in the main html file, but they persist expecially in audio.js
3. In style.css the comments claim there are no hard coded values. This is a lie.    
### Upsides

#### Good front end
1. The sound is back!
2. There is a ranking tab and it does seem to be accurate (Player is ranked appropriatly)
3. There is a very explicit animation for "Big wins"
4. The resizing is okay. The compenents do move to a vertical layout when zooming in, and seperate when zooming out.
5. The icons have move away from emoji's and are thematically appropriate.
6. The volume slider does work.
7. You can chat with the robot. It's responces make sense 80% of the time. 

#### Good back end
1. The inline comments are really good. They provide information regarding functionality, intention, and where else to go in the codebase to find additional information. The code can be understood just by reading comments alone.
2. Providing the origional prompt does seem to ensure the original criteria is met. The codebase maintains the cryptographically secure randomizer despite not being metioned in the new propmt.
3. The accecability / reduce motion matches system/browser setting's automatically, doesn't need to be toggled by users with preexisting issues. 

## Notes for next iteration:
1. Make the audio during the spin sound more like a standard slot machine.
2. Move away from standard "ai" slop background color. Focus more on red, yellows, and greens, and increase saturation rather than making neon colors.
3. Make the spin button more thematically appropriate
4. Do not use emoji's for the player icon.
5. Include background music and ambient audio
6. Add an acceability button to toggle flashing displays
7. Make the leaderboard accurate to the players acculmulated points.
8. Add more animations for small wins
9. Make the background more intresting with aimations.
10. Add audio for when the play doesn't get a win. 
    
