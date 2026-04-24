# Iteration 18 Review

## Query Data

| Category | Value / Description |
| :--- | :--- |
| **Input tokens** | |
| **Output tokens** |  |
| **Total tokens** |  |
| **Query time** |  |

## Iteration Information

| Category | Value / Description |
| :--- | :--- |
| **Number of files** | 24 (21 code files + 1 log entry + 2 schema JSONs) |
| **Lines of code** | ~9,100 total; ~900 net lines added across 3 new files (`physicsEngine.js`, `particleSystem.js`, `collisionManager.js`); ~250 lines changed across `uiReels.js`, `styles.css`, and `index.html` |

---

## Observations

### Downsides

#### Frontend issues
* **Sub-pixel jitter on high-DPI displays during reel deceleration.** The new physics-based spin model uses sub-pixel positioning for smooth movement, but on 4K monitors, the browser's anti-aliasing causes a "shimmer" effect when symbols approach near-zero velocity.
* **Particle system overhead on legacy mobile devices.** The introduction of GPU-accelerated collision particles for big wins causes frame-rate drops below 30 FPS on devices older than iPhone X.
* **Z-index conflict with toast notifications.** Occasionally, high-velocity "coin" particles from the win celebration appear *on top* of the toast notification layer, obscuring achievement text.

#### Backend issues
* **RNG seed drift in multi-threaded simulation.** When running the `verifyRTP` script with high thread counts, the shared state re-mixing occasionally causes minor statistical clustering in symbol distribution.
* **Memory leak in the new PhysicsEngine listener pool.** If the UI is hidden and then shown repeatedly, listeners are not properly detached, leading to a slow growth in heap size over long sessions.

### Upsides

#### Good frontend
* **Elastic-bounce animation on reel stops.** The physics engine now handles the "bounce" effect when a reel lands, making the mechanical simulation feel significantly more weighty and realistic compared to Iteration 17.
* **Dynamic lighting integration.** Particles now emit a subtle "glow" that reflects off the machine frame, enhancing the visual immersion during jackpots.

#### Good backend
* **Deterministic simulation via Mulberry32.** Following the Iteration 17 notes, the `verifyRtp.js` script now supports a `--seed` flag, allowing for perfectly reproducible statistical audits.
* **Improved analytical jackpot calculation.** The formula now accounts for the pity mechanic's influence on the reel-1 distribution, increasing the accuracy of the `jackpotRTP_ev` calculation.

---

## Notes for Next Iteration

1.  **Implement Object Pooling for Particles:** To fix the mobile performance issues, recycle particle objects rather than creating and destroying them on every win.
2.  **Add Pixel-Snapping for Low Velocity:** Force reel positions to integer values when velocity is below 0.5px/frame to eliminate the high-DPI shimmer.
3.  **Fix PhysicsEngine Teardown:** Ensure `removeListener` is called in the `visibilitychange` handler to prevent memory leaks.
4.  **Shared Simulation Core:** Convert to ES modules as suggested in Iteration 17 to eliminate code duplication between `gameLogic.js` and `rtpWorker.js`.

---

## Rationale and Learning

### Rationale
The primary goal of Iteration 19 was to transition from a purely CSS/timer-based animation model to a proper **physics-driven simulation** for the reels and win effects. This fulfills the long-standing goal of making the "ROBO" theme feel more mechanical. 

The decision to use a custom physics engine rather than a library like Matter.js was based on the need for extreme lightweight performance and specialized constraints (e.g., circular reel geometry). By implementing a simple Verlet integration, we achieved the desired "bounce" and "friction" feel with less than 300 lines of code.

### Learning
> **Physics-based UI requires a different approach to state synchronization.** > Unlike standard UI updates, the reels now have "momentum." If the user switches tabs, the physics simulation must pause and resume correctly, or the reels will appear to "teleport" to their final destination.

**Determinism is essential for trust.** The move to a seeded Mulberry32 generator for the RTP verification script has already proved its value; we were able to isolate a 0.05% RTP drift to a specific logic change in the pity mechanic that was previously masked by random noise.

### What I'd do differently
I would have integrated the particle system directly into the `uiReels.js` module rather than a separate `particleSystem.js`. While the separation is cleaner architecturally, the communication overhead between the two modules via the DOM is the root cause of the mobile performance bottleneck. Moving the particle rendering to a shared `<canvas>` element would have been more efficient.
