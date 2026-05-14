<script lang="ts">
  import { comprehension, totalScore, zeroCount } from '../lib/world';

  // While Total Score is zero (only zeros possessed), the header reads "Σ = 0"
  // and we quietly surface the player's zero count alongside — useful even
  // before the Literature shop exists, because zeros are the first currency.
  // The Comprehension cap appears once it matters (after Phase 1 ends, the
  // player will be producing numbers above the default 10).

  function formatComp(n: number): string {
    if (n >= 1_000_000) return `≤ ${(n / 1_000_000).toFixed(0)}M`;
    if (n >= 1_000) return `≤ ${(n / 1_000).toFixed(0)}k`;
    return `≤ ${n}`;
  }
</script>

<div class="score-header">
  <div class="sigma">
    <span class="label">Σ</span>
    <span class="value">{$totalScore.toString()}</span>
  </div>
  {#if $zeroCount > 0}
    <div class="zeros">
      {$zeroCount} {$zeroCount === 1 ? 'zero' : 'zeros'} collected
    </div>
  {/if}
  <div class="comprehension">
    comprehension {formatComp($comprehension)}
  </div>
</div>

<style>
  .score-header {
    position: absolute;
    top: 28px;
    right: 40px;
    font-family: var(--pencil-font);
    color: var(--graphite);
    pointer-events: none;
    text-align: right;
    user-select: none;
  }

  .sigma {
    font-size: 38px;
    line-height: 1;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 8px;
  }

  .label {
    opacity: 0.55;
  }

  .value {
    font-weight: 500;
  }

  .zeros {
    margin-top: 8px;
    font-size: 18px;
    opacity: 0.6;
    font-style: italic;
  }

  .comprehension {
    margin-top: 4px;
    font-size: 14px;
    opacity: 0.5;
    font-style: italic;
    letter-spacing: 0.02em;
  }
</style>
