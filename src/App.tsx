import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Dice5,
  Feather,
  LoaderCircle,
  Plus,
  ScrollText,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const SCENE_TYPES = ["Adventure", "Encounter", "Mystery", "Campfire", "Question", "Opinion"] as const;
const ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;

type SceneType = (typeof SCENE_TYPES)[number];
type Ability = (typeof ABILITIES)[number];
type CharacterStats = Record<Ability, number>;

type Scene = {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  content: string;
  image_url: string | null;
  scene_type: SceneType;
  upvotes: number;
  created_at: string;
  previous_scene_id: string | null;
  involved_characters: string[];
  canon_action_id: string | null;
};

type Character = CharacterStats & {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  concept: string;
  image_url: string | null;
  created_at: string;
};

type Action = {
  id: string;
  scene_id: string;
  author_id: string;
  author_name: string;
  character_id: string | null;
  character_name: string;
  action_text: string;
  ability: Ability;
  d20_roll: number;
  modifier: number;
  dc: number | null;
  total: number;
  succeeded: boolean | null;
  created_at: string;
};

type SceneInput = {
  title: string;
  content: string;
  image_url: string | null;
  scene_type: SceneType;
  previous_scene_id: string | null;
  involved_characters: string[];
};

type CharacterInput = CharacterStats & {
  name: string;
  concept: string;
  image_url: string | null;
};

type NewAction = {
  character: Character | null;
  newCharacter: CharacterInput | null;
  action_text: string;
  ability: Ability;
  dc: number | null;
};

let playerIdentityPromise: Promise<string> | null = null;

