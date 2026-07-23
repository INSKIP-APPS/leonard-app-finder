-- ──────────────────────────────────────────────────────────────────────
-- Sauvegardes par utilisateur (AAP et dispositifs).
-- Remplace le stockage localStorage (perdu en changeant de poste) : chaque
-- utilisateur retrouve ses éléments sauvegardés sur n'importe quel navigateur.
-- item_id est en text (ids AAP type "HORIZON-…" et dispositifs "disp-…").
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.sauvegardes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type  text not null check (item_type in ('aap', 'dispositif')),
  item_id    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

alter table public.sauvegardes enable row level security;

-- Chacun ne voit et ne modifie que ses propres sauvegardes.
create policy sauvegardes_select on public.sauvegardes
  for select to authenticated using (user_id = auth.uid());

create policy sauvegardes_insert on public.sauvegardes
  for insert to authenticated with check (user_id = auth.uid());

create policy sauvegardes_delete on public.sauvegardes
  for delete to authenticated using (user_id = auth.uid());
