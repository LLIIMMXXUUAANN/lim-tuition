import { CreditCardIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

export default function PaymentMethods() {
  return (
    <section id="payment" className="bg-white py-16">
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">Payment Methods</h2>
        <p className="text-center text-slate-700 mb-8">
          Simple and flexible options for local and overseas students.
        </p>
        <div className="bg-cardBg rounded-2xl shadow-sm border border-slate-100 px-6 md:px-10 py-8 md:py-10 space-y-8">
          <div>
            <h3 className="text-lg font-semibold mb-6 text-center md:text-left">How You Can Pay</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-full bg-softBg flex items-center justify-center border border-slate-200">
                    <CreditCardIcon className="h-5 w-5 text-accentGold" />
                  </div>
                  <p className="text-sm md:text-base font-semibold text-slate-800">For Malaysian Students</p>
                </div>
                <p className="text-sm md:text-base text-slate-700 pl-12">Touch &apos;n Go eWallet or Bank Transfer.</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-full bg-softBg flex items-center justify-center border border-slate-200">
                    <GlobeAltIcon className="h-5 w-5 text-accentGold" />
                  </div>
                  <p className="text-sm md:text-base font-semibold text-slate-800">For Overseas Students</p>
                </div>
                <p className="text-sm md:text-base text-slate-700 pl-12">Wise – International transfers in your local currency.</p>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-lg font-semibold mb-3">Payment Policy</h3>
            <ul className="list-disc list-inside space-y-2 text-sm md:text-base text-slate-700">
              <li>Fees are typically paid <span className="font-medium">in advance</span> before the new month begins.</li>
              <li>I will calculate the total based on your agreed schedule and share the amount with you.</li>
            </ul>
            <p className="text-sm md:text-base text-slate-700 mt-4 font-semibold">Exceptions:</p>
            <ul className="list-disc list-inside space-y-2 text-sm md:text-base text-slate-700 mt-2">
              <li><span className="font-medium">Weekly payment</span> is allowed for students taking <span className="font-medium">3 hours or more per week</span>.</li>
              <li>For <span className="font-medium">new students</span>, you may <span className="font-medium">pay only for the first class</span> before deciding to continue.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
