/**
 * Office-format conversion endpoint (Phase 2).
 *
 * Real .docx/.xlsx/.pptx conversion needs a full Office rendering engine, which
 * is not something that can run in the browser. This is the only part of the app
 * that sends a file off-device, and it is deliberately opt-in: with no provider
 * key configured the endpoint reports 501 and the UI keeps the feature disabled.
 *
 * Configure ONE of these in Netlify -> Site settings -> Environment variables:
 *   CONVERT_PROVIDER      = "convertapi" | "cloudconvert"
 *   CONVERTAPI_SECRET     = <secret>        (when provider is convertapi)
 *   CLOUDCONVERT_API_KEY  = <api key>       (when provider is cloudconvert)
 *
 * GET  /api/convert            -> { configured, provider, formats }
 * POST /api/convert            -> multipart form: file, from, to  => converted bytes
 */

const MAX_BYTES = 5.5 * 1024 * 1024; // Netlify synchronous function payload ceiling.

const SUPPORTED = {
  // PDF out of Office formats
  docx: ['pdf'],
  doc: ['pdf'],
  xlsx: ['pdf'],
  xls: ['pdf'],
  pptx: ['pdf'],
  ppt: ['pdf'],
  html: ['pdf'],
  txt: ['pdf'],
  rtf: ['pdf'],
  // Office formats out of PDF
  pdf: ['docx', 'xlsx', 'pptx', 'txt', 'html'],
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function providerConfig() {
  const explicit = (process.env.CONVERT_PROVIDER || '').trim().toLowerCase();
  const convertApiSecret = process.env.CONVERTAPI_SECRET;
  const cloudConvertKey = process.env.CLOUDCONVERT_API_KEY;

  if (explicit === 'convertapi' && convertApiSecret) {
    return { provider: 'convertapi', secret: convertApiSecret };
  }
  if (explicit === 'cloudconvert' && cloudConvertKey) {
    return { provider: 'cloudconvert', secret: cloudConvertKey };
  }
  // Fall back to whichever key is present.
  if (convertApiSecret) return { provider: 'convertapi', secret: convertApiSecret };
  if (cloudConvertKey) return { provider: 'cloudconvert', secret: cloudConvertKey };
  return null;
}

export default async function handler(request) {
  const config = providerConfig();

  if (request.method === 'GET') {
    return json({
      configured: Boolean(config),
      provider: config ? config.provider : null,
      formats: SUPPORTED,
      maxBytes: MAX_BYTES,
      message: config
        ? `Conversions are handled by ${config.provider}.`
        : 'No conversion provider is configured. Set CONVERTAPI_SECRET or CLOUDCONVERT_API_KEY in your Netlify environment variables.',
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST to convert a file.' }, 405);
  }

  if (!config) {
    return json(
      {
        error: 'not_configured',
        message:
          'Document conversion is not enabled on this deployment. Add CONVERTAPI_SECRET or CLOUDCONVERT_API_KEY to the site environment variables.',
      },
      501,
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Send the file as multipart/form-data.' }, 400);
  }

  const file = form.get('file');
  const from = String(form.get('from') || '').toLowerCase().replace(/^\./, '');
  const to = String(form.get('to') || '').toLowerCase().replace(/^\./, '');

  if (!file || typeof file === 'string') {
    return json({ error: 'No file was included in the request.' }, 400);
  }
  if (!SUPPORTED[from] || !SUPPORTED[from].includes(to)) {
    return json({ error: `Converting ${from || '?'} to ${to || '?'} is not supported.` }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json(
      {
        error: 'too_large',
        message: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The conversion endpoint accepts up to ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`,
      },
      413,
    );
  }

  try {
    const bytes =
      config.provider === 'convertapi'
        ? await convertWithConvertApi(config.secret, file, from, to)
        : await convertWithCloudConvert(config.secret, file, from, to);

    const baseName = (file.name || 'document').replace(/\.[^.]+$/, '');
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${baseName}.${to}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return json(
      { error: 'conversion_failed', message: error?.message || 'The conversion failed.' },
      502,
    );
  }
}

async function convertWithConvertApi(secret, file, from, to) {
  const body = new FormData();
  body.append('File', file, file.name || `input.${from}`);
  body.append('StoreFile', 'true');

  const response = await fetch(`https://v2.convertapi.com/convert/${from}/to/${to}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    body,
  });

  if (!response.ok) {
    throw new Error(`ConvertAPI returned ${response.status}: ${await safeText(response)}`);
  }

  const result = await response.json();
  const entry = result?.Files?.[0];
  if (!entry) throw new Error('ConvertAPI returned no output file.');

  if (entry.FileData) {
    return Buffer.from(entry.FileData, 'base64');
  }
  if (entry.Url) {
    const download = await fetch(entry.Url);
    if (!download.ok) throw new Error('The converted file could not be downloaded.');
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error('ConvertAPI returned an unexpected response.');
}

async function convertWithCloudConvert(apiKey, file, from, to) {
  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  // 1. Create a job with an upload task, a convert task and an export task.
  const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        upload: { operation: 'import/upload' },
        convert: {
          operation: 'convert',
          input: 'upload',
          input_format: from,
          output_format: to,
        },
        export: { operation: 'export/url', input: 'convert' },
      },
    }),
  });

  if (!jobResponse.ok) {
    throw new Error(`CloudConvert returned ${jobResponse.status}: ${await safeText(jobResponse)}`);
  }

  const job = (await jobResponse.json()).data;
  const uploadTask = job.tasks.find((task) => task.name === 'upload');
  if (!uploadTask?.result?.form) throw new Error('CloudConvert did not return an upload target.');

  // 2. Upload the file to the signed form.
  const uploadForm = new FormData();
  for (const [key, value] of Object.entries(uploadTask.result.form.parameters || {})) {
    uploadForm.append(key, value);
  }
  uploadForm.append('file', file, file.name || `input.${from}`);

  const upload = await fetch(uploadTask.result.form.url, { method: 'POST', body: uploadForm });
  if (!upload.ok) throw new Error(`Upload to CloudConvert failed (${upload.status}).`);

  // 3. Poll until the export task finishes.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const status = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.id}`, {
      headers: authHeaders,
    });
    if (!status.ok) continue;

    const current = (await status.json()).data;
    if (current.status === 'error') {
      const failed = current.tasks.find((task) => task.status === 'error');
      throw new Error(failed?.message || 'CloudConvert reported an error.');
    }
    if (current.status !== 'finished') continue;

    const exportTask = current.tasks.find(
      (task) => task.operation === 'export/url' && task.status === 'finished',
    );
    const url = exportTask?.result?.files?.[0]?.url;
    if (!url) throw new Error('CloudConvert finished without producing a file.');

    const download = await fetch(url);
    if (!download.ok) throw new Error('The converted file could not be downloaded.');
    return Buffer.from(await download.arrayBuffer());
  }

  throw new Error('The conversion timed out.');
}

async function safeText(response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}
