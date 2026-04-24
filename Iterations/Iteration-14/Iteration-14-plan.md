# Iteration 14 Plan

### Goals

- **UI Stability**: Prevent toast overflow and viewport collisions by capping visible toasts and ensuring consistent placement across mid-sized screens.
- **Audio Reliability**: Improve cross-browser sound playback by preventing clipping in short sound effects (e.g., denied buzz).
- **Visual Balance**: Reduce animation fatigue by limiting persistent pulsing elements and timing out non-critical visual alerts.
- **UX Refinement**: Replace explicit pity indicators with a more subtle “near-win” progress system that feels natural and non-intrusive.
- **Accessibility Compliance**: Ensure epilepsy mode is fully functional by minimizing or disabling high-intensity motion and flashing effects.
- **System Validation**: Strengthen reliability by formalizing regression tests and empirically verifying RTP through large-scale simulation.

### Prompt

Improve the browser-based slot machine game while continuing to follow the original prompt in ./OriginalPrompt.txt as the authoritative specification, using the current codebase as the baseline. Focus on polish, stability, and player-facing UX. Limit visible achievement/result toasts to a maximum of 3 at a time to prevent stacking into the jackpot or reel area, and ensure their positioning remains clear across mid-sized screens. Add a 50ms silent lead-in to the denied sound effect so it plays reliably on mobile browsers without clipping. Reduce visual fatigue by stopping the storage warning pulse after 10 seconds and ensuring epilepsy mode is fully functional by disabling or significantly reducing flashing, pulsing, and high-intensity motion across the interface. Replace the visible pity bar with a more subtle “how close to winning” progress indicator that feels natural and non-exploitable. Enhance the experience with additional background animations that are smooth, low-intensity, and non-distracting. Finally, promote the smoke-test script into a permanent repository file for regression protection, and include or run a 100k-spin simulation to empirically verify the system is near the 92% RTP target.
