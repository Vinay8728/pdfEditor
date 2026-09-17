import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">That page does not exist</h1>
      <p className="mt-3 text-muted">
        The tool you were looking for may have been renamed. Everything available is listed on the
        home page.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 font-medium text-white transition hover:bg-brand-700"
      >
        Back to all tools
      </Link>
    </div>
  );
}
