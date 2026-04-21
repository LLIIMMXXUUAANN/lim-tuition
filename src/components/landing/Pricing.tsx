import { ClockIcon, FolderOpenIcon } from "@heroicons/react/24/outline";

export default function Pricing() {
  return (
    <section id="pricing" className="bg-white py-16">
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">Pricing</h2>
        <p className="text-sm md:text-base text-slate-700 text-center mb-8">
          Simple hourly pricing with full access to notes, exercises, and learning materials.
        </p>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 px-6 md:px-10 py-10 space-y-10">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-navy flex items-center justify-center">
              <ClockIcon className="h-6 w-6 text-accentGold" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Rate</h3>
              <p className="text-slate-700 mt-1">RM65 per hour (1-to-1 online)</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-navy flex items-center justify-center">
              <FolderOpenIcon className="h-6 w-6 text-accentGold" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Materials</h3>
              <p className="text-slate-700 mt-1">You will receive a Google Drive folder containing:</p>
              <ol className="list-decimal ml-5 text-slate-700 space-y-1 mt-3">
                <li><span className="font-medium">Teaching Slides</span> – clear explanations with practice questions</li>
                <li><span className="font-medium">In-Class Coding Examples</span> – live demonstrations</li>
                <li><span className="font-medium">Homework Exercises</span> – targeted questions</li>
                <li><span className="font-medium">Homework Review</span> – feedback and sample solutions</li>
                <li><span className="font-medium">Personal Projects</span> – guided mini-projects after core topics</li>
                <li><span className="font-medium">Reusable Google Meet Link</span> – dedicated link for every session</li>
              </ol>
              <p className="text-xs text-slate-500 italic mt-3">
                * For students following their own syllabus, personal projects are not included unless specifically requested.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
