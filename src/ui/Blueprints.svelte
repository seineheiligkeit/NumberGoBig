<script lang="ts">
  import { blueprints, deleteBlueprint } from '../lib/blueprints';
  import { getController } from '../lib/interaction';

  let visible = false;

  function toggle(): void {
    visible = !visible;
  }

  function startSelection(): void {
    visible = false;
    getController().beginBlueprintSelection();
  }

  function stamp(id: string): void {
    visible = false;
    getController().beginBlueprintPlacement(id);
  }

  function remove(id: string, name: string): void {
    if (window.confirm(`Delete blueprint "${name}"? This cannot be undone.`)) {
      deleteBlueprint(id);
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString();
  }
</script>

<button class="blueprints-toggle" type="button" on:click={toggle} class:open={visible}>
  Blueprints
  {#if $blueprints.length > 0}
    <span class="count">· {$blueprints.length}</span>
  {/if}
</button>

{#if visible}
  <aside class="blueprints">
    <header>
      <span class="title">Blueprints</span>
      <span class="subtitle">named layouts, reusable</span>
      <button class="close" type="button" on:click={() => (visible = false)} aria-label="Close">×</button>
    </header>

    <div class="actions">
      <button type="button" class="primary" on:click={startSelection}>
        + New from selection
      </button>
      <p class="hint">Click a saved blueprint to stamp a copy. The library persists between sessions.</p>
    </div>

    <div class="content">
      {#if $blueprints.length === 0}
        <p class="empty">
          No blueprints yet. Build a layout you'd like to reuse, then hit
          <em>New from selection</em> and drag a rectangle around it.
        </p>
      {:else}
        <ul class="list">
          {#each $blueprints as bp (bp.id)}
            <li class="bp">
              <div class="bp-head">
                <span class="bp-name">{bp.name}</span>
                <button class="bp-delete" type="button" on:click={() => remove(bp.id, bp.name)} aria-label="Delete">×</button>
              </div>
              <div class="bp-meta">
                {bp.cells.length} cell{bp.cells.length === 1 ? '' : 's'},
                {bp.pipes.length} pipe{bp.pipes.length === 1 ? '' : 's'}
                · {formatDate(bp.createdAt)}
              </div>
              <button type="button" class="bp-stamp" on:click={() => stamp(bp.id)}>
                stamp
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .blueprints-toggle {
    position: absolute;
    top: 28px;
    left: 132px;
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
  .blueprints-toggle:hover {
    background: rgba(244, 230, 138, 0.4);
  }
  .blueprints-toggle.open {
    background: rgba(244, 230, 138, 0.55);
    border-style: solid;
  }
  .blueprints-toggle .count {
    opacity: 0.65;
    margin-left: 4px;
    font-style: italic;
  }

  .blueprints {
    position: absolute;
    top: 78px;
    left: 132px;
    width: 360px;
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

  .actions {
    padding: 16px 22px;
    border-bottom: 1px solid rgba(58, 58, 58, 0.14);
  }
  .actions .primary {
    font-family: var(--pencil-font);
    font-size: 15px;
    background: rgba(244, 230, 138, 0.4);
    border: 1px solid rgba(58, 58, 58, 0.55);
    color: var(--graphite);
    padding: 7px 14px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .actions .primary:hover {
    background: rgba(244, 230, 138, 0.7);
  }
  .actions .hint {
    margin-top: 10px;
    font-size: 13px;
    font-style: italic;
    opacity: 0.6;
    line-height: 1.4;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 18px;
  }

  .empty {
    font-size: 14px;
    font-style: italic;
    opacity: 0.6;
    line-height: 1.5;
    padding: 30px 6px;
    text-align: center;
  }

  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bp {
    padding: 12px 14px;
    border: 1px solid rgba(58, 58, 58, 0.22);
    border-radius: 4px;
    background: rgba(255, 252, 244, 0.55);
  }
  .bp-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .bp-name {
    font-size: 18px;
    font-weight: 500;
  }
  .bp-meta {
    font-size: 12px;
    opacity: 0.6;
    font-style: italic;
    margin-top: 3px;
  }
  .bp-stamp {
    margin-top: 10px;
    font-family: var(--pencil-font);
    font-size: 14px;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.55);
    color: var(--graphite);
    padding: 5px 12px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .bp-stamp:hover {
    background: rgba(244, 230, 138, 0.55);
  }
  .bp-delete {
    background: transparent;
    border: none;
    color: var(--graphite);
    opacity: 0.4;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    font-family: var(--pencil-font);
  }
  .bp-delete:hover {
    opacity: 0.85;
  }

  .content::-webkit-scrollbar {
    width: 7px;
  }
  .content::-webkit-scrollbar-thumb {
    background: rgba(58, 58, 58, 0.22);
    border-radius: 4px;
  }
</style>
