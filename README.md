# TodoTree

Hierarchical todo app. Tasks can have subtasks can have subtasks, infinitely. There's a harvest view that surfaces prioritized items across the whole tree, a focus/pomodoro mode, and cloud sync when logged in.

## Running it

```bash
pnpm install
pnpm dev
```

Runs on port 3000. You'll need the backend running too for auth/sync to work (see `/backend`).

## Stack

- React 19, TypeScript, Vite
- TanStack Router (file-based, the URL updates as you zoom into subtrees)
- Tailwind v4 + hand-written CSS
- Recharts for the activity graph in the menu
- Vitest for tests

## Scripts

```bash
pnpm dev
pnpm build
pnpm test
pnpm check      # prettier + eslint fix
```

## Structure

```
src/
├── routes/             # __root, index, $, auth
├── components/
│   ├── layout/         # RootLayout, MainMenu, ActivityGraph, etc.
│   ├── auth/           # auth context + JWT handling
│   └── todo-tree/      # basically everything else
└── utils/storage.ts    # localStorage helpers
```

The main logic lives in `TodoTreePage.tsx` and the `todo-tree/` folder. `tree-utils.ts` has all the pure tree functions if you're looking for something.

## Persistence

Guest mode saves to IndexedDB locally. Sign in and it syncs to the backend. If you edit on two devices before syncing there's a conflict resolution modal that lets you pick which version to keep.

Activity history (the 14-day graph in the menu) is a separate localStorage key, just daily snapshots of task counts, nothing fancy.

## Notes

- URL reflects zoom state: navigating to `/work/project/subtask` zooms the tree to that node
- The `$` catch-all route handles this
- Keyboard shortcuts are in the menu if you forget them
