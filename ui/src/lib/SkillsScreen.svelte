<script lang="ts">
  import { onMount } from 'svelte';
  import { createSkill, deleteSkill, updateSkill, getBakkesFavorites } from './api';
  import type { BakkesFavorite, Skill } from './api';
  import { useSkills } from './useSkills';
  import { skillTags } from './skillsStore';
  import { getBakkesUserId } from './constants';

  let name = '';
  let category = '';
  let tags = '';
  let notes = '';
  let saving = false;
  let formError: string | null = null;

  let favorites: BakkesFavorite[] = [];
  let favoritesLoading = true;
  let favoritesError: string | null = null;
  let selectedFavoriteCode = '';

    onMount(async () => {
      favoritesLoading = true;
      favoritesError = null;
      try {
        favorites = await getBakkesFavorites(getBakkesUserId());
      } catch (error) {
        favoritesError = error instanceof Error ? error.message : 'Unable to load favorites';
      } finally {
        favoritesLoading = false;
      }
    });

  let editingSkillId: number | null = null;
  let editForm = { name: '', category: '', tags: '', notes: '' };
  let editSaving = false;
  let editError: string | null = null;

  let deletingSkillId: number | null = null;
  let deleteError: string | null = null;

  const skillsStore = useSkills();
  function normalizeTags(input: string) {
    const parsed = input
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    return parsed.length ? parsed.join(', ') : undefined;
  }

  function tagList(input: string | null | undefined) {
    if (!input) {
      return [];
    }

    return input
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    formError = null;

    if (!name.trim()) {
      formError = 'Name is required';
      return;
    }

    saving = true;
    try {
      await createSkill({
        name: name.trim(),
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: normalizeTags(tags),
        favoriteCode: selectedFavoriteCode || undefined,
      });
      name = '';
      category = '';
      tags = '';
      notes = '';
      selectedFavoriteCode = '';
      await skillsStore.refresh();
    } catch (err) {
      formError = err instanceof Error ? err.message : 'Failed to save skill';
    } finally {
      saving = false;
    }
  };

  function beginEdit(skill: Skill) {
    editingSkillId = skill.id;
    editForm = {
      name: skill.name,
      category: skill.category ?? '',
      tags: skill.tags ?? '',
      notes: skill.notes ?? '',
    };
    editError = null;
  }

  function cancelEdit() {
    editingSkillId = null;
    editError = null;
  }

  const handleUpdate = async (skill: Skill) => {
    if (!editForm.name.trim()) {
      editError = 'Name is required';
      return;
    }

    editSaving = true;
    editError = null;
    try {
      const normalized = normalizeTags(editForm.tags);
      await updateSkill({
        id: skill.id,
        name: editForm.name.trim(),
        category: editForm.category.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
        tags: normalized ?? null,
      });
      editingSkillId = null;
      await skillsStore.refresh();
    } catch (err) {
      editError = err instanceof Error ? err.message : 'Failed to update skill';
    } finally {
      editSaving = false;
    }
  };

  const handleDelete = async (skill: Skill) => {
    deleteError = null;
    if (!window.confirm(`Delete "${skill.name}"? This cannot be undone.`)) {
      return;
    }

    deletingSkillId = skill.id;
    try {
      await deleteSkill(skill.id);
      if (editingSkillId === skill.id) {
        editingSkillId = null;
      }
      await skillsStore.refresh();
    } catch (err) {
      deleteError = err instanceof Error ? err.message : 'Failed to delete skill';
    } finally {
      deletingSkillId = null;
    }
  };
</script>

