import Navbar from "@/features/landing/components/Navbar";
import Hero from "@/features/landing/components/Hero";
import About from "@/features/landing/components/About";
import WhatIOffer from "@/features/landing/components/WhatIOffer";
import HowLessonsWork from "@/features/landing/components/HowLessonsWork";
import StudentLevelsLanguages from "@/features/landing/components/StudentLevelsLanguages";
import Pricing from "@/features/landing/components/Pricing";
import ClassDurationScheduling from "@/features/landing/components/ClassDurationScheduling";
import PaymentMethods from "@/features/landing/components/PaymentMethods";
import CommunicationPlatforms from "@/features/landing/components/CommunicationPlatforms";
import OtherDetails from "@/features/landing/components/OtherDetails";
import Testimonials from "@/features/landing/components/Testimonials";
import Footer from "@/features/landing/components/Footer";

export default function HomePage() {
  return (
    <div className="min-h-screen font-sans text-slate-900 bg-softBg">
      <Navbar />
      <Hero />
      <About />
      <WhatIOffer />
      <HowLessonsWork />
      <StudentLevelsLanguages />
      <Pricing />
      <ClassDurationScheduling />
      <PaymentMethods />
      <CommunicationPlatforms />
      <OtherDetails />
      <Testimonials />
      <Footer />
    </div>
  );
}
