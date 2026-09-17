import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How pdfEditor handles your documents: core tools run entirely in your browser and never upload anything.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-muted">How your documents are handled, in plain terms.</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-fg">Your files are not uploaded</h2>
          <p className="mt-2 text-muted">
            Every tool marked as running in your browser does exactly that. The PDF is read into
            memory by this page, processed by JavaScript and WebAssembly running on your own
            machine, and written back out as a download. No copy is sent anywhere, which is why
            these tools keep working even if you go offline after the page has loaded.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg">The one exception</h2>
          <p className="mt-2 text-muted">
            Converting to and from Word, Excel and PowerPoint needs a full Office rendering engine,
            which cannot run in a browser. Those two tools — and only those two — send your file to
            a third-party conversion service through this site&rsquo;s serverless endpoint. They are
            clearly labelled &ldquo;Server&rdquo; throughout the interface, and they are disabled
            unless the site owner has configured a provider. If that matters to you, do not use
            them; nothing else on the site behaves this way.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg">What gets stored</h2>
          <p className="mt-2 text-muted">
            Your colour-theme preference is kept in your browser&rsquo;s local storage. Documents
            are held only in page memory and are gone the moment you close or reload the tab. There
            are no accounts, and nothing about your documents is recorded.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg">Passwords and encryption</h2>
          <p className="mt-2 text-muted">
            Passwords you type to open or protect a PDF are used in the page and then discarded.
            They are never transmitted. Protecting a PDF applies genuine AES encryption to the file
            itself, so the password is required by any conforming PDF reader.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg">Redaction</h2>
          <p className="mt-2 text-muted">
            Drawing a black box over text in most editors leaves the text in the file, where it can
            be copied straight back out. The redaction tool here re-renders each affected page and
            discards the original page object, so the removed content genuinely no longer exists in
            the output.
          </p>
        </section>
      </div>
    </div>
  );
}
