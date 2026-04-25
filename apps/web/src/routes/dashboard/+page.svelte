<svelte:head>
	<title>dashboard — nazuraki.dev</title>
</svelte:head>

<script lang="ts">
import Code from './sections/Code.svelte';
import Stats from './sections/Stats.svelte';
</script>

<div class="dashboard">
  <div class="code">
    <Code />
  </div>
  <div class="stats">
    <Stats />
  </div>
</div>

<style>
  /*
   * Bridge sysctl CSS vars to nazu design tokens.
   * Components use --surface-1, --primary, etc.; tokens.css provides --color-*.
   */
  .dashboard {
    --bg:             #0e0e10;
    --surface-0:      #131315;
    --surface-1:      #1b1b1d;
    --surface-2:      #201f21;
    --surface-3:      #2a2a2c;
    --primary:        #cebdff;
    --secondary:      #ff9bbb;
    --on-surface:     #e6e3e8;
    --on-surface-dim: #938f99;
    --outline:        #47464a;
    --success:        #6fcf97;
    --warning:        #f2c94c;
    --caution:        #f2994a;
    --error:          #eb5757;
    --font-display:   'Space Grotesk', system-ui, sans-serif;
    --font-body:      'Inter', system-ui, sans-serif;

    display: grid;
    grid-template-columns: 3fr 1fr;
    /* fill viewport minus the 3rem nazu header */
    height: calc(100vh - 3rem);
    overflow: hidden;
    background: var(--bg);
    color: var(--on-surface);
    font-family: var(--font-body);
    font-size: 125%;
  }

  .code {
    background: var(--bg);
    overflow: hidden;
  }

  .stats {
    background: var(--surface-2);
    overflow-y: auto;
  }
</style>
