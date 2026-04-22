import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative flex items-start bg-black"
      style={{
        backgroundImage: `
          linear-gradient(to right,
            rgba(0,0,0,0.82) 0%,
            rgba(0,0,0,0.60) 38%,
            rgba(0,0,0,0.12) 72%,
            transparent 100%
          ),
          url('/landing_page_4k.png')
        `,
        backgroundSize: "auto, auto 100%",
        backgroundPosition: "center top, right top",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Mobile-only dark overlay so text stays readable */}
      <div className="absolute inset-0 bg-black/65 md:hidden" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 pt-10 pb-20">
        <div className="max-w-2xl">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-black/50 border border-slate-600 rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accentGold flex-shrink-0" />
            <span className="text-accentGold text-[10px] font-semibold uppercase tracking-widest">
              1-to-1 Online Programming Lessons
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-5 text-white">
            Empowering Students
            <br />
            Through
            <br />
            <span className="text-accentGold">Personalized</span>
            <br />
            Programming Lessons
          </h1>

          <div className="max-w-md">
            <p className="text-sm md:text-base text-slate-300 mb-6 leading-relaxed">
              Master Python, C, C++, Java, or JavaScript through clear
              explanations, hands-on coding, and a structured learning
              plan tailored to your goals.
            </p>

            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-0.5 text-accentGold" aria-label="5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon key={i} className="h-4 w-4 drop-shadow-[0_0_4px_rgba(198,166,103,0.7)]" />
                ))}
              </div>
              <span className="text-slate-300 text-xs">
                Trusted by 25+ students with consistent 5-star reviews.
              </span>
            </div>

            <div className="w-10 h-px bg-slate-500/60 mb-5" />

            <div className="flex flex-col gap-2.5 text-sm text-slate-200">
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon className="h-5 w-5 text-accentGold flex-shrink-0" />
                <span>1-to-1 online lessons designed around your pace</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon className="h-5 w-5 text-accentGold flex-shrink-0" />
                <span>Beginner-friendly approach with real problem-solving</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon className="h-5 w-5 text-accentGold flex-shrink-0" />
                <span>Suitable for school, university, and adult learners</span>
              </div>
            </div>
          </div>

        </div>
      </div>

    </section>
  );
}
