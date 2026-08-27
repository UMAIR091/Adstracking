import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { Brand } from "@/components/Brand";
import { getArticle, HELP_ARTICLES } from "@/lib/help/articles";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  return a ? { title: `${a.title} · ReportFlow Help`, description: a.summary } : { title: "Help · ReportFlow" };
}

export default function HelpArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-ink-200 bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/"><Brand /></Link>
          <Link href="/help" className="text-sm font-medium text-brand-600 hover:underline">All articles</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">
        <Link href="/help" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
          <ArrowLeft size={15} /> Help Center
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">{article.category}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">{article.title}</h1>
        <p className="mt-1 text-ink-500">{article.summary}</p>

        <article className="mt-6 space-y-3 rounded-2xl border border-ink-200 bg-surface p-6 text-[15px] leading-relaxed text-ink-700">
          {renderBody(article.body)}
        </article>

        <Link href="/contact" className="mt-6 flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline">
          <LifeBuoy size={16} /> Still stuck? Contact support
        </Link>
      </main>
    </div>
  );
}

// Minimal, safe body renderer: blank-line-separated paragraphs; "- " lines
// become a bullet list; a line ending in "?" renders as a sub-heading (FAQ).
function renderBody(body: string) {
  const blocks = body.split(/\n\n+/);
  return blocks.map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={i} className="list-disc space-y-1 pl-5">
          {lines.map((l, j) => <li key={j}>{l.replace(/^\s*-\s/, "")}</li>)}
        </ul>
      );
    }
    if (lines.length === 1 && lines[0].trim().endsWith("?")) {
      return <h3 key={i} className="pt-1 text-sm font-semibold text-ink-900">{lines[0]}</h3>;
    }
    return <p key={i}>{block}</p>;
  });
}
