// ABOUTME: A small RFC 4180 CSV reader, and the roster row shape the importer expects.
// ABOUTME: No env imports, so the parser is unit-tested — a roster import that mangles names is a bad first impression.

/**
 * Parse CSV into rows of fields.
 *
 * Hand-rolled rather than a dependency because the whole grammar is quotes,
 * doubled quotes, and newlines inside quotes — and those three are exactly what
 * a naive `split(',')` gets wrong. A delegate called "Tremblay, Marie" is not an
 * edge case in Quebec; it is Tuesday.
 *
 * Handles CRLF and LF, a trailing newline, and quoted fields containing commas,
 * quotes and line breaks. Does not handle a byte-order mark — `stripBom` does.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      endField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      // CRLF or a lone CR; either way the row ends here.
      if (input[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // A trailing newline produces no final row; anything else does.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/** Excel writes a BOM on UTF-8 CSVs, and it would otherwise become part of the first header. */
export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

export type RosterRow = {
  email: string;
  fullName: string;
  preferredName: string | null;
  role: 'delegate' | 'coach' | 'executive';
  team: string | null;
};

export type RosterProblem = { line: number; reason: string };

const ROLES = ['delegate', 'coach', 'executive'] as const;

/**
 * Read a roster CSV into rows, collecting problems rather than throwing.
 *
 * An import of 120 people that stops at line 6 wastes an afternoon. Every row is
 * checked, the good ones are returned, and the bad ones come back with their
 * line numbers so one spreadsheet fix covers them all.
 *
 * Superuser is deliberately not importable. Roles are granted by a superuser
 * through the console, and a CSV that can mint one is a CSV that only has to be
 * edited once by the wrong person.
 */
export function readRoster(text: string): { rows: RosterRow[]; problems: RosterProblem[] } {
  const table = parseCsv(stripBom(text)).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (table.length === 0) return { rows: [], problems: [{ line: 0, reason: 'empty file' }] };

  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);

  const emailAt = at('email');
  const nameAt = at('full_name') === -1 ? at('name') : at('full_name');
  if (emailAt === -1 || nameAt === -1) {
    return { rows: [], problems: [{ line: 1, reason: 'header must include email and full_name' }] };
  }

  const preferredAt = at('preferred_name');
  const roleAt = at('role');
  const teamAt = at('team');

  const rows: RosterRow[] = [];
  const problems: RosterProblem[] = [];
  const seen = new Set<string>();

  table.slice(1).forEach((cells, index) => {
    const line = index + 2; // 1-based, and the header is line 1.
    const email = (cells[emailAt] ?? '').trim().toLowerCase();
    const fullName = (cells[nameAt] ?? '').trim();

    if (!email || !email.includes('@')) {
      problems.push({ line, reason: `"${email}" is not an email address` });
      return;
    }
    if (!fullName) {
      problems.push({ line, reason: 'missing name' });
      return;
    }
    if (seen.has(email)) {
      // A duplicate would be an upsert that quietly overwrote the first row's
      // team, which is worse than saying so.
      problems.push({ line, reason: `${email} appears more than once` });
      return;
    }

    const rawRole = (roleAt === -1 ? '' : (cells[roleAt] ?? '')).trim().toLowerCase();
    if (rawRole && !ROLES.includes(rawRole as (typeof ROLES)[number])) {
      problems.push({ line, reason: `"${rawRole}" is not an importable role` });
      return;
    }

    seen.add(email);
    rows.push({
      email,
      fullName,
      preferredName: preferredAt === -1 ? null : (cells[preferredAt] ?? '').trim() || null,
      role: (rawRole || 'delegate') as RosterRow['role'],
      team: teamAt === -1 ? null : (cells[teamAt] ?? '').trim() || null,
    });
  });

  return { rows, problems };
}
