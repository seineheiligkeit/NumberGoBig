import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { maybeInstallFromUrl } from './dev/presets';

// Must run BEFORE mount so the save is in localStorage by the time
// `setupPixi → loadFromStorage` reads it. Three presets available:
// `?preset=early|mid|end`, or `devLoadEarly()`/`devLoadMid()`/`devLoadEnd()`
// in the console. The in-game menu (bottom-left) has buttons too.
maybeInstallFromUrl();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
