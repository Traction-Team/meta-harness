'use strict';
/* Metafab · Mark III prototype · hand-written project content.
   One real project (Invoice service) so that every artifact survives a close look:
   requests, specs, slice plans, diffs, tests, PRs, Sentry events.
   The simulation in app.js decides *when* things happen. This file decides *what* they are. */

const REPO = { name: 'acme/invoice-service', base: 'main', head: 'a41c9e2', wt: '~/.metafab/wt/invoice-service' };

// ───────────────────────────────────────────── helpers for writing diffs
// A test is { n: name, b: [body lines] }. Tests marked err are error/edge paths: a weak
// Build slice (v1, no testing standard) skips them. Build slice v2 writes them first.
function testFile(path, subject, imports, tests) {
  const l = [...imports.map(x => '+' + x), '+', `+describe('${subject}', () => {`];
  tests.forEach((t, i) => { if (i) l.push('+'); l.push(`+  it('${t.n}', async () => {`, ...t.b.map(x => '+    ' + x), '+  });'); });
  l.push('+});');
  return { path, st: 'A', test: true, hunks: [{ h: `@@ -0,0 +1,${l.length} @@`, l }] };
}

// ───────────────────────────────────────────── requests
const REQUESTS = [
  {
    key: 'csv', title: 'Export invoices as CSV', from: 'Seb · form',
    text: 'Our accountant wants all invoices for a quarter in a spreadsheet. Let me export the invoice list as CSV, with whatever filters are active.',
    explore: [
      ['Read', 'src/api/routes/invoices.ts', '142 lines'],
      ['Grep', '"parseListFilters" src/', '3 matches in 2 files'],
      ['Read', 'src/web/invoices/InvoiceList.tsx', '210 lines'],
    ],
    finding: 'The list already parses status, client and date filters with `parseListFilters()` in the invoices route. The export can reuse it, so the CSV always matches what the user sees.',
    ask: {
      q: 'Should the CSV have one row per invoice, or one row per line item?',
      why: 'The request says "all invoices for a quarter". An accountant reconciling totals wants one row per invoice. Some bookkeeping tools import line items instead. It changes the columns and the file size, so I would rather not guess.',
      options: ['One row per invoice', 'One row per line item', 'Both, as two exports'],
    },
    spec: `# Export invoices as CSV

## Goal
An agency owner downloads the invoices they see in the list as a CSV file, to send to their accountant.

## Non-goals
- Line items. One row per invoice.
- Scheduled or emailed exports.
- XLSX.

## Constraints
- Uses the filters that are active on the list: status, client, date range.
- Money is a decimal string in the invoice currency. Never a float.
- Dates are ISO 8601, for example \`2026-07-01\`.
- At most 10,000 rows in one export. Above that, ask the user to narrow the filter.

## Acceptance criteria
1. **Export CSV** on the invoice list downloads \`invoices-2026-07-01-to-2026-09-30.csv\`.
2. Columns: number, client, issued, due, status, currency, subtotal, tax, total, paid_at.
3. Values with commas, quotes or new lines are escaped as in RFC 4180.
4. When no invoices match the filter, the file has the header row only.
5. A user can only export invoices from their own workspace.`,
    plan: 'Three slices. The serializer has no I/O, so it can be built and tested alone. The endpoint and the button only depend on its signature.',
    slices: [
      {
        title: 'CSV serializer', branch: 'mf/inv-csv-serializer',
        scope: 'A pure function that turns invoice rows into RFC 4180 CSV. No I/O, no database.',
        criteria: [2, 3, 4],
        explore: [['Read', 'src/lib/money.ts', '64 lines'], ['Grep', '"toDecimalString" src/lib', '1 match']],
        files: [
          { path: 'src/lib/csv.ts', st: 'A', hunks: [{ h: '@@ -0,0 +1,31 @@', l: [
            "+import { toDecimalString } from './money';",
            "+import type { Invoice } from '../db/schema';",
            '+',
            "+export const INVOICE_COLUMNS = ['number', 'client', 'issued', 'due', 'status', 'currency', 'subtotal', 'tax', 'total', 'paid_at'] as const;",
            '+',
            '+function cell(v: string | null): string {',
            "+  if (v == null) return '';",
            '+  return /[",\\n\\r]/.test(v) ? \'"\' + v.replace(/"/g, \'""\') + \'"\' : v;',
            '+}',
            '+',
            '+export function invoicesToCsv(rows: Invoice[]): string {',
            '+  const lines = [INVOICE_COLUMNS.join(\',\')];',
            '+  for (const r of rows) {',
            '+    lines.push([',
            '+      r.number, r.clientName, r.issuedOn, r.dueOn, r.status, r.currency,',
            '+      toDecimalString(r.subtotalMinor, r.currency),',
            '+      toDecimalString(r.taxMinor, r.currency),',
            '+      toDecimalString(r.totalMinor, r.currency),',
            '+      r.paidAt?.slice(0, 10) ?? null,',
            '+    ].map(cell).join(\',\'));',
            '+  }',
            "+  return lines.join('\\r\\n') + '\\r\\n';",
            '+}',
          ] }] },
        ],
        test: { path: 'test/lib/csv.test.ts', subject: 'invoicesToCsv', imports: ["import { describe, it, expect } from 'vitest';", "import { invoicesToCsv } from '../../src/lib/csv';", "import { invoice } from '../fixtures';"] },
        tests: [
          { n: 'writes one row per invoice with the header', b: ['const csv = invoicesToCsv([invoice(), invoice({ number: \'INV-0042\' })]);', "expect(csv.split('\\r\\n')).toHaveLength(4);"] },
          { n: 'formats money as decimal strings', b: ['const csv = invoicesToCsv([invoice({ totalMinor: 123450, currency: \'AUD\' })]);', "expect(csv).toContain(',1234.50,');"] },
          { n: 'escapes commas and quotes', b: ["const csv = invoicesToCsv([invoice({ clientName: 'Smith, \"Jones\" & Co' })]);", 'expect(csv).toContain(\'"Smith, ""Jones"" & Co"\');'] },
          { n: 'header only when there are no invoices', err: true, b: ["expect(invoicesToCsv([])).toBe('number,client,issued,due,status,currency,subtotal,tax,total,paid_at\\r\\n');"] },
          { n: 'escapes new lines inside a value', err: true, b: ["const csv = invoicesToCsv([invoice({ clientName: 'Line one\\nLine two' })]);", 'expect(csv).toContain(\'"Line one\\nLine two"\');'] },
        ],
      },
      {
        title: 'GET /invoices/export', branch: 'mf/inv-csv-endpoint', weakTests: true,
        scope: 'An endpoint that applies the list filters, checks the workspace, and returns the CSV with a dated filename.',
        criteria: [1, 4, 5],
        explore: [['Read', 'src/api/routes/invoices.ts', '142 lines'], ['Read', 'src/api/middleware/workspace.ts', '38 lines'], ['Grep', '"listInvoices(" src/', '2 matches']],
        files: [
          { path: 'src/api/routes/invoices.ts', st: 'M', hunks: [
            { h: '@@ -1,6 +1,7 @@', l: [
              " import { Hono } from 'hono';",
              " import { requireWorkspace } from '../middleware/workspace';",
              " import { listInvoices, parseListFilters } from '../../db/invoices';",
              "+import { invoicesToCsv } from '../../lib/csv';",
              ' ',
              ' export const invoices = new Hono<AppEnv>();',
              " invoices.use('*', requireWorkspace);",
            ] },
            { h: '@@ -38,6 +39,22 @@ invoices.get(\'/\', async (c) => {', l: [
              "   return c.json({ invoices: rows, next: page.next });",
              ' });',
              ' ',
              "+invoices.get('/export', async (c) => {",
              "+  const filters = parseListFilters(c.req.query());",
              "+  const rows = await listInvoices(c.get('workspaceId'), filters, { limit: 10_001 });",
              '+  if (rows.length > 10_000) {',
              "+    return c.json({ error: 'too_many_rows', limit: 10_000 }, 413);",
              '+  }',
              '+  const name = `invoices-${filters.from}-to-${filters.to}.csv`;',
              "+  c.header('content-type', 'text/csv; charset=utf-8');",
              "+  c.header('content-disposition', `attachment; filename=\"${name}\"`);",
              '+  return c.body(invoicesToCsv(rows));',
              '+});',
              '+',
              " invoices.get('/:id', async (c) => {",
            ] },
          ] },
        ],
        test: { path: 'test/api/invoices-export.test.ts', subject: 'GET /invoices/export', imports: ["import { describe, it, expect } from 'vitest';", "import { app, signIn, seed } from '../harness';"] },
        tests: [
          { n: 'returns CSV with the active filters applied', b: ["await seed.invoices(3, { status: 'paid' }); await seed.invoices(2, { status: 'sent' });", "const res = await signIn(app).get('/invoices/export?status=paid&from=2026-07-01&to=2026-09-30');", "expect((await res.text()).trim().split('\\r\\n')).toHaveLength(4);"] },
          { n: 'sets a dated filename', b: ["const res = await signIn(app).get('/invoices/export?from=2026-07-01&to=2026-09-30');", "expect(res.headers.get('content-disposition')).toContain('invoices-2026-07-01-to-2026-09-30.csv');"] },
          { n: 'does not export invoices from another workspace', err: true, b: ["await seed.invoices(2, { workspace: 'other' });", "const res = await signIn(app).get('/invoices/export');", "expect((await res.text()).trim().split('\\r\\n')).toHaveLength(1);"] },
          { n: 'returns 413 above 10,000 rows', err: true, b: ['await seed.invoices(10_001);', "expect((await signIn(app).get('/invoices/export')).status).toBe(413);"] },
          { n: 'exports invoices whose client was deleted', err: true, b: ["const [inv] = await seed.invoices(1); await seed.deleteClient(inv.clientId);", "expect((await signIn(app).get('/invoices/export')).status).toBe(200);"] },
        ],
        defect: {
          title: "TypeError: Cannot read properties of null (reading 'name')",
          where: 'GET /invoices/export', culprit: 'src/db/invoices.ts in listInvoices', users: 3, events: 11,
          stack: ["TypeError: Cannot read properties of null (reading 'name')", '  at toRow (src/db/invoices.ts:88:31)', '  at Array.map (<anonymous>)', '  at listInvoices (src/db/invoices.ts:71:18)', '  at async src/api/routes/invoices.ts:44:16'],
          note: 'An invoice whose client was deleted has client = null. The export has no test for it.',
          fix: { path: 'src/db/invoices.ts', hunks: [{ h: '@@ -86,3 +86,3 @@ function toRow(row: InvoiceRow): Invoice {', l: ['   number: row.number,', '-  clientName: row.client.name,', "+  clientName: row.client?.name ?? '(deleted client)',", '   issuedOn: row.issuedOn,'] }] },
        },
      },
      {
        title: 'Export button on invoice list', branch: 'mf/inv-csv-button', weakTests: true,
        scope: 'A button in the list toolbar that builds the export URL from the current filters. Above 10,000 rows it explains how to narrow the filter.',
        criteria: [1],
        explore: [['Read', 'src/web/invoices/InvoiceList.tsx', '210 lines'], ['Read', 'src/web/invoices/useListFilters.ts', '57 lines']],
        files: [
          { path: 'src/web/invoices/useExport.ts', st: 'A', hunks: [{ h: '@@ -0,0 +1,14 @@', l: [
            "+import { useListFilters } from './useListFilters';",
            '+',
            '+export function useExport() {',
            '+  const { filters, total } = useListFilters();',
            '+  const params = new URLSearchParams(filters as Record<string, string>);',
            '+  return {',
            "+    href: '/api/invoices/export?' + params.toString(),",
            '+    tooMany: total > 10_000,',
            '+  };',
            '+}',
          ] }] },
          { path: 'src/web/invoices/InvoiceList.tsx', st: 'M', hunks: [{ h: '@@ -61,7 +61,15 @@ export function InvoiceList() {', l: [
            '   return (',
            '     <Page title="Invoices">',
            '       <Toolbar>',
            '         <FilterBar />',
            '+        <Button',
            '+          as="a"',
            '+          href={exp.tooMany ? undefined : exp.href}',
            '+          disabled={exp.tooMany}',
            '+          title={exp.tooMany ? \'More than 10,000 invoices. Narrow the date range.\' : undefined}',
            '+        >',
            '+          Export CSV',
            '+        </Button>',
            '         <NewInvoiceButton />',
            '       </Toolbar>',
          ] }] },
        ],
        test: { path: 'test/web/useExport.test.ts', subject: 'useExport', imports: ["import { describe, it, expect } from 'vitest';", "import { renderHook } from '@testing-library/react';", "import { useExport } from '../../src/web/invoices/useExport';", "import { withFilters } from '../web-harness';"] },
        tests: [
          { n: 'builds the export URL from the active filters', b: ["const { result } = renderHook(useExport, withFilters({ status: 'paid', from: '2026-07-01' }));", "expect(result.current.href).toBe('/api/invoices/export?status=paid&from=2026-07-01');"] },
          { n: 'disables the export above 10,000 invoices', err: true, b: ['const { result } = renderHook(useExport, withFilters({}, { total: 10_001 }));', 'expect(result.current.tooMany).toBe(true);'] },
        ],
      },
    ],
  },

  {
    key: 'stripe', title: 'Stripe payment links on invoices', from: 'Seb · form',
    text: 'Clients should be able to pay an invoice by card. Put a Stripe payment link in the invoice email and the PDF, and mark the invoice paid when Stripe says so.',
    explore: [
      ['Read', 'src/db/schema.ts', '188 lines'],
      ['Grep', '"stripe" src/ package.json', '2 matches · stripe@16.2.0 is installed, not used'],
      ['Read', 'src/emails/invoice.tsx', '96 lines'],
    ],
    finding: 'The `stripe` package is installed but nothing uses it yet. Invoices store money in minor units (`totalMinor`), which is what Stripe wants, so no conversion is needed.',
    ask: {
      q: 'If someone edits an invoice after it was sent, what should happen to the payment link already in the client\'s inbox?',
      why: 'A Stripe payment link has a fixed amount. If the total changes, the old link would charge the old amount. There are three reasonable answers and they lead to different specs.',
      options: ['Deactivate the old link and send a new one', 'Block edits once an invoice is sent', 'Keep the old link'],
    },
    spec: `# Stripe payment links on invoices

## Goal
A client pays an invoice by card from the email or the PDF. The invoice is marked paid without anyone touching it.

## Non-goals
- Partial payments.
- Saved cards or subscriptions.
- Refunds. They stay in the Stripe dashboard.

## Constraints
- Create the payment link when the invoice is **sent**, not when it is drafted.
- Amounts in minor units, in the invoice currency.
- The webhook is idempotent: the same Stripe event twice marks the invoice paid once.
- Verify the Stripe signature on every webhook call.
- Editing a sent invoice deactivates its link and sends a new one.

## Acceptance criteria
1. A sent invoice has a payment link for its exact total.
2. The invoice email and the PDF show a **Pay now** button with that link.
3. \`checkout.session.completed\` marks the invoice paid and stores \`paid_at\`.
4. A webhook with a bad signature returns 400 and changes nothing.
5. Editing the total of a sent invoice deactivates the old link.`,
    plan: 'Three slices. Link creation needs a migration for `payment_link_id`. The webhook only needs the column to exist. The button only needs the URL on the invoice.',
    slices: [
      {
        title: 'Create payment link on send', branch: 'mf/inv-stripe-link', weakTests: true,
        scope: 'When an invoice is sent, create a Stripe payment link for its total and store it. Editing the total of a sent invoice deactivates the old link.',
        criteria: [1, 5],
        explore: [['Read', 'src/api/routes/invoices.ts', '158 lines'], ['Read', 'src/db/migrations/0013_client_notes.sql', '9 lines'], ['Bash', 'grep STRIPE .env.example', '(no output)']],
        ask: {
          q: '`STRIPE_SECRET_KEY` is not in `.env.example`, and CI has no Stripe test key. How should the tests talk to Stripe?',
          why: 'With a test key, the tests hit Stripe test mode and catch API changes, but they are slower and need a secret in CI. A mock is fast and needs nothing, but it only checks that we call Stripe the way we think we should.',
          options: ['Mock Stripe in tests', 'I will add a test key to CI secrets'],
        },
        files: [
          { path: 'src/db/migrations/0014_payment_links.sql', st: 'A', hunks: [{ h: '@@ -0,0 +1,4 @@', l: [
            '+ALTER TABLE invoices ADD COLUMN payment_link_id text;',
            '+ALTER TABLE invoices ADD COLUMN payment_link_url text;',
            '+CREATE UNIQUE INDEX invoices_payment_link_id ON invoices (payment_link_id);',
          ] }] },
          { path: 'src/billing/payment-links.ts', st: 'A', hunks: [{ h: '@@ -0,0 +1,22 @@', l: [
            "+import Stripe from 'stripe';",
            "+import type { Invoice } from '../db/schema';",
            '+',
            '+const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);',
            '+',
            '+export async function createPaymentLink(inv: Invoice) {',
            '+  const price = await stripe.prices.create({',
            '+    currency: inv.currency.toLowerCase(),',
            '+    unit_amount: inv.totalMinor,',
            '+    product_data: { name: `Invoice ${inv.number}` },',
            '+  });',
            '+  return stripe.paymentLinks.create({',
            '+    line_items: [{ price: price.id, quantity: 1 }],',
            '+    metadata: { invoice_id: inv.id },',
            '+  });',
            '+}',
            '+',
            '+export async function deactivatePaymentLink(id: string) {',
            '+  await stripe.paymentLinks.update(id, { active: false });',
            '+}',
          ] }] },
          { path: 'src/api/routes/invoices.ts', st: 'M', hunks: [{ h: "@@ -96,8 +96,14 @@ invoices.post('/:id/send', async (c) => {", l: [
            "   const inv = await getInvoice(c.get('workspaceId'), c.req.param('id'));",
            "   if (inv.status !== 'draft') return c.json({ error: 'already_sent' }, 409);",
            '+  const link = await createPaymentLink(inv);',
            '+  await updateInvoice(inv.id, {',
            '+    paymentLinkId: link.id,',
            '+    paymentLinkUrl: link.url,',
            '+  });',
            '   await sendInvoiceEmail(inv);',
            "   await updateInvoice(inv.id, { status: 'sent', sentAt: new Date() });",
            "   return c.json({ ok: true });",
          ] }] },
        ],
        test: { path: 'test/billing/payment-links.test.ts', subject: 'payment links', imports: ["import { describe, it, expect, vi } from 'vitest';", "import { app, signIn, seed, stripeMock } from '../harness';"] },
        tests: [
          { n: 'creates a link for the exact total on send', b: ['const inv = await seed.invoice({ totalMinor: 482000, currency: \'AUD\' });', "await signIn(app).post(`/invoices/${inv.id}/send`);", 'expect(stripeMock.prices.create).toHaveBeenCalledWith(expect.objectContaining({ unit_amount: 482000 }));'] },
          { n: 'stores the link on the invoice', b: ['const inv = await seed.invoice();', "await signIn(app).post(`/invoices/${inv.id}/send`);", 'expect((await seed.reload(inv)).paymentLinkUrl).toMatch(/^https:\\/\\/buy.stripe.com\\//);'] },
          { n: 'deactivates the old link when a sent total changes', err: true, b: ["const inv = await seed.invoice({ status: 'sent', paymentLinkId: 'plink_1' });", "await signIn(app).patch(`/invoices/${inv.id}`).send({ totalMinor: 1000 });", "expect(stripeMock.paymentLinks.update).toHaveBeenCalledWith('plink_1', { active: false });"] },
          { n: 'does not send the email when Stripe fails', err: true, b: ["stripeMock.prices.create.mockRejectedValueOnce(new Error('rate_limited'));", "const res = await signIn(app).post(`/invoices/${(await seed.invoice()).id}/send`);", 'expect(res.status).toBe(502);'] },
        ],
        defect: {
          title: 'StripeInvalidRequestError: Invalid currency: aud',
          where: 'POST /invoices/:id/send', culprit: 'src/billing/payment-links.ts in createPaymentLink', users: 2, events: 4,
          stack: ['StripeInvalidRequestError: Invalid currency: aud', '  at StripeError.generate (node_modules/stripe/esm/Error.js:10:16)', '  at createPaymentLink (src/billing/payment-links.ts:7:30)', "  at async src/api/routes/invoices.ts:98:16"],
          note: 'The workspace Stripe account has no AUD enabled. Send fails after the link call, and the email is never sent. No test covers a Stripe error.',
          fix: { path: 'src/api/routes/invoices.ts', hunks: [{ h: "@@ -98,6 +98,12 @@ invoices.post('/:id/send', async (c) => {", l: ['-  const link = await createPaymentLink(inv);', '+  let link;', '+  try {', '+    link = await createPaymentLink(inv);', '+  } catch (err) {', "+    log.warn('payment link failed; sending without it', { invoice: inv.id, err });", '+  }', '   await updateInvoice(inv.id, {', '-    paymentLinkId: link.id,', '-    paymentLinkUrl: link.url,', '+    paymentLinkId: link?.id ?? null,', '+    paymentLinkUrl: link?.url ?? null,'] }] },
        },
      },
      {
        title: 'Webhook marks invoice paid', branch: 'mf/inv-stripe-webhook', weakTests: true,
        scope: 'Handle `checkout.session.completed`. Verify the signature, find the invoice by metadata, mark it paid once.',
        criteria: [3, 4],
        explore: [['Read', 'src/api/app.ts', '61 lines'], ['Grep', '"rawBody" src/api', '0 matches']],
        files: [
          { path: 'src/api/routes/stripe-webhook.ts', st: 'A', hunks: [{ h: '@@ -0,0 +1,24 @@', l: [
            "+import { Hono } from 'hono';",
            "+import Stripe from 'stripe';",
            "+import { markInvoicePaid } from '../../db/invoices';",
            '+',
            '+const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);',
            '+export const stripeWebhook = new Hono();',
            '+',
            "+stripeWebhook.post('/', async (c) => {",
            "+  const sig = c.req.header('stripe-signature') ?? '';",
            '+  let event: Stripe.Event;',
            '+  try {',
            '+    event = stripe.webhooks.constructEvent(await c.req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);',
            '+  } catch {',
            "+    return c.json({ error: 'bad_signature' }, 400);",
            '+  }',
            "+  if (event.type === 'checkout.session.completed') {",
            '+    const s = event.data.object;',
            '+    await markInvoicePaid(s.metadata!.invoice_id, new Date(s.created * 1000));',
            '+  }',
            '+  return c.json({ received: true });',
            '+});',
          ] }] },
          { path: 'src/api/app.ts', st: 'M', hunks: [{ h: '@@ -22,6 +22,7 @@', l: [
            " app.route('/invoices', invoices);",
            " app.route('/clients', clients);",
            "+app.route('/webhooks/stripe', stripeWebhook);",
            ' ',
            ' export default app;',
          ] }] },
        ],
        test: { path: 'test/api/stripe-webhook.test.ts', subject: 'POST /webhooks/stripe', imports: ["import { describe, it, expect } from 'vitest';", "import { app, seed, signedStripeEvent } from '../harness';"] },
        tests: [
          { n: 'marks the invoice paid on checkout.session.completed', b: ["const inv = await seed.invoice({ status: 'sent' });", "await app.request('/webhooks/stripe', signedStripeEvent('checkout.session.completed', { invoice_id: inv.id }));", "expect((await seed.reload(inv)).status).toBe('paid');"] },
          { n: 'rejects a bad signature', err: true, b: ["const res = await app.request('/webhooks/stripe', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'nope' } });", 'expect(res.status).toBe(400);'] },
          { n: 'ignores a repeated event', err: true, b: ["const inv = await seed.invoice({ status: 'sent' });", "const ev = signedStripeEvent('checkout.session.completed', { invoice_id: inv.id });", "await app.request('/webhooks/stripe', ev); await app.request('/webhooks/stripe', ev);", 'expect(await seed.paymentsFor(inv)).toHaveLength(1);'] },
        ],
        defect: {
          title: 'duplicate key value violates unique constraint "payments_invoice_id_key"',
          where: 'POST /webhooks/stripe', culprit: 'src/db/invoices.ts in markInvoicePaid', users: 1, events: 6,
          stack: ['error: duplicate key value violates unique constraint "payments_invoice_id_key"', '  at Parser.parseErrorMessage (node_modules/pg-protocol/dist/parser.js:283:98)', '  at markInvoicePaid (src/db/invoices.ts:131:9)', '  at async src/api/routes/stripe-webhook.ts:18:5'],
          note: 'Stripe retries webhooks. The second delivery fails with a 500, so Stripe keeps retrying. No test sends the same event twice.',
          fix: { path: 'src/db/invoices.ts', hunks: [{ h: '@@ -128,5 +128,6 @@ export async function markInvoicePaid(id: string, at: Date) {', l: ['   await db.transaction(async (tx) => {', '-    await tx.insert(payments).values({ invoiceId: id, paidAt: at });', '+    await tx.insert(payments).values({ invoiceId: id, paidAt: at })', '+      .onConflictDoNothing({ target: payments.invoiceId });', "     await tx.update(invoices).set({ status: 'paid', paidAt: at }).where(eq(invoices.id, id));"] }] },
        },
      },
      {
        title: 'Pay now in email and PDF', branch: 'mf/inv-stripe-button',
        scope: 'Show a Pay now button with the payment link in the invoice email and the PDF. Hide it when the invoice is paid.',
        criteria: [2],
        explore: [['Read', 'src/emails/invoice.tsx', '96 lines'], ['Read', 'src/pdf/invoice.tsx', '143 lines']],
        files: [
          { path: 'src/emails/invoice.tsx', st: 'M', hunks: [{ h: '@@ -48,6 +48,13 @@ export function InvoiceEmail({ invoice }: Props) {', l: [
            '       <Text>Amount due: {formatMoney(invoice.totalMinor, invoice.currency)}</Text>',
            '       <Text>Due: {formatDate(invoice.dueOn)}</Text>',
            "+      {invoice.paymentLinkUrl && invoice.status !== 'paid' && (",
            '+        <Section style={{ margin: \'24px 0\' }}>',
            '+          <Button href={invoice.paymentLinkUrl} style={styles.pay}>',
            '+            Pay now',
            '+          </Button>',
            '+        </Section>',
            '+      )}',
            '       <Hr />',
          ] }] },
          { path: 'src/pdf/invoice.tsx', st: 'M', hunks: [{ h: '@@ -110,4 +110,9 @@', l: [
            '         <TotalsTable invoice={invoice} />',
            "+        {invoice.paymentLinkUrl && invoice.status !== 'paid' && (",
            '+          <Link src={invoice.paymentLinkUrl} style={styles.pay}>',
            '+            Pay now · {invoice.paymentLinkUrl.replace(\'https://\', \'\')}',
            '+          </Link>',
            '+        )}',
            '       </Page>',
          ] }] },
        ],
        test: { path: 'test/emails/invoice-pay.test.tsx', subject: 'Pay now', imports: ["import { describe, it, expect } from 'vitest';", "import { render } from '@react-email/render';", "import { InvoiceEmail } from '../../src/emails/invoice';", "import { invoice } from '../fixtures';"] },
        tests: [
          { n: 'shows Pay now with the link on a sent invoice', b: ["const html = await render(<InvoiceEmail invoice={invoice({ status: 'sent', paymentLinkUrl: 'https://buy.stripe.com/x' })} />);", "expect(html).toContain('https://buy.stripe.com/x');"] },
          { n: 'hides Pay now on a paid invoice', err: true, b: ["const html = await render(<InvoiceEmail invoice={invoice({ status: 'paid', paymentLinkUrl: 'https://buy.stripe.com/x' })} />);", "expect(html).not.toContain('Pay now');"] },
        ],
      },
    ],
  },

  {
    key: 'overdue', title: 'Overdue reminders', from: 'Seb · form',
    text: 'Send clients a polite reminder when an invoice is 7 days overdue, and again at 14. Let me turn it off per client, some of them hate it.',
    explore: [
      ['Read', 'src/jobs/index.ts', '44 lines'],
      ['Grep', '"cron(" src/jobs', '2 matches'],
      ['Read', 'src/db/schema.ts', '191 lines'],
    ],
    finding: 'There is already a job runner with two daily cron jobs. Reminders fit as a third. Clients have no settings column yet, so the per-client switch needs a migration.',
    spec: `# Overdue reminders

## Goal
Clients get a polite reminder when an invoice is overdue, so the agency does not have to chase by hand.

## Non-goals
- Late fees.
- SMS.
- Reminders before the due date.

## Constraints
- Reminders at 7 and 14 days overdue. Never more than one per invoice per day.
- Times use the workspace time zone, not UTC.
- The switch is per client. It is on by default.

## Acceptance criteria
1. A daily job sends a reminder for each invoice that is exactly 7 or 14 days overdue.
2. The email names the invoice, the amount, the due date, and has the Pay now link if there is one.
3. A client with reminders off gets none.
4. A paid invoice gets none, even if it was paid on the day.`,
    plan: 'Three slices. The job and the email template are independent. The per-client switch is a migration plus one checkbox; the job reads it but does not need it to exist first, because the default is on.',
    slices: [
      {
        title: 'Daily overdue job', branch: 'mf/inv-overdue-job', weakTests: true,
        scope: 'A daily job that finds invoices exactly 7 or 14 days overdue in the workspace time zone, and sends one reminder each.',
        criteria: [1, 3, 4],
        explore: [['Read', 'src/jobs/index.ts', '44 lines'], ['Read', 'src/lib/dates.ts', '72 lines']],
        files: [
          { path: 'src/jobs/overdue-reminders.ts', st: 'A', hunks: [{ h: '@@ -0,0 +1,19 @@', l: [
            "+import { daysBetween, todayIn } from '../lib/dates';",
            "+import { listOverdue } from '../db/invoices';",
            "+import { sendReminder } from '../emails/send';",
            '+',
            '+const DAYS = [7, 14];',
            '+',
            '+export async function overdueReminders(ws: Workspace) {',
            '+  const today = todayIn(ws.timeZone);',
            '+  for (const inv of await listOverdue(ws.id)) {',
            '+    if (!inv.client.remindersOn) continue;',
            '+    const late = daysBetween(inv.dueOn, today);',
            '+    if (DAYS.includes(late)) await sendReminder(inv, late);',
            '+  }',
            '+}',
          ] }] },
          { path: 'src/jobs/index.ts', st: 'M', hunks: [{ h: '@@ -12,4 +12,5 @@', l: [
            " cron('0 6 * * *', perWorkspace(syncExchangeRates));",
            " cron('0 7 * * *', perWorkspace(weeklyDigest));",
            "+cron('0 9 * * *', perWorkspace(overdueReminders));",
          ] }] },
        ],
        test: { path: 'test/jobs/overdue-reminders.test.ts', subject: 'overdueReminders', imports: ["import { describe, it, expect } from 'vitest';", "import { overdueReminders } from '../../src/jobs/overdue-reminders';", "import { seed, sent, at } from '../harness';"] },
        tests: [
          { n: 'sends at 7 and 14 days overdue', b: ["await seed.invoice({ dueOn: '2026-09-01' }); await seed.invoice({ dueOn: '2026-08-25' });", "await at('2026-09-08', () => overdueReminders(seed.ws));", 'expect(sent.reminders).toHaveLength(2);'] },
          { n: 'skips clients with reminders off', err: true, b: ["await seed.invoice({ dueOn: '2026-09-01', client: { remindersOn: false } });", "await at('2026-09-08', () => overdueReminders(seed.ws));", 'expect(sent.reminders).toHaveLength(0);'] },
          { n: 'uses the workspace time zone', err: true, b: ["seed.ws.timeZone = 'Australia/Sydney';", "await seed.invoice({ dueOn: '2026-09-01' });", "await at('2026-09-07T22:00:00Z', () => overdueReminders(seed.ws));", 'expect(sent.reminders).toHaveLength(1);'] },
        ],
        defect: {
          title: 'Reminder sent for invoice INV-0318 one day early',
          where: 'job: overdue-reminders', culprit: 'src/jobs/overdue-reminders.ts in overdueReminders', users: 4, events: 4,
          stack: ['Reported by a client by reply email, forwarded to support.', 'Workspace time zone: Australia/Sydney (UTC+10)', 'Job ran at 2026-10-06T23:00:00Z = 2026-10-07 09:00 local', 'daysBetween(dueOn, today) used UTC "today" → 7 instead of 6'],
          note: 'The job uses the workspace time zone, but listOverdue() filters with UTC. No test runs the job near midnight in a non-UTC zone.',
          fix: { path: 'src/jobs/overdue-reminders.ts', hunks: [{ h: '@@ -7,5 +7,5 @@', l: [' export async function overdueReminders(ws: Workspace) {', '   const today = todayIn(ws.timeZone);', '-  for (const inv of await listOverdue(ws.id)) {', '+  for (const inv of await listOverdue(ws.id, { asOf: today })) {', '     if (!inv.client.remindersOn) continue;'] }] },
        },
      },
      {
        title: 'Reminder email', branch: 'mf/inv-overdue-email',
        scope: 'The reminder email template: invoice number, amount, due date, days late, Pay now link if there is one.',
        criteria: [2],
        explore: [['Read', 'src/emails/invoice.tsx', '103 lines'], ['Read', 'src/emails/send.ts', '40 lines']],
        files: [
          { path: 'src/emails/reminder.tsx', st: 'A', hunks: [{ h: '@@ -0,0 +1,18 @@', l: [
            "+import { Button, Text } from '@react-email/components';",
            "+import { Layout } from './layout';",
            '+',
            '+export function ReminderEmail({ invoice, late }: { invoice: Invoice; late: number }) {',
            '+  return (',
            '+    <Layout preview={`Invoice ${invoice.number} is ${late} days overdue`}>',
            '+      <Text>Hi {invoice.client.contactName},</Text>',
            '+      <Text>',
            '+        A friendly reminder that invoice {invoice.number} for{\' \'}',
            '+        {formatMoney(invoice.totalMinor, invoice.currency)} was due on {formatDate(invoice.dueOn)}.',
            '+      </Text>',
            '+      {invoice.paymentLinkUrl && <Button href={invoice.paymentLinkUrl}>Pay now</Button>}',
            '+    </Layout>',
            '+  );',
            '+}',
          ] }] },
        ],
        test: { path: 'test/emails/reminder.test.tsx', subject: 'ReminderEmail', imports: ["import { describe, it, expect } from 'vitest';", "import { render } from '@react-email/render';", "import { ReminderEmail } from '../../src/emails/reminder';", "import { invoice } from '../fixtures';"] },
        tests: [
          { n: 'names the invoice, amount and due date', b: ["const html = await render(<ReminderEmail invoice={invoice({ number: 'INV-0318' })} late={7} />);", "expect(html).toContain('INV-0318');"] },
          { n: 'leaves out Pay now without a link', err: true, b: ['const html = await render(<ReminderEmail invoice={invoice({ paymentLinkUrl: null })} late={7} />);', "expect(html).not.toContain('Pay now');"] },
        ],
      },
      {
        title: 'Per-client reminder switch', branch: 'mf/inv-overdue-switch',
        scope: 'A `reminders_on` column on clients, default true, and a checkbox on the client settings page.',
        criteria: [3],
        explore: [['Read', 'src/web/clients/ClientSettings.tsx', '118 lines']],
        files: [
          { path: 'src/db/migrations/0015_client_reminders.sql', st: 'A', hunks: [{ h: '@@ -0,0 +1,1 @@', l: ['+ALTER TABLE clients ADD COLUMN reminders_on boolean NOT NULL DEFAULT true;'] }] },
          { path: 'src/web/clients/ClientSettings.tsx', st: 'M', hunks: [{ h: '@@ -74,6 +74,12 @@', l: [
            '       <Field label="Payment terms">',
            '         <TermsSelect value={client.terms} onChange={set(\'terms\')} />',
            '       </Field>',
            '+      <Field label="Reminders">',
            '+        <Checkbox checked={client.remindersOn} onChange={set(\'remindersOn\')}>',
            '+          Email a reminder at 7 and 14 days overdue',
            '+        </Checkbox>',
            '+      </Field>',
          ] }] },
        ],
        test: { path: 'test/web/client-settings.test.tsx', subject: 'ClientSettings', imports: ["import { describe, it, expect } from 'vitest';", "import { renderPage, user } from '../web-harness';"] },
        tests: [
          { n: 'saves the reminder switch', b: ["const page = await renderPage('/clients/c_1/settings');", "await user.click(page.getByLabelText('Email a reminder at 7 and 14 days overdue'));", 'expect(page.saved).toMatchObject({ remindersOn: false });'] },
        ],
      },
    ],
  },

  {
    key: 'currency', title: 'Multi-currency invoices', from: 'Seb · form',
    text: 'We bill two clients in EUR. Let me set a currency per client, and show totals per currency on the dashboard.',
    explore: [
      ['Read', 'src/lib/money.ts', '64 lines'],
      ['Grep', "\"'AUD'\" src/", '9 matches in 6 files'],
      ['Read', 'src/web/dashboard/Totals.tsx', '81 lines'],
    ],
    finding: '"AUD" is hard-coded in 9 places. Invoices already have a `currency` column, but it is always set from the workspace default. Totals on the dashboard add every invoice together.',
    ask: {
      q: 'Should the dashboard convert EUR to AUD for one combined total, or show one total per currency?',
      why: 'Converting needs an exchange rate source and a rule for which day\'s rate to use. One total per currency needs nothing new, but there is no single number for revenue.',
      options: ['One total per currency', 'Convert with a daily rate'],
    },
    spec: `# Multi-currency invoices

## Goal
An agency bills some clients in another currency, and the dashboard stays correct.

## Non-goals
- Conversion between currencies.
- Changing the currency of an invoice after it is sent.

## Constraints
- Currency is set on the client. New invoices take it from the client.
- Money is formatted by currency: symbol, decimals and grouping.
- No hard-coded "AUD" outside the workspace default.

## Acceptance criteria
1. A client has a currency. The default is the workspace currency.
2. A new invoice for that client uses the client currency.
3. Amounts show in the right format everywhere: list, PDF, email, CSV.
4. The dashboard shows one total per currency.`,
    plan: 'Three slices: the data change, formatting, and the dashboard. Formatting is the widest change, so it is its own slice.',
    slices: [
      { title: 'Currency on client', branch: 'mf/inv-currency-client', scope: 'A `currency` column on clients and the client form. New invoices take the client currency.', criteria: [1, 2],
        explore: [['Read', 'src/db/schema.ts', '191 lines']],
        files: [{ path: 'src/db/migrations/0016_client_currency.sql', st: 'A', hunks: [{ h: '@@ -0,0 +1,2 @@', l: ['+ALTER TABLE clients ADD COLUMN currency char(3);', '+UPDATE clients SET currency = w.currency FROM workspaces w WHERE w.id = clients.workspace_id;'] }] }],
        test: { path: 'test/db/client-currency.test.ts', subject: 'client currency', imports: ["import { describe, it, expect } from 'vitest';", "import { seed } from '../harness';"] },
        tests: [{ n: 'new invoices take the client currency', b: ["const c = await seed.client({ currency: 'EUR' });", "expect((await seed.invoice({ clientId: c.id })).currency).toBe('EUR');"] }] },
      { title: 'Format money by currency', branch: 'mf/inv-currency-format', weakTests: true, scope: 'Replace the hard-coded AUD formatting with Intl.NumberFormat by currency, in all 9 places.', criteria: [3],
        explore: [['Grep', "\"'AUD'\" src/", '9 matches in 6 files']],
        files: [{ path: 'src/lib/money.ts', st: 'M', hunks: [{ h: '@@ -1,9 +1,10 @@', l: [
          ' export function formatMoney(minor: number, currency: string) {',
          "-  return '$' + (minor / 100).toFixed(2);",
          "+  const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency });",
          '+  return f.format(minor / 10 ** f.resolvedOptions().maximumFractionDigits);',
          ' }',
        ] }] }],
        test: { path: 'test/lib/money.test.ts', subject: 'formatMoney', imports: ["import { describe, it, expect } from 'vitest';", "import { formatMoney } from '../../src/lib/money';"] },
        tests: [{ n: 'formats EUR', b: ["expect(formatMoney(123450, 'EUR')).toBe('€1,234.50');"] }, { n: 'formats JPY with no decimals', err: true, b: ["expect(formatMoney(1234, 'JPY')).toBe('¥1,234');"] }],
        defect: {
          title: "RangeError: Invalid currency code : null",
          where: 'GET /invoices/:id/pdf', culprit: 'src/lib/money.ts in formatMoney', users: 2, events: 9,
          stack: ['RangeError: Invalid currency code : null', '  at new NumberFormat (<anonymous>)', '  at formatMoney (src/lib/money.ts:2:13)', '  at TotalsTable (src/pdf/invoice.tsx:131:20)'],
          note: 'Invoices drafted before the migration have currency = null on their client. No test formats a null currency.',
          fix: { path: 'src/lib/money.ts', hunks: [{ h: '@@ -1,4 +1,5 @@', l: ['-export function formatMoney(minor: number, currency: string) {', '+export function formatMoney(minor: number, currency: string | null, fallback = workspaceCurrency()) {', "-  const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency });", "+  const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency ?? fallback });"] }] },
        } },
      { title: 'Dashboard totals per currency', branch: 'mf/inv-currency-dashboard', scope: 'Group dashboard totals by currency and show one row each.', criteria: [4],
        explore: [['Read', 'src/web/dashboard/Totals.tsx', '81 lines']],
        files: [{ path: 'src/web/dashboard/Totals.tsx', st: 'M', hunks: [{ h: '@@ -20,6 +20,9 @@', l: ['-  const total = invoices.reduce((s, i) => s + i.totalMinor, 0);', '+  const byCurrency = groupBy(invoices, (i) => i.currency);', '+  const totals = Object.entries(byCurrency).map(([cur, xs]) =>', '+    [cur, xs.reduce((s, i) => s + i.totalMinor, 0)] as const);'] }] }],
        test: { path: 'test/web/totals.test.tsx', subject: 'Totals', imports: ["import { describe, it, expect } from 'vitest';", "import { renderTotals } from '../web-harness';"] },
        tests: [{ n: 'shows one total per currency', b: ["const t = renderTotals([{ currency: 'AUD', totalMinor: 100 }, { currency: 'EUR', totalMinor: 200 }]);", 'expect(t.rows).toHaveLength(2);'] }] },
    ],
  },
];

