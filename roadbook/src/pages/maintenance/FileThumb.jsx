import { FileText, Download, ExternalLink } from 'lucide-react';
import { useFileUrl } from '../../lib/files.js';

/** Image preview inline, or a link for PDFs and other files. */
export default function FileThumb({ path, name = 'file', big = false }) {
  const url = useFileUrl(path);
  if (!path) return null;
  const isPdf = /\.pdf$/i.test(path);
  if (!url) return <div className="flex h-16 items-center gap-2 rounded-lg bg-ink-100 px-3 text-xs text-ink-500 dark:bg-ink-800"><FileText size={16} />File saved. Preview not available offline.</div>;
  if (isPdf || !/\.(jpe?g|png|webp|gif)$/i.test(path)) {
    return (
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-2 text-sm font-medium hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700"><ExternalLink size={14} />Open {isPdf ? 'PDF' : 'file'}</a>
        <a href={url} download={`${name}.${path.split('.').pop()}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"><Download size={14} />Download</a>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open full size" className="block">
      <img src={url} alt={`${name} photo`} className={`w-full rounded-lg object-cover ring-1 ring-ink-200 dark:ring-ink-700 ${big ? 'max-h-96' : 'h-36'}`} />
    </a>
  );
}
