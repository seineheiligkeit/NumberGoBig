<script lang="ts">
  import { onMount } from 'svelte';
  import { setupPixi } from './lib/pixi/setup';
  import { PENCIL_CURSOR_URL } from './lib/cursors';
  import ScoreHeader from './ui/ScoreHeader.svelte';
  import Literature from './ui/Literature.svelte';
  import Gallery from './ui/Gallery.svelte';
  import Blueprints from './ui/Blueprints.svelte';
  import Marginalia from './ui/Marginalia.svelte';
  import GameMenu from './ui/GameMenu.svelte';

  let canvasContainer: HTMLDivElement;

  onMount(() => {
    // Apply the idle pencil cursor as the page default. Drag and placement
    // modes will override transiently and restore this on completion.
    document.body.style.cursor = PENCIL_CURSOR_URL;
    setupPixi(canvasContainer).catch((e) => {
      console.error('[setupPixi] failed:', e);
    });
  });
</script>

<main>
  <div class="canvas-container" bind:this={canvasContainer}></div>
  <ScoreHeader />
  <Literature />
  <Gallery />
  <Blueprints />
  <Marginalia />
  <GameMenu />
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
</style>