// Requests that come in later through the form, as if a person typed them.
const LATER_REQUESTS = ['overdue', 'currency'];
const FIRST_REQUESTS = ['csv', 'stripe'];

// ───────────────────────────────────────────── agents
// Agents are real harness sessions on a real machine, not "A1".
const AGENT_POOL = [
  { name: 'Claude Code', harness: 'claude', model: 'opus-4.5', machine: "Seb's MacBook Pro" },
  { name: 'Codex', harness: 'codex', model: 'gpt-5-codex', machine: "Seb's MacBook Pro" },
  { name: 'Claude Code', harness: 'claude', model: 'sonnet-4.5', machine: "Seb's MacBook Pro" },
  { name: 'Codex', harness: 'codex', model: 'gpt-5-codex', machine: "Seb's MacBook Pro" },
  { name: 'Claude Code', harness: 'claude', model: 'opus-4.5', machine: "Seb's MacBook Pro" },
  { name: 'Claude Code', harness: 'claude', model: 'sonnet-4.5', machine: "Seb's MacBook Pro" },
  { name: 'Codex', harness: 'codex', model: 'gpt-5-codex', machine: "Seb's MacBook Pro" },
  { name: 'Claude Code', harness: 'claude', model: 'opus-4.5', machine: "Seb's MacBook Pro" },
];

