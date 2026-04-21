export default function Footer() {
  return (
    <footer className="bg-navy text-slate-200 text-xs md:text-sm py-4">
      <div className="max-w-6xl mx-auto px-4 text-center">
        © {new Date().getFullYear()} &nbsp;Lim&apos;s Programming Tuition. All rights reserved.
      </div>
    </footer>
  );
}
