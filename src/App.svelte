<script lang="ts">
  import { onMount } from 'svelte';
  import { setupGameView, type GameViewHandle } from './lib/view/game-view';
  import { scoreStore, toolStore, type Tool } from './lib/view/stores';

  let canvasContainer: HTMLDivElement;
  let handle: GameViewHandle | null = null;

  const tools: { tool: Tool; label: string }[] = [
    { tool: 'successor', label: '{ }  Successor' },
    { tool: 'addition', label: '+  Addition' },
    { tool: 'multiplication', label: '×  Multiplication' },
    { tool: 'exponentiation', label: '^  Exponentiation' },
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
</script>

<main>
  <div class="canvas-container" bind:this={canvasContainer}></div>

  <header class="score">
    <div class="sigma">Σ</div>
    <div class="value">{$scoreStore}</div>
  </header>

  <aside class="shelf">
    <h2>Literature</h2>
    <p class="hint">Place a cell, then drop blocks onto its ports.</p>
    {#each tools as t}
      <button class:active={$toolStore === t.tool} onclick={() => pick(t.tool)}>
        {t.label}
      </button>
    {/each}
    {#if $toolStore}
      <p class="placing">{hint($toolStore)}</p>
    {/if}
  </aside>
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
</style>
