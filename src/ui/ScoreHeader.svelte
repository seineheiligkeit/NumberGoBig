<script lang="ts">
  import { comprehension, totalScore, zeroCount } from '../lib/world';

  // While Total Score is zero (only zeros possessed), the header reads "Σ = 0"
  // and we quietly surface the player's zero count alongside — useful even
  // before the Literature shop exists, because zeros are the first currency.
  // The Comprehension cap appears once it matters (after Phase 1 ends, the
  // player will be producing numbers above the default 10).

  // Phase 6: comprehension is power-of-2. The bit-count is the
  // mathematician's natural reading; pair it with the explicit value
  // so the player sees both ("Comp ≤ 2^10 (= 1,024)"). Falls back to
  // a plain "≤ N" for non-power-of-2 values (shouldn't happen post-
  // v15 migration but defensive).
  const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function superscript(n: number): string {
    return String(n)
      .split('')
      .map((d) => SUPS[parseInt(d, 10)] ?? d)
      .join('');
  }
  function formatComp(n: number): string {
    if (n < 1) return `≤ ${n}`;
    const log = Math.log2(n);
    const tier = Math.round(log);
    const isExactPow2 = Math.abs(log - tier) < 1e-9;
    if (!isExactPow2) return `≤ ${n.toLocaleString()}`;
    if (tier <= 3) return `≤ ${n}`; // ≤2, ≤4, ≤8 read cleanly
    return `≤ 2${superscript(tier)} (= ${n.toLocaleString()})`;
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