function routeFromHash() {
  const match = window.location.hash.match(/^#scene\/([0-9a-f-]+)$/i);
  return match?.[1] ?? null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function modifierFor(score: number) {
  return Math.floor((score - 10) / 2);
}

function abilityLabel(ability: Ability) {
  return ability.charAt(0).toUpperCase() + ability.slice(1);
}

function ExternalImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function CharacterForm({
  onCreate,
  onCancel,
  compact = false,
}: {
  onCreate: (character: CharacterInput) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [stats, setStats] = useState<CharacterStats>({
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await onCreate({
        name: name.trim(),
        concept: concept.trim(),
        image_url: imageUrl.trim() || null,
        ...stats,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The character could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`form-card ${compact ? "form-card--compact" : ""}`} onSubmit={submit}>
      <div className="form-heading">
        <div>
          <span className="eyebrow">Add to the ledger</span>
          <h3>New character</h3>
        </div>
        {onCancel && (
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close character form">
            <X size={18} />
          </button>
        )}
      </div>
      <label>
        Character name
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={70} />
      </label>
      <label>
        A little about them
        <textarea value={concept} onChange={(event) => setConcept(event.target.value)} rows={2} maxLength={350} />
      </label>
      <label>
        Portrait image URL <span className="optional">(optional)</span>
        <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" />
      </label>
      <div className="stat-grid">
        {ABILITIES.map((ability) => (
          <label className="stat-field" key={ability}>
            {abilityLabel(ability).slice(0, 3).toUpperCase()}
            <input
              type="number"
              min="1"
              max="30"
              value={stats[ability]}
              onChange={(event) => setStats({ ...stats, [ability]: Number(event.target.value) })}
              aria-label={abilityLabel(ability)}
            />
          </label>
        ))}
      </div>
      {formError && <p className="form-error">{formError}</p>}
      <div className="form-actions">
        {onCancel && <button className="button button--quiet" type="button" onClick={onCancel}>Cancel</button>}
        <button className="button button--primary" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
          Save character
        </button>
      </div>
    </form>
  );
}

function SceneForm({
  initialScene,
  previousScene,
  scenes,
  characters,
  onSubmit,
  onCancel,
}: {
  initialScene?: Scene | null;
  previousScene?: Scene | null;
  scenes: Scene[];
  characters: Character[];
  onSubmit: (input: SceneInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialScene?.title ?? "");
  const [content, setContent] = useState(initialScene?.content ?? "");
  const [imageUrl, setImageUrl] = useState(initialScene?.image_url ?? "");
  const [sceneType, setSceneType] = useState<SceneType>(initialScene?.scene_type ?? "Adventure");
  const [previousId, setPreviousId] = useState(initialScene?.previous_scene_id ?? previousScene?.id ?? "");
  const [involved, setInvolved] = useState<string[]>(initialScene?.involved_characters ?? []);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const parentOptions = scenes.filter((item) => item.id !== initialScene?.id);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || null,
        scene_type: sceneType,
        previous_scene_id: previousId || null,
        involved_characters: involved,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The scene could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function toggleCharacter(name: string) {
    setInvolved((current) => current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]);
  }

  return (
    <form className="form-card scene-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <span className="eyebrow">{initialScene ? "Revise the record" : "Set the scene"}</span>
          <h2>{initialScene ? "Edit scene" : "Write a new scene"}</h2>
        </div>
        {onCancel && (
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close scene form">
            <X size={18} />
          </button>
        )}
      </div>
      <label>
        Scene title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} placeholder="The lanterns beneath Greyharbor" />
      </label>
      <label>
        Scene text <span className="optional">(optional)</span>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={8000} placeholder="Set the moment. What do the characters see, hear, or stand to lose?" />
      </label>
      <div className="form-row">
        <label>
          Story flag
          <select value={sceneType} onChange={(event) => setSceneType(event.target.value as SceneType)}>
            {SCENE_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>
          External image URL <span className="optional">(optional)</span>
          <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" />
        </label>
      </div>
      <label>
        Continue a story <span className="optional">(optional)</span>
        <select value={previousId} onChange={(event) => setPreviousId(event.target.value)}>
          <option value="">Start a new thread</option>
          {parentOptions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
        </select>
      </label>
      {previousScene?.canon_action_id && previousId === previousScene.id && (
        <p className="helper-text">
          This scene follows <strong>{previousScene.title}</strong>. Its chosen canon action will appear in the story thread.
        </p>
      )}
      {characters.length > 0 && (
        <fieldset className="character-picker">
          <legend>Characters in this scene</legend>
          <div className="chip-list">
            {characters.map((character) => (
              <label className={`check-chip ${involved.includes(character.name) ? "is-selected" : ""}`} key={character.id}>
                <input type="checkbox" checked={involved.includes(character.name)} onChange={() => toggleCharacter(character.name)} />
                {character.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {formError && <p className="form-error">{formError}</p>}
      <div className="form-actions">
        {onCancel && <button className="button button--quiet" type="button" onClick={onCancel}>Cancel</button>}
        <button className="button button--primary" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={16} /> : <Feather size={16} />}
          {initialScene ? "Save changes" : "Publish scene"}
        </button>
      </div>
    </form>
  );
}

function ActionForm({
  characters,
  onSubmit,
}: {
  characters: Character[];
  onSubmit: (input: NewAction) => Promise<void>;
}) {
  const [characterId, setCharacterId] = useState("");
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [newCharacter, setNewCharacter] = useState<CharacterInput | null>(null);
  const [actionText, setActionText] = useState("");
  const [ability, setAbility] = useState<Ability>("strength");
  const [dc, setDc] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const selectedCharacter = characters.find((character) => character.id === characterId) ?? null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCharacter && !newCharacter) {
      setFormError("Choose a character or create one for this action.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await onSubmit({
        character: selectedCharacter,
        newCharacter,
        action_text: actionText.trim(),
        ability,
        dc: dc ? Number(dc) : null,
      });
      setActionText("");
      setNewCharacter(null);
      setCreatingCharacter(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The action could not be posted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {creatingCharacter && (
        <CharacterForm
          compact
          onCreate={async (character) => {
            setNewCharacter(character);
            setCreatingCharacter(false);
          }}
          onCancel={() => { setCreatingCharacter(false); setNewCharacter(null); }}
        />
      )}
      <form className="action-form" onSubmit={submit}>
        <div className="form-heading">
          <div>
            <span className="eyebrow">Your turn</span>
            <h3>What does a character do?</h3>
          </div>
          <Dice5 className="heading-mark" size={22} />
        </div>
        <label>
          Character
          <select value={creatingCharacter ? "new" : newCharacter ? "pending" : characterId} onChange={(event) => {
            const value = event.target.value;
            setCreatingCharacter(value === "new");
            setCharacterId(value === "new" || value === "pending" ? "" : value);
            if (value !== "pending") setNewCharacter(null);
          }} required>
            <option value="">Choose a character…</option>
            {characters.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}
            {newCharacter && <option value="pending">{newCharacter.name} (new)</option>}
            <option value="new">+ Create a character for this action</option>
          </select>
        </label>
        {newCharacter && <p className="helper-text"><Check size={14} /> {newCharacter.name} will be added to the ledger with this action.</p>}
        <label>
          Action
          <textarea value={actionText} onChange={(event) => setActionText(event.target.value)} rows={3} required maxLength={2000} placeholder="Describe an attempt, not just its outcome. The dice decide the uncertain part." />
        </label>
        <div className="form-row form-row--roll">
          <label>
            Check
            <select value={ability} onChange={(event) => setAbility(event.target.value as Ability)}>
              {ABILITIES.map((name) => <option value={name} key={name}>{abilityLabel(name)}</option>)}
            </select>
          </label>
          <label>
            Difficulty <span className="optional">(optional DC)</span>
            <input type="number" min="1" max="40" value={dc} onChange={(event) => setDc(event.target.value)} placeholder="e.g. 14" />
          </label>
        </div>
        {formError && <p className="form-error">{formError}</p>}
        <button className="button button--primary" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={16} /> : <Swords size={16} />}
          Roll & post action
        </button>
      </form>
    </>
  );
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<"feed" | "characters">("feed");
  const [sceneId, setSceneId] = useState<string | null>(() => routeFromHash());
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [previousScene, setPreviousScene] = useState<Scene | null>(null);
  const [previousCanonAction, setPreviousCanonAction] = useState<Action | null>(null);
  const [canonAction, setCanonAction] = useState<Action | null>(null);
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("wayfarers-display-name") ?? "Wandering Scribe");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created_at" | "upvotes">("created_at");
  const [filterType, setFilterType] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingScene, setEditingScene] = useState(false);
  const [parentForNewScene, setParentForNewScene] = useState<Scene | null>(null);
  const [characterFormOpen, setCharacterFormOpen] = useState(false);
  const [busyActionId, setBusyActionId] = useState("");

  const ownedCharacterCount = useMemo(
    () => characters.filter((character) => character.owner_id === userId).length,
    [characters, userId],
  );

  const loadScenes = useCallback(async () => {
    if (!supabase || !userId) return;
    setFeedLoading(true);
    let request = supabase
      .from("scenes")
      .select("*")
      .order(sortBy, { ascending: false });
    if (search.trim()) request = request.ilike("title", `%${search.trim()}%`);
    if (filterType) request = request.eq("scene_type", filterType);
    const { data, error } = await request;
    if (error) setErrorMessage(`Could not load the story feed: ${error.message}`);
    else setScenes((data ?? []) as Scene[]);
    setFeedLoading(false);
  }, [userId, sortBy, search, filterType]);

  const loadCharacters = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error } = await supabase.from("characters").select("*").order("name");
    if (error) setErrorMessage(`Could not load the character ledger: ${error.message}`);
    else setCharacters((data ?? []) as Character[]);
  }, [userId]);

  const loadSceneDetail = useCallback(async (id: string) => {
    if (!supabase || !userId) return;
    setDetailLoading(true);
    setActions([]);
    setScene(null);
    setPreviousScene(null);
    setPreviousCanonAction(null);
    setCanonAction(null);
    const { data: sceneData, error: sceneError } = await supabase
      .from("scenes")
      .select("*")
      .eq("id", id)
      .single();
    if (sceneError) {
      setErrorMessage(`Could not load this scene: ${sceneError.message}`);
      setScene(null);
      setDetailLoading(false);
      return;
    }
    const selectedScene = sceneData as Scene;
    setScene(selectedScene);
    const { data: actionData, error: actionError } = await supabase
      .from("actions")
      .select("*")
      .eq("scene_id", id)
      .order("created_at", { ascending: true });
    if (actionError) setErrorMessage(`Could not load scene actions: ${actionError.message}`);
    else setActions((actionData ?? []) as Action[]);

    if (selectedScene.previous_scene_id) {
      const { data: previousData, error: previousError } = await supabase
        .from("scenes")
        .select("*")
        .eq("id", selectedScene.previous_scene_id)
        .single();
      if (previousError) setErrorMessage(`Could not load the previous scene: ${previousError.message}`);
      else {
        const parent = previousData as Scene;
        setPreviousScene(parent);
        if (parent.canon_action_id) {
          const { data: previousCanonData, error: previousCanonError } = await supabase
            .from("actions")
            .select("*")
            .eq("id", parent.canon_action_id)
            .single();
          if (previousCanonError) setErrorMessage(`Could not load the previous scene's canon action: ${previousCanonError.message}`);
          else setPreviousCanonAction(previousCanonData as Action);
        }
      }
    } else {
      setPreviousScene(null);
    }
    if (selectedScene.canon_action_id) {
      const { data: canonData, error: canonError } = await supabase
        .from("actions")
        .select("*")
        .eq("id", selectedScene.canon_action_id)
        .single();
      if (canonError) setErrorMessage(`Could not load the canon action: ${canonError.message}`);
      else setCanonAction(canonData as Action);
    } else {
      setCanonAction(null);
    }
    setDetailLoading(false);
  }, [userId]);

  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      setReady(true);
      return;
    }
    let cancelled = false;
    async function signIn(authClient: NonNullable<typeof supabase>) {
      if (!playerIdentityPromise) {
        playerIdentityPromise = (async () => {
          const { data: sessionData, error: sessionError } = await authClient.auth.getSession();
          if (sessionError) throw new Error(`Could not restore your player session: ${sessionError.message}`);
          let id = sessionData.session?.user.id;
          if (!id) {
            const { data, error } = await authClient.auth.signInAnonymously();
            if (error) throw new Error(`Could not create a player session. Enable anonymous sign-ins in Supabase: ${error.message}`);
            id = data.user?.id;
          }
          if (!id) throw new Error("Supabase did not return a player ID.");
          return id;
        })().catch((error: unknown) => {
          playerIdentityPromise = null;
          throw error;
        });
      }
      try {
        const id = await playerIdentityPromise;
        if (!cancelled) {
          setUserId(id);
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not create a player session.");
          setReady(true);
        }
      }
    }
    void signIn(client);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (userId) {
      void loadScenes();
      void loadCharacters();
    }
  }, [userId, loadScenes, loadCharacters]);

  useEffect(() => {
    function syncRoute() {
      setSceneId(routeFromHash());
      if (!routeFromHash()) {
        setPage("feed");
        setEditingScene(false);
      }
    }
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (sceneId && userId) void loadSceneDetail(sceneId);
  }, [sceneId, userId, loadSceneDetail]);

  useEffect(() => {
    localStorage.setItem("wayfarers-display-name", displayName);
  }, [displayName]);

  function navigateHome() {
    window.location.hash = "";
    setSceneId(null);
    setScene(null);
    setEditingScene(false);
    setPage("feed");
  }

  function openScene(id: string) {
    window.location.hash = `scene/${id}`;
    setSceneId(id);
    setComposerOpen(false);
    setEditingScene(false);
  }

  async function createCharacter(input: CharacterInput) {
    if (!supabase || !userId) throw new Error("Your player session is not ready.");
    const { error } = await supabase.from("characters").insert({
      owner_id: userId,
      owner_name: displayName.trim() || "Wandering Scribe",
      ...input,
    });
    if (error) throw new Error(error.message);
    await loadCharacters();
    setCharacterFormOpen(false);
  }

  async function saveScene(input: SceneInput) {
    if (!supabase || !userId) throw new Error("Your player session is not ready.");
    const payload = {
      ...input,
      author_name: displayName.trim() || "Wandering Scribe",
    };
    if (editingScene && scene) {
      const { error } = await supabase.from("scenes").update(input).eq("id", scene.id);
      if (error) throw new Error(error.message);
      await Promise.all([loadScenes(), loadSceneDetail(scene.id)]);
      setEditingScene(false);
    } else {
      const { data, error } = await supabase
        .from("scenes")
        .insert({ ...payload, author_id: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await loadScenes();
      setComposerOpen(false);
      setParentForNewScene(null);
      if (data) openScene(data.id);
    }
  }

  async function deleteScene() {
    if (!supabase || !scene || !window.confirm("Delete this scene and its actions? This cannot be undone.")) return;
    const { error } = await supabase.from("scenes").delete().eq("id", scene.id);
    if (error) setErrorMessage(`Could not delete the scene: ${error.message}`);
    else {
      navigateHome();
      await loadScenes();
    }
  }

  async function postAction(input: NewAction) {
    if (!supabase || !userId || !scene) throw new Error("Your player session is not ready.");
    let character = input.character;
    if (input.newCharacter) {
      const { data, error } = await supabase
        .from("characters")
        .insert({
          owner_id: userId,
          owner_name: displayName.trim() || "Wandering Scribe",
          ...input.newCharacter,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      character = data as Character;
      await loadCharacters();
    }
    if (!character) throw new Error("Choose a character before posting an action.");
    const modifier = modifierFor(character[input.ability]);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + modifier;
    const { error } = await supabase.from("actions").insert({
      scene_id: scene.id,
      author_id: userId,
      author_name: displayName.trim() || "Wandering Scribe",
      character_id: character.id,
      character_name: character.name,
      action_text: input.action_text,
      ability: input.ability,
      d20_roll: roll,
      modifier,
      dc: input.dc,
      total,
      succeeded: input.dc === null ? null : total >= input.dc,
    });
    if (error) throw new Error(error.message);
    await loadSceneDetail(scene.id);
  }

  async function upvoteScene() {
    if (!supabase || !scene) return;
    setBusyActionId("upvote");
    const { error } = await supabase.rpc("increment_scene_upvotes", { scene_id_input: scene.id });
    if (error) setErrorMessage(`Could not record your upvote: ${error.message}`);
    else await Promise.all([loadSceneDetail(scene.id), loadScenes()]);
    setBusyActionId("");
  }

  async function setCanon(actionId: string | null) {
    if (!supabase || !scene) return;
    const { error } = await supabase.from("scenes").update({ canon_action_id: actionId }).eq("id", scene.id);
    if (error) setErrorMessage(`Could not set the canon action: ${error.message}`);
    else await loadSceneDetail(scene.id);
  }

  async function deleteAction(action: Action) {
    if (!supabase || !scene || !window.confirm("Remove this action from the scene?")) return;
    setBusyActionId(action.id);
    const { error } = await supabase.from("actions").delete().eq("id", action.id);
    if (error) setErrorMessage(`Could not delete the action: ${error.message}`);
    else await loadSceneDetail(scene.id);
    setBusyActionId("");
  }

  function beginNextScene() {
    if (!scene) return;
    setParentForNewScene(scene);
    setComposerOpen(true);
    setPage("feed");
    setEditingScene(false);
    window.location.hash = "";
    setSceneId(null);
    setScene(null);
  }

  const setupNeeded = !isSupabaseConfigured;
  const signedIn = Boolean(userId);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={navigateHome} aria-label="Wayfarer's Table home">
          <span className="brand-mark"><BookOpen size={22} /></span>
          <span className="brand-copy">
            <strong>Wayfarer's Table</strong>
            <small>A community story in progress</small>
          </span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={!sceneId && page === "feed" ? "nav-link is-active" : "nav-link"} onClick={navigateHome}>
            <ScrollText size={16} /> The story
          </button>
          <button className={page === "characters" ? "nav-link is-active" : "nav-link"} onClick={() => { setPage("characters"); setSceneId(null); window.location.hash = ""; }}>
            <Users size={16} /> Character ledger
          </button>
        </nav>
        <label className="player-name">
          <span className="player-dot" />
          <input
            aria-label="Your player name"
            title={userId ? `Anonymous player ${userId.slice(0, 8)}; set your display name` : "Set your display name"}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value.slice(0, 40))}
            placeholder="Your player name"
          />
        </label>
      </header>

      <main className="main-content">
        {setupNeeded ? (
          <section className="setup-panel">
            <div className="setup-icon"><Shield size={26} /></div>
            <span className="eyebrow">One small setup step</span>
            <h1>Connect your Supabase table</h1>
            <p>Add the project URL and public anon/publishable key to a local <code>.env.local</code> file. Follow the Supabase setup section in the README, then restart the dev server.</p>
            <pre>VITE_SUPABASE_URL=https://your-project-id.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=your-public-key</pre>
          </section>
        ) : !ready ? (
          <LoadingState label="Finding your place at the table…" />
        ) : !signedIn ? (
          <section className="setup-panel">
            <div className="setup-icon"><Shield size={26} /></div>
            <span className="eyebrow">Player session unavailable</span>
            <h1>We could not join the story</h1>
            <p>Enable anonymous sign-ins in Supabase Authentication settings, then refresh. Your error is shown below.</p>
          </section>
        ) : sceneId ? (
          detailLoading ? <LoadingState label="Unrolling the scene…" /> : scene ? (
            editingScene ? (
              <SceneForm
                initialScene={scene}
                scenes={scenes}
                characters={characters}
                onSubmit={saveScene}
                onCancel={() => setEditingScene(false)}
              />
            ) : (
              <SceneDetail
                scene={scene}
                actions={actions}
                previousScene={previousScene}
                previousCanonAction={previousCanonAction}
                canonAction={canonAction}
                characters={characters}
                userId={userId}
                busyActionId={busyActionId}
                onBack={navigateHome}
                onUpvote={upvoteScene}
                onEdit={() => setEditingScene(true)}
                onDelete={deleteScene}
                onSetCanon={setCanon}
                onDeleteAction={deleteAction}
                onNextScene={beginNextScene}
                onPostAction={postAction}
                onOpenScene={openScene}
              />
            )
          ) : <EmptyState title="Scene not found" detail="It may have been removed, or you may not have access to it." onAction={navigateHome} actionLabel="Back to the story" />
        ) : page === "characters" ? (
          <CharacterLedger
            characters={characters}
            userId={userId}
            ownedCount={ownedCharacterCount}
            createOpen={characterFormOpen}
            onToggleCreate={() => setCharacterFormOpen((open) => !open)}
            onCreate={createCharacter}
          />
        ) : (
          <Feed
            scenes={scenes}
            characters={characters}
            loading={feedLoading}
            search={search}
            sortBy={sortBy}
            filterType={filterType}
            composerOpen={composerOpen}
            parentScene={parentForNewScene}
            onSearch={setSearch}
            onSort={setSortBy}
            onFilter={setFilterType}
            onOpenScene={openScene}
            onToggleComposer={() => {
              setComposerOpen((open) => !open);
              setParentForNewScene(null);
            }}
            onCreateScene={saveScene}
          />
        )}
        {errorMessage && (
          <div className="error-banner" role="alert">
            <span>{errorMessage}</span>
            <button type="button" className="icon-button" onClick={() => setErrorMessage("")} aria-label="Dismiss error"><X size={16} /></button>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span><Sparkles size={14} /> No single author. Just the next brave choice.</span>
        <span>{userId ? `Player ${userId.slice(0, 8)}` : "Wayfarer's Table"}</span>
      </footer>
    </div>
  );
}

function Feed({
  scenes,
  characters,
  loading,
  search,
  sortBy,
  filterType,
  composerOpen,
  parentScene,
  onSearch,
  onSort,
  onFilter,
  onOpenScene,
  onToggleComposer,
  onCreateScene,
}: {
  scenes: Scene[];
  characters: Character[];
  loading: boolean;
  search: string;
  sortBy: "created_at" | "upvotes";
  filterType: string;
  composerOpen: boolean;
  parentScene: Scene | null;
  onSearch: (value: string) => void;
  onSort: (value: "created_at" | "upvotes") => void;
  onFilter: (value: string) => void;
  onOpenScene: (id: string) => void;
  onToggleComposer: () => void;
  onCreateScene: (input: SceneInput) => Promise<void>;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="live-dot" /> The shared chronicle</span>
          <h1>Every scene is a<br /><em>door left open.</em></h1>
          <p>Set the scene. Take an action. Roll the dice. Together, decide what becomes legend.</p>
          <button className="button button--primary hero-button" onClick={onToggleComposer}>
            <Plus size={17} /> Write a scene
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="orbit orbit--one" />
          <span className="orbit orbit--two" />
          <div className="moon"><Sparkles size={24} /></div>
          <div className="mountain mountain--back" />
          <div className="mountain mountain--front" />
          <div className="hero-lantern"><span /></div>
          <span className="art-caption">THE ROAD REMEMBERS</span>
        </div>
      </section>

      {composerOpen && (
        <div className="composer-wrap">
          <SceneForm
            previousScene={parentScene}
            scenes={scenes}
            characters={characters}
            onSubmit={onCreateScene}
            onCancel={onToggleComposer}
          />
        </div>
      )}

      <section className="feed-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Gathered around the table</span>
            <h2>Recent scenes <span className="count-badge">{scenes.length}</span></h2>
          </div>
          <button className="button button--outline" onClick={onToggleComposer}><Plus size={16} /> New scene</button>
        </div>
        <div className="feed-tools">
          <label className="search-field">
            <Search size={17} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search scene titles…" aria-label="Search scene titles" />
            {search && <button type="button" className="icon-button" onClick={() => onSearch("")} aria-label="Clear search"><X size={15} /></button>}
          </label>
          <label className="select-tool">
            <ArrowDownWideNarrow size={16} />
            <select value={sortBy} onChange={(event) => onSort(event.target.value as "created_at" | "upvotes")} aria-label="Sort scenes">
              <option value="created_at">Newest first</option>
              <option value="upvotes">Most upvoted</option>
            </select>
          </label>
          <label className="select-tool">
            <ScrollText size={16} />
            <select value={filterType} onChange={(event) => onFilter(event.target.value)} aria-label="Filter by story flag">
              <option value="">All flags</option>
              {SCENE_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
        </div>
        {loading ? <LoadingState label="Gathering the latest tales…" inline /> : scenes.length > 0 ? (
          <div className="scene-list">
            {scenes.map((item, index) => (
              <button className="scene-card" onClick={() => onOpenScene(item.id)} key={item.id}>
                <span className="scene-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="scene-card-main">
                  <span className="scene-card-time">{formatDate(item.created_at)}</span>
                  <span className="scene-card-title">{item.title}</span>
                </span>
                <span className="scene-card-votes"><ArrowUp size={15} /> {item.upvotes}</span>
                <ChevronRight className="scene-chevron" size={18} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title={search || filterType ? "No scenes match that search" : "The first page is still blank"}
            detail={search || filterType ? "Try a different title or story flag." : "Write an opening scene and invite the table into your story."}
            actionLabel={search || filterType ? "Clear filters" : "Start the story"}
            onAction={search || filterType ? () => { onSearch(""); onFilter(""); } : onToggleComposer}
          />
        )}
      </section>
    </>
  );
}

function SceneDetail({
  scene,
  actions,
  previousScene,
  previousCanonAction,
  canonAction,
  characters,
  userId,
  busyActionId,
  onBack,
  onUpvote,
  onEdit,
  onDelete,
  onSetCanon,
  onDeleteAction,
  onNextScene,
  onPostAction,
  onOpenScene,
}: {
  scene: Scene;
  actions: Action[];
  previousScene: Scene | null;
  previousCanonAction: Action | null;
  canonAction: Action | null;
  characters: Character[];
  userId: string | null;
  busyActionId: string;
  onBack: () => void;
  onUpvote: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetCanon: (actionId: string | null) => void;
  onDeleteAction: (action: Action) => void;
  onNextScene: () => void;
  onPostAction: (input: NewAction) => Promise<void>;
  onOpenScene: (id: string) => void;
}) {
  const isOwner = scene.author_id === userId;
  return (
    <article className="detail-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> All scenes</button>
      {previousScene && (
        <button className="thread-parent" onClick={() => onOpenScene(previousScene.id)}>
          <span className="eyebrow">A chapter in this thread</span>
          <span><ChevronRight size={15} /> {previousScene.title}</span>
          {previousCanonAction && <small>Canon: {previousCanonAction.character_name} — {previousCanonAction.action_text}</small>}
        </button>
      )}
      <header className="detail-header">
        <div className="detail-meta">
          <span className="flag">{scene.scene_type}</span>
          <span>{formatDate(scene.created_at)}</span>
        </div>
        <h1>{scene.title}</h1>
        <p className="byline">Scene set by <strong>{scene.author_name}</strong></p>
        {scene.involved_characters?.length > 0 && (
          <div className="involved-list">
            <Users size={15} />
            <span>In this scene:</span>
            {scene.involved_characters.map((name) => <span className="character-tag" key={name}>{name}</span>)}
          </div>
        )}
        <div className="detail-actions">
          <button className="button button--outline" onClick={onUpvote} disabled={busyActionId === "upvote"}>
            {busyActionId === "upvote" ? <LoaderCircle className="spin" size={16} /> : <ArrowUp size={16} />}
            Upvote <strong>{scene.upvotes}</strong>
          </button>
          <button className="button button--outline" onClick={onNextScene}><Feather size={16} /> Write next scene</button>
          {isOwner && <button className="button button--quiet" onClick={onEdit}>Edit</button>}
          {isOwner && <button className="button button--danger-quiet" onClick={onDelete}><Trash2 size={15} /> Delete</button>}
        </div>
      </header>

      <div className="scene-prose">
        {scene.content ? <p>{scene.content}</p> : <p className="muted-copy">The table has been given a place, but the details are yours to discover.</p>}
        <ExternalImage src={scene.image_url} alt={`Illustration for ${scene.title}`} className="detail-image" />
      </div>

      <section className="actions-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">The table's choices</span>
            <h2>Actions <span className="count-badge">{actions.length}</span></h2>
          </div>
          {isOwner && scene.canon_action_id && (
            <button className="button button--quiet canon-clear" onClick={() => onSetCanon(null)}>Clear canon</button>
          )}
        </div>
        {canonAction && (
          <div className="canon-banner">
            <span className="canon-mark"><Sparkles size={17} /></span>
            <span><small>Chosen canon for the next scene</small><strong>{canonAction.character_name}: {canonAction.action_text}</strong></span>
          </div>
        )}
        {actions.length > 0 ? (
          <div className="action-list">
            {actions.map((action) => (
              <ActionCard
                action={action}
                key={action.id}
                isOwner={action.author_id === userId}
                canSetCanon={isOwner}
                isCanon={action.id === scene.canon_action_id}
                busy={busyActionId === action.id}
                onSetCanon={() => onSetCanon(action.id)}
                onDelete={() => onDeleteAction(action)}
              />
            ))}
          </div>
        ) : (
          <p className="empty-inline">No actions yet. Make the first move.</p>
        )}
        <ActionForm characters={characters} onSubmit={onPostAction} />
      </section>
    </article>
  );
}

function ActionCard({
  action,
  isOwner,
  canSetCanon,
  isCanon,
  busy,
  onSetCanon,
  onDelete,
}: {
  action: Action;
  isOwner: boolean;
  canSetCanon: boolean;
  isCanon: boolean;
  busy: boolean;
  onSetCanon: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`action-card ${isCanon ? "action-card--canon" : ""}`}>
      <div className="action-avatar"><Swords size={17} /></div>
      <div className="action-content">
        <div className="action-byline">
          <strong>{action.character_name}</strong>
          <span>played by {action.author_name}</span>
          <time>{formatDate(action.created_at)}</time>
        </div>
        <p>{action.action_text}</p>
        <div className="roll-result">
          <span className="roll-die"><Dice5 size={14} /> {action.d20_roll}</span>
          <span>{abilityLabel(action.ability)} {action.modifier >= 0 ? `+${action.modifier}` : action.modifier}</span>
          <span className="roll-total">Total {action.total}</span>
          {action.dc !== null && <span className={`roll-outcome ${action.succeeded ? "is-success" : "is-failure"}`}>{action.succeeded ? "Success" : "Failure"} · DC {action.dc}</span>}
        </div>
        {(canSetCanon || isOwner) && (
          <div className="action-controls">
            {canSetCanon && (
              <button className={`text-button ${isCanon ? "is-current" : ""}`} onClick={onSetCanon}>
                {isCanon ? <><Check size={14} /> Canon for next scene</> : <><Sparkles size={14} /> Make canon</>}
              </button>
            )}
            {isOwner && <button className="text-button text-button--danger" onClick={onDelete} disabled={busy}><Trash2 size={14} /> Remove</button>}
          </div>
        )}
      </div>
    </article>
  );
}

function CharacterLedger({
  characters,
  userId,
  ownedCount,
  createOpen,
  onToggleCreate,
  onCreate,
}: {
  characters: Character[];
  userId: string | null;
  ownedCount: number;
  createOpen: boolean;
  onToggleCreate: () => void;
  onCreate: (character: CharacterInput) => Promise<void>;
}) {
  return (
    <section className="ledger-page">
      <div className="ledger-heading">
        <div>
          <span className="eyebrow">Who walks these roads?</span>
          <h1>The character ledger</h1>
          <p>Characters belong to the people who make them, and to every scene they enter.</p>
        </div>
        <button className="button button--primary" onClick={onToggleCreate}><Plus size={16} /> New character</button>
      </div>
      {createOpen && <CharacterForm onCreate={onCreate} onCancel={onToggleCreate} />}
      <div className="ledger-note"><Shield size={16} /> {ownedCount} of {characters.length} characters created by you. Anonymous player IDs keep edits tied to their author.</div>
      {characters.length > 0 ? (
        <div className="character-grid">
          {characters.map((character) => (
            <article className="character-card" key={character.id}>
              <ExternalImage src={character.image_url} alt={`${character.name}'s portrait`} className="character-portrait" />
              <div className="character-card-copy">
                <span className="eyebrow">Created by {character.owner_name}</span>
                <h2>{character.name}</h2>
                {character.concept && <p>{character.concept}</p>}
                <div className="character-stats">
                  {ABILITIES.map((ability) => (
                    <span key={ability}><small>{ability.slice(0, 3).toUpperCase()}</small><strong>{character[ability]}</strong></span>
                  ))}
                </div>
                <div className="modifier-line">
                  {ABILITIES.map((ability) => (
                    <span key={ability}>{ability.slice(0, 3).toUpperCase()} {modifierFor(character[ability]) >= 0 ? "+" : ""}{modifierFor(character[ability])}</span>
                  ))}
                </div>
                {character.owner_id === userId && <span className="owner-badge"><Shield size={12} /> Your character</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No characters in the ledger yet" detail="Create one here, or make a new character as part of your first action." actionLabel="Create a character" onAction={onToggleCreate} />
      )}
    </section>
  );
}

function LoadingState({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <div className={`loading-state ${inline ? "loading-state--inline" : ""}`} role="status">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Feather size={22} /></div>
      <h3>{title}</h3>
      <p>{detail}</p>
      <button className="button button--outline" onClick={onAction}>{actionLabel} <ChevronRight size={15} /></button>
    </div>
  );
}
