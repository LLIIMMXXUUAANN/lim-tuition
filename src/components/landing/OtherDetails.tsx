import { CloudIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";

export default function OtherDetails() {
  return (
    <section id="other-details" className="bg-white py-16">
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">
          Other Details for My Python Syllabus
        </h2>
        <p className="text-center text-slate-700 mb-8">
          A quick overview of the tools and devices needed for lessons.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 px-2 md:px-6">
          <div className="flex items-start gap-3">
            <CloudIcon className="h-6 w-6 text-accentGold mt-1" />
            <div>
              <h3 className="text-lg font-semibold mb-1">Coding Platform – Google Colab</h3>
              <ul className="list-disc ml-5 text-slate-700 space-y-1 text-sm">
                <li>Runs entirely in the browser</li>
                <li>Automatically saves and syncs work in Google Drive</li>
                <li>No installation required</li>
              </ul>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ComputerDesktopIcon className="h-6 w-6 text-accentGold mt-1" />
            <div>
              <h3 className="text-lg font-semibold mb-1">Computer Requirements</h3>
              <ul className="list-disc ml-5 text-slate-700 space-y-1 text-sm">
                <li>No advanced specifications needed</li>
                <li>Any laptop with a basic CPU, keyboard, and screen is sufficient</li>
                <li>If it can open Google Chrome, it can run the lessons</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