// ───────────────────────────────────────────── generic content for anything not hand-written
// (requests typed into the form, and Fix requests made by Triage from a defect)
function slugify(t) { return t.toLowerCase().replace(/^fix:\s*/, 'fix ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28); }

function genericRequest(title, text) {
  const slug = slugify(title);
  return {
    key: 'gen-' + slug, title, from: 'Seb · form', generic: true,
    text: text || title,
    explore: [['Grep', `"${title.split(' ').slice(-1)[0].toLowerCase()}" src/`, '4 matches in 3 files'], ['Read', 'src/api/routes/invoices.ts', '158 lines']],
    finding: 'Nothing like this exists yet. It touches the API and the invoice list.',
    spec: `# ${title}\n\n## Goal\n${text || title}.\n\n## Non-goals\n- Admin tooling.\n- Bulk actions.\n\n## Constraints\n- Follows the patterns in \`src/api/routes/invoices.ts\`.\n- Scoped to the current workspace.\n\n## Acceptance criteria\n1. It works end to end for one user.\n2. Errors show a message the user can act on.\n3. A user cannot see or change another workspace's data.`,
    plan: 'Two slices: the API, then the UI.',
    slices: [
      { title: 'API', branch: `mf/${slug}-api`, weakTests: true, scope: `The endpoint for: ${title.toLowerCase()}.`, criteria: [1, 3], explore: [['Read', 'src/api/routes/invoices.ts', '158 lines']],
        files: [{ path: `src/api/routes/${slug}.ts`, st: 'A', hunks: [{ h: '@@ -0,0 +1,6 @@', l: ["+import { Hono } from 'hono';", "+import { requireWorkspace } from '../middleware/workspace';", '+', `+export const route = new Hono<AppEnv>();`, "+route.use('*', requireWorkspace);"] }] }],
        test: { path: `test/api/${slug}.test.ts`, subject: title, imports: ["import { describe, it, expect } from 'vitest';", "import { app, signIn } from '../harness';"] },
        tests: [{ n: 'works for the signed-in workspace', b: [`expect((await signIn(app).get('/${slug}')).status).toBe(200);`] }, { n: 'returns 404 for another workspace', err: true, b: [`expect((await signIn(app, 'other').get('/${slug}/x')).status).toBe(404);`] }] },
      { title: 'UI', branch: `mf/${slug}-ui`, scope: `The screen for: ${title.toLowerCase()}.`, criteria: [1, 2], explore: [['Read', 'src/web/invoices/InvoiceList.tsx', '218 lines']],
        files: [{ path: `src/web/${slug}/Page.tsx`, st: 'A', hunks: [{ h: '@@ -0,0 +1,4 @@', l: ['+export function Page() {', `+  return <Page title="${title}" />;`, '+}'] }] }],
        test: { path: `test/web/${slug}.test.tsx`, subject: title, imports: ["import { describe, it, expect } from 'vitest';", "import { renderPage } from '../web-harness';"] },
        tests: [{ n: 'renders', b: [`expect(await renderPage('/${slug}')).toBeTruthy();`] }] },
    ],
  };
}

// A Fix request made by Triage from a defect. Two slices: reproduce, then fix.
function fixRequest(defect) {
  const d = defect.content || {};
  const title = 'Fix: ' + defect.title;
  const slug = slugify(d.where || defect.title);
  const file = (d.culprit || 'src/api/routes/invoices.ts').split(' ')[0];
  return {
    key: 'fix-' + defect.id, title, from: `Triage · ${defect.id}`, fix: true,
    text: `${d.where || ''}: ${defect.title}\n\n${d.note || ''}`.trim(),
    explore: [['Read', file, '120 lines'], ['Bash', 'git log -3 --format="%h %s" -- ' + file, `${defect.sha || '9f2c1ab'} ${defect.prTitle || 'Merge PR'}`]],
    finding: d.note || 'The failing path has no test.',
    spec: `# ${title}\n\n## What happens\n${d.where ? `\`${d.where}\` fails` : 'It fails'} with \`${defect.title}\`. ${d.events || 1} events, ${d.users || 1} users.\n\n## Cause\n${d.note || 'Unknown yet.'}\n\n## Acceptance criteria\n1. A test reproduces the failure on main.\n2. The fix makes that test pass.\n3. No other behaviour changes.`,
    plan: 'Two slices: a failing test that reproduces it, then the fix.',
    slices: [
      { title: 'Failing test that reproduces it', branch: `mf/${slug}-repro`, scope: 'A test on main that fails the same way as the Sentry event.', criteria: [1], explore: [['Read', file, '120 lines']],
        files: [], test: { path: `test/regressions/${defect.id.toLowerCase()}.test.ts`, subject: defect.id, imports: ["import { describe, it, expect } from 'vitest';", "import { app, signIn, seed } from '../harness';"] },
        tests: [{ n: `reproduces ${defect.id}`, b: ['// arrange the state from the Sentry event', `const res = await signIn(app).get('/${slug}');`, 'expect(res.status).toBe(200);'] }] },
      { title: 'Fix', branch: `mf/${slug}-fix`, scope: `Make the reproduction pass. ${d.note || ''}`, criteria: [2, 3], explore: [['Read', file, '120 lines']],
        files: d.fix ? [{ ...d.fix, st: 'M' }] : [],
        test: { path: `test/regressions/${defect.id.toLowerCase()}.test.ts`, subject: defect.id, imports: [] }, tests: [] },
    ],
  };
}
