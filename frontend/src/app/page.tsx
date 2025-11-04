import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="space-y-8">
      <div className="text-center space-y-4 py-12">
        <h1 className="text-4xl font-bold text-slate-900">Welcome to Ultudy</h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Your AI-powered adaptive learning companion. Master any course with personalized lessons and intelligent progress tracking.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">1. Organize Courses</h2>
          <p className="mt-2 text-sm text-slate-600">
            Create courses and upload your textbooks, lecture notes, and materials organized by chapter.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">2. Interactive Learning</h2>
          <p className="mt-2 text-sm text-slate-600">
            Get AI-generated lessons with check-in questions that adapt to your understanding.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">3. Track Mastery</h2>
          <p className="mt-2 text-sm text-slate-600">
            See your progress across all concepts and identify weak areas that need review.
          </p>
        </div>
      </div>

      <div className="text-center">
        <Link
          href="/courses"
          className="inline-block rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800"
        >
          Get Started with Your Courses →
        </Link>
      </div>

      <div className="mt-12 rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h3 className="font-semibold text-slate-900">Quick Start Guide</h3>
        <ol className="list-decimal space-y-2 pl-6 mt-3 text-sm text-slate-700">
          <li>
            Create a course for each class you're taking
          </li>
          <li>
            Upload your course materials (PDFs) and tag them by chapter
          </li>
          <li>
            Click "Study" on any document to start an interactive learning session
          </li>
          <li>
            Answer check-in questions to track your mastery of each concept
          </li>
        </ol>
      </div>
    </section>
  );
}
