export function Navbar() {
  return (
    <header className="fixed top-0 left-[240px] right-0 h-16 bg-white border-b border-border z-20 flex items-center px-8">
      <div className="flex-1">
        <div className="label-caps">Leonard · powered by VINCI</div>
        <div className="text-sm text-text">Veille des Appels à Projets de financement public de l'innovation</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted">239 dispositifs surveillés</div>
        <div className="w-8 h-8 rounded-full bg-navy text-white text-xs font-semibold flex items-center justify-center">LV</div>
      </div>
    </header>
  );
}
