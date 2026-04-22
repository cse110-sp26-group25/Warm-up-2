## Psychological & Technical Optimization Research

### 1. Provably Fair Algorithms (Technical Integrity)
**Theme:** Addressing "TrainWrecks" (The Analyst) and the "Rigged" concerns identified in Reddit community research.

* **Concept:** Utilizing a **Cryptographic Hash** (e.g., SHA-256) to verify that the spin outcome was determined *before* the user initiated the action.
* **Implementation:** * The server generates a **Server Seed** (kept secret until after the spin).
    * The user provides a **Client Seed** (customizable string).
    * The combination of these two seeds generates the result. 
* **Why it matters:** This ensures the developer cannot manipulate the outcome mid-spin. It satisfies the "mathematically sound" requirement and provides a counter-measure against macro-generation and automated exploitation.

### 2. Loss Aversion & "Losses Disguised as Wins" (LDWs)
**Theme:** Psychology of Engagement and User Retention.

* **Concept:** A scenario where a player bets $5 and "wins" $2. While technically a **$3 net loss**, the interface triggers "Winning" stimuli (audio cues, flashing lights, animations).
* **Research Note:** Neurological studies indicate that the brain often reacts to LDWs similarly to a true win. This is a critical mechanic for **User 1 (Matt Patt)** and **User 5 (Joe)** to prevent them from becoming discouraged by a dwindling balance.
* **Takeaway for Iteration:** The UI should prioritize displaying "Amount Won" in a prominent, celebratory fashion, while keeping the "Net Profit/Loss" or "Total Spent" less visually stimulating to maximize time-on-device.

### 3. Fitts's Law in Casino UI
**Theme:** Physical Effort, Ergonomics, and Accessibility.

* **Concept:** **Fitts's Law** states that the time required to move to a target is a function of the ratio between the distance to the target and the width of the target.
* **Research Note:** Implementing a **"Big Red Button"** and **"Spacebar to Spin"** significantly reduces the **interaction cost**. 
* **Takeaway for Iteration:** * **User 4 (John):** Large target areas and keyboard shortcuts act as necessary accessibility accommodations.
    * **General Users:** Enables "low-effort fidgeting," allowing users to play for longer durations without physical fatigue. 
    * **Action:** Map the "Spin" trigger to the largest visual element on the screen and the keyboard Spacebar.
