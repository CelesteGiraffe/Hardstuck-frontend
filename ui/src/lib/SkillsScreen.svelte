<script lang="ts">
  import { onMount } from 'svelte';
  import { getSkills, createSkill, type Skill } from './api';

  let skills: Skill[] = [];
  let loading = true;
  let error: string | null = null;

  let name = '';
  let category = '';
  let notes = '';
  let saving = false;
  let formError: string | null = null;

  const loadSkills = async () => {
    loading = true;
    error = null;
    try {
      skills = await getSkills();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load skills';
    } finally {
      loading = false;
    }
  };

  onMount(loadSkills);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    formError = null;

    if (!name.trim()) {
      formError = 'Name is required';
      return;
    }

    saving = true;
    try {
      await createSkill({ name: name.trim(), category: category.trim() || undefined, notes: notes.trim() || undefined });
      name = '';
      category = '';
      notes = '';
      await loadSkills();
    } catch (err) {
      formError = err instanceof Error ? err.message : 'Failed to save skill';
    } finally {
      saving = false;
    }
  };
</script>

<section class="screen-content">
  <h1>Skills</h1>
  <p>Manage skill categories and notes here.</p>

  <div class="skills-muted">
    {#if loading}
      Loading skills...
    {:else if error}
      <span class="badge offline">{error}</span>
    {:else if skills.length === 0}
      <span>No skills added yet.</span>
    {:else}
      <ul class="skill-list">
        {#each skills as skill}
          <li>
            <strong>{skill.name}</strong>
            {#if skill.category}
              <span class="category">{skill.category}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <form class="skill-form" on:submit|preventDefault={handleSubmit}>
    <h2>Add skill</h2>
    <label>
      Name
      <input type="text" bind:value={name} placeholder="e.g. Aerial" />
    </label>
    <label>
      Category
      <input type="text" bind:value={category} placeholder="Offense, Defense, etc." />
    </label>
    <label>
      Notes
      <textarea rows="3" bind:value={notes} placeholder="Optional notes about this skill"></textarea>
    </label>
    {#if formError}
      <p class="form-error">{formError}</p>
    {/if}
    <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save skill'}</button>
  </form>
</section>