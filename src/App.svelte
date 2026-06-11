<script lang="ts">
  import { onMount } from 'svelte';
  import { setupGameView, type GameViewHandle } from './lib/view/game-view';
  import { scoreStore, toolStore, frontierStore, statsStore, speedStore, unlockedTools, audioMuted, buildPreviews, type Tool } from './lib/view/stores';
  import { setAudioMuted } from './lib/view/audio';
  import { journal } from './lib/view/narrator';
  import { PRESETS } from './lib/view/presets';
  import Marginalia from './Marginalia.svelte';
  import Inspector from './Inspector.svelte';

  function toggleMute() {
    audioMuted.update((m) => {
      setAudioMuted(!m);
      return !m;
    });
  }

  let canvasContainer: HTMLDivElement;
  let handle: GameViewHandle | null = null;

  const tools: { tool: Tool; label: string; desc: string }[] = [
    { tool: 'successor', label: '{ }  Successor', desc: 'Taps the river: writes 1s from zeros. Build many — width is the source.' },
    { tool: 'addition', label: '+  Addition', desc: 'Plumbing: consolidates small numbers into fewer, larger operands.' },
    { tool: 'multiplication', label: '×  Multiplication', desc: 'The amplifier: the product is score AND future fuel.' },
    { tool: 'exponentiation', label: '^  Exponentiation', desc: 'The jump operator: a^b. Big jumps demand working notes — show your work.' },
    { tool: 'mill', label: 'M  Mill', desc: 'Splits a block into ≤16 equal pieces (value conserved) — right-sizes fuel and notes.' },
    { tool: 'accelerator', label: '»  Accelerator', desc: 'A power plant: its charge carries blocks on covered pipes. Feed it to keep logistics flowing.' },
    { tool: 'warehouse', label: 'W  Warehouse', desc: 'A stockpile: pipes deposit; output pipes withdraw largest-first. Click it for hand-verbs.' },
    { tool: 'pipe', label: '↳  Pipe', desc: 'Wire an output to a port. Tip: drag straight from an output nub — no tool needed.' },
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
      ? 'Click an output, then an input port… (Esc cancels)'
      : t
        ? 'Click the page to place — the tool stays in hand. Esc puts it down.'
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

  <header class="score" title="Total Score — the magnitude of every number you possess (loose, staged, in transit)">
    <div class="sigma">Σ</div>
    <div class="value">{$scoreStore}</div>
    <div class="caption">everything you hold · frontier = your biggest single number</div>
  </header>

  <aside class="monitor">
    <details open>
      <summary class="row big"><span>frontier</span><b>{$frontierStore}</b></summary>
      <div class="row"><span>time</span><b>{elapsed($statsStore.elapsed)}</b></div>
      <div class="row"><span>cells / working</span><b>{$statsStore.cells} / {$statsStore.working}</b></div>
      <div class="row"><span>pipes / loose</span><b>{$statsStore.pipes} / {$statsStore.loose}</b></div>
      <div class="row"><span>pencils (builds)</span><b>{$statsStore.building} / {$statsStore.slots === Infinity ? '∞' : $statsStore.slots}</b></div>
      {#if $statsStore.scoreRate}
        <div class="row"><span>Σ rate</span><b>{$statsStore.scoreRate}</b></div>
        <div class="row"><span>production</span><b>{$statsStore.produceRate}</b></div>
      {/if}
      {#if $statsStore.bottleneck}
        <p class="bottleneck">{$statsStore.bottleneck}</p>
      {/if}
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
      <details class="journal">
        <summary>journal — the back page</summary>
        <div class="entries">
          {#each [...$journal].reverse() as j (j.id)}
            <p><span>{j.t}</span>{j.text}</p>
          {:else}
            <p class="empty">Nothing noted yet.</p>
          {/each}
        </div>
      </details>
    </details>
  </aside>

  <aside class="shelf">
    <details open>
      <summary><h2>Apparatus</h2></summary>
      <p class="hint">Place a cell, then drop blocks onto its ports. Drag cells to move; shift-click a cell or pipe to delete (Ctrl+Z un-erases).</p>
    {#each tools.filter((t) => $unlockedTools.includes(t.tool)) as t, i (t.tool)}
      <button class:active={$toolStore === t.tool} title={t.desc} onclick={() => pick(t.tool)}>
        {t.label}<span class="key">{i + 1}</span>{#if $buildPreviews[t.tool]}<span class="eta">{$buildPreviews[t.tool]}</span>{/if}
      </button>
    {/each}
    <p class="keys">Space pause · −/+ speed · F fit view · Esc cancel · Ctrl+Z un-erase · drag empty page to select</p>
    {#if $toolStore}
      <p class="placing">{hint($toolStore)}</p>
    {/if}
    <details class="legend">
      <summary>? the canvas vocabulary</summary>
      <p>○ operand port · □ fuel socket · ● output nub</p>
      <p>dashed square — drop a block here</p>
      <p>ring — the operation's clock · dashed outer ring — working notes due</p>
      <p>≥ N — the fuel grade it accepts · ~3m — time left at current rate</p>
      <p>dashed red — refused or clogged</p>
      <p>hatching — heavy (slow on pipes; mill it, or power the pipe)</p>
      <p>×N — a stack · №k — waiting for a build pencil</p>
    </details>
    </details>
  </aside>

  {#if $statsStore.cells === 0}
    <div class="onboard">Pick <b>Successor</b>, place it anywhere — it taps the river of zeros into 1s.</div>
  {/if}

  <Marginalia />
  <Inspector />
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
  .shelf button .key {
    float: right;
    opacity: 0.4;
    font-size: 11px;
  }
  .shelf button .eta {
    float: right;
    opacity: 0.5;
    font-size: 11px;
    font-style: italic;
    margin-right: 8px;
  }
  /* Collapsible cards (U2.3): the panels fold to a one-line header so the
     factory underneath is reachable. Native <details> — penciled, no chrome. */
  summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '▾ ';
    font-size: 10px;
    opacity: 0.45;
  }
  details:not([open]) summary::before {
    content: '▸ ';
  }
  summary h2 {
    display: inline;
  }
  .shelf .keys {
    margin: 8px 2px 0;
    font-size: 10.5px;
    opacity: 0.55;
    line-height: 1.5;
  }
  .monitor .bottleneck {
    margin: 5px 0 0;
    font-size: 11px;
    font-style: italic;
    opacity: 0.7;
    line-height: 1.35;
  }
  .score .caption {
    font-size: 10px;
    opacity: 0.5;
    text-align: right;
    margin-top: -2px;
  }
  .legend,
  .journal {
    margin-top: 9px;
    font-size: 11px;
  }
  .legend summary,
  .journal summary {
    font-size: 11.5px;
    opacity: 0.7;
  }
  .legend p {
    margin: 3px 0;
    opacity: 0.65;
    line-height: 1.35;
  }
  .journal .entries {
    max-height: 180px;
    overflow-y: auto;
    margin-top: 4px;
  }
  .journal .entries p {
    margin: 3px 0;
    opacity: 0.75;
    line-height: 1.35;
    border-top: 1px dashed rgba(58, 58, 58, 0.12);
    padding-top: 3px;
  }
  .journal .entries p span {
    opacity: 0.5;
    margin-right: 6px;
    font-size: 10px;
  }
  .journal .empty {
    font-style: italic;
    opacity: 0.5;
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
