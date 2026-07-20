// ──────────────────────────────────────────────────────────────────────
// Mécanique commune des exports PDF (fiche AAP / fiche dispositif).
// N'inclut PAS la charte visuelle (CSS) : elle reste inline dans chaque fiche,
// car son rendu ne se valide qu'à l'impression. Ici on factorise seulement la
// plomberie identique et sans effet visuel : ouverture de fenêtre nommée
// (un double-clic la réutilise — UX-013) et attente du chargement des images
// avant impression (PDF propre, sans logo cassé).
// ──────────────────────────────────────────────────────────────────────

/**
 * Script (exécuté dans la fenêtre PDF) qui attend que toutes les images soient
 * chargées avant de lancer l'impression. À interpoler dans le `<body>` du gabarit.
 */
export const PDF_PRINT_SCRIPT = `<script>
  window.addEventListener('load', function () {
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    Promise.all(imgs.map(function (img) {
      if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
      return new Promise(function (r) { img.onload = r; img.onerror = r; });
    })).then(function () { setTimeout(function () { window.print(); }, 300); });
  });
</script>`;

/**
 * Ouvre (ou réutilise) la fenêtre d'export nommée et y écrit le document.
 * Renvoie false si la pop-up a été bloquée (l'appelant peut s'arrêter).
 */
export function openPrintWindow(fullHtml: string): boolean {
  const w = window.open("", "leonard-pdf-export", "width=900,height=1200");
  if (!w) {
    alert("Autorisez les fenêtres pop-up pour exporter en PDF.");
    return false;
  }
  w.document.write(fullHtml);
  w.document.close();
  return true;
}
