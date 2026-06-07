import { LightBulbIcon, CodeBracketIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export default function HowLessonsWork() {
  return (
    <section id="how" className="bg-white py-16">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold mb-2">How My Lessons Work</h2>
        <p className="text-slate-700 mb-10">Every lesson is organized into three clear stages:</p>
        <div className="grid md:grid-cols-3 gap-12 mb-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-navy flex items-center justify-center">
              <LightBulbIcon className="h-8 w-8 text-accentGold" />
            </div>
            <span className="text-xs uppercase tracking-wide text-accentGold">Step 1</span>
            <h3 className="font-semibold">Explain the concept</h3>
            <p className="text-sm text-slate-700">
              I start with simple explanations, examples, and diagrams to ensure you truly
              understand the idea behind the code.
            </p>
          </div>
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-navy flex items-center justify-center">
              <CodeBracketIcon className="h-8 w-8 text-accentGold" />
            </div>
            <span className="text-xs uppercase tracking-wide text-accentGold">Step 2</span>
            <h3 className="font-semibold">Live coding together</h3>
            <p className="text-sm text-slate-700">
              We write code step-by-step. You will see how to think through a problem, how to
              debug, and how to improve your solution.
            </p>
          </div>
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-navy flex items-center justify-center">
              <CheckCircleIcon className="h-8 w-8 text-accentGold" />
            </div>
            <span className="text-xs uppercase tracking-wide text-accentGold">Step 3</span>
            <h3 className="font-semibold">Practice &amp; feedback</h3>
            <p className="text-sm text-slate-700">
              You receive homework or short exercises after class. I review your work in the
              next session so you learn from mistakes and keep improving.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
