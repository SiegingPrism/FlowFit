# FlowSphere UI

Static multi-page web app with localStorage-powered interactions.

## Features
- Task completion tracking
- Habit completion tracking
- Daily/weekly review persistence
- Settings toggles and profile editor
- Theme switcher (Neon Dark / Classic Dark)

## Run locally

```bash
cd flowsphere-ui
python3 -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

## Deploy

### Vercel
- Import the `flowsphere-ui` folder as a static project.
- `vercel.json` is included.

### Netlify
- Drag-and-drop this folder into Netlify Drop, or connect repo and set publish directory to `flowsphere-ui`.
- `netlify.toml` is included.

### GitHub Pages
- Upload all files from this folder to your Pages branch root.

## Notes
- Data is stored in browser `localStorage` using key `flowsphere.app.v1`.
- This starter is frontend-only. Replace placeholder integrations with backend APIs for production auth/sync.
