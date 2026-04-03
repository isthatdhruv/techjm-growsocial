export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-text md:px-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-text-muted">Legal</p>
          <h1 className="text-4xl font-semibold text-white">Privacy Policy</h1>
          <p className="text-base text-text-muted">
            This Privacy Policy explains how TechJM collects, uses, and protects
            information when you use the platform.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Information We Collect</h2>
          <p className="text-text-muted">
            We may collect account details, connected social platform data, uploaded
            files, generated content, and usage information required to operate the
            product.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">How We Use Information</h2>
          <p className="text-text-muted">
            We use collected information to provide content discovery, content
            generation, scheduling, publishing, authentication, and support
            services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Third-Party Services</h2>
          <p className="text-text-muted">
            TechJM may connect with third-party services such as LinkedIn, X, AI
            providers, and infrastructure providers to deliver platform features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Contact</h2>
          <p className="text-text-muted">
            For privacy-related questions, contact the TechJM team through the
            support channel associated with this application.
          </p>
        </section>
      </div>
    </main>
  );
}
