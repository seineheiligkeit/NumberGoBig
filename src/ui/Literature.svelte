<script lang="ts">
  import {
    LITERATURE_ENTRIES,
    canAfford,
    currentCost,
    formatCost,
    isCellEntry,
    isCompRequirementMet,
    isComprehensionEntryAvailable,
    isLevelUpgradeAvailable,
    purchase,
    type LiteratureEntry,
  } from '../lib/literature';
  import {
    achievements,
    cellLevels,
    comprehension,
    countByValue,
    purchaseCounts,
  } from '../lib/world';
  import { getController } from '../lib/interaction';
  import type { CellType } from '../../core/cell-types';

  $: visible = $achievements.has('play_with_zeros');

  // Re-evaluate the visible entries whenever cell/pipe levels or
  // comprehension change. Phase 6 β.1 adds the comp-tier filter (one
  // next-unowned comp entry visible); β.2 adds the comp-requirement
  // filter (pipes hidden until comp climbs past their magnitude).
  $: visibleEntries = (() => {
    // Touch the stores so reactivity tracks changes (no-op reads).
    void $cellLevels;
    void $comprehension;
    // pipeLevels store dropped in γ.1 — pipe leveling dissolved.
    return LITERATURE_ENTRIES.filter(
      (e) =>
        isLevelUpgradeAvailable(e) &&
        isComprehensionEntryAvailable(e) &&
        isCompRequirementMet(e),
    );
  })();

  function tryPurchase(entry: LiteratureEntry): void {
    const ok = purchase(entry);
    if (!ok) return;
    if (isCellEntry(entry)) {
      // Rule-warehouse entries (`placementCellType` set) carry both the
      // CellType and the `ruleId` to install; ordinary cell entries use
      // their id directly as the CellType. Phase 6 δ.1: decomposer-bot
      // entries also carry a `botRating` for the placed bot.
      const type = (entry.placementCellType ?? entry.id) as CellType;
      getController().beginCellPlacement(type, {
        ruleId: entry.ruleId,
        botRating: entry.botRating,
      });
    } else if (entry.kind === 'pipe' && entry.pipeMagnitude) {
      getController().beginPipePlacement(entry.pipeMagnitude, entry.pipeCooldownMs ?? 1000);
    }
    // 'level' entries take effect immediately on purchase (the side-effect
    // ran in `purchase()`); no placement flow.
  }

  function buttonLabel(entry: LiteratureEntry, owned: number): string {
    if (entry.kind === 'theorem') return 'inscribe';
    if (entry.kind === 'comprehension') return 'comprehend';
    if (entry.kind === 'pipe') return owned > 0 ? 'lay another' : 'lay pipe';
    if (entry.kind === 'level') return 'upgrade';
    return owned > 0 ? 'acquire another' : 'acquire';
  }

  function terminalLabel(entry: LiteratureEntry): string {
    if (entry.kind === 'theorem') return '✓ inscribed';
    if (entry.kind === 'comprehension') return '✓ comprehended';
    if (entry.kind === 'level') return '✓ upgraded';
    return '✓ acquired';
  }
</script>

