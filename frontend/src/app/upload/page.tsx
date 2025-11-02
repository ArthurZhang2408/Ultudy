'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useUserId } from '../../lib/useUserId';

type UploadResponse = {
  document_id: string;
  pages: number;
  chunks: number;
};

export default function UploadPage() {
  const { userId } = useUserId();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError('Please select a PDF file to upload.');
      setResult(null);
      return;
    }

    setError(null);
    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiFetch<UploadResponse>('/upload/pdf', {
        method: 'POST',
        body: formData
      }, userId);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Upload a PDF</h1>
        <p className="text-slate-600">Select a PDF file to add it to your personal study library.</p>
      </div>
      <form className="flex flex-col gap-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="pdf">
          PDF file
          <input
            id="pdf"
            name="pdf"
            type="file"
            accept="application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={isUploading}>
          {isUploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {result ? (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <h2 className="font-semibold">Upload successful</h2>
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-green-900">Document ID</dt>
              <dd className="font-mono">{result.document_id}</dd>
            </div>
            <div>
              <dt className="font-medium text-green-900">Pages</dt>
              <dd>{result.pages}</dd>
            </div>
            <div>
              <dt className="font-medium text-green-900">Chunks</dt>
              <dd>{result.chunks}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-green-900">
            Note: future backend releases may introduce a multi-step upload flow. When available,
            switch this form to use <code className="rounded bg-green-100 px-1 py-0.5">/upload/start</code>.
          </p>
        </div>
      ) : null}
    </section>
  );
}
