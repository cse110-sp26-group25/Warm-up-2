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

<!--
Maybe we should report our data in a table? 
I don't think we need to go into the level of depths we have in the logs, 
it might be more effective just to report the "overall" section and a sentance on what we learned about prompting. 
- Sahana
-->

<!--
Honestly that sounds much better to do!
I'll change up the formatting to reflect it
Thank you for your input
- John 
-->
| Iteration Number | Overall Overview |
| ---------------- | ---------------- |
| Iteration 1      | It is a start, but Claude was generally unsuccessful in following its prompt. It makes sense since we gave Claude a lot of things to make for our slot machine. |
| Iteration 2      | Claude was able to fix some of the issues the previous iteration had, but some errors are still present; it still didn't do much of what the prompt said, so it was slightly unsuccessful. Then again, the prompt was still just as long as the previous iteration. |
| Iteration 3      | Claude made a good amount of progress and was able to fix most issues, but it needs a bit more refinement, so overall, it was kind of successful. The prompt was also much shorter compared to our original and since the scale of the issues it needed to fix was not as large, we were able to hone into some more detailed prompts.|
| Iteration 4      | While the prompt wasn't as long, Claude wasn't able to follow some of the prompt's directions. Sometimes when it was able ot follow the prompt's direction, it felt like it was slightly off, or it forgot to consider something. There was some things that Clade kept constant, but it still didn't really deliver with the new things added as well as updating certain things to accomodate for the new things added, so overall, unsuccessful. |
| Iteration 5      | Claude kind of regressed in progress with this iteration. It did fix it's audio, but it wasn't able to preserve the UI and changed it for the worse. As said before, the prompt was as long as the original, so claude did have a lot more to work around and consider. Overall: Unsuccessful. |
| Iteration 6      | Claude ran into the same problems listed in the previous iteration. It wasn't able to preserve some aspects of the slot machine, and it wasn't able to fix parts it was tasked to fix. Another overall unsuccessful iteration. |
| Iteration 7      | While there are some parts of the slot machine that needed to be worked on, given our prompt (and prompt size), Claude was able to fix all the things it was tasked to do, so it was overall successful. |
| Iteration 8      | Claude was really successful in following the prompt given to it. The prompt was really detailed, going into what specifically Claude needed to look out for, and that aspect of it really worked to Claude's advantage. the prompt was also not overtly wordy. |
| Iteration 9      | Again, Calude was successful. It really looks like the shorter and more concise the prompt is really had an impact on Claude actually being able to fix the issue.|
| Iteration 10     | Claude was mostly successful in following the given prompts. It did really help to use explicit values as a part of the prompt rather than having Claude interpret what the prompter means. |
| Iteration 11     | Claude fell short a bit in this iteration. While the prompting was detailed, it was still missing really specific specification. Claude in turn was left to interpret what exactly the prompter wants, so Claude was able to implement some stuff, but it did it in a way where it sort of interfered with existing spaces. Overall: a bit Unsuccesful. |
| Iteration 12     | Claude was really successful this iteration. It was able to follow the directions of the prompt clearly and it resulted in an output that satisfies most if not all of the noted changes in the prompt, with minimal errs. |
| Iteration 13     | Claude handed this iteration pretty well. It was able to follow the directions of the prompt and satisfies most of the core fixes the prompt suggested, although it still had a small fair share of slip-ups. Overall: Successful. |
| Iteration 14     | CLaude ran so-so. It was able to fix some of the prompts requests, but it looks like the UI took a big hit in exchange, even when it was unprompted to do so. Maybe referencing the original prompt as a part of iteration 15's prompt may lead the AI to be confused about what to change. Overall: Slightly Unsuccessful. |
| Iteration 15     | With more specific calls to what Claude should change and how it should change it, Claude can more accurately deal with the issues brought up in the prompt. Overall: Successful |
| Iteration 16     | While the amount of tasks presented in the prompt was large, the short, concise, and direct rules presented didn't really matter as much in the long run. With everything organized within its own special, Claude was able to follow the prompt pretty successfully aside from a few errors. Overall: Pretty Successful. |
| Iteration 17     | As seen from the review given, it looks like Claude was able to provide the necessary changes the prompt asked for. |
| Iteration 18     | While the prompt given was one of our shortest, Claude wasn't able to deliver 1/2 of the tasks in the prompt. On the issue Claude was able to implement, it seemed like it was able to implement it well, but overall, Claude was kind of unsuccessful. |
| Iteration 19     | The prompt was short and concise enough for Claude to interpret and implement, there were some hiccups in some parts of the tasks given, but all in all, it was successful. |
| Iteration 20 | |



## Findings


<!--
Answer the "what we tracked" questions and any other intresting observations
-->



## Conclusion

<!--
Answer the "what we aimed to answer" questions
-->
