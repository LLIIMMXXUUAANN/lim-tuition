export default function About() {
  return (
    <section id="about" className="bg-white py-16">
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center">About Me</h2>
        <p className="text-base md:text-lg leading-relaxed text-slate-700 text-left">
          I am <span className="text-accentGold font-semibold">Lim</span>, an AI Engineer at a
          multinational company. I have taught students from primary school to university and
          overseas learners who need structured programming support.
        </p>
        <p className="text-base md:text-lg leading-relaxed text-slate-700 mt-5 text-left">
          My teaching emphasises clarity, logic, and real problem-solving. I break down complex
          topics into simple ideas, guide you through live coding, and provide structured notes
          so you can learn confidently at your own pace.
        </p>
      </div>
    </section>
  );
}
