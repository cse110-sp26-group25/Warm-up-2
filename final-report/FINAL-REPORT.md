# Final Report

## Table of Contents

1. [Introduction](#introduction)
2. [Research](#research)
3. [Methodology](#methodology)
4. [Iterations](#iterations)
5. [Findings](#findings)
6. [Conclusion](#conclusion)

## Introduction

### Specs
- Platform: Claude Code Sonnet
- Version: 4.6
- Extending thinking was turned off 
- Various levels of thinking intensity were used 

### What we Tracked 
- How well does Claude Code follow our prompt?
- How much does it leave out?
- Did it change any previous features that it wasn't prompted to?
  - If so, did it not work as intended?
  - Did these changed deviate from our 
- How readable is the code?
- How long did it take?
- How many tokens did it cost?

### What We Aimed to Answer
- Commmon problems one should expect to experience when using AI in an attempt to build quality software
- The impact of research and planning on the quality of the software product
- Areas in which user and domain centered thinking results in a better end product
- What team norms and discipline should be adopted for the best outcomes
- Area's we believe AI will help versus hinder our software engineering process

## Research

### Main Topics Focused On
- Legality and other External Considerations
- The Function of the Machine
- The Visual/Audio
- The Social Aspect
- Extra Information

### Our Process
After doing our own individual research, we met up on Tuesday, April 21st to discuss our findings, explaining why each of our points should be implemented into the slot machine as well as why certain points provided may not be as useful to the slot machine as we had originally thought. Once we've compiled a list of requirements we wanted our slot machine to have, we asked ChatGPT to create a prompt to give Claude and we made slight modifications to it to satisfy what we wanted Claude to do.
We also decided to have everything we want on our first iteration and as we do more iterations, we refine on what Claude was lacking.

## Methodology  
Before begining a new iteration we reviewed the previous few iterations. We took note of which desired features the previous iterations held and which they lack. We took not of which features the previous iterations were attempting to add/improve, and how sucessful the AI was in doing so. We then generated a new prompt for the current iteration using ChatGPT for an initial draft. Using our previous observations, we made changed to this prompt. If the AI had been sucessful in adding a new feature, we continued that format for other prompts. If a feature was not substatntially improved, alternate prompting structures were attempted.    

The way in which we ran the model differed slightly during the iteration process. Around iteration 3 we began providing acess to the origional prompt and asking Claude to reference it in an attempt to prevent drift. Around iteration 11 we began to experiement with Claude's intensity of thinking in an attempt to curb the increasing runtimes. We decided upon this "dynamic approach" because we felt it better modeled the engineering prcoess within indutry, which we proritized over mainting a perfectly "consistent" model for our experiment. This may be a limitation within our findings, as our findings per iteration may not generalize to other iteration's way of using Claude. However, this approach did give us better insight in understanding how certain obstacles in using AI may be overcome, and in which way's we felt comfertable integrating AI moving forward. 

Finally, after the AI produced the slot machine, we wrote a review similar to the reviews made during the previous warm-up. We took note of technical details such as token usage and file chages. We then spent time "playing" the outputted game, evaluating how well the product achieve the goals within the prompt, and if any features we had desired became collateral during these changes. We then went into the code base, evaluating how "well written" the progams were, and for insight as to why certain features were not preforming to expectation. Finally, we considered the new machine hollistically, considering and proposing alternate ways for the next iteration to fix the features the current interation failed to import, as well as addtional ways to improve other features. 

This process was then repeated, creating the following 20 iterations. 

## Iterations

### Iteration List
| [Iteration 1](#iteration-1) | [Iteration 2](#iteration-2) | [Iteration 3](#iteration-3) | [Iteration 4](#iteration-4) | [Iteration 5](#iteration-5) |
| :------------------------- | :------------------------- | :------------------------- | :------------------------- | :------------------------- | 
| [Iteration 6](#iteration-6) | [Iteration 7](#iteration-7) | [Iteration 8](#iteration-8) | [Iteration 9](#iteration-9) | [Iteration 10](#iteration-10) |
| [Iteration 11](#iteration-11) | [Iteration 12](#iteration-12) | [Iteration 13](#iteration-13) | [Iteration 14](#iteration-14) | [Iteration 15](#iteration-15) |
| [Iteration 16](#iteration-16) | [Iteration 17](#iteration-17) | [Iteration 18](#iteration-18) | [Iteration 19](#iteration-19) | [Iteration 20](#iteration-20) |
---
### Iteration 1
---

<!--
Maybe we should report our data in a table? 
I don't think we need to go into the level of depths we have in the logs, 
it might be more effective just to report the "overall" section and a sentance on what we learned about prompting. 
- Sahana
-->



#### Goals:
- Create a baseline application using the original prompt found in our AI plan file
- Set an exmaple for other iterations to follow

##### What Went Well:
- The colors and the UI and UX looks and feel nice
- There is a lot of accessibility settings that was successfully implemented
- The code is modular, filled with variables, and descriptive with the comments as well as the Classes and IDs

##### What Didn't: 
- The avatar settings didn't work
- The UI is pretty boring and uninteresting
  - Some elements of the US is oddly placed, in the way, or not supposed to be there
- The animations are minimal
- The structure of the slot machine doesn't match what we were looking for
  - 3x3 instead of 3x5
  - only 2 betting options
- Colors are hard coded
- The RNG is still accessible
- A lot of div in the html
- Missing Favicon

#### Overall:
It is a start, but Claude was generally unsuccessful in following its prompt.

---
### Iteration 2
---

#### Goals:
- Fix all of the faults of the slot machine as found in the previous iteration

#### What Went Well:
- Peronalized Customization (avatar, accessibility, color changing) works
- Lists directions on how to play
- var is not overused in JS file

#### What Didn't:
- The sounds and visuals are lacking
  - No audio in general
  - Animations are lacking for winning
- Social aspect is still a bit lacking
  - User score is not saved
  - Chatbox doesn't work properly
  - The rankings can be shown in the front page

#### Overall: 
Claude was able to fix some of the issues the previous iteration had, but some errors are still present; it still didn't do much of what the prompt said, so it was slightly unsuccessful

---
### Iteration 3
---

#### Goals:
- Fix all of the faults of the slot machine as found in the previous iteration

#### What Went Well:
- The Sound works
- The UI works much better and even works on differnt devices
- The visuals look better and help fit the slot machine
- Ranking tab works
- The randomizer is secure

#### What Didn't:
- The sounds feel off
- The interactable robot works most of the time
- There are some things that don't scale properly
- Still have hard coded variables

#### Overall:
- Claude made a good amount of progress and was able to fix most issues, but it needs a bit more refinement, so overall, it was kind of successful

---
### Iteration 4
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:


---
### Iteration 5
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:


---
### Iteration 6
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:


---
### Iteration 7
---

#### Goals:


#### What Went Well:


#### What Didn't:


#### Overall:


---
### Iteration 8
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:


---
### Iteration 9
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 10
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 11
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 12
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:
---
### Iteration 13
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 14
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 15
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 16
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 17
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 18
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 19
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:

---
### Iteration 20
---

#### Goals:

#### What Went Well:


#### What Didn't:


#### Overall:





## Findings


<!--
Answer the "what we tracked" questions and any other intresting observations
-->



## Conclusion

<!--
Answer the "what we aimed to answer" questions
-->
