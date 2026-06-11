<script lang="ts">
  import { marginalia } from './lib/view/narrator';
  import { fly, fade } from 'svelte/transition';
</script>

<aside class="marginalia">
  {#each $marginalia as n (n.id)}
    <p in:fly={{ x: -14, duration: 420 }} out:fade={{ duration: 700 }}>{n.text}</p>
  {/each}
</aside>

<style>
  .marginalia {
    position: absolute;
    left: 18px;
    bottom: 132px; /* clear of the river band (U2.3) — notes never drown in zeros */
    width: 250px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    pointer-events: none;
    font-family: var(--pencil-font, 'Kalam', cursive);
    color: #3a3a3a;
  }
  .marginalia p {
    margin: 0;
    font-size: 14px;
    font-style: italic;
    line-height: 1.3;
    opacity: 0.78;
    /* a faint pencil rule under each note, like a margin annotation */
    border-left: 2px solid rgba(58, 58, 58, 0.25);
    padding-left: 9px;
  }
</style>
