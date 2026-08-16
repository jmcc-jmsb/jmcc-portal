// ABOUTME: Unit tests for the CSV reader and the roster importer.
// ABOUTME: "Tremblay, Marie" is not an edge case in Quebec, so the quoting rules get real coverage.
import { describe, expect, it } from 'vitest';
import { parseCsv, readRoster, stripBom } from '../../lib/csv';

describe('parseCsv', () => {
  it('reads a plain table', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    // The failure a split(',') import ships with: one name becomes two columns
    // and every field after it shifts.
    expect(parseCsv('name,email\n"Tremblay, Marie",m@x.ca')).toEqual([
      ['name', 'email'],
      ['Tremblay, Marie', 'm@x.ca'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"She said ""hi"""')).toEqual([['a'], ['She said "hi"']]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line one\nline two",x')).toEqual([
      ['a', 'b'],
      ['line one\nline two', 'x'],
    ]);
  });

  it('handles CRLF, which is what Excel writes', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not invent a row from a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2);
  });

  it('keeps empty fields rather than dropping them', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('strips the byte-order mark Excel adds', () => {
    expect(parseCsv(stripBom('﻿email'))).toEqual([['email']]);
  });
});

describe('readRoster', () => {
  const header = 'email,full_name,preferred_name,role,team\n';

  it('reads a well-formed roster', () => {
    const { rows, problems } = readRoster(
      `${header}a@x.ca,Alice Nguyen,Ali,delegate,Finance A\nb@x.ca,Bo Tremblay,,coach,`,
    );
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { email: 'a@x.ca', fullName: 'Alice Nguyen', preferredName: 'Ali', role: 'delegate', team: 'Finance A' },
      { email: 'b@x.ca', fullName: 'Bo Tremblay', preferredName: null, role: 'coach', team: null },
    ]);
  });

  it('defaults a missing role to delegate', () => {
    const { rows } = readRoster('email,full_name\na@x.ca,Alice');
    expect(rows[0].role).toBe('delegate');
  });

  it('lowercases emails so a duplicate in different case is still a duplicate', () => {
    const { rows, problems } = readRoster(`${header}A@X.ca,Alice,,,\na@x.ca,Alice again,,,`);
    expect(rows).toHaveLength(1);
    expect(problems[0].reason).toContain('more than once');
  });

  it('collects every problem rather than stopping at the first', () => {
    // An import of 120 people that dies at line 6 wastes an afternoon.
    const { rows, problems } = readRoster(
      `${header}notanemail,Alice,,,\nb@x.ca,,,,\nc@x.ca,Carol,,delegate,\n`,
    );
    expect(rows).toHaveLength(1);
    expect(problems.map((p) => p.line)).toEqual([2, 3]);
  });

  it('refuses a role it will not import', () => {
    // Superuser is granted by a superuser in the console, never by a spreadsheet.
    const { rows, problems } = readRoster(`${header}a@x.ca,Alice,,superuser,`);
    expect(rows).toHaveLength(0);
    expect(problems[0].reason).toContain('not an importable role');
  });

  it('rejects a file with no usable header', () => {
    const { problems } = readRoster('name,thing\nx,y');
    expect(problems[0].reason).toContain('header must include');
  });

  it('accepts `name` as well as `full_name`', () => {
    const { rows } = readRoster('email,name\na@x.ca,Alice');
    expect(rows[0].fullName).toBe('Alice');
  });

  it('ignores blank lines in the middle of a file', () => {
    const { rows, problems } = readRoster(`${header}a@x.ca,Alice,,,\n\nb@x.ca,Bo,,,\n`);
    expect(rows).toHaveLength(2);
    expect(problems).toEqual([]);
  });

  it('says so on an empty file rather than reporting a clean import of nothing', () => {
    expect(readRoster('').problems[0].reason).toBe('empty file');
  });
});
