# Breath Web

React + TypeScript + Vite frontend for Breath.

This MVP keeps emergency guidance client-side so the demo works even if camera access or network access fails. The assistant is rule-based and only responds from predefined CPR, choking, severe bleeding, and unknown protocol objects in `src/App.tsx`.

## Run

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

The current local environment does not expose an `npm` binary on PATH, so builds here were run through a downloaded npm CLI with the bundled Node runtime.