<section class="screen-content">
  <h1>Skills</h1>
  <p>Manage skill categories, notes, and tags in one place.</p>

  <div class="skills-dashboard">
    <div class="skills-panel span-6">
      <h2>Add skill</h2>
      <form class="skill-form" on:submit|preventDefault={handleSubmit}>
        <label>
          Name
          <input type="text" bind:value={name} placeholder="e.g. Aerial" />
        </label>
        <label>
          Category
          <input type="text" bind:value={category} placeholder="Offense, Defense, etc." />
        </label>
        <label>
          Tags (comma separated)
          <input type="text" bind:value={tags} placeholder="Optional tags" />
        </label>
        <label>
          Notes
          <textarea rows="3" bind:value={notes} placeholder="Optional notes about this skill"></textarea>
        </label>
        <label>
          Bakkes favorite
          {#if favoritesLoading}
            <select disabled>
              <option>Loading favorites…</option>
            </select>
          {:else if favoritesError}
            <select disabled>
              <option>{favoritesError}</option>
            </select>
          {:else if favorites.length === 0}
            <select disabled>
              <option>No favorites yet</option>
            </select>
          {:else}
              <select bind:value={selectedFavoriteCode} data-testid="favorites-select">
              <option value="">Do not associate a favorite</option>
              {#each favorites as favorite}
                <option value={favorite.code}>{favorite.name}</option>
              {/each}
            </select>
          {/if}
        </label>
        <input type="hidden" data-testid="favorite-code-input" bind:value={selectedFavoriteCode} />
        {#if favoritesError}
          <p class="form-error">{favoritesError}</p>
        {/if}
        {#if formError}
          <p class="form-error">{formError}</p>
        {/if}
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save skill'}</button>
      </form>
    </div>

    <div class="skills-panel span-6">
      <h2>Existing skills</h2>
      <div class="skills-muted">
        {#if $skillsStore.loading}
          Loading skills...
        {:else if $skillsStore.error}
          <span class="badge offline">{$skillsStore.error}</span>
        {:else if $skillsStore.skills.length === 0}
          <span>No skills added yet.</span>
        {:else}
          {#if $skillTags.length}
            <div class="tag-palette">
              <strong>Existing tags</strong>
              <div class="tag-chips">
                {#each $skillTags as tag}
                  <span class="tag-pill">{tag}</span>
                {/each}
              </div>
            </div>
          {/if}
          {#if deleteError}
            <p class="form-error">{deleteError}</p>
          {/if}
          <ul class="skill-list">
            {#each $skillsStore.skills as skill}
              <li class="skill-item">
                <div class="skill-summary">
                  <div>
                    <strong>{skill.name}</strong>
                    {#if skill.category}
                      <span class="category">{skill.category}</span>
                    {/if}
                    {#if skill.tags}
                      <div class="skill-tags">
                        {#each tagList(skill.tags) as tag}
                          <span class="tag-pill outline">{tag}</span>
                        {/each}
                      </div>
                    {/if}
                    {#if skill.notes}
                      <p class="skill-notes">{skill.notes}</p>
                    {/if}
                  </div>
                  <div class="skill-actions">
                    <button
                      type="button"
                      aria-label={`Edit ${skill.name}`}
                      on:click={() => beginEdit(skill)}
                      disabled={deletingSkillId === skill.id}
                    >
                      {editingSkillId === skill.id ? 'Continue editing' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete ${skill.name}`}
                      on:click={() => handleDelete(skill)}
                      disabled={deletingSkillId === skill.id}
                    >
                      {deletingSkillId === skill.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
                {#if editingSkillId === skill.id}
                  <form class="skill-inline-form" on:submit|preventDefault={() => handleUpdate(skill)}>
                    <label>
                      Name
                      <input type="text" bind:value={editForm.name} placeholder="Skill name" />
                    </label>
                    <label>
                      Category
                      <input type="text" bind:value={editForm.category} placeholder="Optional category" />
                    </label>
                    <label>
                      Tags (comma separated)
                      <input type="text" bind:value={editForm.tags} placeholder="e.g. offense, aerial" />
                    </label>
                    <label>
                      Notes
                      <textarea rows="2" bind:value={editForm.notes} placeholder="Optional notes"></textarea>
                    </label>
                    <div class="inline-actions">
                      <button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
                      <button type="button" class="button-muted" on:click={cancelEdit} disabled={editSaving}>Cancel</button>
                    </div>
                    {#if editError}
                      <p class="form-error">{editError}</p>
                    {/if}
                  </form>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .skills-dashboard {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
  }

  .skills-panel {
    background: var(--card-background, rgba(15, 23, 42, 0.95));
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: var(--history-card-shadow);
    color: #fff;
  }

  .skills-panel[class*='span-'] {
    grid-column: span var(--span, 12);
  }

  .skills-panel.span-6 {
    --span: 6;
  }

  .skills-panel h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
</style>