import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { maybeInstallDevPreset } from './dev/preset-midgame';

// Must run BEFORE mount so the save is in localStorage by the time
// `setupPixi → loadFromStorage` reads it. Visit `?preset=midgame` once,
// or run `devLoadMidgame()` in the console.
maybeInstallDevPreset();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
