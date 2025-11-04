'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '../../lib/api';

type SearchResult = {
  document_id: string;
  chunk_id: string;
  score: number;
  excerpt: string;
  page_start?: number;
  page_end?: number;
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [k, setK] = useState('8');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!query.trim()) {
      setError('Enter a search query.');
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    const params = new URLSearchParams({ q: query.trim() });
    if (k.trim()) {
      params.set('k', k.trim());
    }

    try {
      const response = await apiFetch<SearchResult[]>(`/api/search?${params.toString()}`, {
        method: 'GET'
      });
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Search your documents</h1>
        <p className="text-slate-600">
          Queries only return chunks from documents associated with your current User ID.
        </p>
      </div>
      <form className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="query">
          Query
          <input
            id="query"
            name="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Explain quantum tunneling"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="k">
          Results (k)
          <input
            id="k"
            name="k"
            value={k}
            onChange={(event) => setK(event.target.value)}
            type="number"
            min={1}
            max={20}
          />
        </label>
        <button type="submit" disabled={isSearching}>
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="space-y-4">
        {results.map((result) => (
          <article key={result.chunk_id} className="rounded border border-slate-200 bg-white p-4 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Document: {result.document_id}</span>
              <span>Score: {result.score.toFixed(3)}</span>
            </header>
            <p className="mt-3 whitespace-pre-wrap text-slate-800">{result.excerpt}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
              {typeof result.page_start === 'number' ? (
                <div>
                  <dt className="font-medium text-slate-600">Page start</dt>
                  <dd>{result.page_start}</dd>
                </div>
              ) : null}
              {typeof result.page_end === 'number' ? (
                <div>
                  <dt className="font-medium text-slate-600">Page end</dt>
                  <dd>{result.page_end}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
        {!results.length && !error && !isSearching ? (
          <p className="text-sm text-slate-500">Enter a query to see matching chunks.</p>
        ) : null}
      </div>
    </section>
  );
}
