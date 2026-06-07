import { ChatBubbleLeftRightIcon, VideoCameraIcon } from "@heroicons/react/24/outline";

export default function CommunicationPlatforms() {
  return (
    <section id="communication" className="bg-softBg py-16">
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">Communication Platforms</h2>
        <p className="text-center text-slate-700 mb-8">Stay connected and join tuition sessions easily.</p>
        <div className="bg-cardBg rounded-2xl shadow-sm border border-slate-100 px-6 md:px-10 py-8 md:py-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-accentGold" />
                <h3 className="text-xl font-semibold">Messaging</h3>
              </div>
              <ul className="list-disc ml-6 text-slate-700 space-y-2">
                <li>WhatsApp <span className="italic text-slate-500">(Preferred)</span></li>
                <li>Email</li>
              </ul>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <VideoCameraIcon className="h-6 w-6 text-accentGold" />
                <h3 className="text-xl font-semibold">Tuition Sessions</h3>
              </div>
              <ul className="list-disc ml-6 text-slate-700 space-y-2">
                <li>Google Meet</li>
              </ul>
              <p className="text-slate-500 italic mt-2">
                * No webcam is required, allowing both parties to stay comfortable and fully focus on lesson content.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
