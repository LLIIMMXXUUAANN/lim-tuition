"use client";

import { useEffect, useState } from "react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#offer", label: "What I Offer" },
  { href: "#how", label: "How It Works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#testimonials", label: "Testimonials" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 bg-navy text-slate-100 border-b border-slate-800">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        <a href="#hero" className="flex items-center gap-2 hover:text-accentGold">
          <span className="text-accentGold text-lg font-bold">&lt;/&gt;</span>
          <span className="font-semibold text-sm">Lim&apos;s Programming Tuition</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-accentGold transition-colors">
              {l.label}
            </a>
          ))}
          <a href="/student/login" className="text-xs border border-slate-500 px-3 py-1 rounded-md hover:border-accentGold hover:text-accentGold transition-colors">Student Portal</a>
          <a href="/admin/login" className="text-xs border border-slate-500 px-3 py-1 rounded-md hover:border-accentGold hover:text-accentGold transition-colors">Admin</a>
        </nav>

        {/* Hamburger button — mobile only */}
        <button
          className="md:hidden p-1 rounded hover:text-accentGold transition-colors"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <nav
          id="mobile-menu"
          className="md:hidden bg-navy border-t border-slate-800 px-6 py-4 flex flex-col gap-4 text-sm"
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hover:text-accentGold transition-colors"
              onClick={close}
            >
              {l.label}
            </a>
          ))}
          <div className="flex gap-3 pt-1">
            <a href="/student/login" onClick={close} className="text-xs border border-slate-500 px-3 py-1 rounded-md hover:border-accentGold hover:text-accentGold transition-colors">Student Portal</a>
            <a href="/admin/login" onClick={close} className="text-xs border border-slate-500 px-3 py-1 rounded-md hover:border-accentGold hover:text-accentGold transition-colors">Admin</a>
          </div>
        </nav>
      )}
    </header>
  );
}