<aside class="literature" class:visible>
  <header>
    <span class="title">Literature</span>
    <span class="subtitle">results in your hand</span>
  </header>

  <ul class="entries">
    {#each visibleEntries as entry (entry.id)}
      {@const owned = $purchaseCounts.get(entry.id) ?? 0}
      {@const cost = currentCost(entry, owned)}
      {@const affordable = canAfford(cost, $countByValue)}
      {@const terminal = entry.isOnce && owned > 0}
      <li
        class="entry"
        class:purchased={owned > 0}
        class:locked={!affordable && !terminal}
        class:theorem={entry.kind === 'theorem'}
        class:comprehension={entry.kind === 'comprehension'}
        class:level={entry.kind === 'level'}
      >
        <div class="row">
          <span class="glyph">{entry.glyph}</span>
          <div class="info">
            <div class="name">{entry.name}</div>
            <div class="description">{entry.description}</div>
          </div>
        </div>
        <div class="footer">
          {#if terminal}
            <span class="status">{terminalLabel(entry)}</span>
          {:else}
            <span class="cost" class:affordable>
              {formatCost(cost)}
              {#if owned > 0}
                <span class="owned">(owned {owned})</span>
              {/if}
            </span>
            <button
              type="button"
              class="buy"
              disabled={!affordable}
              on:click={() => tryPurchase(entry)}
            >
              {buttonLabel(entry, owned)}
            </button>
          {/if}
        </div>
      </li>
    {/each}

    <li class="entry placeholder">?</li>
    <li class="entry placeholder">?</li>
  </ul>
</aside>

<style>
  .literature {
    position: absolute;
    top: 0;
    right: 0;
    height: 100vh;
    width: 320px;
    padding: 28px 26px 24px 26px;
    background: rgba(251, 247, 238, 0.78);
    backdrop-filter: blur(2px);
    border-left: 1px solid rgba(58, 58, 58, 0.18);
    color: var(--graphite);
    font-family: var(--pencil-font);
    box-sizing: border-box;
    overflow-y: auto;
    transform: translateX(110%);
    transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: auto;
  }
  .literature.visible {
    transform: translateX(0);
  }

  header {
    margin-bottom: 24px;
    padding-bottom: 14px;
    border-bottom: 1px dashed rgba(58, 58, 58, 0.32);
  }
  .title {
    font-size: 28px;
    font-weight: 500;
  }
  .subtitle {
    font-size: 15px;
    font-style: italic;
    opacity: 0.55;
    margin-left: 10px;
  }

  .entries {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entry {
    padding: 12px 14px;
    border: 1px solid rgba(58, 58, 58, 0.24);
    border-radius: 4px;
    background: rgba(255, 252, 244, 0.55);
  }
  .entry.locked {
    opacity: 0.55;
  }
  .entry.purchased {
    background: rgba(255, 252, 244, 0.3);
    opacity: 0.78;
  }
  .entry.placeholder {
    text-align: center;
    font-size: 26px;
    opacity: 0.32;
    border-style: dashed;
  }
  .entry.theorem {
    border-style: dashed;
    border-color: rgba(58, 58, 58, 0.34);
  }
  .entry.theorem .glyph {
    font-style: italic;
    opacity: 0.7;
  }
  .entry.comprehension {
    border-color: rgba(58, 58, 58, 0.40);
    background: rgba(244, 230, 138, 0.10);
  }
  .entry.comprehension .glyph {
    font-size: 22px;
    opacity: 0.85;
  }

  /* Level upgrades — subtle differentiation from cells/pipes. The glyph
     is a Roman numeral, larger than usual so it reads as the upgrade
     tier at a glance. */
  .entry.level {
    border-color: rgba(58, 58, 58, 0.30);
    background: rgba(245, 240, 220, 0.18);
  }
  .entry.level .glyph {
    font-size: 30px;
    font-style: italic;
    opacity: 0.85;
  }

  .row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .glyph {
    font-size: 32px;
    line-height: 1;
    min-width: 42px;
    text-align: center;
    opacity: 0.85;
  }

  .info {
    flex: 1;
  }
  .name {
    font-size: 20px;
    font-weight: 500;
  }
  .description {
    font-size: 14px;
    opacity: 0.7;
    margin-top: 4px;
    line-height: 1.3;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    gap: 10px;
  }

  .cost {
    font-size: 15px;
    opacity: 0.65;
  }
  .cost.affordable {
    opacity: 0.95;
  }
  .cost .owned {
    font-size: 13px;
    opacity: 0.7;
    margin-left: 4px;
    font-style: italic;
  }

  .buy {
    font-family: inherit;
    font-size: 16px;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.55);
    color: var(--graphite);
    padding: 5px 12px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.05s ease;
  }
  .buy:hover:not(:disabled) {
    background: rgba(244, 230, 138, 0.55);
  }
  .buy:active:not(:disabled) {
    transform: translateY(1px);
  }
  .buy:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .status {
    font-size: 15px;
    opacity: 0.75;
    font-style: italic;
  }
</style>
