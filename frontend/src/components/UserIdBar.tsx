'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { DEV_USER, useUserId } from '../lib/useUserId';

export default function UserIdBar() {
  const { userId, saveUserId } = useUserId();
  const [value, setValue] = useState(userId);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setValue(userId);
  }, [userId]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(timeout);
  }, [message]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim() || DEV_USER;
    saveUserId(trimmed);
    setMessage('User ID saved');
  };

  return (
    <div className="bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <form className="flex flex-col gap-2 md:flex-row md:items-center" onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-slate-600" htmlFor="user-id">
            User ID
          </label>
          <input
            id="user-id"
            name="user-id"
            className="w-full md:w-64"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={DEV_USER}
          />
          <button type="submit" className="md:ml-2">
            Save
          </button>
          {message ? <span className="text-sm text-green-600 md:ml-3">{message}</span> : null}
        </form>
        <nav className="flex gap-4 text-sm font-medium text-slate-700">
          <Link href="/">Home</Link>
          <Link href="/upload">Upload</Link>
          <Link href="/search">Search</Link>
          <Link href="/study">Study</Link>
        </nav>
      </div>
    </div>
  );
}
