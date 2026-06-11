<script lang="ts">
  import { inspectorStore } from './lib/view/stores';
  import { fly } from 'svelte/transition';
</script>

{#if $inspectorStore}
  <aside class="inspector" transition:fly={{ y: 12, duration: 180 }}>
    <header>
      <b>{$inspectorStore.title}</b>
      <button class="close" title="Close (Esc)" onclick={() => inspectorStore.set(null)}>×</button>
    </header>
    <p class="role">{$inspectorStore.role}</p>
    {#each $inspectorStore.lines as line (line.k)}
      <div class="row"><span>{line.k}</span><b>{line.v}</b></div>
    {/each}
    {#if $inspectorStore.actions}
      <div class="actions">
        {#each $inspectorStore.actions as a (a.label)}
          <button onclick={a.run}>{a.label}</button>
        {/each}
      </div>
    {/if}
    {#if $inspectorStore.hint}
      <p class="hint">{$inspectorStore.hint}</p>
    {/if}
  </aside>
{/if}

<style>
  /* The inspector card (U4.1) — a penciled index card, bottom-right, clear of
     the monitor above and the river below. Read-only; click-away/Esc closes. */
  .inspector {
    position: absolute;
    right: 16px;
    bottom: 132px;
    width: 252px;
    padding: 10px 12px;
    background: rgba(251, 247, 238, 0.96);
    border: 1px solid rgba(58, 58, 58, 0.35);
    border-radius: 5px;
    box-shadow: 1px 2px 0 rgba(58, 58, 58, 0.12);
    font-family: var(--pencil-font, 'Kalam', cursive);
    color: #3a3a3a;
    font-size: 13px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  header b {
    font-size: 15px;
  }
  .close {
    background: none;
    border: none;
    font: inherit;
    font-size: 16px;
    cursor: pointer;
    color: inherit;
    opacity: 0.5;
    padding: 0 2px;
  }
  .close:hover {
    opacity: 1;
  }
  .role {
    margin: 2px 0 7px;
    font-size: 11.5px;
    font-style: italic;
    opacity: 0.65;
    line-height: 1.35;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 1.5px 0;
    border-top: 1px dashed rgba(58, 58, 58, 0.14);
  }
  .row span {
    opacity: 0.6;
  }
  .row b {
    font-weight: 600;
    text-align: right;
  }
  .hint {
    margin: 7px 0 0;
    font-size: 11.5px;
    font-style: italic;
    opacity: 0.6;
    line-height: 1.35;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .actions button {
    flex: 1;
    padding: 4px 6px;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.35);
    border-radius: 4px;
    font-family: inherit;
    font-size: 11.5px;
    color: inherit;
    cursor: pointer;
  }
  .actions button:hover {
    background: rgba(58, 58, 58, 0.06);
  }
</style>
