export default function Testimonials() {
  return (
    <section id="testimonials" className="bg-softBg py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">What Others Say</h2>
        <p className="text-sm md:text-base text-slate-700 text-center mb-8">
          Testimonials from students and parents from my lessons.
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col">
            <span className="text-accentGold text-2xl mb-3">❝</span>
            <p className="text-sm md:text-base text-slate-700 flex-1 mb-4">
              &quot;Mr Lim is very flexible and allows me to follow my own syllabus at my own pace. The coding examples are clear and easy to practice on my own. Overall, it is very helpful for my learning.&quot;
            </p>
            <div className="text-xs md:text-sm text-slate-600">
              <p className="font-semibold">University Student</p>
              <p>Computer Science Major</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col">
            <span className="text-accentGold text-2xl mb-3">❝</span>
            <p className="text-sm md:text-base text-slate-700 flex-1 mb-4">
              &quot;Lim is a very patient and careful teacher. His lecture notes are well-organized, clear, and detailed, making complex concepts easy to follow. Beyond the comprehensive Python lessons, I also learned how to develop good coding style, logical thinking, and problem-solving skills. Thanks to his guidance, I feel more confident and ready to use my skills in real projects.&quot;
            </p>
            <div className="text-xs md:text-sm text-slate-600">
              <p className="font-semibold">Working Adult Beginner</p>
              <p>Career Transition to Tech</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col">
            <span className="text-accentGold text-2xl mb-3">❝</span>
            <p className="text-sm md:text-base text-slate-700 flex-1 mb-4">
              &quot;I truly appreciate your patience and understanding with my son. You&apos;ve created a positive and supportive programming &amp; learning environment for him. Your knowledge is impressive, and you&apos;ve explained concepts in a way that my son can understand. Thank you very much.&quot;
            </p>
            <div className="text-xs md:text-sm text-slate-600">
              <p className="font-semibold">Parent Review</p>
              <p>Secondary School Student&apos;s Parent</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
