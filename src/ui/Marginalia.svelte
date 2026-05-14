<script lang="ts">
  import { notes } from '../lib/marginalia';
  import { fly, fade } from 'svelte/transition';
</script>

<div class="marginalia">
  {#each $notes as note (note.id)}
    <div
      class="note"
      style="transform: rotate({note.rotation}rad);"
      in:fly={{ x: -16, duration: 500, opacity: 0 }}
      out:fade={{ duration: 700 }}
    >
      {note.text}
    </div>
  {/each}
</div>

<style>
  .marginalia {
    position: absolute;
    top: 96px;
    left: 44px;
    max-width: 320px;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
    z-index: 5;
  }

  .note {
    font-family: 'Caveat', 'Patrick Hand', cursive, serif;
    font-style: italic;
    font-size: 22px;
    color: var(--graphite);
    opacity: 0.82;
    line-height: 1.32;
    /* Soft paper glow so the note reads cleanly over the canvas content. */
    text-shadow:
      0 0 6px rgba(251, 247, 238, 0.95),
      0 0 14px rgba(251, 247, 238, 0.85),
      0 0 24px rgba(251, 247, 238, 0.6);
    transform-origin: left center;
  }
</style>
