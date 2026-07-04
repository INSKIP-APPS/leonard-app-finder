import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, CalendarClock, CheckCircle2, XCircle, Play } from "lucide-react";
import {
  getScrapeLogs,
  getScrapeFrequency,
  setScrapeFrequency,
  runScrapeNow,
  dataSource,
  FREQUENCY_LABELS,
  type ScrapeFrequency,
} from "@/services/data-store";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Leonard Veille AAP" },
      {
        name: "description",
        content: "Piloter la fréquence de scraping et suivre les exécutions de la veille.",
      },
    ],
  }),
  component: Admin,
});

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Admin() {
  const qc = useQueryClient();
  const { data: freq } = useQuery({ queryKey: ["scrapeFrequency"], queryFn: getScrapeFrequency });
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["scrapeLogs"],
    queryFn: () => getScrapeLogs(30),
  });

  const [selected, setSelected] = useState<ScrapeFrequency | "">("");
  const [savingFreq, setSavingFreq] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const currentFreq = freq?.frequency ?? null;
  const effectiveSelected = selected || currentFreq || "hebdo_lundi";

  const saveFreq = async () => {
    setSavingFreq(true);
    setMsg(null);
    try {
      await setScrapeFrequency(effectiveSelected as ScrapeFrequency);
      await qc.invalidateQueries({ queryKey: ["scrapeFrequency"] });
      setMsg({
        kind: "ok",
        text: `Fréquence mise à jour : ${FREQUENCY_LABELS[effectiveSelected as ScrapeFrequency]}.`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingFreq(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMsg(null);
    try {
      const r = await runScrapeNow();
      if (r.ok) {
        setMsg({ kind: "ok", text: "Scraping lancé — la base et l'historique se mettent à jour." });
        setTimeout(() => qc.invalidateQueries({ queryKey: ["scrapeLogs"] }), 6000);
      } else {
        setMsg({ kind: "err", text: r.message ?? "Échec du scraping." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  if (dataSource !== "supabase") {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl mb-2">Administration</h1>
        <div className="card-flat p-6 text-sm text-muted">
          Cette page pilote le scraping automatique hébergé sur Supabase. Elle nécessite une
          connexion Supabase active (mode actuel :{" "}
          <span className="font-medium text-text">local</span>).
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl">Administration</h1>
        <div className="text-sm text-muted mt-1">
          Pilotez la veille automatique et suivez ses exécutions.
        </div>
      </header>

      {msg && (
        <div
          className={`flex items-start gap-2 text-sm px-3 py-2 rounded-md ${msg.kind === "ok" ? "bg-[#E8F5F0] text-emerald-800" : "bg-[#FFF4E6] text-orange-700"}`}
        >
          {msg.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fréquence */}
        <div className="card-flat p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-4 h-4 text-navy" />
            <h2 className="text-base font-semibold text-navy">Fréquence du scraping</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Le robot interroge le portail EU Funding &amp; Tenders et met la base à jour
            automatiquement.
            {freq?.cron && (
              <>
                {" "}
                Expression cron actuelle : <code className="text-[11px]">{freq.cron}</code> (UTC).
              </>
            )}
          </p>
          <label className="block text-xs font-medium text-text mb-1.5">Périodicité</label>
          <select
            value={effectiveSelected}
            onChange={(e) => setSelected(e.target.value as ScrapeFrequency)}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
          >
            {(Object.keys(FREQUENCY_LABELS) as ScrapeFrequency[]).map((k) => (
              <option key={k} value={k}>
                {FREQUENCY_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted mt-1.5">
            Heures en UTC (~8h Paris l'été, ~7h l'hiver). Actuel :{" "}
            <span className="font-medium text-text">
              {currentFreq ? FREQUENCY_LABELS[currentFreq] : "non planifié"}
            </span>
            .
          </p>
          <button
            onClick={saveFreq}
            disabled={savingFreq}
            className="mt-4 inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {savingFreq ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarClock className="w-4 h-4" />
            )}
            Enregistrer la fréquence
          </button>
        </div>

        {/* Scraping manuel */}
        <div className="card-flat p-5">
          <div className="flex items-center gap-2 mb-1">
            <Play className="w-4 h-4 text-navy" />
            <h2 className="text-base font-semibold text-navy">Scraping manuel</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Lance immédiatement une récupération des appels à projets, sans attendre la prochaine
            exécution planifiée.
          </p>
          <button
            onClick={runNow}
            disabled={running}
            className="inline-flex items-center gap-2 bg-purple text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {running ? "Scraping en cours…" : "Lancer un scraping maintenant"}
          </button>
        </div>
      </div>

      {/* Historique */}
      <div className="card-flat p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-navy">Historique des exécutions</h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["scrapeLogs"] })}
            className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
          </button>
        </div>
        {loadingLogs ? (
          <div className="text-sm text-muted py-6 text-center">Chargement…</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">
            Aucune exécution enregistrée pour l'instant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Statut</th>
                  <th className="py-2 px-3 font-medium text-right">Récupérés</th>
                  <th className="py-2 px-3 font-medium text-right">Nouveaux</th>
                  <th className="py-2 px-3 font-medium text-right">Mis à jour</th>
                  <th className="py-2 px-3 font-medium text-right">Clôturés</th>
                  <th className="py-2 pl-3 font-medium text-right">Durée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id} className="text-text">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDateTime(l.run_at)}</td>
                    <td className="py-2 px-3">
                      {l.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> OK
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-orange-700"
                          title={l.error ?? ""}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Échec
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{l.fetched}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium text-navy">
                      {l.nouveaux}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{l.mis_a_jour}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{l.fermes}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted">
                      {l.duration_ms != null ? `${(l.duration_ms / 1000).toFixed(1)} s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
