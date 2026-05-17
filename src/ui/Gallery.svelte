<script lang="ts">
  import { discoveredValues } from '../lib/world';
  import {
    FAMOUS_NUMBERS,
    KNOWN_PERFECTS,
    famousNumberOf,
    integerFromKey,
    isPrime,
  } from '../../core/classify';
  import { valueOf } from '../../core/value';

  type Tab = 'integers' | 'primes' | 'perfects' | 'famous';
  let activeTab: Tab = 'integers';
  let visible = false;

  // The grid renders 0..99 explicitly; integers above that get listed
  // separately below. The thresholds keep the grid finite without
  // hiding mid-game discoveries that go past 100.
  const GRID_SIZE = 100;

  $: discoveredInts = (() => {
    const out = new Set<number>();
    for (const k of $discoveredValues) {
      const n = integerFromKey(k);
      if (n !== null && n >= 0) out.add(n);
    }
    return out;
  })();

  $: discoveredPrimes = (() => {
    const out: number[] = [];
    for (const n of discoveredInts) {
      if (isPrime(valueOf(n))) out.push(n);
    }
    out.sort((a, b) => a - b);
    return out;
  })();

  $: discoveredPerfects = KNOWN_PERFECTS.filter((p) => discoveredInts.has(p));

  $: discoveredFamous = FAMOUS_NUMBERS.filter((f) => discoveredInts.has(f.value));

  // Integers above the rendered grid — listed plainly so they don't get
  // lost. Cap at 64 entries so a runaway cultivator doesn't blow up the
  // panel; the rest are summarised.
  const OVERFLOW_LIMIT = 64;
  $: largeInts = (() => {
    const out: number[] = [];
    for (const n of discoveredInts) {
      if (n >= GRID_SIZE) out.push(n);
    }
    out.sort((a, b) => a - b);
    return out;
  })();

  function toggle(): void {
    visible = !visible;
  }
</script>

