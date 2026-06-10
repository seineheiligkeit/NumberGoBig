<script lang="ts">
  import { onMount } from 'svelte';
  import { setupGameView, type GameViewHandle } from './lib/view/game-view';
  import { scoreStore, toolStore, frontierStore, statsStore, speedStore, unlockedTools, audioMuted, type Tool } from './lib/view/stores';
  import { setAudioMuted } from './lib/view/audio';
  import { PRESETS } from './lib/view/presets';
  import Marginalia from './Marginalia.svelte';

  function toggleMute() {
    audioMuted.update((m) => {
      setAudioMuted(!m);
      return !m;
    });
  }

  let canvasContainer: HTMLDivElement;
  let handle: GameViewHandle | null = null;

  const tools: { tool: Tool; label: string }[] = [
    { tool: 'successor', label: '{ }  Successor' },
    { tool: 'addition', label: '+  Addition' },
    { tool: 'multiplication', label: '×  Multiplication' },
    { tool: 'exponentiation', label: '^  Exponentiation' },
    { tool: 'mill', label: 'M  Mill (split → fuel)' },
    { tool: 'accelerator', label: '»  Accelerator' },
    { tool: 'warehouse', label: 'W  Warehouse (store → fuel)' },
    { tool: 'pipe', label: '↳  Pipe' },
  ];

  onMount(() => {
    setupGameView(canvasContainer)
      .then((h) => (handle = h))
      .catch((e) => console.error('[setupGameView] failed:', e));
    return () => handle?.destroy();
  });

  function pick(tool: Tool) {
    toolStore.set($toolStore === tool ? null : tool);
  }

  const hint = (t: Tool | null): string =>
    t === 'pipe'
      ? 'Click an output, then an input port…'
      : t
        ? 'Click the page to place…'
        : '';

  const speeds = [0, 1, 3, 10, 30];
  function elapsed(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${ss}s` : `${ss}s`;
  }
</script>

<main>
  <div class="canvas-container" bind:this={canvasContainer}></div>

  <header class="score">
    <div class="sigma">Σ</div>
    <div class="value">{$scoreStore}</div>
  </header>

  <aside class="monitor">
    <div class="row big"><span>frontier</span><b>{$frontierStore}</b></div>
    <div class="row"><span>time</span><b>{elapsed($statsStore.elapsed)}</b></div>
    <div class="row"><span>cells / working</span><b>{$statsStore.cells} / {$statsStore.working}</b></div>
    <div class="row"><span>pipes / loose</span><b>{$statsStore.pipes} / {$statsStore.loose}</b></div>
    <div class="speed">
      <span>speed</span>
      {#each speeds as s}
        <button class:active={$speedStore === s} onclick={() => speedStore.set(s)}>
          {s === 0 ? '⏸' : `${s}×`}
        </button>
      {/each}
      <button class="mute" title="Mute audio" onclick={toggleMute}>{$audioMuted ? '🔇' : '🔊'}</button>
    </div>
    <div class="dev">
      <span>snapshots</span>
      <button class="reset" title="Clear the canvas" onclick={() => handle?.reset()}>⟲ Reset</button>
      {#each PRESETS as p (p.key)}
        <button class="preset" title={p.blurb} onclick={() => handle?.loadPreset(p.key)}>{p.label}</button>
      {/each}
    </div>
  </aside>

  <aside class="shelf">
    <h2>Literature</h2>
    <p class="hint">Place a cell, then drop blocks onto its ports. Drag cells to move; shift-click a cell or pipe to delete.</p>
    {#each tools.filter((t) => $unlockedTools.includes(t.tool)) as t (t.tool)}
      <button class:active={$toolStore === t.tool} onclick={() => pick(t.tool)}>
        {t.label}
      </button>
    {/each}
    {#if $toolStore}
      <p class="placing">{hint($toolStore)}</p>
    {/if}
  </aside>

  {#if $statsStore.cells === 0}
    <div class="onboard">Pick <b>Successor</b>, then click the river — it taps the zeros for ones.</div>
  {/if}

  <Marginalia />
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }
  .canvas-container {
    width: 100%;
    height: 100%;
  }
  .score {
    position: absolute;
    top: 16px;
    right: 24px;
    text-align: right;
    font-family: var(--pencil-font, 'Kalam', cursive);
    color: #3a3a3a;
    pointer-events: none;
  }
  .score .sigma {
    font-size: 18px;
    opacity: 0.6;
  }
  .score .value {
    font-size: 40px;
    line-height: 1;
  }
  .shelf {
    position: absolute;
    top: 16px;
    left: 16px;
    width: 220px;
    padding: 12px 14px;
    background: rgba(251, 247, 238, 0.92);
    border: 1px solid rgba(58, 58, 58, 0.25);
    border-radius: 6px;
    font-family: var(--pencil-font, 'Kalam', cursive);
    color: #3a3a3a;
  }
  .shelf h2 {
    margin: 0 0 2px;
    font-size: 18px;
    font-weight: 600;
  }
  .shelf .hint {
    margin: 0 0 10px;
    font-size: 12px;
    opacity: 0.7;
  }
  .shelf button {
    display: block;
    width: 100%;
    margin: 4px 0;
    padding: 7px 10px;
    text-align: left;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.3);
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    color: inherit;
    cursor: pointer;
  }
  .shelf button:hover {
    background: rgba(58, 58, 58, 0.06);
  }
  .shelf button.active {
    background: rgba(244, 230, 138, 0.6);
    border-color: rgba(58, 58, 58, 0.5);
  }
  .shelf .placing {
    margin: 8px 0 0;
    font-size: 12px;
    font-style: italic;
    opacity: 0.8;
  }
  .onboard {
    position: absolute;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: rgba(251, 247, 238, 0.9);
    border: 1px dashed rgba(58, 58, 58, 0.35);
    border-radius: 6px;
    font-family: var(--pencil-font, 'Kalam', cursive);
    font-size: 15px;
    color: #3a3a3a;
    opacity: 0.85;
    pointer-events: none;
  }
  .onboard b {
    font-weight: 600;
  }
  .monitor {
    position: absolute;
    top: 78px;
    right: 24px;
    width: 200px;
    padding: 8px 12px;
    background: rgba(251, 247, 238, 0.92);
    border: 1px solid rgba(58, 58, 58, 0.25);
    border-radius: 6px;
    font-family: var(--pencil-font, 'Kalam', cursive);
    color: #3a3a3a;
    font-size: 13px;
  }
  .monitor .row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
  }
  .monitor .row span {
    opacity: 0.6;
  }
  .monitor .row.big b {
    font-size: 18px;
  }
  .monitor .speed {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    border-top: 1px solid rgba(58, 58, 58, 0.15);
    padding-top: 6px;
  }
  .monitor .speed span {
    opacity: 0.6;
    margin-right: 2px;
  }
  .monitor .speed button {
    flex: 1;
    padding: 3px 0;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.3);
    border-radius: 4px;
    font-family: inherit;
    font-size: 12px;
    color: inherit;
    cursor: pointer;
  }
  .monitor .speed button.active {
    background: rgba(244, 230, 138, 0.6);
    border-color: rgba(58, 58, 58, 0.5);
  }
  .monitor .dev {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
    border-top: 1px solid rgba(58, 58, 58, 0.15);
    padding-top: 6px;
  }
  .monitor .dev span {
    width: 100%;
    opacity: 0.6;
  }
  .monitor .dev button {
    flex: 1 1 auto;
    padding: 3px 6px;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.3);
    border-radius: 4px;
    font-family: inherit;
    font-size: 12px;
    color: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .monitor .dev button:hover {
    background: rgba(58, 58, 58, 0.06);
  }
  .monitor .dev button.reset {
    flex-basis: 100%;
  }
</style>
