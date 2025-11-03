import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold text-slate-900">Ultudy Frontend MVP</h1>
      <p className="text-slate-700">
        This minimal interface lets you upload PDFs, search across your personal library, and
        generate study materials powered by the Ultudy backend.
      </p>
      <ol className="list-decimal space-y-3 pl-6 text-slate-700">
        <li>
          Set your <strong>User ID</strong> in the header bar. Each request includes this value as
          <code className="ml-1 rounded bg-slate-200 px-1 py-0.5">X-User-Id</code> and isolates your
          data.
        </li>
        <li>
          Visit <Link href="/upload">Upload</Link> to add PDFs to your library.
        </li>
        <li>
          Explore <Link href="/search">Search</Link> to find relevant excerpts.
        </li>
        <li>
          Use <Link href="/study">Study</Link> to build lessons and practice quizzes.
        </li>
      </ol>
      <p className="text-slate-600">
        The backend URL defaults to <code className="rounded bg-slate-200 px-1 py-0.5">http://localhost:3001</code>
        and can be configured via <code className="rounded bg-slate-200 px-1 py-0.5">NEXT_PUBLIC_BACKEND_URL</code>.
      </p>
    </section>
  );
}
