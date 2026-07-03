-- ─────────────────────────────────────────────────────────────────────
-- Leonard AAP Finder — schéma initial (Phase 3.2)
-- À exécuter dans le SQL Editor du projet Supabase.
--
-- Principe : chaque table conserve l'objet typé complet dans une colonne
-- `data jsonb` (aucune perte vs les schémas TypeScript), avec en plus
-- quelques colonnes scalaires indexées pour les requêtes filtrées.
-- ─────────────────────────────────────────────────────────────────────

-- ── dispositifs : import de l'Excel, rarement mis à jour ───────────────
create table if not exists public.dispositifs (
  id                text primary key,
  numero            integer,
  nom               text not null,
  organisme         text,
  echelle           text,           -- EU | National | Régional
  programme         text,
  statut_ouverture  text,           -- Ouvert | Fermé | À surveiller
  pertinence_vinci  text,           -- Forte | Moyenne | Faible
  montant           text,
  trl_min           integer,
  trl_max           integer,
  data              jsonb not null, -- objet Dispositif complet
  updated_at        timestamptz not null default now()
);

create index if not exists dispositifs_echelle_idx on public.dispositifs (echelle);
create index if not exists dispositifs_pertinence_idx on public.dispositifs (pertinence_vinci);

-- ── aaps : alimenté par le pipeline SEDIA, mis à jour régulièrement ─────
create table if not exists public.aaps (
  id                 text primary key,       -- Topic ID
  titre              text not null,
  programme          text,
  pilier             text,
  cluster            text,
  statut             text,                   -- open | forthcoming | closed
  type_action        text,                   -- RIA | IA | CSA | COFUND | EIC | Autre
  date_ouverture     timestamptz,
  date_cloture       timestamptz,
  budget_total       bigint,
  budget_par_projet  bigint,
  trl_min            integer,
  trl_max            integer,
  thematiques        jsonb,                  -- string[]
  dispositif_id      text references public.dispositifs (id) on delete set null,
  data               jsonb not null,         -- objet AAP complet
  date_scraping      timestamptz,
  updated_at         timestamptz not null default now()
);

create index if not exists aaps_dispositif_idx on public.aaps (dispositif_id);
create index if not exists aaps_statut_idx on public.aaps (statut);
create index if not exists aaps_cluster_idx on public.aaps (cluster);
create index if not exists aaps_deadline_idx on public.aaps (date_cloture);

-- ── projets : projets internes saisis par les utilisateurs (futur) ─────
create table if not exists public.projets (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  filiale      text,
  description  text,
  trl          integer,
  mots_cles    jsonb,
  data         jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Row Level Security ─────────────────────────────────────────────────
-- POC : lecture publique sur les référentiels, écriture réservée au rôle
-- service (utilisé par le pipeline de scraping et le seed). À durcir en prod.
alter table public.dispositifs enable row level security;
alter table public.aaps enable row level security;
alter table public.projets enable row level security;

create policy "dispositifs_read" on public.dispositifs for select using (true);
create policy "aaps_read"        on public.aaps        for select using (true);
create policy "projets_read"     on public.projets     for select using (true);

-- Les écritures passent par la service_role key (bypass RLS) côté scripts.
