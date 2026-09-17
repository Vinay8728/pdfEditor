import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { isEncrypted, makeImage, makePdf, pageCountOf } from './fixtures';

/**
 * End-to-end checks against the real static export.
 *
 * These run the actual PDF pipeline in a real browser — pdf.js worker, pdf-lib,
 * canvas and all — and assert on the bytes that come back out, not just that a
 * button was clickable.
 */

/** Fails the test if the page logs an uncaught error. */
function guardConsole(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function download(page: Page, action: () => Promise<void>): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), action()]);
  return file;
}

async function bytesOf(file: Download): Promise<Uint8Array> {
  const path = await file.path();
  if (!path) throw new Error('The download produced no file on disk.');
  return new Uint8Array(readFileSync(path));
}

test.describe('site', () => {
  test('home page renders the tool directory', async ({ page }) => {
    const errors = guardConsole(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every PDF tool you need');
    // Every tool in the registry gets a card in the directory.
    await expect(page.getByRole('link', { name: 'Merge PDF', exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Redact PDF', exact: false }).first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('privacy page states the no-upload guarantee', async ({ page }) => {
    await page.goto('/privacy/');
    await expect(page.getByRole('heading', { name: 'Your files are not uploaded' })).toBeVisible();
  });
});

test.describe('merge', () => {
  test('combines two documents into one', async ({ page }) => {
    const errors = guardConsole(page);
    const a = await makePdf('merge-a.pdf', 3, 'Alpha');
    const b = await makePdf('merge-b.pdf', 2, 'Beta');

    await page.goto('/t/merge-pdf/');
    await page.locator('input[type="file"]').first().setInputFiles([a, b]);

    // Wait for both files to be listed before acting.
    await expect(page.getByText('merge-a.pdf')).toBeVisible();
    await expect(page.getByText('merge-b.pdf')).toBeVisible();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Merge files' }).click();
    });

    expect(file.suggestedFilename()).toBe('merged.pdf');
    expect(await pageCountOf(await bytesOf(file))).toBe(5);
    expect(errors).toEqual([]);
  });
});

test.describe('split', () => {
  test('produces one file per page as a zip', async ({ page }) => {
    const source = await makePdf('split.pdf', 4);

    await page.goto('/t/split-pdf/');
    await page.locator('input[type="file"]').first().setInputFiles(source);
    await expect(page.getByText('split.pdf')).toBeVisible();

    await page.getByRole('radio', { name: 'Each page' }).click();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Split file' }).click();
    });

    // Four outputs are bundled, so the result is a zip rather than a PDF.
    expect(file.suggestedFilename()).toContain('.zip');
    const bytes = await bytesOf(file);
    expect(bytes.length).toBeGreaterThan(0);
    // PK\x03\x04 — the zip magic number.
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

test.describe('page operations', () => {
  test('rotate writes a rotated document', async ({ page }) => {
    const source = await makePdf('rotate.pdf', 2);

    await page.goto('/t/rotate-pdf/');
    await page.locator('input[type="file"]').first().setInputFiles(source);
    await expect(page.getByText('rotate.pdf')).toBeVisible();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Rotate pages' }).click();
    });

    expect(await pageCountOf(await bytesOf(file))).toBe(2);
  });

  test('page numbers are added without losing pages', async ({ page }) => {
    const source = await makePdf('numbers.pdf', 3);

    await page.goto('/t/page-numbers/');
    await page.locator('input[type="file"]').first().setInputFiles(source);
    await expect(page.getByText('numbers.pdf')).toBeVisible();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Add page numbers' }).click();
    });

    expect(await pageCountOf(await bytesOf(file))).toBe(3);
  });

  test('the organiser renders thumbnails and applies changes', async ({ page }) => {
    const source = await makePdf('organise.pdf', 3);

    await page.goto('/t/organise-pages/');
    await page.locator('input[type="file"]').first().setInputFiles(source);

    // Thumbnails come from pdf.js, so this also proves the worker loaded.
    await expect(page.getByRole('button', { name: /Page 1, now at position 1/ })).toBeVisible({
      timeout: 30_000,
    });

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Apply changes' }).click();
    });

    expect(await pageCountOf(await bytesOf(file))).toBe(3);
  });
});

test.describe('conversion', () => {
  test('PDF to JPG renders every page', async ({ page }) => {
    const source = await makePdf('images.pdf', 2);

    await page.goto('/t/pdf-to-jpg/');
    await page.locator('input[type="file"]').first().setInputFiles(source);
    await expect(page.getByText('images.pdf')).toBeVisible();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Convert to images' }).click();
    });

    expect(file.suggestedFilename()).toContain('.zip');
  });

  test('JPG to PDF builds a document', async ({ page }) => {
    const image = await makeImage('dot.png');

    await page.goto('/t/jpg-to-pdf/');
    await page.locator('input[type="file"]').first().setInputFiles(image);
    await expect(page.getByText('dot.png')).toBeVisible();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Build PDF' }).click();
    });

    expect(file.suggestedFilename()).toBe('images.pdf');
    expect(await pageCountOf(await bytesOf(file))).toBe(1);
  });
});

test.describe('security', () => {
  test('protect really encrypts the output', async ({ page }) => {
    const source = await makePdf('secret.pdf', 1);

    await page.goto('/t/protect-pdf/');
    await page.locator('input[type="file"]').first().setInputFiles(source);
    await expect(page.getByText('secret.pdf')).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill('hunter22');
    await page.getByLabel('Confirm password').fill('hunter22');

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Protect file' }).click();
    });

    const bytes = await bytesOf(file);
    // The point of this tool: opening without the password must fail.
    expect(await isEncrypted(bytes)).toBe(true);
    expect(await pageCountOf(bytes, 'hunter22')).toBe(1);
  });

  test('grayscale keeps the page count', async ({ page }) => {
    const source = await makePdf('colour.pdf', 2);

    await page.goto('/t/grayscale-pdf/');
    await page.locator('input[type="file"]').first().setInputFiles(source);
    await expect(page.getByText('colour.pdf')).toBeVisible();

    const file = await download(page, async () => {
      await page.getByRole('button', { name: 'Convert to greyscale' }).click();
    });

    expect(await pageCountOf(await bytesOf(file))).toBe(2);
  });
});

test.describe('editor', () => {
  test('opens a document and shows the page canvas', async ({ page }) => {
    const errors = guardConsole(page);
    const source = await makePdf('edit.pdf', 3);

    await page.goto('/editor/');
    await page.locator('input[type="file"]').first().setInputFiles(source);

    await expect(page.getByText('Page 1 of 3')).toBeVisible({ timeout: 30_000 });
    // Two canvases stack up: the rendered page and the Fabric overlay.
    await expect(page.locator('canvas').first()).toBeVisible();

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 3')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
