import {
  AcademicCapIcon,
  LanguageIcon,
  GlobeAltIcon,
  GlobeAsiaAustraliaIcon,
  GlobeAmericasIcon,
} from "@heroicons/react/24/outline";

export default function StudentLevelsLanguages() {
  return (
    <section className="bg-softBg py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">
          Student Backgrounds &amp; Languages Offered
        </h2>
        <p className="text-sm md:text-base text-slate-700 text-center mb-8">
          Designed for learners from all backgrounds, with lessons available in multiple languages.
        </p>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-cardBg rounded-2xl shadow-sm border border-slate-100 p-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-softBg flex items-center justify-center">
                <AcademicCapIcon className="h-6 w-6 text-accentGold" />
              </div>
              <h3 className="text-lg font-semibold">Student Backgrounds</h3>
            </div>
            <p className="text-sm md:text-base text-slate-700 mb-3">
              I teach students from a wide range of backgrounds, including:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm md:text-base text-slate-700">
              <li>Primary and secondary school students</li>
              <li>SPM, IGCSE, O-Level, STPM, and foundation students</li>
              <li>Diploma and degree students</li>
              <li>Working adults or beginners switching to tech</li>
              <li>Overseas learners seeking structured guidance</li>
            </ul>
            <p className="text-sm md:text-base text-slate-700 mt-4">
              Lessons are made beginner-friendly, and the pace is always adjusted to your comfort.
            </p>
          </div>
          <div className="bg-cardBg rounded-2xl shadow-sm border border-slate-100 p-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-softBg flex items-center justify-center">
                <LanguageIcon className="h-6 w-6 text-accentGold" />
              </div>
              <h3 className="text-lg font-semibold">Languages Offered</h3>
            </div>
            <p className="text-sm md:text-base text-slate-700 mb-4">Lessons are conducted in:</p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-softBg flex items-center justify-center border border-slate-200">
                  <GlobeAltIcon className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm md:text-base font-medium">English</p>
                  <p className="text-xs text-slate-500">Full proficiency</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-softBg flex items-center justify-center border border-slate-200">
                  <GlobeAsiaAustraliaIcon className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm md:text-base font-medium">Mandarin</p>
                  <p className="text-xs text-slate-500">中文授课可选</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-softBg flex items-center justify-center border border-slate-200">
                  <GlobeAmericasIcon className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm md:text-base font-medium">Malay</p>
                  <p className="text-xs text-slate-500">Bahasa Melayu</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