<button class="gallery-toggle" type="button" on:click={toggle} class:open={visible}>
  Gallery
  {#if discoveredInts.size > 0}
    <span class="count">· {discoveredInts.size}</span>
  {/if}
</button>

{#if visible}
  <aside class="gallery">
    <header>
      <span class="title">Number Gallery</span>
      <span class="subtitle">a record of every value produced</span>
      <button class="close" type="button" on:click={() => (visible = false)} aria-label="Close">×</button>
    </header>

    <nav class="tabs">
      <button class:active={activeTab === 'integers'} on:click={() => (activeTab = 'integers')}>
        Integers <span class="tabcount">{discoveredInts.size}</span>
      </button>
      <button class:active={activeTab === 'primes'} on:click={() => (activeTab = 'primes')}>
        Primes <span class="tabcount">{discoveredPrimes.length}</span>
      </button>
      <button class:active={activeTab === 'perfects'} on:click={() => (activeTab = 'perfects')}>
        Perfects <span class="tabcount">{discoveredPerfects.length}</span>
      </button>
      <button class:active={activeTab === 'famous'} on:click={() => (activeTab = 'famous')}>
        Famous <span class="tabcount">{discoveredFamous.length}</span>
      </button>
    </nav>

    <div class="content">
      {#if activeTab === 'integers'}
        <p class="hint">First hundred — discovered cells fill in.</p>
        <div class="integers-grid">
          {#each Array(GRID_SIZE) as _, i}
            {@const found = discoveredInts.has(i)}
            {@const famous = found && famousNumberOf(valueOf(i)) !== null}
            <div class="cell" class:found class:famous title={famous ? famousNumberOf(valueOf(i))?.label : ''}>
              <span>{found ? i : ''}</span>
            </div>
          {/each}
        </div>
        {#if largeInts.length > 0}
          <h3 class="section-head">Beyond 99</h3>
          <ul class="number-list">
            {#each largeInts.slice(0, OVERFLOW_LIMIT) as n}
              {@const famous = famousNumberOf(valueOf(n))}
              <li class:famous={famous !== null}>
                <span class="num">{n.toLocaleString()}</span>
                {#if famous}
                  <span class="annot">— {famous.label}</span>
                {/if}
              </li>
            {/each}
          </ul>
          {#if largeInts.length > OVERFLOW_LIMIT}
            <p class="overflow-note">… and {largeInts.length - OVERFLOW_LIMIT} more.</p>
          {/if}
        {/if}

      {:else if activeTab === 'primes'}
        <p class="hint">Primes discovered, in ascending order. The radical sign is the mathematician's coloured pencil — primes wear it.</p>
        {#if discoveredPrimes.length === 0}
          <p class="empty">No primes recorded yet. Try Factor on a composite.</p>
        {:else}
          <ul class="prime-list">
            {#each discoveredPrimes as p}
              <li><span class="prime">{p.toLocaleString()}</span></li>
            {/each}
          </ul>
        {/if}

      {:else if activeTab === 'perfects'}
        <p class="hint">A perfect number equals the sum of its proper divisors.</p>
        <ul class="perfect-list">
          {#each KNOWN_PERFECTS as p}
            {@const found = discoveredInts.has(p)}
            <li class:found>
              <span class="num">{found ? p.toLocaleString() : '?'.repeat(p.toString().length)}</span>
              {#if !found}
                <span class="annot">— undiscovered</span>
              {/if}
            </li>
          {/each}
        </ul>

      {:else if activeTab === 'famous'}
        <p class="hint">A short list of named integers. Each waits to be produced.</p>
        <ul class="famous-list">
          {#each FAMOUS_NUMBERS as f}
            {@const found = discoveredInts.has(f.value)}
            <li class:found>
              <span class="num">{f.value.toLocaleString()}</span>
              <span class="label">{f.label}</span>
              <span class="detail">{found ? f.detail : '—'}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .gallery-toggle {
    position: absolute;
    top: 28px;
    left: 28px;
    background: transparent;
    border: 1px dashed rgba(58, 58, 58, 0.55);
    color: var(--graphite);
    font-family: var(--pencil-font);
    font-size: 16px;
    padding: 6px 14px;
    cursor: pointer;
    pointer-events: auto;
    border-radius: 3px;
    transition: background 0.15s ease;
    z-index: 6;
  }
  .gallery-toggle:hover {
    background: rgba(244, 230, 138, 0.4);
  }
  .gallery-toggle.open {
    background: rgba(244, 230, 138, 0.55);
    border-style: solid;
  }
  .gallery-toggle .count {
    opacity: 0.65;
    margin-left: 4px;
    font-style: italic;
  }

  .gallery {
    position: absolute;
    top: 78px;
    left: 28px;
    width: 480px;
    height: calc(100vh - 110px);
    background: rgba(251, 247, 238, 0.94);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(58, 58, 58, 0.22);
    border-radius: 4px;
    color: var(--graphite);
    font-family: var(--pencil-font);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    z-index: 5;
    box-shadow: 0 6px 18px rgba(58, 58, 58, 0.08);
  }

  header {
    padding: 18px 22px 12px 22px;
    border-bottom: 1px dashed rgba(58, 58, 58, 0.32);
    position: relative;
  }
  .title {
    font-size: 26px;
    font-weight: 500;
  }
  .subtitle {
    font-size: 14px;
    font-style: italic;
    opacity: 0.55;
    margin-left: 8px;
  }
  .close {
    position: absolute;
    top: 14px;
    right: 14px;
    background: transparent;
    border: none;
    font-family: var(--pencil-font);
    font-size: 26px;
    line-height: 1;
    color: var(--graphite);
    opacity: 0.6;
    cursor: pointer;
    padding: 4px 8px;
  }
  .close:hover {
    opacity: 1;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 10px 16px 0 16px;
    border-bottom: 1px solid rgba(58, 58, 58, 0.14);
  }
  .tabs button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-family: var(--pencil-font);
    font-size: 15px;
    color: var(--graphite);
    opacity: 0.6;
    padding: 8px 12px 10px 12px;
    cursor: pointer;
    transition: opacity 0.12s ease, border-color 0.12s ease;
  }
  .tabs button:hover {
    opacity: 0.9;
  }
  .tabs button.active {
    opacity: 1;
    border-bottom-color: var(--graphite);
  }
  .tabcount {
    font-size: 12px;
    font-style: italic;
    opacity: 0.65;
    margin-left: 4px;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 18px 22px 22px 22px;
  }

  .hint {
    font-size: 14px;
    font-style: italic;
    opacity: 0.62;
    margin-bottom: 14px;
    line-height: 1.4;
  }

  .empty {
    font-size: 15px;
    font-style: italic;
    opacity: 0.55;
    text-align: center;
    padding: 30px 0;
  }

  /* Integers grid — 10×10, each cell is a sketched square. */
  .integers-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }
  .integers-grid .cell {
    aspect-ratio: 1;
    border: 1px dashed rgba(58, 58, 58, 0.2);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: rgba(58, 58, 58, 0.18);
    background: transparent;
    transition: background 0.2s ease;
  }
  .integers-grid .cell.found {
    border-style: solid;
    border-color: rgba(58, 58, 58, 0.55);
    color: var(--graphite);
    background: rgba(255, 252, 244, 0.7);
  }
  .integers-grid .cell.found.famous {
    background: rgba(244, 230, 138, 0.35);
    border-color: var(--graphite);
  }

  .section-head {
    margin-top: 22px;
    margin-bottom: 8px;
    font-size: 16px;
    font-weight: 500;
    border-bottom: 1px dashed rgba(58, 58, 58, 0.28);
    padding-bottom: 4px;
  }

  .number-list,
  .prime-list,
  .perfect-list,
  .famous-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .number-list li,
  .perfect-list li {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    font-size: 15px;
  }
  .number-list .num,
  .perfect-list .num {
    font-weight: 500;
    min-width: 90px;
  }
  .number-list .annot,
  .perfect-list .annot {
    font-style: italic;
    opacity: 0.65;
  }
  .number-list li.famous {
    background: rgba(244, 230, 138, 0.18);
    border-radius: 2px;
    padding-left: 6px;
  }
  .perfect-list li {
    opacity: 0.4;
  }
  .perfect-list li.found {
    opacity: 1;
  }

  .prime-list {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 12px;
  }
  .prime-list li {
    padding: 3px 0;
    font-size: 15px;
    color: var(--accent-red);
    font-weight: 500;
  }

  .famous-list li {
    padding: 8px 0;
    border-bottom: 1px dotted rgba(58, 58, 58, 0.18);
    display: grid;
    grid-template-columns: 80px 1fr;
    column-gap: 10px;
    row-gap: 2px;
    align-items: baseline;
    opacity: 0.45;
  }
  .famous-list li.found {
    opacity: 1;
  }
  .famous-list .num {
    font-weight: 500;
    font-size: 16px;
  }
  .famous-list .label {
    font-style: italic;
  }
  .famous-list .detail {
    grid-column: 2;
    font-size: 13px;
    opacity: 0.7;
    line-height: 1.35;
    margin-top: 2px;
  }

  .overflow-note {
    margin-top: 10px;
    font-size: 13px;
    font-style: italic;
    opacity: 0.55;
  }

  /* Scrollbar — slim and graphite to match the notebook. */
  .content::-webkit-scrollbar {
    width: 7px;
  }
  .content::-webkit-scrollbar-thumb {
    background: rgba(58, 58, 58, 0.22);
    border-radius: 4px;
  }
</style>
