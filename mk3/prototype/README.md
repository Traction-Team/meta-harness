# Mark III prototype

A click-through of the Metafab experience in `../overview.md`. Plain HTML, CSS and JS. No build step.

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8731
```

The flow to try:

1. **New metafab.** Name it, say what it should build. The designer agent lays out the workflow on the canvas while it explains each part.
2. **Play.** Choose how many agents from your machine. Team and cloud runners are shown but not connected.
3. Watch items move as balls. Each program run adds a mark. Items stop at gates and raise questions in the inbox. Click one to decide.
4. Shipped code comes back as defects through the Sentry connection and loops through Triage to the start.
5. **Maintain.** The metafab pauses. The maintenance agent finds the weak program, proposes a change to `.metafab/`, and shows the replay. Choose roll over now or drain.

Space pauses. Scroll to zoom, drag to pan. Esc closes the side pane.
