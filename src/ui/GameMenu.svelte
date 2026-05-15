<script lang="ts">
  /**
   * Game options menu — small pencil-style menu button in the top-left
   * corner. Currently offers a "new game" reset for playtest purposes.
   *
   * Future home for: prestige (when Slice 6.3 lands), audio toggle,
   * settings, etc.
   */

  let open = false;
  let confirming: 'soft' | 'hard' | null = null;

  function toggle(): void {
    open = !open;
    if (!open) confirming = null;
  }

  function requestReset(kind: 'soft' | 'hard'): void {
    confirming = kind;
  }

  function cancelReset(): void {
    confirming = null;
  }

  function confirmReset(): void {
    try {
      localStorage.removeItem('numbers-go-big.save');
      if (confirming === 'hard') {
        localStorage.removeItem('numbers-go-big.blueprints');
      }
    } catch {
      // localStorage unavailable — nothing we can do.
    }
    // Reload the page to re-bootstrap with a clean world.
    window.location.reload();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      open = false;
      confirming = null;
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="game-menu">
  <button
    class="trigger"
    type="button"
    title="Game options"
    on:click={toggle}
  >
    ≡
  </button>

  {#if open}
    <div class="panel" role="menu">
      <div class="panel-title">Notebook options</div>
      <p class="hint">
        Resets are unrecoverable. Make a copy of <code>localStorage</code>
        first if you want to come back.
      </p>

      {#if !confirming}
        <button class="action" type="button" on:click={() => requestReset('soft')}>
          New game
          <span class="action-note">clears save · keeps blueprints</span>
        </button>
        <button class="action" type="button" on:click={() => requestReset('hard')}>
          Hard reset
          <span class="action-note">clears everything · including blueprints</span>
        </button>
      {:else}
        <div class="confirm">
          <div class="confirm-text">
            {#if confirming === 'soft'}
              Erase your factory and start over? Blueprints will be kept.
            {:else}
              Erase your factory <em>and</em> the Blueprint library? This cannot be undone.
            {/if}
          </div>
          <div class="confirm-row">
            <button class="confirm-yes" type="button" on:click={confirmReset}>
              Yes, reset
            </button>
            <button class="confirm-no" type="button" on:click={cancelReset}>
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .game-menu {
    position: absolute;
    bottom: 14px;
    left: 14px;
    z-index: 30;
    font-family: var(--pencil-font);
    color: var(--graphite);
    /* Panel opens upward, so anchor flex column from the bottom. */
    display: flex;
    flex-direction: column-reverse;
    align-items: flex-start;
    gap: 8px;
  }

  .trigger {
    background: rgba(251, 247, 238, 0.78);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(58, 58, 58, 0.32);
    border-radius: 4px;
    font-family: inherit;
    color: inherit;
    font-size: 26px;
    line-height: 1;
    width: 38px;
    height: 38px;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s ease, transform 0.05s ease;
  }
  .trigger:hover {
    background: rgba(244, 230, 138, 0.55);
  }
  .trigger:active {
    transform: translateY(1px);
  }

  .panel {
    width: 290px;
    background: rgba(251, 247, 238, 0.92);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(58, 58, 58, 0.28);
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 14px;
  }

  .panel-title {
    font-size: 16px;
    font-weight: 500;
    padding-bottom: 8px;
    border-bottom: 1px dashed rgba(58, 58, 58, 0.32);
  }

  .hint {
    margin: 0;
    font-size: 12px;
    opacity: 0.65;
    line-height: 1.4;
    font-style: italic;
  }
  .hint code {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
    background: rgba(58, 58, 58, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .action {
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.40);
    border-radius: 3px;
    padding: 8px 10px;
    font-family: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: background 0.15s ease;
  }
  .action:hover {
    background: rgba(244, 230, 138, 0.40);
  }
  .action-note {
    font-size: 11px;
    opacity: 0.6;
    font-style: italic;
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px;
    border: 1px dashed rgba(58, 58, 58, 0.42);
    border-radius: 3px;
    background: rgba(244, 230, 138, 0.18);
  }
  .confirm-text {
    font-size: 13px;
    line-height: 1.4;
  }
  .confirm-row {
    display: flex;
    gap: 8px;
  }
  .confirm-yes,
  .confirm-no {
    flex: 1;
    background: transparent;
    border: 1px solid rgba(58, 58, 58, 0.55);
    border-radius: 3px;
    padding: 6px 10px;
    font-family: inherit;
    font-size: 13px;
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.05s ease;
  }
  .confirm-yes:hover {
    background: rgba(192, 92, 92, 0.18);
  }
  .confirm-no:hover {
    background: rgba(244, 230, 138, 0.45);
  }
  .confirm-yes:active,
  .confirm-no:active {
    transform: translateY(1px);
  }
</style>
