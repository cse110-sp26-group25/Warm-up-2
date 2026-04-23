# Slot Machine Research - Sahana 

### Graphics 
- Rather than using neon or flashy lights (outside of the graphics) most slot machines use very saturated colors in order to "stand out".
- Contrary to our previous prompting, most slot machines don't have much contrast between the icons and the background. They're cohesive, almost bledning into one another. The icons typically are a contrasting color to the "base color" of the machine. 
- The number of rows vary, but most have 3 to 5.  
- Some slot machines have themese / storylines (like the game of life slot machine). If these themes are kept mostly to the visuals, and most contribute to earning other rewards / bonus rounds they could provide entertainment to users who want it, while not adding too much "fluff" for economically focused users (or those who simply don't care about the additional features)
- The following comes from [this](https://www.reviewjournal.com/business/casinos-gaming/slot-machines-looking-for-attention-with-advanced-technology-1671776/) article:
  - The curved screen slot machines have are intended to "suck the player in", making them look up makes it feel like the game physically surrounds them. Is there a way to emulate this digitially? I think I tend to feel more "sucked in" if I'm looking a little lower on my laptop screen. We could experiment with positions that aren't just in the middle.
- Ideas to stray away from "slop" asthetic
  - Instead of using emoji's maybe use icons that look badly ai generated, in line with the "making fun of ai" theme
  - Keep the the little feedback / chat responce during each spin that occured in our previous warmup, it feels like the ai is reponding back after a prompt
  - Have a "thinking" animation while it's spinning
  - Make the lever robot themed? Like a robot arm

### Legal Findings 
- Legally wheels cannot be weighed, to influence whose favour the game is in the number of icons can be altered, especially because the wheele is digital the number of icons that can be on a wheele is really large
- The house edge is based on the total some of what the player bet, not the amount they bet per game. Ex: if they bet 10 and play 10 games, the house edge would be a % of 100, not 10 * the percentage on 10.
 - Thus our goal as the house is to prioritize the amount of time spent at the game, rather than the amount they're willing to spend per game. i.e. if they bet small amounts but play for a long time the house benifits more than if they bet high for a couple rounds.
- People expect online slot machines to be more favorable / have less of a house edge
 - We might want to give claude a specific trp/house edge that we think would appeal most to our specific users.   


### Prompting 
- [How to get better code quality](- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#:~:text=behavior%2C%20add%20specific)
- We need to tell claude to read the files and give them the specific paths, if the instruction is not explicit it might hallucinate the information, which might explain some of the drift in the previous assignment.
  - [Relevant Documentatoin](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#minimizing-hallucinations-in-agentic-coding)
  - This [article](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#frontend-design ) provides advice on how to prevent the "aislop" asthetic in the frontend graphics. 
