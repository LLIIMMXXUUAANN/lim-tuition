export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-navy text-slate-100 border-b border-slate-800">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <a href="#hero" className="flex items-center space-x-2 hover:text-accentGold">
          <span className="text-accentGold text-xl">&lt;/&gt;</span>
          <span className="font-semibold">Lim&apos;s Programming Tuition</span>
        </a>
        <nav className="hidden md:flex items-center space-x-8 text-sm">
          <a href="#about" className="hover:text-accentGold">About</a>
          <a href="#offer" className="hover:text-accentGold">What I Offer</a>
          <a href="#how" className="hover:text-accentGold">How It Works</a>
          <a href="#pricing" className="hover:text-accentGold">Pricing</a>
          <a href="#testimonials" className="hover:text-accentGold">Testimonials</a>
          <a href="/portal/login" className="text-xs border border-slate-400 text-slate-200 px-3 py-1 rounded-md hover:border-accentGold hover:text-accentGold transition-colors">Student Portal</a>
          <a href="/login" className="text-xs border border-slate-400 text-slate-200 px-3 py-1 rounded-md hover:border-accentGold hover:text-accentGold transition-colors">Admin</a>
        </nav>
      </div>
    </header>
  );
}
