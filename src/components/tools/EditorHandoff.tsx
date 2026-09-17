'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import { Alert, Button } from '@/components/ui/controls';
import { useEditorStore, type EditorTool, type PageGeometry } from '@/lib/editorStore';
import { loadPdfDocument } from '@/lib/pdf/pdfjs';

const INTRO: Record<string, { tool: EditorTool; blurb: string; action: string }> = {
  'edit-pdf': {
    tool: 'text',
    blurb:
      'The editor opens with your document. Add text, images, shapes, highlights and freehand drawing on any page, then apply the changes to a new PDF.',
    action: 'Open in editor',
  },
  'sign-pdf': {
    tool: 'signature',
    blurb:
      'Create your signature by drawing it, typing it, or uploading a photo — then drop it anywhere on any page and resize it to fit.',
    action: 'Open the signing editor',
  },
  'redact-pdf': {
    tool: 'redact',
    blurb:
      'Drag boxes over anything sensitive. When you apply, every affected page is re-rendered so the content underneath is genuinely destroyed, not just hidden.',
    action: 'Open the redaction editor',
  },
};

export function EditorHandoff({ files, slug, setError }: PanelProps & { slug: string }) {
  const router = useRouter();
  const setDocument = useEditorStore((state) => state.setDocument);
  const setTool = useEditorStore((state) => state.setTool);
  const [loading, setLoading] = useState(false);

  const file = files[0];
  const intro = INTRO[slug] ?? INTRO['edit-pdf'];

  const open = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await loadPdfDocument(file.bytes, { password: file.password });
      const geometry: PageGeometry[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        geometry.push({
          width: viewport.width,
          height: viewport.height,
          rotation: page.rotate ?? 0,
        });
        page.cleanup();
      }
      const pageCount = doc.numPages;
      await doc.destroy();

      setDocument({
        fileName: file.name,
        bytes: file.bytes,
        pageCount,
        geometry,
        password: file.password,
      });
      setTool(intro.tool);
      router.push('/editor/');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'This PDF could not be opened in the editor.',
      );
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">{intro.blurb}</Alert>
      <Button onClick={open} loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
        {intro.action}
      </Button>
    </div>
  );
}
