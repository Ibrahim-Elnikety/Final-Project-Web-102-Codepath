create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_name text not null check (char_length(owner_name) between 1 and 40),
  name text not null check (char_length(name) between 1 and 70),
  concept text not null default '' check (char_length(concept) <= 350),
  image_url text,
  strength smallint not null default 10 check (strength between 1 and 30),
  dexterity smallint not null default 10 check (dexterity between 1 and 30),
  constitution smallint not null default 10 check (constitution between 1 and 30),
  intelligence smallint not null default 10 check (intelligence between 1 and 30),
  wisdom smallint not null default 10 check (wisdom between 1 and 30),
  charisma smallint not null default 10 check (charisma between 1 and 30),
  created_at timestamptz not null default now()
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  content text not null default '' check (char_length(content) <= 8000),
  image_url text,
  scene_type text not null default 'Adventure'
    check (scene_type in ('Adventure', 'Encounter', 'Mystery', 'Campfire', 'Question', 'Opinion')),
  upvotes integer not null default 0 check (upvotes >= 0),
  previous_scene_id uuid references public.scenes (id) on delete set null,
  involved_characters text[] not null default '{}',
  canon_action_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  character_id uuid references public.characters (id) on delete set null,
  character_name text not null check (char_length(character_name) between 1 and 70),
  action_text text not null check (char_length(action_text) between 1 and 2000),
  ability text not null
    check (ability in ('strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma')),
  d20_roll smallint not null check (d20_roll between 1 and 20),
  modifier smallint not null check (modifier between -5 and 10),
  dc smallint check (dc between 1 and 40),
  total smallint not null check (total between -4 and 30),
  succeeded boolean,
  created_at timestamptz not null default now(),
  check ((dc is null and succeeded is null) or (dc is not null and succeeded = (total >= dc)))
);

alter table public.scenes
  add constraint scenes_canon_action_id_fkey
  foreign key (canon_action_id) references public.actions (id) on delete set null;

create index if not exists scenes_created_at_idx on public.scenes (created_at desc);
create index if not exists scenes_upvotes_idx on public.scenes (upvotes desc);
create index if not exists scenes_previous_scene_id_idx on public.scenes (previous_scene_id);
create index if not exists actions_scene_created_at_idx on public.actions (scene_id, created_at);
create index if not exists characters_name_idx on public.characters (name);

alter table public.characters enable row level security;
alter table public.scenes enable row level security;
alter table public.actions enable row level security;

create policy "Authenticated players can read characters"
  on public.characters for select to authenticated using (true);
create policy "Players create their own characters"
  on public.characters for insert to authenticated with check (auth.uid() = owner_id);
create policy "Players update their own characters"
  on public.characters for update to authenticated using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
create policy "Players delete their own characters"
  on public.characters for delete to authenticated using (auth.uid() = owner_id);

create policy "Authenticated players can read scenes"
  on public.scenes for select to authenticated using (true);
create policy "Players create their own scenes"
  on public.scenes for insert to authenticated with check (auth.uid() = author_id);
create policy "Scene authors update their own scenes"
  on public.scenes for update to authenticated using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
create policy "Scene authors delete their own scenes"
  on public.scenes for delete to authenticated using (auth.uid() = author_id);

create policy "Authenticated players can read actions"
  on public.actions for select to authenticated using (true);
create policy "Players add actions as themselves"
  on public.actions for insert to authenticated with check (
    auth.uid() = author_id
    and exists (select 1 from public.scenes where scenes.id = scene_id)
    and (character_id is null or exists (
      select 1 from public.characters where characters.id = character_id
    ))
  );
create policy "Players and scene authors remove actions"
  on public.actions for delete to authenticated using (
    auth.uid() = author_id
    or exists (
      select 1 from public.scenes
      where scenes.id = scene_id and scenes.author_id = auth.uid()
    )
  );

create or replace function public.validate_scene_canon_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.canon_action_id is not null and not exists (
    select 1
    from public.actions
    where actions.id = new.canon_action_id
      and actions.scene_id = new.id
  ) then
    raise exception 'The canon action must belong to this scene';
  end if;
  return new;
end;
$$;

create trigger validate_scene_canon_action_before_write
  before insert or update of canon_action_id on public.scenes
  for each row execute function public.validate_scene_canon_action();

create or replace function public.increment_scene_upvotes(scene_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'A player session is required to upvote';
  end if;

  update public.scenes
  set upvotes = upvotes + 1
  where id = scene_id_input
  returning upvotes into updated_count;

  if updated_count is null then
    raise exception 'Scene not found';
  end if;

  return updated_count;
end;
$$;

revoke all on public.characters, public.scenes, public.actions from public, anon, authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, delete on public.scenes to authenticated;
grant update (title, content, image_url, scene_type, previous_scene_id, involved_characters, canon_action_id)
  on public.scenes to authenticated;
grant select, insert, delete on public.actions to authenticated;
grant execute on function public.increment_scene_upvotes(uuid) to authenticated;
revoke all on function public.validate_scene_canon_action() from public, anon;
grant execute on function public.validate_scene_canon_action() to authenticated;
