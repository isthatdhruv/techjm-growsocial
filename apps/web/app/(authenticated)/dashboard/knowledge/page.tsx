'use client';

import { useCallback, useEffect, useState } from 'react';
import { GlassCard } from '@/app/components/glass-card';

type KnowledgeDocument = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  chunkCount: number;
  processedAt: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

type SearchResult = {
  chunkId: string;
  documentId: string;
  fileName: string;
  content: string;
  score: number;
};

async function getToken() {
  const { getAuth } = await import('firebase/auth');
  return getAuth().currentUser?.getIdToken() || '';
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch('/api/knowledge', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setMessage(null);

    const token = await getToken();
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));

    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Upload failed');
    } else {
      setMessage(`Uploaded ${data.uploaded?.length || 0} file(s).`);
      if (data.failed?.length) {
        setError(data.failed.map((item: { fileName: string; error: string }) => `${item.fileName}: ${item.error}`).join(' | '));
      }
      fetchDocuments();
    }

    setUploading(false);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setError(null);
    const token = await getToken();
    const res = await fetch('/api/knowledge/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Search failed');
      return;
    }

    setSearchResults(data.results || []);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    const token = await getToken();
    const res = await fetch('/api/knowledge/discover', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, save: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Upload discovery failed');
    } else {
      setMessage(`Created ${data.saved || 0} topic(s) from uploads.`);
    }
    setDiscovering(false);
  };

  const handleDelete = async (documentId: string) => {
    const token = await getToken();
    await fetch(`/api/knowledge/${documentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchDocuments();
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Uploads</h1>
        <p className="mt-1 text-sm text-text-muted">
          Upload research files, search across them, and generate topics grounded in your documents.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          {message}
        </div>
      )}

      <GlassCard className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Upload Documents</h2>
            <p className="text-xs text-text-muted">
              Supported: PDF, DOCX, TXT, MD, CSV, HTML
            </p>
          </div>
          <label className="inline-flex cursor-pointer rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30">
            {uploading ? 'Uploading...' : 'Upload documents'}
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.csv,.html,.htm"
              className="hidden"
              onChange={async (event) => {
                await handleUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search uploads or focus discovery on a topic"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/50 focus:outline-none"
          />
          <button
            onClick={handleSearch}
            className="rounded-lg bg-white/5 px-4 py-2 text-sm text-text-muted hover:bg-white/10 hover:text-white"
          >
            Search Uploads
          </button>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
          >
            {discovering ? 'Discovering...' : 'Discover Topics'}
          </button>
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <GlassCard className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Documents</h2>
          {loading ? (
            <div className="text-sm text-text-muted">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-sm text-text-muted">No uploaded documents yet.</div>
          ) : (
            <div className="space-y-3">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-start justify-between rounded-xl border border-white/6 bg-white/[0.02] p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{document.fileName}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {document.fileType.toUpperCase()} · {document.chunkCount} chunks · {document.status}
                    </p>
                    {document.errorMessage && (
                      <p className="mt-1 text-xs text-red-300">{document.errorMessage}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(document.id)}
                    className="rounded-lg bg-red-500/10 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Search Results</h2>
          {searchResults.length === 0 ? (
            <div className="text-sm text-text-muted">
              Search across your uploads to retrieve grounded context for content generation.
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <div key={result.chunkId} className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-text-muted/70">
                      {result.fileName}
                    </p>
                    <span className="text-[11px] text-accent">score {result.score.toFixed(2)}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-white/85">{result.content}</p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
