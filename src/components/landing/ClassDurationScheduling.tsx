import {
  ClockIcon,
  CalendarDaysIcon,
  AdjustmentsHorizontalIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

export default function ClassDurationScheduling() {
  return (
    <section id="schedule" className="bg-softBg py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">
          Class Duration &amp; Scheduling
        </h2>
        <p className="text-sm md:text-base text-slate-700 text-center mb-8">
          Lessons are structured for focus, consistency, and flexibility to fit your weekly routine.
        </p>
        <div className="max-w-5xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
            <div className="space-y-6 md:space-y-8">
              <div className="flex items-start gap-3 md:gap-4">
                <div className="mt-1 h-9 w-9 shrink-0 rounded-full bg-softBg flex items-center justify-center">
                  <ClockIcon className="h-5 w-5 text-accentGold" />
                </div>
                <div>
                  <p className="font-semibold text-sm md:text-base text-slate-900">Class duration</p>
                  <p className="text-sm md:text-base text-slate-700">
                    Each class runs for a minimum of <span className="font-semibold">1 hour</span> and
                    maximum of <span className="font-semibold">2 hours</span>.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4">
                <div className="mt-1 h-9 w-9 shrink-0 rounded-full bg-softBg flex items-center justify-center">
                  <CalendarDaysIcon className="h-5 w-5 text-accentGold" />
                </div>
                <div>
                  <p className="font-semibold text-sm md:text-base text-slate-900">Weekly frequency</p>
                  <p className="text-sm md:text-base text-slate-700">
                    You may schedule <span className="font-semibold">multiple classes per week</span> depending on your goals or upcoming exams.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4">
                <div className="mt-1 h-9 w-9 shrink-0 rounded-full bg-softBg flex items-center justify-center">
                  <AdjustmentsHorizontalIcon className="h-5 w-5 text-accentGold" />
                </div>
                <div>
                  <p className="font-semibold text-sm md:text-base text-slate-900">Preferred times</p>
                  <p className="text-sm md:text-base text-slate-700">
                    Students share preferred days and time slots (e.g.{" "}
                    <span className="italic">Monday 8–9pm, Wednesday 9–10:30am</span>).
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4">
                <div className="mt-1 h-9 w-9 shrink-0 rounded-full bg-softBg flex items-center justify-center">
                  <CheckCircleIcon className="h-5 w-5 text-accentGold" />
                </div>
                <div>
                  <p className="font-semibold text-sm md:text-base text-slate-900">Schedule confirmation</p>
                  <p className="text-sm md:text-base text-slate-700">
                    I will review my availability and confirm a consistent weekly schedule that works for both of us.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
