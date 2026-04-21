import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";

export default function Hero() {
  return (
    <section id="hero" className="bg-gradient-to-b from-navy via-navyLight to-softBg text-slate-100 pt-20 pb-24">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h1 className="text-3xl md:text-5xl font-semibold leading-tight mb-6">
          Empowering Students Through
          <br className="hidden md:block" />
          Personalized Programming Lessons
        </h1>
        <p className="text-base md:text-lg text-slate-200 max-w-2xl mx-auto mb-10">
          Master Python, C, C++, Java, or JavaScript through clear explanations,
          hands-on coding, and a structured learning plan tailored to your goals.
        </p>
        <div className="flex items-center justify-center mt-6">
          <div className="flex items-center space-x-1 text-accentGold">
            <StarIcon className="h-4 w-4 drop-shadow-[0_0_4px_rgba(198,166,103,0.5)]" />
            <StarIcon className="h-4 w-4 drop-shadow-[0_0_4px_rgba(198,166,103,0.5)]" />
            <StarIcon className="h-4 w-4 drop-shadow-[0_0_4px_rgba(198,166,103,0.5)]" />
            <StarIcon className="h-4 w-4 drop-shadow-[0_0_4px_rgba(198,166,103,0.5)]" />
            <StarIcon className="h-4 w-4 drop-shadow-[0_0_4px_rgba(198,166,103,0.5)]" />
          </div>
          <span className="text-slate-300 text-sm ml-3">
            Trusted by 25+ students with consistent 5-star reviews.
          </span>
        </div>
        <div className="w-16 h-px bg-slate-500/40 mx-auto my-6"></div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm md:text-base">
          <div className="flex items-center space-x-3">
            <CheckCircleIcon className="h-8 w-8 text-accentGold" />
            <span>1-to-1 online lessons designed around your pace</span>
          </div>
          <div className="flex items-center space-x-3">
            <CheckCircleIcon className="h-8 w-8 text-accentGold" />
            <span>Beginner-friendly approach with real problem-solving</span>
          </div>
          <div className="flex items-center space-x-3">
            <CheckCircleIcon className="h-8 w-8 text-accentGold" />
            <span>Suitable for school, university, and adult learners</span>
          </div>
        </div>
      </div>
    </section>
  );
}
