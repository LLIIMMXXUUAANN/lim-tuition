import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import About from "@/components/landing/About";
import WhatIOffer from "@/components/landing/WhatIOffer";
import HowLessonsWork from "@/components/landing/HowLessonsWork";
import StudentLevelsLanguages from "@/components/landing/StudentLevelsLanguages";
import Pricing from "@/components/landing/Pricing";
import ClassDurationScheduling from "@/components/landing/ClassDurationScheduling";
import PaymentMethods from "@/components/landing/PaymentMethods";
import CommunicationPlatforms from "@/components/landing/CommunicationPlatforms";
import OtherDetails from "@/components/landing/OtherDetails";
import Testimonials from "@/components/landing/Testimonials";
import Footer from "@/components/landing/Footer";

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
