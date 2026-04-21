import { DocumentTextIcon, CodeBracketIcon } from "@heroicons/react/24/outline";

export default function WhatIOffer() {
  return (
    <section id="offer" className="bg-softBg py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">What I Offer</h2>
        <p className="text-sm md:text-base text-slate-700 text-center mb-8">
          Two flexible ways to learn, based on your needs and experience.
        </p>
        <div className="grid md:grid-cols-2 gap-8">
          {/* Option A */}
          <div className="bg-cardBg rounded-2xl shadow-sm border border-slate-100 p-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-navy flex items-center justify-center">
                <DocumentTextIcon className="h-6 w-6 text-accentGold" />
              </div>
              <h3 className="text-lg font-semibold">Option A</h3>
            </div>
            <h4 className="font-semibold mb-3">Learn Using Your Own Syllabus</h4>
            <p className="text-sm md:text-base text-slate-700 mb-4">
              If you already have a school, university, bootcamp, or self-study syllabus, I
              will follow it fully. This option is ideal if you want support for:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm md:text-base text-slate-700 mb-4">
              <li><span className="font-medium">Python</span></li>
              <li><span className="font-medium">C++</span></li>
              <li><span className="font-medium">C</span></li>
              <li><span className="font-medium">Java</span></li>
              <li><span className="font-medium">JavaScript</span></li>
              <li><span className="font-medium">Object-Oriented Programming (OOP)</span></li>
              <li>Programming fundamentals and problem-solving</li>
            </ul>
            <p className="text-sm md:text-base text-slate-700">
              I will go through your slides, notes, past-year questions, or lab materials
              with you, explain each concept in simple terms, and guide you through real
              coding exercises.
            </p>
          </div>
          {/* Option B */}
          <div className="bg-cardBg rounded-2xl shadow-sm border border-slate-100 p-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-navy flex items-center justify-center">
                <CodeBracketIcon className="h-6 w-6 text-accentGold" />
              </div>
              <h3 className="text-lg font-semibold">Option B</h3>
            </div>
            <h4 className="font-semibold mb-3">Structured Python Mastery Program (≈30 hours)</h4>
            <p className="text-sm md:text-base text-slate-700 mb-4">
              For students without a syllabus, I offer a complete Python learning pathway
              designed to build strong foundations in about 30 hours.
            </p>
            <p className="font-semibold text-sm md:text-base mb-2">Python Mastery Program – Learning Roadmap:</p>
            <ul className="list-disc list-inside space-y-1 text-sm md:text-base text-slate-700 mb-6">
              <li><span className="font-medium">Topic 1</span> — Getting Started with Programming</li>
              <li><span className="font-medium">Topic 2</span> — Functions, Modules &amp; Code Reusability</li>
              <li><span className="font-medium">Topic 3</span> — Decision Making with Selection Structures</li>
              <li><span className="font-medium">Topic 4</span> — Mastering Loops &amp; Iteration</li>
              <li><span className="font-medium">Topic 5</span> — Working with Lists, Sets, Tuples &amp; Dictionaries</li>
              <li><span className="font-medium">Topic 6</span> — Handling and Managing Text Files</li>
            </ul>
            <p className="font-semibold text-sm md:text-base mb-2">The program includes:</p>
            <ul className="list-disc list-inside space-y-1 text-sm md:text-base text-slate-700 mb-6">
              <li>Topic-by-topic notes and explanations</li>
              <li>Live coding for every concept</li>
              <li>Homework and practice questions</li>
              <li>Mini-projects to apply what you&apos;ve learned</li>
            </ul>
            <p className="text-sm md:text-base text-slate-700">
              This track is suitable for complete beginners. After mastering Python, students can progress into Data Science or AI.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
